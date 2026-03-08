package controller

import (
	"context"
	"delta/codeRace/database"
	"delta/codeRace/engine/botrunner"
	"delta/codeRace/engine/racer"
	"delta/codeRace/models"
	"delta/codeRace/sandbox"
	"encoding/json"
	"log"
	"math"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// SandboxMgr is the global sandbox manager, initialised in main().
var SandboxMgr *sandbox.Manager

// ── Legacy endpoint (file-based track) ───────────────────────────────────────

type botRunRequest struct {
	Code string `json:"code"`
}

func BotRunController(c *fiber.Ctx) error {
	var req botRunRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Code == "" {
		return c.Status(400).JSON(fiber.Map{"error": "code must not be empty"})
	}

	log.Println("bot run: starting")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	result := botrunner.RunCollect(ctx, SandboxMgr, req.Code)

	log.Printf("bot run: done — %d frames, reason=%s\n", len(result.Frames), result.Reason)

	return c.JSON(fiber.Map{
		"frames":           result.Frames,
		"stdout":           result.Stdout,
		"reason":           result.Reason,
		"ticks":            len(result.Frames),
		"finished":         result.Finished,
		"finishTime":       result.FinishTime,
		"checkpointsHit":   result.CheckpointsHit,
		"totalCheckpoints": result.TotalCheckpoints,
	})
}

// ── Run: single track within a trackset ──────────────────────────────────────

type runTrackRequest struct {
	Code       string `json:"code"`
	TracksetID string `json:"tracksetId"`
	TrackIndex int    `json:"trackIndex"`
}

// RunTrackController runs user code on a single track (for testing).
func RunTrackController(c *fiber.Ctx) error {
	var req runTrackRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Code == "" {
		return c.Status(400).JSON(fiber.Map{"error": "code must not be empty"})
	}

	// Load track from DB.
	var track models.Track
	if err := database.DB.Where("trackset_id = ? AND order_index = ?", req.TracksetID, req.TrackIndex).
		First(&track).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "track not found"})
	}

	var trackData racer.TrackFileData
	if err := json.Unmarshal(track.Data, &trackData); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "corrupt track data"})
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	result := botrunner.RunSingle(ctx, SandboxMgr, req.Code, &trackData)

	return c.JSON(fiber.Map{
		"frames":           result.Frames,
		"stdout":           result.Stdout,
		"reason":           result.Reason,
		"ticks":            len(result.Frames),
		"finished":         result.Finished,
		"finishTime":       result.FinishTime,
		"checkpointsHit":   result.CheckpointsHit,
		"totalCheckpoints": result.TotalCheckpoints,
	})
}

// ── Submit: run code on ALL tracks in a trackset ─────────────────────────────

type submitRequest struct {
	Code       string `json:"code"`
	TracksetID string `json:"tracksetId"`
}

// SubmitTracksetController runs the code against every track and records
// the score if it beats the player's personal best.
func SubmitTracksetController(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)

	var req submitRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Code == "" {
		return c.Status(400).JSON(fiber.Map{"error": "code must not be empty"})
	}

	// Load all tracks for the trackset, ordered.
	var tracks []models.Track
	if err := database.DB.Where("trackset_id = ?", req.TracksetID).
		Order("order_index ASC").Find(&tracks).Error; err != nil || len(tracks) == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "trackset has no tracks"})
	}

	// Parse track data.
	trackDatas := make([]*racer.TrackFileData, len(tracks))
	for i, t := range tracks {
		var td racer.TrackFileData
		if err := json.Unmarshal(t.Data, &td); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "corrupt track data"})
		}
		trackDatas[i] = &td
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	result := botrunner.RunTrackset(ctx, SandboxMgr, req.Code, trackDatas)

	tsID, _ := uuid.Parse(req.TracksetID)

	// ── Always record the submission attempt ─────────────────────────────
	{
		times := make([]float64, len(result.TrackResults))
		reasons := make([]string, 0)
		for i, tr := range result.TrackResults {
			times[i] = math.Round(tr.FinishTime*1000) / 1000
			if !tr.Finished {
				reasons = append(reasons, tr.Reason)
			}
		}
		timesJSON, _ := json.Marshal(times)
		reason := ""
		if result.AllFinished {
			reason = "finished"
		} else if len(reasons) > 0 {
			reason = reasons[0]
		}

		sub := models.Submission{
			TracksetID:  tsID,
			UserID:      userID,
			Code:        req.Code,
			AllFinished: result.AllFinished,
			Times:       timesJSON,
			TotalTime:   result.TotalTime,
			Score:       result.Score,
			Reason:      reason,
		}
		database.DB.Create(&sub)
	}

	// ── If all finished, check if this beats the player's personal best ──
	if result.AllFinished {
		// Collect per-track times.
		times := make([]float64, len(result.TrackResults))
		for i, tr := range result.TrackResults {
			times[i] = math.Round(tr.FinishTime*1000) / 1000
		}
		timesJSON, _ := json.Marshal(times)

		var existing models.TracksetScore
		err := database.DB.Where("trackset_id = ? AND user_id = ?", tsID, userID).
			First(&existing).Error

		if err != nil {
			// No existing score — create.
			score := models.TracksetScore{
				TracksetID: tsID,
				UserID:     userID,
				Code:       req.Code,
				Times:      timesJSON,
				TotalTime:  result.TotalTime,
				Score:      result.Score,
			}
			database.DB.Create(&score)
		} else if result.Score > existing.Score {
			// New personal best.
			existing.Code = req.Code
			existing.Times = timesJSON
			existing.TotalTime = result.TotalTime
			existing.Score = result.Score
			database.DB.Save(&existing)
		}
	}

	return c.JSON(result)
}
