package middleware

import (
	"os"
	"strings"

	"delta/codeRace/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// JWTSecret used for signing and verifying tokens.
var JWTSecret []byte

func init() {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "coderace-dev-secret-change-in-prod"
	}
	JWTSecret = []byte(s)
}

// Claims stored inside the JWT.
type Claims struct {
	UserID      uuid.UUID `json:"uid"`
	Email       string    `json:"email"`
	DisplayName string    `json:"name"`
	IsAdmin     bool      `json:"admin"`
	jwt.RegisteredClaims
}

// GenerateToken creates a signed JWT for the given user.
func GenerateToken(user *models.User) (string, error) {
	claims := Claims{
		UserID:      user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		IsAdmin:     user.IsAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "coderace",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(JWTSecret)
}

// RequireAuth is a Fiber middleware that validates the JWT from the
// Authorization header and stores user info in Locals.
func RequireAuth(c *fiber.Ctx) error {
	auth := c.Get("Authorization")
	if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
		return c.Status(401).JSON(fiber.Map{"error": "missing or invalid token"})
	}

	tokenStr := strings.TrimPrefix(auth, "Bearer ")

	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return JWTSecret, nil
	})
	if err != nil || !token.Valid {
		return c.Status(401).JSON(fiber.Map{"error": "invalid token"})
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "invalid token claims"})
	}

	c.Locals("userID", claims.UserID)
	c.Locals("email", claims.Email)
	c.Locals("displayName", claims.DisplayName)
	c.Locals("isAdmin", claims.IsAdmin)

	return c.Next()
}

// RequireAdmin is a Fiber middleware that must come AFTER RequireAuth.
// It rejects non-admin users with 403.
func RequireAdmin(c *fiber.Ctx) error {
	isAdmin, ok := c.Locals("isAdmin").(bool)
	if !ok || !isAdmin {
		return c.Status(403).JSON(fiber.Map{"error": "admin access required"})
	}
	return c.Next()
}

// OptionalAuth is like RequireAuth but does NOT reject unauthenticated
// requests. It populates Locals if a valid token is present and silently
// continues otherwise. Useful for endpoints that behave differently when
// the caller is authenticated (e.g. ?mine=true on list).
func OptionalAuth(c *fiber.Ctx) error {
	auth := c.Get("Authorization")
	if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
		return c.Next()
	}

	tokenStr := strings.TrimPrefix(auth, "Bearer ")

	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return JWTSecret, nil
	})
	if err != nil || !token.Valid {
		return c.Next() // bad token — treat as anonymous
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		return c.Next()
	}

	c.Locals("userID", claims.UserID)
	c.Locals("email", claims.Email)
	c.Locals("displayName", claims.DisplayName)
	c.Locals("isAdmin", claims.IsAdmin)

	return c.Next()
}
