package racer

import (
	"encoding/json"
	"os"
	"testing"
)

type scenarioTrack struct {
	WorldW       int             `json:"worldW"`
	WorldH       int             `json:"worldH"`
	StartX       float64         `json:"startX"`
	StartY       float64         `json:"startY"`
	StartHeading float64         `json:"startHeading"`
	Rects        []TrackRectData `json:"rects"`
}

type scenarioInput struct {
	FromTick int        `json:"fromTick"`
	ToTick   int        `json:"toTick"`
	Input    InputState `json:"input"`
}

type scenarioFile struct {
	Track         scenarioTrack   `json:"track"`
	InputSequence []scenarioInput `json:"inputSequence"`
	TotalTicks    int             `json:"totalTicks"`
}

type goldenTick struct {
	Tick       int     `json:"tick"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Heading    float64 `json:"heading"`
	Speed      float64 `json:"speed"`
	LateralV   float64 `json:"lateralV"`
	VelX       float64 `json:"velX"`
	VelY       float64 `json:"velY"`
	SteerAngle float64 `json:"steerAngle"`
	Drifting   bool    `json:"drifting"`
	Surface    string  `json:"surface"`
}

func TestGenerateGolden(t *testing.T) {
	scenarioPath := "../../../tests/fixtures/physics_scenario.json"
	raw, err := os.ReadFile(scenarioPath)
	if err != nil {
		t.Fatalf("cannot read scenario: %v", err)
	}

	var scenario scenarioFile
	if err := json.Unmarshal(raw, &scenario); err != nil {
		t.Fatalf("cannot parse scenario: %v", err)
	}

	trackData := &TrackFileData{
		WorldW:       scenario.Track.WorldW,
		WorldH:       scenario.Track.WorldH,
		StartX:       scenario.Track.StartX,
		StartY:       scenario.Track.StartY,
		StartHeading: scenario.Track.StartHeading,
		Rects:        scenario.Track.Rects,
	}

	racer := NewRacerFromTrack(trackData)

	inputForTick := make(map[int]InputState, scenario.TotalTicks)
	for _, seq := range scenario.InputSequence {
		for tick := seq.FromTick; tick <= seq.ToTick; tick++ {
			inputForTick[tick] = seq.Input
		}
	}

	golden := make([]goldenTick, 0, scenario.TotalTicks)
	for tick := 0; tick < scenario.TotalTicks; tick++ {
		inp, ok := inputForTick[tick]
		if !ok {
			inp = InputState{}
		}
		racer.UpdateInput(inp)
		racer.Tick()

		c := racer.car
		golden = append(golden, goldenTick{
			Tick:       tick,
			X:          c.X,
			Y:          c.Y,
			Heading:    c.Heading,
			Speed:      c.Speed,
			LateralV:   c.LateralV,
			VelX:       racer.velX,
			VelY:       racer.velY,
			SteerAngle: c.SteerAngle,
			Drifting:   c.Drifting,
			Surface:    c.Surface,
		})
	}

	outPath := "../../../tests/fixtures/golden_output.json"
	out, err := json.MarshalIndent(golden, "", "  ")
	if err != nil {
		t.Fatalf("cannot marshal golden output: %v", err)
	}
	if err := os.WriteFile(outPath, out, 0644); err != nil {
		t.Fatalf("cannot write golden output: %v", err)
	}

	t.Logf("wrote %d golden ticks to %s", len(golden), outPath)

	if len(golden) != scenario.TotalTicks {
		t.Errorf("expected %d ticks, got %d", scenario.TotalTicks, len(golden))
	}

	last := golden[len(golden)-1]
	if last.X == scenario.Track.StartX && last.Y == scenario.Track.StartY {
		t.Error("car did not move from start position")
	}
}
