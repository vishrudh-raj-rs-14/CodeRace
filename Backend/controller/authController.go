package controller

import (
	"delta/codeRace/database"
	"delta/codeRace/middleware"
	"delta/codeRace/models"
	"strings"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
)

// ─── Register ────────────────────────────────────────────────────────────────

type registerRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

func RegisterController(c *fiber.Ctx) error {
	var req registerRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.DisplayName = strings.TrimSpace(req.DisplayName)

	if req.Email == "" || req.Password == "" || req.DisplayName == "" {
		return c.Status(400).JSON(fiber.Map{"error": "email, password, and displayName are required"})
	}
	if len(req.Password) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "password must be at least 6 characters"})
	}

	// Check for existing user.
	var existing models.User
	if err := database.DB.Where("email = ?", req.Email).First(&existing).Error; err == nil {
		return c.Status(409).JSON(fiber.Map{"error": "email already registered"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to hash password"})
	}

	// First user becomes admin.
	var count int64
	database.DB.Model(&models.User{}).Count(&count)

	user := models.User{
		Email:        req.Email,
		PasswordHash: string(hash),
		DisplayName:  req.DisplayName,
		IsAdmin:      count == 0,
	}

	if err := database.DB.Create(&user).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to create user"})
	}

	token, err := middleware.GenerateToken(&user)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate token"})
	}

	return c.Status(201).JSON(fiber.Map{
		"token": token,
		"user": fiber.Map{
			"id":          user.ID,
			"email":       user.Email,
			"displayName": user.DisplayName,
			"isAdmin":     user.IsAdmin,
		},
	})
}

// ─── Login ───────────────────────────────────────────────────────────────────

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func LoginController(c *fiber.Ctx) error {
	var req loginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	var user models.User
	if err := database.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "invalid email or password"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "invalid email or password"})
	}

	token, err := middleware.GenerateToken(&user)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate token"})
	}

	return c.JSON(fiber.Map{
		"token": token,
		"user": fiber.Map{
			"id":          user.ID,
			"email":       user.Email,
			"displayName": user.DisplayName,
			"isAdmin":     user.IsAdmin,
		},
	})
}

// ─── Me (get current user) ──────────────────────────────────────────────────

func MeController(c *fiber.Ctx) error {
	userID := c.Locals("userID")
	email := c.Locals("email")
	displayName := c.Locals("displayName")
	isAdmin := c.Locals("isAdmin")

	return c.JSON(fiber.Map{
		"id":          userID,
		"email":       email,
		"displayName": displayName,
		"isAdmin":     isAdmin,
	})
}
