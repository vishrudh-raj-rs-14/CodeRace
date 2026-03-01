package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ─── User ────────────────────────────────────────────────────────────────────

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	DisplayName  string    `gorm:"not null" json:"displayName"`
	IsAdmin      bool      `gorm:"default:false" json:"isAdmin"`
	CreatedAt    time.Time `json:"createdAt"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// ─── Trackset ────────────────────────────────────────────────────────────────

type Trackset struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Name        string    `gorm:"not null" json:"name"`
	Description string    `json:"description"`
	CreatedBy   uuid.UUID `gorm:"type:uuid;not null" json:"createdBy"`
	Creator     User      `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	Official    bool      `gorm:"default:false" json:"official"`
	CreatedAt   time.Time `json:"createdAt"`
	Tracks      []Track   `gorm:"foreignKey:TracksetID" json:"tracks,omitempty"`
}

func (t *Trackset) BeforeCreate(tx *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return nil
}

// ─── Track ───────────────────────────────────────────────────────────────────

// Track represents a single track within a trackset. Data is stored as JSONB
// matching the racer.TrackFileData structure.
type Track struct {
	ID         uuid.UUID       `gorm:"type:uuid;primaryKey" json:"id"`
	TracksetID uuid.UUID       `gorm:"type:uuid;not null;uniqueIndex:idx_trackset_order" json:"tracksetId"`
	OrderIndex int             `gorm:"not null;uniqueIndex:idx_trackset_order" json:"orderIndex"`
	Data       json.RawMessage `gorm:"type:jsonb;not null" json:"data"`
	CreatedAt  time.Time       `json:"createdAt"`
}

func (t *Track) BeforeCreate(tx *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return nil
}

// ─── TracksetScore ───────────────────────────────────────────────────────────

// TracksetScore stores a player's best submission for a trackset.
// Primary key is (TracksetID, UserID).
type TracksetScore struct {
	TracksetID  uuid.UUID       `gorm:"type:uuid;primaryKey" json:"tracksetId"`
	UserID      uuid.UUID       `gorm:"type:uuid;primaryKey" json:"userId"`
	User        User            `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Trackset    Trackset        `gorm:"foreignKey:TracksetID" json:"-"`
	Code        string          `gorm:"type:text" json:"-"`      // winning code
	CodeHistory json.RawMessage `gorm:"type:jsonb" json:"-"`     // past submissions
	Times       json.RawMessage `gorm:"type:jsonb" json:"times"` // [float] per track
	TotalTime   float64         `gorm:"not null;default:0" json:"totalTime"`
	Score       int             `gorm:"not null;default:0;index" json:"score"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}
