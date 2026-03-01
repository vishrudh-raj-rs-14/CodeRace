package router

import (
	"delta/codeRace/controller"
	"delta/codeRace/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupTracksetRoutes(api fiber.Router) {
	ts := api.Group("/tracksets")

	// Public but with optional auth (for ?mine=true filter).
	ts.Get("/", middleware.OptionalAuth, controller.ListTracksetsController)
	ts.Get("/:id", controller.GetTracksetController)

	// Authenticated: create, update, delete.
	ts.Post("/", middleware.RequireAuth, controller.CreateTracksetController)
	ts.Put("/:id", middleware.RequireAuth, controller.UpdateTracksetController)
	ts.Delete("/:id", middleware.RequireAuth, controller.DeleteTracksetController)
}
