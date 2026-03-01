package sandbox

// WrapUserCode embeds the user's Python source into a harness that handles
// JSON-line communication with the bot runner over stdin / stdout.
//
// The user must define:
//
//	def drive(state) -> dict
//
// Parameters available on state (SimpleNamespace with dot-access):
//
//	state.tick                int     – current tick number (0–599)
//	state.car.x, .y          float   – world position (px)
//	state.car.heading         float   – radians, 0 = right
//	state.car.speed           float   – forward speed (px/s)
//	state.car.lateralV        float   – lateral (slip) velocity (px/s)
//	state.car.steerAngle      float   – current front-wheel angle (rad)
//	state.car.drifting        bool
//	state.car.surface         str     – surface name under the car
//	state.surface.name        str     – same as car.surface
//	state.surface.grip        float   – 0..1 grip multiplier
//	state.surface.drag_mult   float   – rolling-friction multiplier
//	state.surface.speed_mult  float   – top-speed multiplier
//
// Globals (set once before the first drive() call):
//
//	TRACK       – list of track rectangles (.x .y .w .h .color .name)
//	CHECKPOINTS – list of checkpoint zones (.x .y .w .h .order)
//	FINISH      – finish zone (.x .y .w .h) or None
//	WORLD       – world dimensions (.w .h)
//	TICK_RATE   – ticks per second (60)
//	DT          – seconds per tick  (1/60)
//
// Return value:
//
//	{"w": bool, "a": bool, "s": bool, "d": bool}
//	  w = accelerate, s = brake/reverse, a = steer left, d = steer right
func WrapUserCode(userCode string) string {
	return wrapperHeader + userCode + "\n" + wrapperFooter
}

const wrapperHeader = `import json
import os
import sys
from io import StringIO
from types import SimpleNamespace

# ── Protocol plumbing (do not modify) ────────────────────────────────────
# Save the real stdout for harness I/O, then redirect sys.stdout to a
# StringIO buffer so user print() calls are captured per tick.
_COMM = os.fdopen(os.dup(1), "w")
_USER_BUF = StringIO()
sys.stdout = _USER_BUF

TRACK = []
CHECKPOINTS = []
FINISH = None
WORLD = None
TICK_RATE = 60
DT = 1.0 / 60


def _to_ns(obj):
    """Recursively convert dicts/lists to SimpleNamespace for dot-access."""
    if isinstance(obj, dict):
        return SimpleNamespace(**{k: _to_ns(v) for k, v in obj.items()})
    if isinstance(obj, list):
        return [_to_ns(i) for i in obj]
    return obj


# ─── Your code ───────────────────────────────────────────────────────────
`

const wrapperFooter = `# ─── End of your code ────────────────────────────────────────────────────


def _main():
    global TRACK, CHECKPOINTS, FINISH, WORLD, TICK_RATE, DT

    # First line: init payload  {"track": [...], "checkpoints": [...], "finish": {...}, "world": {...}, "tick_rate": 60}
    _init_line = sys.stdin.readline()
    if not _init_line:
        return
    _init = json.loads(_init_line)
    TRACK = _to_ns(_init.get("track", []))
    CHECKPOINTS = _to_ns(_init.get("checkpoints", []))
    FINISH = _to_ns(_init.get("finish")) if _init.get("finish") else None
    WORLD = _to_ns(_init.get("world", {}))
    TICK_RATE = _init.get("tick_rate", 60)
    DT = 1.0 / TICK_RATE

    # Signal readiness to the runner.
    print(json.dumps({"ready": True}), file=_COMM, flush=True)

    # Game loop: one JSON line per tick on stdin, one response on stdout.
    for _line in sys.stdin:
        _line = _line.strip()
        if not _line:
            continue

        _state = _to_ns(json.loads(_line))

        # Reset the capture buffer before calling drive().
        _USER_BUF.truncate(0)
        _USER_BUF.seek(0)

        try:
            _result = drive(_state)
        except Exception:
            _result = {}

        # Grab anything the user printed this tick.
        _captured = _USER_BUF.getvalue()

        # Normalise: accept dict or SimpleNamespace, default all keys False.
        if hasattr(_result, "__dict__") and not isinstance(_result, dict):
            _result = vars(_result)
        if not isinstance(_result, dict):
            _result = {}

        _out = {
            "w": bool(_result.get("w", False)),
            "a": bool(_result.get("a", False)),
            "s": bool(_result.get("s", False)),
            "d": bool(_result.get("d", False)),
        }
        if _captured:
            _out["stdout"] = _captured

        print(json.dumps(_out), file=_COMM, flush=True)


_main()
`
