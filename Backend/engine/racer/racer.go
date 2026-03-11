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
	Wheelbase = 46.0

	// ── engine / drivetrain ──────────────────────────────────────────────
	EngineForce     = 520.0   // acceleration in low-speed band (px/s²)
	EngineForceHigh = 120.0   // acceleration in high-speed band (px/s²)
	PowerBandKnee   = 480.0   // speed where power band transitions
	BrakeForce      = 750.0   // braking deceleration (px/s²)
	ReversePower    = 200.0   // reverse acceleration
	MaxSpeed        = 960.0   // forward top speed (px/s)
	MaxReverseSpd   = 160.0   // reverse top speed
	DragCoeff       = 0.00015 // air drag ∝ v²
	RollingFrict    = 22.0    // base rolling friction (px/s²)

	// ── steering ─────────────────────────────────────────────────────────
	MaxSteerAngle = 33.0 * (math.Pi / 180) // max wheel angle (radians)
	SteerSpeed    = 5.0                    // wheel turn rate (rad/s)
	SteerReturn   = 8.0                    // wheel self-centre rate (rad/s)

	// ── traction / grip ──────────────────────────────────────────────────
	// TractionCoeff is the cornering stiffness — how quickly traction
	// force builds with lateral velocity (proportional region).
	TractionCoeff = 15.0

	// MaxTractionForce is the peak lateral force (px/s²) the tyres can
	// exert at full surface grip (saturation cap of the tyre curve).
	MaxTractionForce = 2200.0

	// DriveGripScale controls how much surface grip affects throttle and
	// brake force at low speed.  At standstill driveGrip = min(1, grip ×
	// DriveGripScale); as speed rises the penalty fades away so the car
	// can still reach full top speed on any surface.
	DriveGripScale = 2.5

	// Minimum lateral velocity to flag as "drifting" (avoids flicker).
	DriftThreshold = 25.0

	// BrakeGripPenalty – braking while turning reduces available grip.
	BrakeGripPenalty = 0.25

	// BrakeDriftBoost – extra heading rotation rate (rad/s) the rear end
	// gains when the driver brakes while steering above BrakeDriftMinSpd.
	BrakeDriftBoost  = 1.8
	BrakeDriftMinSpd = 120.0

	// WallBounce – fraction of velocity kept on wall hit (negative = bounce).
	WallBounce = -0.3
)

// ─── surface types ───────────────────────────────────────────────────────────

type SurfaceType int

const (
	SurfaceRoad SurfaceType = iota
	SurfaceGrass
	SurfaceDirt
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
	SurfaceGrass: {Grip: 0.45, DragMult: 3.0, SpeedMult: 0.50, Color: "#2d5a27", Name: "grass"},
	SurfaceDirt:  {Grip: 0.35, DragMult: 3.5, SpeedMult: 0.60, Color: "#8B7355", Name: "dirt"},
	SurfaceIce:   {Grip: 0.07, DragMult: 0.3, SpeedMult: 1.00, Color: "#b8e0f0", Name: "ice"},
	SurfaceWall:  {Grip: 0.00, DragMult: 0.0, SpeedMult: 0.00, Color: "#333344", Name: "wall"},
}

// SurfaceByName maps name strings back to SurfaceType.
var SurfaceByName = map[string]SurfaceType{
	"road":  SurfaceRoad,
	"grass": SurfaceGrass,
	"dirt":  SurfaceDirt,
	"sand":  SurfaceDirt, // backward compat: old tracks stored "sand"
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
		{X: 4000, Y: 0, W: 4000, H: 4000, Surface: SurfaceDirt},     // NE
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

// ─── raycasts ────────────────────────────────────────────────────────────────

// RaycastHit describes one ray cast from the car into the world.
type RaycastHit struct {
	Angle    float64 `json:"angle"`    // absolute world angle of the ray (rad)
	RelAngle float64 `json:"relAngle"` // angle relative to car heading (rad)
	Distance float64 `json:"distance"` // distance to the first non-road surface (px)
	Surface  string  `json:"surface"`  // name of the surface hit ("grass", "wall", …)
	EndX     float64 `json:"endX"`     // world X of the hit point
	EndY     float64 `json:"endY"`     // world Y of the hit point
}

// RaycastMaxDist is the maximum distance a ray will travel.
const RaycastMaxDist = 1200.0

// raycastStep is the distance between sample points along a ray.
const raycastStep = 4.0

// CastRay marches a ray from (ox, oy) in direction `angle` (radians)
// across the track rectangles.  It starts on the current surface and
// reports the first position where the surface changes to a non-road
// type, or where it hits a wall / world boundary.  If it goes from
// road→grass→road, the first grass hit is reported.
func CastRay(ox, oy, angle, maxDist float64, rects []TrackRect, worldW, worldH int) RaycastHit {
	dx := math.Cos(angle)
	dy := math.Sin(angle)

	startSurf := surfaceAt(rects, ox, oy)

	dist := raycastStep
	for dist <= maxDist {
		px := ox + dx*dist
		py := oy + dy*dist

		// World boundary check
		if px < 0 || px > float64(worldW) || py < 0 || py > float64(worldH) {
			return RaycastHit{
				Angle: angle, Distance: dist,
				Surface: "boundary", EndX: px - dx*raycastStep, EndY: py - dy*raycastStep,
			}
		}

		surf := surfaceAt(rects, px, py)

		// Wall: always report immediately
		if surf.Name == "wall" {
			return RaycastHit{
				Angle: angle, Distance: dist,
				Surface: "wall", EndX: px, EndY: py,
			}
		}

		// If we started on road and hit a non-road surface, report it
		if startSurf.Name == "road" && surf.Name != "road" {
			return RaycastHit{
				Angle: angle, Distance: dist,
				Surface: surf.Name, EndX: px, EndY: py,
			}
		}

		// If we started on non-road, report when surface changes at all
		if startSurf.Name != "road" && surf.Name != startSurf.Name {
			return RaycastHit{
				Angle: angle, Distance: dist,
				Surface: surf.Name, EndX: px, EndY: py,
			}
		}

		dist += raycastStep
	}

	// Max distance reached without a surface change
	return RaycastHit{
		Angle: angle, Distance: maxDist,
		Surface: "none", EndX: ox + dx*maxDist, EndY: oy + dy*maxDist,
	}
}

// CastRays fires 5 rays from the car centre:
//
//	[0] forward      (heading + 0°)
//	[1] left 45°     (heading − 45°)
//	[2] right 45°    (heading + 45°)
//	[3] left 90°     (heading − 90°)
//	[4] right 90°    (heading + 90°)
func CastRays(cx, cy, heading float64, rects []TrackRect, worldW, worldH int) []RaycastHit {
	offsets := []float64{0, -math.Pi / 4, math.Pi / 4, -math.Pi / 2, math.Pi / 2}
	rays := make([]RaycastHit, len(offsets))
	for i, off := range offsets {
		absAngle := heading + off
		hit := CastRay(cx, cy, absAngle, RaycastMaxDist, rects, worldW, worldH)
		hit.Angle = absAngle
		hit.RelAngle = off
		rays[i] = hit
	}
	return rays
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
	Raycasts    []RaycastHit      `json:"raycasts,omitempty"`
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

// OffsetStart shifts the car's starting position by (dx, dy) pixels.
// Used by multiplayer to stagger starting positions.
func (r *Racer) OffsetStart(dx, dy float64) {
	r.car.X += dx
	r.car.Y += dy
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
//  1. THRUST – engine force along the FRONT WHEEL direction (heading +
//     steerAngle).  This means steering naturally assists turns because
//     the engine pushes where the wheels point.
//
//  2. TRACTION – lateral force perpendicular to the car body that
//     resists sideways motion.  The force is proportional to lateral
//     velocity up to a saturation cap that depends on surface grip:
//       tractionForce = min(TractionCoeff × |latV|,
//                           MaxTractionForce × surface.grip)
//     Below the cap → clean cornering.  Above → the excess lateral
//     velocity persists as drift / understeer.
//
// This means:
//   • On road you can corner cleanly at moderate speed but must brake
//     for sharp turns at high speed (traction saturates).
//   • On ice the traction cap is tiny (0.07 × 2800 = 196), so any
//     steering at speed causes the car to keep sliding in the original
//     direction, slowly turning.
//   • Dirt/grass require braking for U-turns at speed.
//   • Braking while turning reduces traction further (BrakeGripPenalty).

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
	effectiveSteer := c.SteerAngle * (1.0 - 0.3*speedRatio)

	// Turn the heading via bicycle model.
	if speed > 0.5 {
		turnRadius := Wheelbase / math.Tan(math.Abs(effectiveSteer)+0.001)
		angVel := speed / turnRadius

		// Grip-limited angular velocity.  For circular motion the required
		// lateral acceleration is a = v × ω.  The tyres can supply at most
		// MaxTractionForce × grip, so ω_max = MaxTractionForce × grip / v.
		// At low speed the cap is huge (sharp turns easy); at high speed
		// the cap shrinks → car understeers → must brake or drift.
		// Use a floor of 0.4 on grip so the heading always turns
		// reasonably — traction (step 5) still limits actual velocity change.
		steerGrip := math.Max(surf.Grip, 0.4)
		maxAngVel := MaxTractionForce * steerGrip / speed
		if angVel > maxAngVel {
			angVel = maxAngVel
		}

		if effectiveSteer < 0 {
			angVel = -angVel
		}
		c.Heading += angVel * dt
		c.Heading = normalizeAngle(c.Heading)
	}

	// Brake-drift: braking while steering at speed kicks the rear end out.
	if input.S && math.Abs(c.SteerAngle) > MaxSteerAngle*0.3 && speed > BrakeDriftMinSpd {
		boost := BrakeDriftBoost * (speed / MaxSpeed) * surf.Grip
		c.Heading += sign(effectiveSteer) * boost * dt
		c.Heading = normalizeAngle(c.Heading)
	}

	// ── 2. decompose velocity into forward / lateral ────────────────────

	fwdX := math.Cos(c.Heading)
	fwdY := math.Sin(c.Heading)
	latX := -fwdY // right-hand perpendicular
	latY := fwdX

	fwdSpeed := r.velX*fwdX + r.velY*fwdY
	latSpeed := r.velX*latX + r.velY*latY

	// ── 3. engine / brake ───────────────────────────────────────────────
	// Thrust is applied along the WHEEL direction (heading + effectiveSteer),
	// so steering naturally assists in changing direction of travel.
	// On low-grip surfaces wheels slip → reduced effective force.

	// driveGrip: at low speed wheels slip on low-grip surfaces; as speed
	// builds the penalty fades so the car can still reach full top speed.
	driveGripBase := math.Min(1.0, surf.Grip*DriveGripScale)
	speedFrac := math.Min(speed/(MaxSpeed*0.5), 1.0)
	driveGrip := driveGripBase + (1.0-driveGripBase)*speedFrac
	braking := false

	if input.W {
		topSpd := MaxSpeed * surf.SpeedMult
		// Two-phase power band: full force below knee, fades above.
		var thrust float64
		if speed < PowerBandKnee {
			thrust = EngineForce
		} else {
			t := (speed - PowerBandKnee) / (topSpd - PowerBandKnee + 0.001)
			if t > 1.0 {
				t = 1.0
			}
			thrust = EngineForce + (EngineForceHigh-EngineForce)*t
		}
		// Wheel direction unit vector
		wheelX := math.Cos(c.Heading + effectiveSteer)
		wheelY := math.Sin(c.Heading + effectiveSteer)
		// Apply thrust along wheel direction (scaled by drive grip)
		r.velX += wheelX * thrust * driveGrip * dt
		r.velY += wheelY * thrust * driveGrip * dt
		// Re-decompose after thrust to check speed cap
		fwdSpeed = r.velX*fwdX + r.velY*fwdY
		latSpeed = r.velX*latX + r.velY*latY
		// Cap forward speed to surface top speed
		if fwdSpeed > topSpd {
			fwdSpeed = topSpd
		}
	}

	if input.S {
		if fwdSpeed > 2.0 {
			// Braking (opposing forward motion) along body heading.
			braking = true
			fwdSpeed -= BrakeForce * driveGrip * dt
			if fwdSpeed < 0 {
				fwdSpeed = 0 // brake doesn't reverse
			}
		} else {
			// Reverse.
			fwdSpeed -= ReversePower * driveGrip * dt
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

	// ── 5. traction (THE key force) ─────────────────────────────────────
	//
	// Proportional + saturation cap model (simplified Pacejka):
	//   tractionForce = min(TractionCoeff × |latSpeed|,
	//                       MaxTractionForce × surface.grip)
	// This means:
	//   - Small slip angles: force ∝ slip → clean cornering
	//   - Large slip angles: force capped → tire saturates → drift

	gripMul := surf.Grip
	if braking {
		gripMul *= BrakeGripPenalty
	}

	tractionCap := MaxTractionForce * gripMul
	tractionForce := math.Min(TractionCoeff*math.Abs(latSpeed), tractionCap)
	latDelta := tractionForce * dt

	if math.Abs(latSpeed) <= latDelta {
		// Traction fully absorbs lateral velocity.
		latSpeed = 0
	} else {
		// Traction partially absorbs — remainder is drift.
		latSpeed -= sign(latSpeed) * latDelta
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

	// Cast raycasts from car centre.
	rays := CastRays(c.X, c.Y, c.Heading, r.track, r.worldW, r.worldH)

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
		Raycasts: rays,
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
