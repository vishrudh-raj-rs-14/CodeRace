package database

import (
	"log"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// DB is the global database connection, initialised by Init().
var DB *gorm.DB

// Init opens the Postgres connection and runs AutoMigrate for all models.
// It expects DATABASE_URL in the environment.
func Init(models ...interface{}) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=coderace password=coderace dbname=coderace port=5432 sslmode=disable"
	}

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("database: failed to connect: %v", err)
	}

	log.Println("database: connected")

	if err := DB.AutoMigrate(models...); err != nil {
		log.Fatalf("database: auto-migrate failed: %v", err)
	}

	// Drop legacy password column if upgrading an existing prod/dev database
	DB.Exec("ALTER TABLE users DROP COLUMN IF EXISTS password_hash")

	log.Println("database: migrations applied")
}
