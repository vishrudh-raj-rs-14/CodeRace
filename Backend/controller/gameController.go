package controller

import (
	"delta/codeRace/database"
	"delta/codeRace/engine/racer"
	"delta/codeRace/models"
	"encoding/json"
	"log"
	"sync"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
)

func GameTestController(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status": "Success !!!",
	})
}

// GameSocketController handles a single player's WebSocket session.
// It creates a Racer, starts the engine, then runs two goroutines:
//   - reader: WASD input from client → engine
//   - writer: frames from engine → client
//
// Optional query param ?trackId=<uuid> loads a specific track from the DB.
// Without it, the legacy file-based track is used.
func GameSocketController(c *websocket.Conn) {
	log.Println("new player connected")

	trackID := c.Query("trackId", "")

	var r *racer.Racer
	if trackID != "" {
		var track models.Track
		if err := database.DB.First(&track, "id = ?", trackID).Error; err != nil {
			log.Println("ws: track not found:", trackID)
			c.WriteMessage(websocket.TextMessage, []byte(`{"error":"track not found"}`))
			c.Close()
			return
		}
		var data racer.TrackFileData
		if err := json.Unmarshal(track.Data, &data); err != nil {
			log.Println("ws: bad track data:", err)
			c.WriteMessage(websocket.TextMessage, []byte(`{"error":"bad track data"}`))
			c.Close()
			return
		}
		r = racer.NewRacerFromTrack(&data)
	} else {
		r = racer.NewRacer()
	}

	r.Start()
	defer r.Stop()

	var wg sync.WaitGroup

	// --- reader: stream input from client → engine ---
	wg.Add(1)
	go func() {
		defer wg.Done()
		defer r.Stop() // client disconnect → stop engine

		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				log.Println("ws read:", err)
				return
			}

			var input racer.InputState
			if err := json.Unmarshal(msg, &input); err != nil {
				log.Println("bad input:", err)
				continue
			}
			r.UpdateInput(input)
		}
	}()

	// --- writer: stream frames from engine → client ---
	wg.Add(1)
	go func() {
		defer wg.Done()

		for frame := range r.Frames {
			if err := c.WriteMessage(websocket.TextMessage, frame); err != nil {
				log.Println("ws write:", err)
				return
			}
		}
	}()

	wg.Wait()
	log.Println("player disconnected")
}
