package router

import (
	"delta/codeRace/controller"
	"delta/codeRace/middleware"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
)

func SetupMatchRoutes(app fiber.Router) {
	matchApi := app.Group("/match")

	// List all tracks for the playground.
	matchApi.Get("/tracks", controller.ListTracksController)

	// Create a new match room (auth required).
	matchApi.Post("/create", middleware.RequireAuth, controller.CreateMatchController)

	// Get match info.
	matchApi.Get("/:id", controller.GetMatchController)

	// Start the match (auth required, creator only).
	matchApi.Post("/:id/start", middleware.RequireAuth, controller.StartMatchController)

	// Restart the match (auth required, creator only).
	matchApi.Post("/:id/restart", middleware.RequireAuth, controller.RestartMatchController)

	// WebSocket: join and race in a match.
	matchApi.Use("/:id/ws", middleware.WebsocketUpgrade)
	matchApi.Get("/:id/ws", websocket.New(controller.MatchSocketController))
}
