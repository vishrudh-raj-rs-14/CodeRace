package controller

import (
	"delta/codeRace/database"
	"delta/codeRace/models"

	"github.com/gofiber/fiber/v2"
)

// LeaderboardController returns the top scores for a trackset.
// GET /api/tracksets/:id/leaderboard
func LeaderboardController(c *fiber.Ctx) error {
	tsID := c.Params("id")
	limit := c.QueryInt("limit", 50)
	if limit > 100 {
		limit = 100
	}

	var scores []models.TracksetScore
	if err := database.DB.
		Preload("User").
		Where("trackset_id = ?", tsID).
		Order("score DESC, total_time ASC").
		Limit(limit).
		Find(&scores).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch leaderboard"})
	}

	// Build a leaner response.
	type entry struct {
		Rank        int     `json:"rank"`
		DisplayName string  `json:"displayName"`
		UserID      string  `json:"userId"`
		Score       int     `json:"score"`
		TotalTime   float64 `json:"totalTime"`
		Times       any     `json:"times"`
	}

	entries := make([]entry, len(scores))
	for i, s := range scores {
		entries[i] = entry{
			Rank:        i + 1,
			DisplayName: s.User.DisplayName,
			UserID:      s.UserID.String(),
			Score:       s.Score,
			TotalTime:   s.TotalTime,
			Times:       s.Times,
		}
	}

	return c.JSON(entries)
}

// MyScoreController returns the requesting user's score for a trackset.
// GET /api/tracksets/:id/my-score
func MyScoreController(c *fiber.Ctx) error {
	tsID := c.Params("id")
	userID := c.Locals("userID")

	var score models.TracksetScore
	if err := database.DB.Where("trackset_id = ? AND user_id = ?", tsID, userID).
		First(&score).Error; err != nil {
		return c.JSON(nil) // no score yet
	}

	return c.JSON(fiber.Map{
		"score":     score.Score,
		"totalTime": score.TotalTime,
		"times":     score.Times,
	})
}
