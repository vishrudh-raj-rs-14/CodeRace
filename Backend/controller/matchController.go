package controller

import (
	"delta/codeRace/database"
	"delta/codeRace/engine/match"
	"delta/codeRace/engine/racer"
	"delta/codeRace/models"
	"encoding/json"
	"log"
	"sync"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// ─── REST: list tracks (for playground) ──────────────────────────────────────

func ListTracksController(c *fiber.Ctx) error {
	var tracks []models.Track
	if err := database.DB.Order("created_at DESC").Find(&tracks).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch tracks"})
	}

	// Attach trackset name for display
	type TrackWithInfo struct {
		models.Track
		TracksetName string `json:"tracksetName"`
	}

	// Collect unique trackset IDs
	tsIDs := map[string]bool{}
	for _, t := range tracks {
		tsIDs[t.TracksetID.String()] = true
	}

	tsNames := map[string]string{}
	if len(tsIDs) > 0 {
		var tracksets []models.Trackset
		ids := make([]string, 0, len(tsIDs))
		for id := range tsIDs {
			ids = append(ids, id)
		}
		database.DB.Select("id, name").Where("id IN ?", ids).Find(&tracksets)
		for _, ts := range tracksets {
			tsNames[ts.ID.String()] = ts.Name
		}
	}

	result := make([]TrackWithInfo, 0, len(tracks))
	for _, t := range tracks {
		result = append(result, TrackWithInfo{
			Track:        t,
			TracksetName: tsNames[t.TracksetID.String()],
		})
	}

	return c.JSON(result)
}

// ─── REST: create a match ────────────────────────────────────────────────────

type createMatchReq struct {
	TrackID string `json:"trackId"`
}

func CreateMatchController(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID).String()

	var body createMatchReq
	if err := c.BodyParser(&body); err != nil || body.TrackID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "trackId required"})
	}

	// Load track from DB
	var track models.Track
	if err := database.DB.First(&track, "id = ?", body.TrackID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "track not found"})
	}

	var trackData racer.TrackFileData
	if err := json.Unmarshal(track.Data, &trackData); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "bad track data"})
	}

	room := match.GlobalManager.Create(&trackData, body.TrackID, userID)

	return c.JSON(fiber.Map{
		"matchId": room.ID,
		"trackId": body.TrackID,
	})
}

// ─── REST: get match info ────────────────────────────────────────────────────

func GetMatchController(c *fiber.Ctx) error {
	id := c.Params("id")
	room := match.GlobalManager.Get(id)
	if room == nil {
		return c.Status(404).JSON(fiber.Map{"error": "match not found"})
	}

	return c.JSON(fiber.Map{
		"matchId":   room.ID,
		"trackId":   room.TrackID,
		"state":     room.State(),
		"players":   room.PlayerList(),
		"creatorId": room.CreatorID,
	})
}

// ─── REST: start match ──────────────────────────────────────────────────────

func StartMatchController(c *fiber.Ctx) error {
	id := c.Params("id")
	userID := c.Locals("userID").(uuid.UUID).String()

	room := match.GlobalManager.Get(id)
	if room == nil {
		return c.Status(404).JSON(fiber.Map{"error": "match not found"})
	}

	if !room.StartCountdown(userID) {
		return c.Status(400).JSON(fiber.Map{"error": "cannot start match (not creator or not enough players)"})
	}

	return c.JSON(fiber.Map{"status": "starting"})
}

// ─── REST: restart match ─────────────────────────────────────────────────────

func RestartMatchController(c *fiber.Ctx) error {
	id := c.Params("id")
	userID := c.Locals("userID").(uuid.UUID).String()

	room := match.GlobalManager.Get(id)
	if room == nil {
		return c.Status(404).JSON(fiber.Map{"error": "match not found"})
	}

	if !room.Restart(userID) {
		return c.Status(400).JSON(fiber.Map{"error": "cannot restart (not creator or match not finished)"})
	}

	// Broadcast lobby state to all players
	info := fiber.Map{
		"roomState": room.State(),
		"players":   room.PlayerList(),
	}
	infoBytes, _ := json.Marshal(info)
	room.BroadcastRaw(infoBytes)

	return c.JSON(fiber.Map{"status": "restarted"})
}

// ─── WebSocket: join and race ────────────────────────────────────────────────

func MatchSocketController(c *websocket.Conn) {
	matchID := c.Params("id")
	userID := c.Query("userId", "")
	displayName := c.Query("name", "Player")

	if userID == "" {
		c.WriteMessage(websocket.TextMessage, []byte(`{"error":"userId required"}`))
		c.Close()
		return
	}

	room := match.GlobalManager.Get(matchID)
	if room == nil {
		c.WriteMessage(websocket.TextMessage, []byte(`{"error":"match not found"}`))
		c.Close()
		return
	}

	player := room.Join(userID, displayName)
	if player == nil {
		c.WriteMessage(websocket.TextMessage, []byte(`{"error":"cannot join match"}`))
		c.Close()
		return
	}

	log.Printf("match %s: player %s (%s) joined", matchID, userID, displayName)

	// Notify all players of updated lobby
	info := fiber.Map{
		"roomState": room.State(),
		"players":   room.PlayerList(),
	}
	infoBytes, _ := json.Marshal(info)
	// Broadcast lobby update
	room.BroadcastRaw(infoBytes)

	var wg sync.WaitGroup

	// Reader: client WASD input or control messages → player
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				log.Printf("match ws read: %v", err)
				return
			}

			// Try to detect control messages (has "type" field)
			var ctrl struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(msg, &ctrl) == nil && ctrl.Type != "" {
				switch ctrl.Type {
				case "restart_vote":
					allReady := room.VoteRestart(userID)
					voted, total := room.RestartVotes()
					voteMsg := map[string]interface{}{
						"restartVotes": voted,
						"totalPlayers": total,
					}
					voteBytes, _ := json.Marshal(voteMsg)
					room.BroadcastRaw(voteBytes)

					if allReady {
						// Broadcast fresh lobby state
						info := fiber.Map{
							"roomState": room.State(),
							"players":   room.PlayerList(),
						}
						infoBytes, _ := json.Marshal(info)
						room.BroadcastRaw(infoBytes)
					}
				case "exit":
					hostLeft := room.HandleLeave(userID)
					if hostLeft {
						// Room is dead
						match.GlobalManager.Remove(matchID)
					}
					return
				}
				continue
			}

			// Otherwise treat as WASD input
			var input racer.InputState
			if err := json.Unmarshal(msg, &input); err != nil {
				continue
			}
			player.UpdateInput(input)
		}
	}()

	// Writer: match frames → client
	wg.Add(1)
	go func() {
		defer wg.Done()
		for frame := range player.Send {
			if err := c.WriteMessage(websocket.TextMessage, frame); err != nil {
				log.Printf("match ws write: %v", err)
				return
			}
		}
	}()

	wg.Wait()
	log.Printf("match %s: player %s disconnected", matchID, userID)

	// Handle disconnect — treat as exit if still in room
	room2 := match.GlobalManager.Get(matchID)
	if room2 != nil {
		hostLeft := room2.HandleLeave(userID)
		if hostLeft {
			match.GlobalManager.Remove(matchID)
		}
	}
}
