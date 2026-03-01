package router

import (
	"delta/codeRace/controller"
	"delta/codeRace/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupAuthRoutes(api fiber.Router) {
	auth := api.Group("/auth")
	auth.Post("/register", controller.RegisterController)
	auth.Post("/login", controller.LoginController)
	auth.Get("/me", middleware.RequireAuth, controller.MeController)
}
