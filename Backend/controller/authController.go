package controller

import (
	"context"
	"delta/codeRace/database"
	"delta/codeRace/middleware"
	"delta/codeRace/models"
	"os"

	"github.com/gofiber/fiber/v2"
	"google.golang.org/api/idtoken"
)

type googleLoginRequest struct {
	Credential string `json:"credential"`
}

func GoogleLoginController(c *fiber.Ctx) error {
	var req googleLoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Credential == "" {
		return c.Status(400).JSON(fiber.Map{"error": "credential missing"})
	}

	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	if clientID == "" {
		return c.Status(500).JSON(fiber.Map{"error": "server misconfigured (GOOGLE_CLIENT_ID missing)"})
	}

	payload, err := idtoken.Validate(context.Background(), req.Credential, clientID)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "invalid google token", "details": err.Error()})
	}

	email := payload.Claims["email"].(string)
	name := ""
	if n, ok := payload.Claims["name"]; ok {
		name = n.(string)
	}

	// Create a cool techy avatar using DiceBear Bottts based on the user's email
	picture := "https://api.dicebear.com/7.x/bottts/svg?seed=" + email

	// Find or create user
	var user models.User
	result := database.DB.Where("email = ?", email).First(&user)
	if result.Error != nil {
		// Create new user
		user = models.User{
			Email:       email,
			DisplayName: name,
			Picture:     picture,
		}
		if err := database.DB.Create(&user).Error; err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "could not create user: " + err.Error()})
		}
	} else {
		// Update profile picture and name if they changed
		user.DisplayName = name
		user.Picture = picture
		database.DB.Save(&user)
	}

	// Generate JWT
	tokenStr, err := middleware.GenerateToken(&user)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate token"})
	}

	return c.JSON(fiber.Map{
		"token": tokenStr,
		"user": fiber.Map{
			"id":          user.ID,
			"email":       user.Email,
			"displayName": user.DisplayName,
			"picture":     user.Picture,
			"isAdmin":     user.IsAdmin,
		},
	})
}

// MeController returns the currently authenticated user's profile.
func MeController(c *fiber.Ctx) error {
	userID := c.Locals("userID")

	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "user not found"})
	}

	return c.JSON(fiber.Map{
		"id":          user.ID,
		"email":       user.Email,
		"displayName": user.DisplayName,
		"picture":     user.Picture,
		"isAdmin":     user.IsAdmin,
	})
}
