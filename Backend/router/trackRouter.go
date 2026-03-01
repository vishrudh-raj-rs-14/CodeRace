package router

import (
	"delta/codeRace/controller"

	"github.com/gofiber/fiber/v2"
)

func SetupTrackRoutes(app fiber.Router) {
	trackApi := app.Group("/track")

	trackApi.Post("/save", controller.SaveTrackController)
	trackApi.Get("/load", controller.LoadTrackController)
}
