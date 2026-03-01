package controller

import (
	"delta/codeRace/database"
	"delta/codeRace/engine/racer"
	"delta/codeRace/models"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// ─── Create Trackset ─────────────────────────────────────────────────────────

type createTracksetRequest struct {
	Name        string                `json:"name"`
	Description string                `json:"description"`
	Tracks      []racer.TrackFileData `json:"tracks"` // 1-5 tracks
}

func CreateTracksetController(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	isAdmin := c.Locals("isAdmin").(bool)

	var req createTracksetRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name is required"})
	}
	if len(req.Tracks) == 0 || len(req.Tracks) > 5 {
		return c.Status(400).JSON(fiber.Map{"error": "must have 1-5 tracks"})
	}

	trackset := models.Trackset{
		Name:        req.Name,
		Description: req.Description,
		CreatedBy:   userID,
		Official:    isAdmin, // admin-created tracksets are official by default
	}

	tx := database.DB.Begin()

	if err := tx.Create(&trackset).Error; err != nil {
		tx.Rollback()
		return c.Status(500).JSON(fiber.Map{"error": "failed to create trackset"})
	}

	for i, td := range req.Tracks {
		data, err := json.Marshal(td)
		if err != nil {
			tx.Rollback()
			return c.Status(500).JSON(fiber.Map{"error": "failed to marshal track data"})
		}
		track := models.Track{
			TracksetID: trackset.ID,
			OrderIndex: i,
			Data:       data,
		}
		if err := tx.Create(&track).Error; err != nil {
			tx.Rollback()
			return c.Status(500).JSON(fiber.Map{"error": "failed to create track"})
		}
	}

	tx.Commit()

	// Reload with tracks.
	database.DB.Preload("Tracks").Preload("Creator").First(&trackset, "id = ?", trackset.ID)

	return c.Status(201).JSON(trackset)
}

// ─── List Tracksets ──────────────────────────────────────────────────────────

func ListTracksetsController(c *fiber.Ctx) error {
	var tracksets []models.Trackset

	query := database.DB.Preload("Creator").Preload("Tracks").Order("created_at DESC")

	// Optional filter: ?official=true
	if off := c.Query("official"); off == "true" {
		query = query.Where("official = ?", true)
	} else if off == "false" {
		query = query.Where("official = ?", false)
	}

	// Optional filter: ?mine=true (requires auth — userID may be nil for public)
	if c.Query("mine") == "true" {
		if uid, ok := c.Locals("userID").(uuid.UUID); ok {
			query = query.Where("created_by = ?", uid)
		}
	}

	if err := query.Find(&tracksets).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch tracksets"})
	}

	return c.JSON(tracksets)
}

// ─── Get Trackset ────────────────────────────────────────────────────────────

func GetTracksetController(c *fiber.Ctx) error {
	id := c.Params("id")

	var trackset models.Trackset
	if err := database.DB.Preload("Tracks").Preload("Creator").First(&trackset, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "trackset not found"})
	}

	return c.JSON(trackset)
}

// ─── Update Trackset ─────────────────────────────────────────────────────────

type updateTracksetRequest struct {
	Name        string                `json:"name"`
	Description string                `json:"description"`
	Tracks      []racer.TrackFileData `json:"tracks"`
}

func UpdateTracksetController(c *fiber.Ctx) error {
	id := c.Params("id")
	userID := c.Locals("userID").(uuid.UUID)
	isAdmin := c.Locals("isAdmin").(bool)

	var trackset models.Trackset
	if err := database.DB.First(&trackset, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "trackset not found"})
	}

	// Only creator or admin can update.
	if trackset.CreatedBy != userID && !isAdmin {
		return c.Status(403).JSON(fiber.Map{"error": "not authorized"})
	}

	var req updateTracksetRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Name != "" {
		trackset.Name = req.Name
	}
	if req.Description != "" {
		trackset.Description = req.Description
	}

	tx := database.DB.Begin()

	if err := tx.Save(&trackset).Error; err != nil {
		tx.Rollback()
		return c.Status(500).JSON(fiber.Map{"error": "failed to update trackset"})
	}

	// If tracks are provided, replace them.
	if len(req.Tracks) > 0 {
		if len(req.Tracks) > 5 {
			tx.Rollback()
			return c.Status(400).JSON(fiber.Map{"error": "max 5 tracks"})
		}

		// Delete existing tracks.
		if err := tx.Where("trackset_id = ?", trackset.ID).Delete(&models.Track{}).Error; err != nil {
			tx.Rollback()
			return c.Status(500).JSON(fiber.Map{"error": "failed to clear old tracks"})
		}

		// Delete existing scores (track layout changed).
		tx.Where("trackset_id = ?", trackset.ID).Delete(&models.TracksetScore{})

		for i, td := range req.Tracks {
			data, err := json.Marshal(td)
			if err != nil {
				tx.Rollback()
				return c.Status(500).JSON(fiber.Map{"error": "failed to marshal track data"})
			}
			track := models.Track{
				TracksetID: trackset.ID,
				OrderIndex: i,
				Data:       data,
			}
			if err := tx.Create(&track).Error; err != nil {
				tx.Rollback()
				return c.Status(500).JSON(fiber.Map{"error": "failed to create track"})
			}
		}
	}

	tx.Commit()

	database.DB.Preload("Tracks").Preload("Creator").First(&trackset, "id = ?", trackset.ID)

	return c.JSON(trackset)
}

// ─── Delete Trackset ─────────────────────────────────────────────────────────

func DeleteTracksetController(c *fiber.Ctx) error {
	id := c.Params("id")
	userID := c.Locals("userID").(uuid.UUID)
	isAdmin := c.Locals("isAdmin").(bool)

	var trackset models.Trackset
	if err := database.DB.First(&trackset, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "trackset not found"})
	}

	if trackset.CreatedBy != userID && !isAdmin {
		return c.Status(403).JSON(fiber.Map{"error": "not authorized"})
	}

	tx := database.DB.Begin()
	tx.Where("trackset_id = ?", trackset.ID).Delete(&models.TracksetScore{})
	tx.Where("trackset_id = ?", trackset.ID).Delete(&models.Track{})
	tx.Delete(&trackset)
	tx.Commit()

	return c.JSON(fiber.Map{"status": "deleted"})
}
