package main

import (
	"delta/codeRace/controller"
	"delta/codeRace/database"
	"delta/codeRace/models"
	"delta/codeRace/router"
	"delta/codeRace/sandbox"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func main() {

	// ── Database ─────────────────────────────────────────────────────────
	database.Init(
		&models.User{},
		&models.Trackset{},
		&models.Track{},
		&models.TracksetScore{},
		&models.Submission{},
	)

	// ── Sandbox manager ──────────────────────────────────────────────────
	controller.SandboxMgr = sandbox.NewManager()

	app := fiber.New(fiber.Config{
		BodyLimit: 50 * 1024 * 1024, // 50 MB for large trackset payloads
	})

	// Allow the React dev server to reach the API / WS.
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	app.Get("/api/ping", func(c *fiber.Ctx) error {
		return c.SendString("pong")
	})

	api := app.Group("/api")

	// ── Routes ───────────────────────────────────────────────────────────
	router.SetupAuthRoutes(api)
	router.SetupGameRoutes(api)
	router.SetupTrackRoutes(api)
	router.SetupTracksetRoutes(api)
	router.SetupLeaderboardRoutes(api)
	router.SetupMatchRoutes(api)

	log.Fatal(app.Listen(":3000"))
}
