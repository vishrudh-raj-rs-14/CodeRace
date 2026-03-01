package racer

import (
	"encoding/json"
	"math"
	"os"
	"sync"
	"time"
)

// ─── constants ───────────────────────────────────────────────────────────────

const (
	TickRate  = 60
	TickDelta = 1.0 / float64(TickRate)

	// Viewport the player sees.
	ViewW = 960
	ViewH = 720

	// World.
	WorldW = 8000
	WorldH = 8000

	// Car body (width = lateral, height = length along heading).
	CarW = 22
	CarH = 44

	// Wheelbase (distance between front and rear axle).
	Wheelbase = 38.0

	// ── engine / drivetrain ──────────────────────────────────────────────
	EngineForce   = 480.0  // forward acceleration (px/s²)
	BrakeForce    = 750.0  // braking deceleration (px/s²)
	ReversePower  = 200.0  // reverse acceleration
	MaxSpeed      = 580.0  // forward top speed (px/s)
	MaxReverseSpd = 140.0  // reverse top speed
	DragCoeff     = 0.0012 // air drag ∝ v²
	RollingFrict  = 22.0   // base rolling friction (px/s²)

	// ── steering ─────────────────────────────────────────────────────────
	MaxSteerAngle = 33.0 * (math.Pi / 180) // max wheel angle (radians)
	SteerSpeed    = 5.0                    // wheel turn rate (rad/s)
	SteerReturn   = 8.0                    // wheel self-centre rate (rad/s)

	// ── traction / grip ──────────────────────────────────────────────────
	// MaxLateralG is the maximum lateral acceleration (px/s²) that the
	// tyres can exert to kill sideways velocity, at full surface grip.
	// This is the CORE of the slip model.  When a turn generates more
	// lateral velocity than the tyres can absorb, the excess persists
	// as a slide / drift.
	MaxLateralG = 2200.0

	// DriftDamping is extra per-second damping on lateral velocity while
	// sliding, so drifts don't last forever.
	DriftDamping = 2.5

	// Minimum lateral velocity to flag as "drifting" (avoids flicker).
	DriftThreshold = 25.0

	// BrakeGripPenalty – braking while turning reduces available grip.
	BrakeGripPenalty = 0.45

	// WallBounce – fraction of velocity kept on wall hit (negative = bounce).
	WallBounce = -0.3
)

// ─── surface types ───────────────────────────────────────────────────────────

type SurfaceType int

const (
	SurfaceRoad SurfaceType = iota
	SurfaceGrass
	SurfaceSand
	SurfaceIce
	SurfaceWall
)

type SurfaceProps struct {
	Grip      float64 // 0‥1  lateral grip multiplier
	DragMult  float64 // rolling-friction multiplier
	SpeedMult float64 // top-speed multiplier
	Color     string
	Name      string
}

var Surfaces = map[SurfaceType]SurfaceProps{
	SurfaceRoad:  {Grip: 1.00, DragMult: 1.0, SpeedMult: 1.00, Color: "#555566", Name: "road"},
	SurfaceGrass: {Grip: 0.45, DragMult: 2.2, SpeedMult: 0.65, Color: "#2d5a27", Name: "grass"},
	SurfaceSand:  {Grip: 0.28, DragMult: 3.5, SpeedMult: 0.45, Color: "#c2b280", Name: "sand"},
	SurfaceIce:   {Grip: 0.07, DragMult: 0.3, SpeedMult: 1.00, Color: "#b8e0f0", Name: "ice"},
	SurfaceWall:  {Grip: 0.00, DragMult: 0.0, SpeedMult: 0.00, Color: "#333344", Name: "wall"},
}

// SurfaceByName maps name strings back to SurfaceType.
var SurfaceByName = map[string]SurfaceType{
	"road":  SurfaceRoad,
	"grass": SurfaceGrass,
	"sand":  SurfaceSand,
	"ice":   SurfaceIce,
	"wall":  SurfaceWall,
}

// ─── track ───────────────────────────────────────────────────────────────────

type TrackRect struct {
	X, Y, W, H float64
	Surface    SurfaceType
}

type SurfaceRectJSON struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	W     float64 `json:"w"`
	H     float64 `json:"h"`
	Color string  `json:"color"`
	Name  string  `json:"name"`
}

// ─── checkpoints & finish ────────────────────────────────────────────────────

// CheckpointRect is a zone the car must drive through, in order.
type CheckpointRect struct {
	X, Y, W, H float64
	Order      int
}

// CheckpointJSON is the JSON-serialisable form of a checkpoint.
type CheckpointJSON struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	W     float64 `json:"w"`
	H     float64 `json:"h"`
	Order int     `json:"order"`
}

// FinishRect is the finish zone – crossing it after all checkpoints = race won.
type FinishRect struct {
	X, Y, W, H float64
}

// FinishJSON is the JSON-serialisable form of the finish zone.
type FinishJSON struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// RaceState is included in every frame so the frontend knows progress.
type RaceState struct {
	CheckpointsHit   []int  `json:"checkpointsHit"` // indices of collected CPs
	TotalCheckpoints int    `json:"totalCheckpoints"`
	Finished         bool   `json:"finished"`
	FinishTick       uint64 `json:"finishTick,omitempty"`
}

// DefaultTrack – 8000×8000 world, four surface quadrants, road grid.
func DefaultTrack() []TrackRect {
	return []TrackRect{
		// ── quadrant background fills (painted first) ────────────────────
		{X: 0, Y: 0, W: 4000, H: 4000, Surface: SurfaceIce},         // NW
		{X: 4000, Y: 0, W: 4000, H: 4000, Surface: SurfaceSand},     // NE
		{X: 0, Y: 4000, W: 4000, H: 4000, Surface: SurfaceGrass},    // SW
		{X: 4000, Y: 4000, W: 4000, H: 4000, Surface: SurfaceGrass}, // SE

		// ── central cross highways ───────────────────────────────────────
		{X: 0, Y: 3800, W: 8000, H: 400, Surface: SurfaceRoad}, // horizontal
		{X: 3800, Y: 0, W: 400, H: 8000, Surface: SurfaceRoad}, // vertical

		// ── perimeter ring road ──────────────────────────────────────────
		{X: 150, Y: 150, W: 7700, H: 280, Surface: SurfaceRoad},  // top
		{X: 150, Y: 7570, W: 7700, H: 280, Surface: SurfaceRoad}, // bottom
		{X: 150, Y: 150, W: 280, H: 7700, Surface: SurfaceRoad},  // left
		{X: 7570, Y: 150, W: 280, H: 7700, Surface: SurfaceRoad}, // right

		// ── ice quadrant (NW) roads ──────────────────────────────────────
		{X: 1800, Y: 430, W: 280, H: 3370, Surface: SurfaceRoad}, // vertical
		{X: 430, Y: 1800, W: 3370, H: 280, Surface: SurfaceRoad}, // horizontal

		// ── sand quadrant (NE) roads ─────────────────────────────────────
		{X: 5900, Y: 430, W: 280, H: 3370, Surface: SurfaceRoad},  // vertical
		{X: 4200, Y: 1800, W: 3370, H: 280, Surface: SurfaceRoad}, // horizontal

		// ── grass quadrant (SW) roads ────────────────────────────────────
		{X: 1800, Y: 4200, W: 280, H: 3370, Surface: SurfaceRoad}, // vertical
		{X: 430, Y: 5900, W: 3370, H: 280, Surface: SurfaceRoad},  // horizontal

		// ── grass quadrant (SE) roads ────────────────────────────────────
		{X: 5900, Y: 4200, W: 280, H: 3370, Surface: SurfaceRoad}, // vertical
		{X: 4200, Y: 5900, W: 3370, H: 280, Surface: SurfaceRoad}, // horizontal

		// ── racing circuit in SE quadrant ────────────────────────────────
		{X: 4600, Y: 4600, W: 2800, H: 250, Surface: SurfaceRoad}, // top
		{X: 4600, Y: 7100, W: 2800, H: 250, Surface: SurfaceRoad}, // bottom
		{X: 4600, Y: 4600, W: 250, H: 2750, Surface: SurfaceRoad}, // left
		{X: 7150, Y: 4600, W: 250, H: 2750, Surface: SurfaceRoad}, // right

		// ── diagonal-ish shortcut roads ──────────────────────────────────
		{X: 2800, Y: 2800, W: 1000, H: 280, Surface: SurfaceRoad}, // NW corner
		{X: 4200, Y: 2800, W: 1000, H: 280, Surface: SurfaceRoad}, // NE corner
		{X: 2800, Y: 4920, W: 1000, H: 280, Surface: SurfaceRoad}, // SW corner
		{X: 4200, Y: 4920, W: 1000, H: 280, Surface: SurfaceRoad}, // SE corner
	}
}

func trackRectsJSON(rects []TrackRect) []SurfaceRectJSON {
	out := make([]SurfaceRectJSON, len(rects))
	for i, r := range rects {
		s := Surfaces[r.Surface]
		out[i] = SurfaceRectJSON{X: r.X, Y: r.Y, W: r.W, H: r.H, Color: s.Color, Name: s.Name}
	}
	return out
}

// surfaceAt – last matching rect wins (painter order); default grass.
func surfaceAt(rects []TrackRect, x, y float64) SurfaceProps {
	result := Surfaces[SurfaceGrass]
	for _, r := range rects {
		if x >= r.X && x <= r.X+r.W && y >= r.Y && y <= r.Y+r.H {
			result = Surfaces[r.Surface]
		}
	}
	return result
}

// ─── track file I/O ──────────────────────────────────────────────────────────

const TrackFilePath = "./tracks/current.json"

// TrackRectData is the JSON form of a placed rectangle.
type TrackRectData struct {
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	W       float64 `json:"w"`
	H       float64 `json:"h"`
	Surface string  `json:"surface"`
}

// TrackFileData is the complete saved track.
type TrackFileData struct {
	WorldW       int              `json:"worldW"`
	WorldH       int              `json:"worldH"`
	GridSize     int              `json:"gridSize"`
	StartX       float64          `json:"startX"`
	StartY       float64          `json:"startY"`
	StartHeading float64          `json:"startHeading"`
	Rects        []TrackRectData  `json:"rects"`
	Checkpoints  []CheckpointJSON `json:"checkpoints"`
	Finish       *FinishJSON      `json:"finish,omitempty"`
}

// SaveTrackFile persists track data to disk.
func SaveTrackFile(data TrackFileData) error {
	_ = os.MkdirAll("./tracks", 0755)
	b, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(TrackFilePath, b, 0644)
}

// LoadTrackFile reads a saved track from disk.
func LoadTrackFile() (*TrackFileData, error) {
	b, err := os.ReadFile(TrackFilePath)
	if err != nil {
		return nil, err
	}
	var data TrackFileData
	if err := json.Unmarshal(b, &data); err != nil {
		return nil, err
	}
	return &data, nil
}

// TrackFromFile converts saved data into engine TrackRects.
func TrackFromFile(data *TrackFileData) []TrackRect {
	rects := make([]TrackRect, 0, len(data.Rects))
	for _, r := range data.Rects {
		st, ok := SurfaceByName[r.Surface]
		if !ok {
			st = SurfaceGrass
		}
		rects = append(rects, TrackRect{X: r.X, Y: r.Y, W: r.W, H: r.H, Surface: st})
	}
	return rects
}

// ─── input / output types ────────────────────────────────────────────────────

// W = throttle, S = brake/reverse, A = steer left, D = steer right.
type InputState struct {
	W bool `json:"w"`
	A bool `json:"a"`
	S bool `json:"s"`
	D bool `json:"d"`
}

type Car struct {
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	W          int     `json:"w"`
	H          int     `json:"h"`
	Heading    float64 `json:"heading"`    // radians, 0 = right
	Speed      float64 `json:"speed"`      // forward speed px/s
	LateralV   float64 `json:"lateralV"`   // lateral (slip) velocity px/s
	SteerAngle float64 `json:"steerAngle"` // current front-wheel angle
	Drifting   bool    `json:"drifting"`
	Surface    string  `json:"surface"`
}

type Frame struct {
	Tick        uint64            `json:"tick"`
	Car         Car               `json:"car"`
	World       WorldInfo         `json:"world"`
	Track       []SurfaceRectJSON `json:"track"`
	Checkpoints []CheckpointJSON  `json:"checkpoints"`
	Finish      *FinishJSON       `json:"finish,omitempty"`
	Race        RaceState         `json:"race"`
	Camera      CameraInfo        `json:"camera"`
}

type WorldInfo struct {
	W int `json:"w"`
	H int `json:"h"`
}

type CameraInfo struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W int     `json:"w"`
	H int     `json:"h"`
}

// ─── racer ───────────────────────────────────────────────────────────────────

type Racer struct {
	mu    sync.RWMutex
	input InputState

	car  Car
	velX float64
	velY float64
	tick uint64

	track     []TrackRect
	trackJSON []SurfaceRectJSON
	worldW    int
	worldH    int

	// ── race objectives ────────────────────────────────────────────────
	checkpoints     []CheckpointRect
	checkpointsJSON []CheckpointJSON
	finish          *FinishRect
	finishJSON      *FinishJSON
	checkpointsHit  map[int]bool // order → hit?
	finished        bool
	finishTick      uint64

	Frames chan []byte
	done   chan struct{}
}

// Finished reports whether the racer has crossed the finish after all
// checkpoints.
func (r *Racer) Finished() bool { return r.finished }

// FinishTick returns the tick at which the car finished (0 if not finished).
func (r *Racer) FinishTickVal() uint64 { return r.finishTick }

// CheckpointsHit returns the set of collected checkpoint orders.
func (r *Racer) CheckpointsHitSet() map[int]bool { return r.checkpointsHit }

// TotalCheckpoints returns the number of checkpoints on the track.
func (r *Racer) TotalCheckpoints() int { return len(r.checkpoints) }

// NewRacerFromTrack creates a Racer initialised from an in-memory
// TrackFileData struct.  This is the primary constructor used when track
// data comes from the database rather than a file on disk.
func NewRacerFromTrack(data *TrackFileData) *Racer {
	track := TrackFromFile(data)
	startX := data.StartX
	startY := data.StartY
	startHeading := data.StartHeading
	wW, wH := WorldW, WorldH
	if data.WorldW > 0 {
		wW = data.WorldW
	}
	if data.WorldH > 0 {
		wH = data.WorldH
	}

	var cps []CheckpointRect
	var cpsJSON []CheckpointJSON
	for _, cp := range data.Checkpoints {
		cps = append(cps, CheckpointRect{X: cp.X, Y: cp.Y, W: cp.W, H: cp.H, Order: cp.Order})
		cpsJSON = append(cpsJSON, cp)
	}

	var fin *FinishRect
	var finJSON *FinishJSON
	if data.Finish != nil {
		fin = &FinishRect{X: data.Finish.X, Y: data.Finish.Y, W: data.Finish.W, H: data.Finish.H}
		finJSON = data.Finish
	}

	r := &Racer{
		car: Car{
			X:       startX,
			Y:       startY,
			W:       CarW,
			H:       CarH,
			Heading: startHeading,
		},
		track:           track,
		trackJSON:       trackRectsJSON(track),
		worldW:          wW,
		worldH:          wH,
		checkpoints:     cps,
		checkpointsJSON: cpsJSON,
		finish:          fin,
		finishJSON:      finJSON,
		checkpointsHit:  make(map[int]bool),
		Frames:          make(chan []byte, 4),
		done:            make(chan struct{}),
	}
	r.car.Surface = surfaceAt(r.track, r.car.X, r.car.Y).Name
	return r
}

// NewRacer creates a Racer from the file-based track (legacy, used by
// the WebSocket game controller).
func NewRacer() *Racer {
	if data, err := LoadTrackFile(); err == nil && len(data.Rects) > 0 {
		return NewRacerFromTrack(data)
	}
	// Fallback to default track.
	data := &TrackFileData{
		WorldW:   WorldW,
		WorldH:   WorldH,
		StartX:   500,
		StartY:   4000,
		GridSize: 50,
	}
	// Convert default track rects to TrackRectData.
	for _, r := range DefaultTrack() {
		data.Rects = append(data.Rects, TrackRectData{
			X: r.X, Y: r.Y, W: r.W, H: r.H,
			Surface: Surfaces[r.Surface].Name,
		})
	}
	return NewRacerFromTrack(data)
}

func (r *Racer) UpdateInput(state InputState) {
	r.mu.Lock()
	r.input = state
	r.mu.Unlock()
}

func (r *Racer) Start() { go r.loop() }

func (r *Racer) Stop() {
	select {
	case <-r.done:
	default:
		close(r.done)
	}
}

func (r *Racer) loop() {
	ticker := time.NewTicker(time.Second / TickRate)
	defer ticker.Stop()
	defer close(r.Frames)

	for {
		select {
		case <-r.done:
			return
		case <-ticker.C:
			r.update()
			r.emit()
		}
	}
}

// ─── physics ─────────────────────────────────────────────────────────────────
//
// Two-force tyre model:
//
//  1. THRUST – engine force along the tyre heading (forward axis).
//     Accelerates/decelerates the car.  Resisted by air drag and
//     rolling friction.
//
//  2. GRIP – lateral force perpendicular to the tyres that prevents
//     the car from sliding sideways.  It has a MAXIMUM (depends on
//     surface grip).  When a turn generates more lateral velocity than
//     the tyres can absorb, the excess persists → the car drifts /
//     understeers.
//
// This means:
//   • On road you can corner cleanly at moderate speed but must brake
//     for sharp turns at high speed (grip limit exceeded).
//   • On ice the grip limit is tiny, so any steering at speed causes
//     the car to keep sliding in the original direction.
//   • Braking while turning further reduces grip → brake-initiated
//     drifts.
//
// The car does NOT artificially slow down when turning.  Speed only
// changes from engine, drag, and friction.  The *direction* of
// velocity changes based on how much grip the tyres have.

func (r *Racer) update() {
	r.mu.RLock()
	input := r.input
	r.mu.RUnlock()

	dt := TickDelta
	c := &r.car

	surf := surfaceAt(r.track, c.X, c.Y)
	c.Surface = surf.Name

	speed := math.Sqrt(r.velX*r.velX + r.velY*r.velY)

	// ── 1. steering (bicycle model) ─────────────────────────────────────

	targetSteer := 0.0
	if input.A {
		targetSteer = -MaxSteerAngle
	}
	if input.D {
		targetSteer = MaxSteerAngle
	}

	if targetSteer != 0 {
		c.SteerAngle = moveToward(c.SteerAngle, targetSteer, SteerSpeed*dt)
	} else {
		c.SteerAngle = moveToward(c.SteerAngle, 0, SteerReturn*dt)
	}

	// At high speed the effective steer is reduced (narrower turning arc).
	speedRatio := math.Min(speed/MaxSpeed, 1.0)
	effectiveSteer := c.SteerAngle * (1.0 - 0.35*speedRatio)

	// Turn the heading via bicycle model.
	if speed > 0.5 {
		turnRadius := Wheelbase / math.Tan(math.Abs(effectiveSteer)+0.001)
		angVel := speed / turnRadius
		if effectiveSteer < 0 {
			angVel = -angVel
		}
		c.Heading += angVel * dt
		c.Heading = normalizeAngle(c.Heading)
	}

	// ── 2. decompose velocity into forward / lateral ────────────────────

	fwdX := math.Cos(c.Heading)
	fwdY := math.Sin(c.Heading)
	latX := -fwdY // right-hand perpendicular
	latY := fwdX

	fwdSpeed := r.velX*fwdX + r.velY*fwdY
	latSpeed := r.velX*latX + r.velY*latY

	// ── 3. engine / brake (along forward axis only) ─────────────────────

	braking := false

	if input.W {
		topSpd := MaxSpeed * surf.SpeedMult
		if fwdSpeed < topSpd {
			fwdSpeed += EngineForce * dt
			if fwdSpeed > topSpd {
				fwdSpeed = topSpd
			}
		}
	}

	if input.S {
		if fwdSpeed > 2.0 {
			// Braking (opposing forward motion).
			braking = true
			fwdSpeed -= BrakeForce * dt
			if fwdSpeed < 0 {
				fwdSpeed = 0 // brake doesn't reverse
			}
		} else {
			// Reverse.
			fwdSpeed -= ReversePower * dt
			if fwdSpeed < -MaxReverseSpd {
				fwdSpeed = -MaxReverseSpd
			}
		}
	}

	// ── 4. drag + rolling friction ──────────────────────────────────────

	drag := -DragCoeff * fwdSpeed * math.Abs(fwdSpeed)
	fwdSpeed += drag * dt

	roll := RollingFrict * surf.DragMult
	if math.Abs(fwdSpeed) < roll*dt {
		fwdSpeed = 0
	} else {
		fwdSpeed -= sign(fwdSpeed) * roll * dt
	}

	// ── 5. lateral grip (THE key force) ─────────────────────────────────
	//
	// gripBudget = maximum lateral velocity the tyres can absorb this tick.
	// If |latSpeed| ≤ gripBudget → tyres fully correct it (clean turn).
	// If |latSpeed| > gripBudget → excess lateral persists (drift/slide).

	gripMul := surf.Grip
	if braking {
		gripMul *= BrakeGripPenalty
	}

	gripBudget := MaxLateralG * gripMul * dt

	if math.Abs(latSpeed) <= gripBudget {
		// Tyres handle it – kill lateral velocity entirely.
		latSpeed = 0
	} else {
		// Tyres at limit – absorb what they can, rest is slide.
		latSpeed -= sign(latSpeed) * gripBudget
		// Extra damping so drifts settle over time.
		latSpeed *= (1.0 - DriftDamping*dt)
	}

	c.Drifting = math.Abs(latSpeed) > DriftThreshold

	// ── 6. recompose world velocity ─────────────────────────────────────

	r.velX = fwdX*fwdSpeed + latX*latSpeed
	r.velY = fwdY*fwdSpeed + latY*latSpeed
	c.Speed = fwdSpeed
	c.LateralV = latSpeed

	// ── 7. integrate position ───────────────────────────────────────────

	c.X += r.velX * dt
	c.Y += r.velY * dt

	// ── wall-block collisions ───────────────────────────────────────────
	// Check all four corners + centre of the car's AABB against wall rects.
	// A wall rect only blocks if surfaceAt at that probe is still wall
	// (a later non-wall rect may override it via painter order).
	halfCW := float64(c.W) / 2
	halfCH := float64(c.H) / 2
	for _, tr := range r.track {
		if tr.Surface != SurfaceWall {
			continue
		}
		if c.X+halfCW > tr.X && c.X-halfCW < tr.X+tr.W &&
			c.Y+halfCH > tr.Y && c.Y-halfCH < tr.Y+tr.H {
			// Only collide if the surface at the car centre is still wall.
			if surfaceAt(r.track, c.X, c.Y).Name != "wall" {
				continue
			}
			penL := (c.X + halfCW) - tr.X
			penR := (tr.X + tr.W) - (c.X - halfCW)
			penU := (c.Y + halfCH) - tr.Y
			penD := (tr.Y + tr.H) - (c.Y - halfCH)
			minPen := math.Min(math.Min(penL, penR), math.Min(penU, penD))
			switch {
			case minPen == penL:
				c.X = tr.X - halfCW - 0.5
				r.velX *= WallBounce
			case minPen == penR:
				c.X = tr.X + tr.W + halfCW + 0.5
				r.velX *= WallBounce
			case minPen == penU:
				c.Y = tr.Y - halfCH - 0.5
				r.velY *= WallBounce
			default:
				c.Y = tr.Y + tr.H + halfCH + 0.5
				r.velY *= WallBounce
			}
		}
	}

	// World boundary collisions.
	margin := float64(CarH)
	if c.X < margin {
		c.X = margin
		if r.velX < 0 {
			r.velX *= WallBounce
		}
	}
	if c.X > float64(r.worldW)-margin {
		c.X = float64(r.worldW) - margin
		if r.velX > 0 {
			r.velX *= WallBounce
		}
	}
	if c.Y < margin {
		c.Y = margin
		if r.velY < 0 {
			r.velY *= WallBounce
		}
	}
	if c.Y > float64(r.worldH)-margin {
		c.Y = float64(r.worldH) - margin
		if r.velY > 0 {
			r.velY *= WallBounce
		}
	}

	// ── checkpoint / finish detection ───────────────────────────────────
	if !r.finished {
		for i := range r.checkpoints {
			cp := &r.checkpoints[i]
			if r.checkpointsHit[cp.Order] {
				continue
			}
			if c.X >= cp.X && c.X <= cp.X+cp.W && c.Y >= cp.Y && c.Y <= cp.Y+cp.H {
				r.checkpointsHit[cp.Order] = true
			}
		}
		// Finish line: only if ALL checkpoints collected.
		if r.finish != nil && len(r.checkpointsHit) == len(r.checkpoints) {
			f := r.finish
			if c.X >= f.X && c.X <= f.X+f.W && c.Y >= f.Y && c.Y <= f.Y+f.H {
				r.finished = true
				r.finishTick = r.tick + 1 // will be incremented below
			}
		}
	}

	r.tick++
}

// ─── public API for external drivers (bot runner) ───────────────────────────

// BuildFrame returns the current game state as a Frame without advancing
// physics.  Used by the bot runner to capture state between ticks.
func (r *Racer) BuildFrame() Frame {
	c := r.car

	camX := c.X - float64(ViewW)/2
	camY := c.Y - float64(ViewH)/2
	camX = clamp(camX, 0, math.Max(0, float64(r.worldW)-float64(ViewW)))
	camY = clamp(camY, 0, math.Max(0, float64(r.worldH)-float64(ViewH)))

	// Collect checkpoint hit list.
	hitList := make([]int, 0, len(r.checkpointsHit))
	for order := range r.checkpointsHit {
		hitList = append(hitList, order)
	}

	return Frame{
		Tick:        r.tick,
		Car:         c,
		Track:       r.trackJSON,
		Checkpoints: r.checkpointsJSON,
		Finish:      r.finishJSON,
		Race: RaceState{
			CheckpointsHit:   hitList,
			TotalCheckpoints: len(r.checkpoints),
			Finished:         r.finished,
			FinishTick:       r.finishTick,
		},
		World: WorldInfo{W: r.worldW, H: r.worldH},
		Camera: CameraInfo{
			X: camX,
			Y: camY,
			W: ViewW,
			H: ViewH,
		},
	}
}

// Tick advances the physics simulation by one step using the current input.
func (r *Racer) Tick() {
	r.update()
}

// CurrentSurface returns the surface properties at the car's current position.
func (r *Racer) CurrentSurface() SurfaceProps {
	return surfaceAt(r.track, r.car.X, r.car.Y)
}

// ─── emit ────────────────────────────────────────────────────────────────────

func (r *Racer) emit() {
	data, err := json.Marshal(r.BuildFrame())
	if err != nil {
		return
	}

	select {
	case r.Frames <- data:
	default:
	}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func sign(v float64) float64 {
	if v > 0 {
		return 1
	}
	if v < 0 {
		return -1
	}
	return 0
}

func moveToward(current, target, maxDelta float64) float64 {
	if math.Abs(target-current) <= maxDelta {
		return target
	}
	return current + sign(target-current)*maxDelta
}

func normalizeAngle(a float64) float64 {
	for a > math.Pi {
		a -= 2 * math.Pi
	}
	for a < -math.Pi {
		a += 2 * math.Pi
	}
	return a
}
