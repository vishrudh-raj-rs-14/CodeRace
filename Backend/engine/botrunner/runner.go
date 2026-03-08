package botrunner

import (
	"bufio"
	"context"
	"delta/codeRace/engine/racer"
	"delta/codeRace/sandbox"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

const (
	// MaxTicks is the total physics ticks per race (25 s of game-time at 60 Hz).
	MaxTicks = racer.TickRate * 25 // 1500

	// ResponseTimeout is how long the bot has to reply to each tick.
	ResponseTimeout = 50 * time.Millisecond

	// StartupTimeout is how long we wait for the sandbox to boot and
	// parse the init payload before the tick loop begins.
	StartupTimeout = 5 * time.Second
)

// ── wire types ───────────────────────────────────────────────────────────────

type gameOverMsg struct {
	GameOver bool   `json:"gameOver"`
	Reason   string `json:"reason"`
	Tick     uint64 `json:"tick"`
}

type initPayload struct {
	Track       []racer.SurfaceRectJSON `json:"track"`
	Checkpoints []racer.CheckpointJSON  `json:"checkpoints"`
	Finish      *racer.FinishJSON       `json:"finish,omitempty"`
	World       racer.WorldInfo         `json:"world"`
	TickRate    int                     `json:"tick_rate"`
}

type botState struct {
	Tick     uint64             `json:"tick"`
	Car      racer.Car          `json:"car"`
	Surface  botSurface         `json:"surface"`
	Race     racer.RaceState    `json:"race"`
	Raycasts []racer.RaycastHit `json:"raycasts"`
}

type botSurface struct {
	Name      string  `json:"name"`
	Grip      float64 `json:"grip"`
	DragMult  float64 `json:"drag_mult"`
	SpeedMult float64 `json:"speed_mult"`
}

type lineResult struct {
	line string
	err  error
}

// botResponse is a response line from the Python wrapper, optionally
// including captured stdout from user print() calls.
type botResponse struct {
	W      bool   `json:"w"`
	A      bool   `json:"a"`
	S      bool   `json:"s"`
	D      bool   `json:"d"`
	Stdout string `json:"stdout,omitempty"`
}

// ── Results ──────────────────────────────────────────────────────────────────

// SingleResult is returned by RunSingle for one track.
type SingleResult struct {
	Frames           []json.RawMessage `json:"frames"`
	Stdout           []string          `json:"stdout"` // per-tick stdout
	Reason           string            `json:"reason"`
	Finished         bool              `json:"finished"`
	FinishTime       float64           `json:"finishTime"`
	CheckpointsHit   int               `json:"checkpointsHit"`
	TotalCheckpoints int               `json:"totalCheckpoints"`
}

// TracksetResult wraps results for all tracks in a trackset submission.
type TracksetResult struct {
	TrackResults []SingleResult `json:"trackResults"`
	AllFinished  bool           `json:"allFinished"`
	TotalTime    float64        `json:"totalTime"`
	Score        int            `json:"score"`
}

// CollectedResult is the legacy type kept for backward compat.
type CollectedResult = SingleResult

// ── RunSingle ────────────────────────────────────────────────────────────────

// RunSingle runs a bot race on a single track (provided as in-memory data).
func RunSingle(ctx context.Context, mgr *sandbox.Manager, code string, trackData *racer.TrackFileData) SingleResult {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var frames []json.RawMessage
	var stdoutLines []string

	// ── 1. Wrap user code & start sandbox ────────────────────────────────

	wrapped := sandbox.WrapUserCode(code)
	sb, err := mgr.Run(ctx, wrapped)
	if err != nil {
		log.Println("botrunner: sandbox start:", err)
		return SingleResult{Reason: "sandbox_error"}
	}
	defer sb.Kill()

	// ── 2. Create racer from track data ──────────────────────────────────

	r := racer.NewRacerFromTrack(trackData)

	// ── 3. Stdout reader goroutine ───────────────────────────────────────

	lines := make(chan lineResult, 1)
	go func() {
		defer close(lines)
		scanner := bufio.NewScanner(sb.Stdout)
		for scanner.Scan() {
			select {
			case lines <- lineResult{line: scanner.Text()}:
			case <-ctx.Done():
				return
			}
		}
		if err := scanner.Err(); err != nil {
			select {
			case lines <- lineResult{err: err}:
			case <-ctx.Done():
			}
		}
	}()

	// ── 4. Send init payload (track + world, once) ───────────────────────

	initFrame := r.BuildFrame()
	initData := initPayload{
		Track:       initFrame.Track,
		Checkpoints: initFrame.Checkpoints,
		Finish:      initFrame.Finish,
		World:       initFrame.World,
		TickRate:    racer.TickRate,
	}
	initBytes, _ := json.Marshal(initData)
	if _, err := fmt.Fprintf(sb.Stdin, "%s\n", initBytes); err != nil {
		log.Println("botrunner: write init:", err)
		return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "write_error"}
	}

	// ── 4b. Wait for the "ready" handshake from the sandbox ──────────────

	select {
	case lr, ok := <-lines:
		if !ok {
			log.Println("botrunner: sandbox exited before ready signal")
			return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "sandbox_error"}
		}
		if lr.err != nil {
			log.Println("botrunner: read ready:", lr.err)
			return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "read_error"}
		}
		log.Println("botrunner: sandbox ready:", lr.line)

	case <-time.After(StartupTimeout):
		log.Println("botrunner: sandbox did not become ready in time")
		return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "startup_timeout"}

	case <-ctx.Done():
		return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "cancelled"}
	}

	// ── 5. Tick loop (no real-time pacing — run as fast as possible) ─────

	for i := 0; i < MaxTicks; i++ {
		select {
		case <-ctx.Done():
			return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "cancelled"}
		default:
		}

		// (a) Capture current state.
		frame := r.BuildFrame()

		// (b) Collect frame.
		frameBytes, _ := json.Marshal(frame)
		frames = append(frames, json.RawMessage(frameBytes))

		// (c) Build and send lightweight state to sandbox.
		surf := r.CurrentSurface()
		state := botState{
			Tick: frame.Tick,
			Car:  frame.Car,
			Surface: botSurface{
				Name:      surf.Name,
				Grip:      surf.Grip,
				DragMult:  surf.DragMult,
				SpeedMult: surf.SpeedMult,
			},
			Race:     frame.Race,
			Raycasts: frame.Raycasts,
		}
		stateBytes, _ := json.Marshal(state)
		if _, err := fmt.Fprintf(sb.Stdin, "%s\n", stateBytes); err != nil {
			log.Println("botrunner: write state:", err)
			return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "write_error"}
		}

		// (d) Read response with 50 ms deadline.
		select {
		case lr, ok := <-lines:
			if !ok {
				return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "process_exited"}
			}
			if lr.err != nil {
				log.Println("botrunner: read stdout:", lr.err)
				return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "read_error"}
			}
			var resp botResponse
			if err := json.Unmarshal([]byte(lr.line), &resp); err != nil {
				log.Println("botrunner: bad response:", err)
			}
			r.UpdateInput(racer.InputState{W: resp.W, A: resp.A, S: resp.S, D: resp.D})
			stdoutLines = append(stdoutLines, resp.Stdout)

		case <-time.After(ResponseTimeout):
			return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "timeout"}

		case <-ctx.Done():
			return SingleResult{Frames: frames, Stdout: stdoutLines, Reason: "cancelled"}
		}

		// (e) Advance physics.
		r.Tick()

		// (f) Check for race finish.
		if r.Finished() {
			finFrame := r.BuildFrame()
			finBytes, _ := json.Marshal(finFrame)
			frames = append(frames, json.RawMessage(finBytes))

			finishTime := float64(r.FinishTickVal()) / float64(racer.TickRate)
			return SingleResult{
				Frames:           frames,
				Stdout:           stdoutLines,
				Reason:           "finished",
				Finished:         true,
				FinishTime:       finishTime,
				CheckpointsHit:   len(r.CheckpointsHitSet()),
				TotalCheckpoints: r.TotalCheckpoints(),
			}
		}
	}

	// ── 6. Final frame ───────────────────────────────────────────────────

	finalFrame := r.BuildFrame()
	finalBytes, _ := json.Marshal(finalFrame)
	frames = append(frames, json.RawMessage(finalBytes))

	return SingleResult{
		Frames:           frames,
		Stdout:           stdoutLines,
		Reason:           "unfinished",
		Finished:         false,
		CheckpointsHit:   len(r.CheckpointsHitSet()),
		TotalCheckpoints: r.TotalCheckpoints(),
	}
}

// ── RunCollect (legacy wrapper) ──────────────────────────────────────────────

// RunCollect runs a bot race using the file-based track. Kept for backward
// compatibility with the old POST /api/game/bot endpoint.
func RunCollect(ctx context.Context, mgr *sandbox.Manager, code string) SingleResult {
	data, err := racer.LoadTrackFile()
	if err != nil || len(data.Rects) == 0 {
		// Use default track.
		data = &racer.TrackFileData{
			WorldW:   racer.WorldW,
			WorldH:   racer.WorldH,
			StartX:   500,
			StartY:   4000,
			GridSize: 50,
		}
		for _, r := range racer.DefaultTrack() {
			data.Rects = append(data.Rects, racer.TrackRectData{
				X: r.X, Y: r.Y, W: r.W, H: r.H,
				Surface: racer.Surfaces[r.Surface].Name,
			})
		}
	}
	return RunSingle(ctx, mgr, code, data)
}

// ── RunTrackset ──────────────────────────────────────────────────────────────

// RunTrackset runs the same code against every track in the trackset
// sequentially.  Each track gets its own sandbox process.
func RunTrackset(ctx context.Context, mgr *sandbox.Manager, code string, tracks []*racer.TrackFileData) TracksetResult {
	result := TracksetResult{
		TrackResults: make([]SingleResult, len(tracks)),
		AllFinished:  true,
	}

	for i, td := range tracks {
		select {
		case <-ctx.Done():
			result.TrackResults[i] = SingleResult{Reason: "cancelled"}
			result.AllFinished = false
			return result
		default:
		}

		sr := RunSingle(ctx, mgr, code, td)
		result.TrackResults[i] = sr

		if !sr.Finished {
			result.AllFinished = false
		}
		result.TotalTime += sr.FinishTime
	}

	if result.AllFinished {
		// score = max(0, 10000 - floor(totalTime * 100))
		s := 10000 - int(result.TotalTime*100)
		if s < 0 {
			s = 0
		}
		result.Score = s
	}

	return result
}
