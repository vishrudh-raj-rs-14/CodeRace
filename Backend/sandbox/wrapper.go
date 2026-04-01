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
//	state.tick                int     – current tick number (0–1499)
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
//	state.raycasts            list    – 5 raycasts from car centre:
//	  [0] forward, [1] left 45°, [2] right 45°, [3] left 90°, [4] right 90°
//	  each: .distance .surface .endX .endY .angle .relAngle
//
// Helper functions (available globally):
//
//	ray_forward(state)          float – distance ahead to surface edge
//	ray_left_45(state)          float – distance to left-45° surface edge
//	ray_right_45(state)         float – distance to right-45° surface edge
//	ray_left_90(state)          float – distance to left-90° surface edge
//	ray_right_90(state)         float – distance to right-90° surface edge
//	rays(state)                 tuple – (fwd, l45, r45, l90, r90)
//	angle_to_checkpoint(state)  float – signed angle to next CP/finish (rad)
//	distance_to_checkpoint(state) float – distance to next CP/finish (px)
//	normalize_angle(a)          float – normalize angle to [-π, π]
//	next_checkpoint_center(state) (x,y) or None – centre of next target//      get_all_checkpoints()       list  – all checkpoints sorted by order//
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
import math
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


# ── Raycast helpers ──────────────────────────────────────────────────────
# state.raycasts is a list of 5 rays:
#   [0] forward (0°), [1] left 45°, [2] right 45°, [3] left 90°, [4] right 90°
# Each ray has: .distance, .surface, .endX, .endY, .angle, .relAngle

def ray_forward(state):
    """Distance to next surface change straight ahead."""
    return state.raycasts[0].distance if hasattr(state, 'raycasts') and len(state.raycasts) > 0 else 9999

def ray_left_45(state):
    """Distance to next surface change at 45° left."""
    return state.raycasts[1].distance if hasattr(state, 'raycasts') and len(state.raycasts) > 1 else 9999

def ray_right_45(state):
    """Distance to next surface change at 45° right."""
    return state.raycasts[2].distance if hasattr(state, 'raycasts') and len(state.raycasts) > 2 else 9999

def ray_left_90(state):
    """Distance to next surface change at 90° left (perpendicular)."""
    return state.raycasts[3].distance if hasattr(state, 'raycasts') and len(state.raycasts) > 3 else 9999

def ray_right_90(state):
    """Distance to next surface change at 90° right (perpendicular)."""
    return state.raycasts[4].distance if hasattr(state, 'raycasts') and len(state.raycasts) > 4 else 9999

def rays(state):
    """Return all 5 ray distances as a tuple: (fwd, left45, right45, left90, right90)."""
    if not hasattr(state, 'raycasts') or not state.raycasts:
        return (9999, 9999, 9999, 9999, 9999)
    r = state.raycasts
    return (
        r[0].distance if len(r) > 0 else 9999,
        r[1].distance if len(r) > 1 else 9999,
        r[2].distance if len(r) > 2 else 9999,
        r[3].distance if len(r) > 3 else 9999,
        r[4].distance if len(r) > 4 else 9999,
    )


# ── Checkpoint / navigation helpers ──────────────────────────────────────

def normalize_angle(a):
    """Normalize angle to [-pi, pi]."""
    while a > math.pi:
        a -= 2 * math.pi
    while a < -math.pi:
        a += 2 * math.pi
    return a

def _next_checkpoint(state):
    """Return the next uncollected checkpoint, or None."""
    hit = set(state.race.checkpointsHit) if hasattr(state.race, 'checkpointsHit') and state.race.checkpointsHit else set()
    for cp in sorted(CHECKPOINTS, key=lambda c: c.order):
        if cp.order not in hit:
            return cp
    return None

def _current_target(state):
    """Return the centre (x,y) of the next target (checkpoint or finish)."""
    cp = _next_checkpoint(state)
    if cp:
        return (cp.x + cp.w / 2, cp.y + cp.h / 2)
    if FINISH:
        return (FINISH.x + FINISH.w / 2, FINISH.y + FINISH.h / 2)
    return None

def distance_to_checkpoint(state):
    """Euclidean distance from car to next checkpoint/finish centre."""
    t = _current_target(state)
    if not t:
        return 0
    dx = t[0] - state.car.x
    dy = t[1] - state.car.y
    return math.sqrt(dx * dx + dy * dy)

def angle_to_checkpoint(state):
    """Signed angle from car heading to next checkpoint/finish. Negative = target is to the left."""
    t = _current_target(state)
    if not t:
        return 0
    dx = t[0] - state.car.x
    dy = t[1] - state.car.y
    target_angle = math.atan2(dy, dx)
    return normalize_angle(target_angle - state.car.heading)

def next_checkpoint_center(state):
    """Return (x, y) centre of the next target, or None."""
    return _current_target(state)

def get_all_checkpoints():
    """Return a list of all checkpoints sorted by order."""
    return sorted(CHECKPOINTS, key=lambda c: c.order)


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
