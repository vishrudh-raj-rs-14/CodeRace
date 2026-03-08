package match

import (
	"delta/codeRace/engine/racer"
	"encoding/json"
	"log"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
)

// ─── Room states ─────────────────────────────────────────────────────────────

type RoomState string

const (
	StateWaiting  RoomState = "waiting"
	StateStarting RoomState = "starting"
	StateRacing   RoomState = "racing"
	StateFinished RoomState = "finished"
)

// ─── Other car payload ───────────────────────────────────────────────────────

type OtherCar struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	W        int     `json:"w"`
	H        int     `json:"h"`
	Heading  float64 `json:"heading"`
	Speed    float64 `json:"speed"`
	Drifting bool    `json:"drifting"`
	Name     string  `json:"name"`
}

// ─── Match frame ─────────────────────────────────────────────────────────────

type MatchFrame struct {
	racer.Frame
	OtherCars []OtherCar `json:"otherCars"`
	RoomState RoomState  `json:"roomState"`
	Countdown int        `json:"countdown,omitempty"`
	Results   []Result   `json:"results,omitempty"`
}

type Result struct {
	UserID      string  `json:"userId"`
	DisplayName string  `json:"displayName"`
	Finished    bool    `json:"finished"`
	FinishTime  float64 `json:"finishTime"`
	Place       int     `json:"place"`
}

// ─── Player ──────────────────────────────────────────────────────────────────

type Player struct {
	ID          string
	DisplayName string
	Racer       *racer.Racer
	Input       racer.InputState
	Send        chan []byte
	mu          sync.Mutex
}

func (p *Player) UpdateInput(input racer.InputState) {
	p.mu.Lock()
	p.Input = input
	p.mu.Unlock()
}

func (p *Player) GetInput() racer.InputState {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.Input
}

// ─── Room ────────────────────────────────────────────────────────────────────

type Room struct {
	ID        string
	TrackData *racer.TrackFileData
	TrackID   string
	CreatorID string
	CreatedAt time.Time

	mu           sync.RWMutex
	state        RoomState
	players      map[string]*Player
	countdown    int
	results      []Result
	done         chan struct{}
	restartReady map[string]bool // players who voted to restart
}

func NewRoom(trackData *racer.TrackFileData, trackID, creatorID string) *Room {
	return &Room{
		ID:           uuid.New().String()[:8],
		TrackData:    trackData,
		TrackID:      trackID,
		CreatorID:    creatorID,
		CreatedAt:    time.Now(),
		state:        StateWaiting,
		players:      make(map[string]*Player),
		done:         make(chan struct{}),
		restartReady: make(map[string]bool),
	}
}

func (r *Room) State() RoomState {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.state
}

func (r *Room) PlayerCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.players)
}

func (r *Room) PlayerList() []map[string]interface{} {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.playerListLocked()
}

// playerListLocked builds the player list; caller must hold at least RLock.
func (r *Room) playerListLocked() []map[string]interface{} {
	list := make([]map[string]interface{}, 0, len(r.players))
	for _, p := range r.players {
		list = append(list, map[string]interface{}{
			"id":          p.ID,
			"displayName": p.DisplayName,
		})
	}
	return list
}

func (r *Room) Join(userID, displayName string) *Player {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.state != StateWaiting && r.state != StateStarting {
		return nil
	}

	if p, ok := r.players[userID]; ok {
		return p
	}

	rc := racer.NewRacerFromTrack(r.TrackData)
	idx := len(r.players)
	if idx > 0 {
		offsetDist := float64(idx) * 35.0
		heading := r.TrackData.StartHeading
		perpX := -math.Sin(heading) * offsetDist
		perpY := math.Cos(heading) * offsetDist
		rc.OffsetStart(perpX, perpY)
	}

	p := &Player{
		ID:          userID,
		DisplayName: displayName,
		Racer:       rc,
		Send:        make(chan []byte, 8),
	}
	r.players[userID] = p
	return p
}

func (r *Room) Leave(userID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if p, ok := r.players[userID]; ok {
		close(p.Send)
		delete(r.players, userID)
	}
}

func (r *Room) StartCountdown(userID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.state != StateWaiting || userID != r.CreatorID || len(r.players) < 1 {
		return false
	}
	r.state = StateStarting
	r.countdown = 3
	go r.runCountdown()
	return true
}

func (r *Room) runCountdown() {
	for i := 3; i > 0; i-- {
		r.mu.Lock()
		r.countdown = i
		r.mu.Unlock()
		r.broadcastLobbyState()
		time.Sleep(time.Second)
	}
	r.mu.Lock()
	r.state = StateRacing
	r.countdown = 0
	r.mu.Unlock()
	r.runRace()
}

func (r *Room) broadcastLobbyState() {
	r.mu.RLock()
	defer r.mu.RUnlock()

	msg := map[string]interface{}{
		"roomState": r.state,
		"countdown": r.countdown,
		"players":   r.playerListLocked(),
	}
	data, _ := json.Marshal(msg)
	for _, p := range r.players {
		select {
		case p.Send <- data:
		default:
		}
	}
}

// BroadcastRaw sends raw bytes to all players.
func (r *Room) BroadcastRaw(data []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, p := range r.players {
		select {
		case p.Send <- data:
		default:
		}
	}
}

func (r *Room) runRace() {
	ticker := time.NewTicker(time.Second / racer.TickRate)
	defer ticker.Stop()

	maxTicks := racer.TickRate * 30

	for tick := 0; tick < maxTicks; tick++ {
		select {
		case <-r.done:
			return
		case <-ticker.C:
		}

		r.mu.RLock()

		for _, p := range r.players {
			p.Racer.UpdateInput(p.GetInput())
			p.Racer.Tick()
		}

		playerFrames := make(map[string]*MatchFrame, len(r.players))
		for pid, p := range r.players {
			frame := p.Racer.BuildFrame()
			mf := &MatchFrame{
				Frame:     frame,
				RoomState: StateRacing,
			}
			playerFrames[pid] = mf
		}

		for pid, mf := range playerFrames {
			others := make([]OtherCar, 0, len(r.players)-1)
			for oid, op := range r.players {
				if oid == pid {
					continue
				}
				of := op.Racer.BuildFrame()
				others = append(others, OtherCar{
					X:        of.Car.X,
					Y:        of.Car.Y,
					W:        of.Car.W,
					H:        of.Car.H,
					Heading:  of.Car.Heading,
					Speed:    of.Car.Speed,
					Drifting: of.Car.Drifting,
					Name:     op.DisplayName,
				})
			}
			mf.OtherCars = others
		}

		for pid, mf := range playerFrames {
			data, err := json.Marshal(mf)
			if err != nil {
				continue
			}
			p := r.players[pid]
			select {
			case p.Send <- data:
			default:
			}
		}

		allDone := true
		for _, p := range r.players {
			if !p.Racer.Finished() {
				allDone = false
				break
			}
		}

		r.mu.RUnlock()

		if allDone {
			break
		}
	}

	// Build results
	r.mu.Lock()
	r.state = StateFinished
	r.results = make([]Result, 0, len(r.players))
	for _, p := range r.players {
		res := Result{
			UserID:      p.ID,
			DisplayName: p.DisplayName,
			Finished:    p.Racer.Finished(),
		}
		if res.Finished {
			res.FinishTime = float64(p.Racer.FinishTickVal()) / float64(racer.TickRate)
		}
		r.results = append(r.results, res)
	}
	for i := 0; i < len(r.results); i++ {
		for j := i + 1; j < len(r.results); j++ {
			if betterResult(r.results[j], r.results[i]) {
				r.results[i], r.results[j] = r.results[j], r.results[i]
			}
		}
	}
	for i := range r.results {
		r.results[i].Place = i + 1
	}
	results := r.results
	r.mu.Unlock()

	// Broadcast final results
	r.mu.RLock()
	msg := map[string]interface{}{
		"roomState": StateFinished,
		"results":   results,
	}
	data, _ := json.Marshal(msg)
	for _, p := range r.players {
		select {
		case p.Send <- data:
		default:
		}
	}
	r.mu.RUnlock()

	log.Printf("match %s finished with %d players", r.ID, len(r.players))
}

func betterResult(a, b Result) bool {
	if a.Finished && !b.Finished {
		return true
	}
	if !a.Finished && b.Finished {
		return false
	}
	return a.FinishTime < b.FinishTime
}

func (r *Room) Close() {
	select {
	case <-r.done:
	default:
		close(r.done)
	}
}

// ─── Restart logic ───────────────────────────────────────────────────────────

// VoteRestart marks a player as ready for restart. Returns true if ALL current
// players have voted and the room transitions back to waiting.
func (r *Room) VoteRestart(userID string) (allReady bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.state != StateFinished {
		return false
	}

	r.restartReady[userID] = true

	// Check if all players are ready
	for pid := range r.players {
		if !r.restartReady[pid] {
			return false
		}
	}

	// Everyone ready – reset room
	r.resetLocked()
	return true
}

// Restart resets the room back to waiting state (creator-only).
func (r *Room) Restart(userID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.state != StateFinished || userID != r.CreatorID {
		return false
	}
	r.resetLocked()
	return true
}

// resetLocked transitions the room back to waiting with fresh racers.
// Caller MUST hold r.mu write lock.
func (r *Room) resetLocked() {
	r.state = StateWaiting
	r.results = nil
	r.restartReady = make(map[string]bool)
	// Re-create done channel so the next race can use it
	r.done = make(chan struct{})

	// Re-create racers for all current players
	idx := 0
	for _, p := range r.players {
		rc := racer.NewRacerFromTrack(r.TrackData)
		if idx > 0 {
			offsetDist := float64(idx) * 35.0
			heading := r.TrackData.StartHeading
			perpX := -math.Sin(heading) * offsetDist
			perpY := math.Cos(heading) * offsetDist
			rc.OffsetStart(perpX, perpY)
		}
		p.Racer = rc
		p.mu.Lock()
		p.Input = racer.InputState{}
		p.mu.Unlock()
		idx++
	}
}

// RestartVotes returns how many players voted restart vs total.
func (r *Room) RestartVotes() (voted int, total int) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.restartReady), len(r.players)
}

// IsCreator checks if userID is the room creator.
func (r *Room) IsCreator(userID string) bool {
	return r.CreatorID == userID
}

// HandleLeave handles a player leaving and broadcasts updates. If host leaves
// while in finished state, the match is terminated.
func (r *Room) HandleLeave(userID string) (hostLeft bool) {
	isHost := r.CreatorID == userID
	r.Leave(userID)

	if isHost {
		// Broadcast host-left message to everyone
		msg := map[string]interface{}{
			"roomState": "host_left",
			"message":   "Host has left the match",
		}
		data, _ := json.Marshal(msg)
		r.BroadcastRaw(data)
		return true
	}

	// Non-host left: update lobby & restart votes
	r.broadcastLobbyState()
	return false
}

// ─── Room Manager ────────────────────────────────────────────────────────────

type Manager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

var GlobalManager = &Manager{rooms: make(map[string]*Room)}

func (m *Manager) Create(trackData *racer.TrackFileData, trackID, creatorID string) *Room {
	room := NewRoom(trackData, trackID, creatorID)
	m.mu.Lock()
	m.rooms[room.ID] = room
	m.mu.Unlock()
	go func() {
		time.Sleep(10 * time.Minute)
		m.Remove(room.ID)
	}()
	return room
}

func (m *Manager) Get(id string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[id]
}

func (m *Manager) Remove(id string) {
	m.mu.Lock()
	if room, ok := m.rooms[id]; ok {
		room.Close()
		delete(m.rooms, id)
	}
	m.mu.Unlock()
}

func (m *Manager) List() []*Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	list := make([]*Room, 0, len(m.rooms))
	for _, r := range m.rooms {
		list = append(list, r)
	}
	return list
}
