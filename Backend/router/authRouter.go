package router

import (
	"delta/codeRace/controller"
	"delta/codeRace/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupAuthRoutes(api fiber.Router) {
	auth := api.Group("/auth")

	// Google OAuth endpoint
	auth.Post("/google", controller.GoogleLoginController)

	// Get self profile
	auth.Get("/me", middleware.RequireAuth, controller.MeController)
}
