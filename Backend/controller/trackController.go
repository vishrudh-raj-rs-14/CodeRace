package controller

import (
	"delta/codeRace/engine/racer"

	"github.com/gofiber/fiber/v2"
)

// SaveTrackController persists the track editor data to disk.
func SaveTrackController(c *fiber.Ctx) error {
	var data racer.TrackFileData
	if err := c.BodyParser(&data); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if err := racer.SaveTrackFile(data); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "saved"})
}

// LoadTrackController returns the saved track data (or defaults).
func LoadTrackController(c *fiber.Ctx) error {
	data, err := racer.LoadTrackFile()
	if err != nil {
		// No saved track — return editor defaults.
		return c.JSON(racer.TrackFileData{
			WorldW:   4000,
			WorldH:   4000,
			GridSize: 50,
			StartX:   200,
			StartY:   200,
			Rects:    []racer.TrackRectData{},
		})
	}
	return c.JSON(data)
}
