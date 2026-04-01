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

// MySubmissionsController returns all submission attempts by the requesting user
// for a given trackset, ordered newest first.
// GET /api/tracksets/:id/my-submissions
func MySubmissionsController(c *fiber.Ctx) error {
	tsID := c.Params("id")
	userID := c.Locals("userID")

	limit := c.QueryInt("limit", 50)
	if limit > 200 {
		limit = 200
	}

	var subs []models.Submission
	if err := database.DB.
		Where("trackset_id = ? AND user_id = ?", tsID, userID).
		Order("created_at DESC").
		Limit(limit).
		Find(&subs).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch submissions"})
	}

	return c.JSON(subs)
}

// GlobalLeaderboardController returns the top scores across all official tracksets.
// GET /api/leaderboard
func GlobalLeaderboardController(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 50)
	if limit > 100 {
		limit = 100
	}

	type globalEntry struct {
		Rank        int     `json:"rank"`
		UserID      string  `json:"userId"`
		DisplayName string  `json:"displayName"`
		TotalScore  int     `json:"totalScore"`
		TotalTime   float64 `json:"totalTime"`
	}

	var results []globalEntry

	err := database.DB.Raw(`
                SELECT 
                        u.id as user_id, 
                        u.display_name, 
                        COALESCE(SUM(ts.score), 0) as total_score, 
                        COALESCE(SUM(ts.total_time), 0) as total_time
                FROM trackset_scores ts
                JOIN tracksets t ON ts.trackset_id = t.id
                JOIN users u ON ts.user_id = u.id
                WHERE t.official = true
                GROUP BY u.id, u.display_name
                ORDER BY total_score DESC, total_time ASC
                LIMIT ?
        `, limit).Scan(&results).Error

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch global leaderboard"})
	}

	for i := range results {
		results[i].Rank = i + 1
	}

	return c.JSON(results)
}
