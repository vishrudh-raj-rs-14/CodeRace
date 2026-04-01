package router

import (
	"delta/codeRace/controller"
	"delta/codeRace/middleware"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
)

func SetupGameRoutes(app fiber.Router) {

	gameApi := app.Group("/game")

	gameApi.Get("/test", controller.GameTestController)

	// WebSocket: middleware checks upgrade, then hand off to controller.
	gameApi.Use("/ws", middleware.WebsocketUpgrade)
	gameApi.Get("/ws", websocket.New(controller.GameSocketController))

	// Legacy bot race (file-based track).
	gameApi.Post("/bot", controller.BotRunController)

	// ── New endpoints (DB-backed tracks) ─────────────────────────────────

	// Run: test code on a single track (auth required).
	gameApi.Post("/run", middleware.RequireAuth, controller.RunTrackController)

	// Submit: run code on all tracks in a trackset (auth required).
	gameApi.Post("/submit", middleware.RequireAuth, controller.SubmitTracksetController)
}

// SetupLeaderboardRoutes attaches leaderboard endpoints under /api/tracksets/:id and /api/leaderboard.
func SetupLeaderboardRoutes(api fiber.Router) {
	api.Get("/leaderboard", controller.GlobalLeaderboardController)
	api.Get("/tracksets/:id/leaderboard", controller.LeaderboardController)
	api.Get("/tracksets/:id/my-score", middleware.RequireAuth, controller.MyScoreController)
	api.Get("/tracksets/:id/my-submissions", middleware.RequireAuth, controller.MySubmissionsController)
}
