import { useState, useRef, useCallback, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import GameCanvas from "../components/GameCanvas";

const PLACEHOLDER_CODE = `# ─── CodeRace Bot ───────────────────────────────────────────
#
# Write a  drive(state)  function that is called every tick.
# Collect all checkpoints in order, then cross the finish line!
# Max race time: 25 seconds.
#
# ── state fields (dot-access) ───────────────────────────────
#   state.tick            int       current tick (0–1499)
#   state.car.x           float     world X position (px)
#   state.car.y           float     world Y position (px)
#   state.car.heading     float     radians, 0 = right
#   state.car.speed       float     forward speed (px/s)
#   state.car.lateralV    float     lateral slip velocity (px/s)
#   state.car.steerAngle  float     current wheel angle (rad)
#   state.car.drifting    bool      True while sliding
#   state.car.surface     str       surface name under the car
#   state.surface.name    str       same as car.surface
#   state.surface.grip    float     0..1 lateral grip multiplier
#   state.surface.drag_mult  float  rolling-friction multiplier
#   state.surface.speed_mult float  top-speed multiplier
#   state.race.checkpointsHit  list[int]  collected CP indices
#   state.race.totalCheckpoints int       total CPs on track
#   state.race.finished         bool      crossed finish?
#
# ── globals (set once before first call) ────────────────────
#   TRACK       list of rects  (.x .y .w .h .color .name)
#   CHECKPOINTS list of zones  (.x .y .w .h .order)
#   FINISH      namespace      (.x .y .w .h) or None
#   WORLD       namespace      (.w .h)
#   TICK_RATE   int   (60)
#   DT          float (1/60)
#
# ── return value ────────────────────────────────────────────
#   {"w": bool, "a": bool, "s": bool, "d": bool}
#   w = accelerate, s = brake/reverse, a = steer left, d = right
# ─────────────────────────────────────────────────────────────

def drive(state):
    # Example: just hold the accelerator
    return {"w": True, "a": False, "s": False, "d": False}
`;

const TICK_RATE = 60;

export default function BotPage() {
  const [code, setCode] = useState(PLACEHOLDER_CODE);
  const [frames, setFrames] = useState([]);
  const [reason, setReason] = useState("");
  const [raceResult, setRaceResult] = useState(null);  // {finished, finishTime, checkpointsHit, totalCheckpoints}
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [currentTick, setCurrentTick] = useState(0);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const tickAccRef = useRef(0);

  const totalFrames = frames.length;
  const currentFrame = frames[currentTick] ?? null;

  // ── Submit code ──────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError("");
    setFrames([]);
    setReason("");
    setRaceResult(null);
    setPlaying(false);
    setCurrentTick(0);
    lastTimeRef.current = null;
    tickAccRef.current = 0;

    try {
      const res = await fetch("/api/game/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setFrames(data.frames ?? []);
      setReason(data.reason ?? "unknown");
      setRaceResult({
        finished: data.finished,
        finishTime: data.finishTime,
        checkpointsHit: data.checkpointsHit,
        totalCheckpoints: data.totalCheckpoints,
      });

      // Auto-play if we got frames
      if (data.frames?.length > 0) {
        setCurrentTick(0);
        setPlaying(true);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [code]);

  // ── Playback loop (requestAnimationFrame at 60 Hz) ──────────────────

  useEffect(() => {
    if (!playing || totalFrames === 0) {
      lastTimeRef.current = null;
      tickAccRef.current = 0;
      return;
    }

    const step = (timestamp) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }
      const delta = (timestamp - lastTimeRef.current) / 1000; // seconds
      lastTimeRef.current = timestamp;
      tickAccRef.current += delta;

      const tickDuration = 1 / TICK_RATE;

      setCurrentTick((prev) => {
        let next = prev;
        while (tickAccRef.current >= tickDuration && next < totalFrames - 1) {
          tickAccRef.current -= tickDuration;
          next++;
        }
        if (next >= totalFrames - 1) {
          setPlaying(false);
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, totalFrames]);

  // ── Controls ─────────────────────────────────────────────────────────

  const togglePlay = () => {
    if (totalFrames === 0) return;
    if (currentTick >= totalFrames - 1) {
      // Restart from beginning
      setCurrentTick(0);
      lastTimeRef.current = null;
      tickAccRef.current = 0;
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
      if (!playing) {
        lastTimeRef.current = null;
        tickAccRef.current = 0;
      }
    }
  };

  const handleSlider = (e) => {
    const val = parseInt(e.target.value, 10);
    setCurrentTick(val);
    setPlaying(false);
    lastTimeRef.current = null;
    tickAccRef.current = 0;
  };

  const stepBack = () => {
    setPlaying(false);
    setCurrentTick((t) => Math.max(0, t - 1));
  };

  const stepForward = () => {
    setPlaying(false);
    setCurrentTick((t) => Math.min(totalFrames - 1, t + 1));
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "TEXTAREA" || e.target.closest(".cm-editor"))
        return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "ArrowLeft") stepBack();
      if (e.key === "ArrowRight") stepForward();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Render ───────────────────────────────────────────────────────────

  const gameTimeStr = totalFrames
    ? `${(currentTick / TICK_RATE).toFixed(2)}s / ${(totalFrames / TICK_RATE).toFixed(2)}s`
    : "—";

  return (
    <div style={styles.page}>
      {/* ── Left: Canvas + playback controls ── */}
      <div style={styles.leftPanel}>
        <div style={styles.canvasWrap}>
          <GameCanvas frame={currentFrame} />
        </div>

        {/* Playback bar */}
        <div style={styles.playbackBar}>
          <button style={styles.btn} onClick={stepBack} disabled={totalFrames === 0} title="Step back">
            ⏪
          </button>
          <button style={styles.btn} onClick={togglePlay} disabled={totalFrames === 0}>
            {playing ? "⏸" : "▶"}
          </button>
          <button style={styles.btn} onClick={stepForward} disabled={totalFrames === 0} title="Step forward">
            ⏩
          </button>

          <input
            type="range"
            min={0}
            max={Math.max(totalFrames - 1, 0)}
            value={currentTick}
            onChange={handleSlider}
            disabled={totalFrames === 0}
            style={styles.slider}
          />

          <span style={styles.tickLabel}>
            Tick {currentTick} · {gameTimeStr}
          </span>
        </div>

        {/* Status */}
        {reason && (
          <div style={styles.statusBox}>
            <div
              style={{
                ...styles.status,
                color: reason === "finished" ? "#ff8800"
                     : reason === "unfinished" ? "#f59e0b"
                     : reason === "timeout" ? "#f87171"
                     : "#f87171",
              }}
            >
              {reason === "finished"
                ? `🏁 Finished in ${raceResult?.finishTime?.toFixed(3)}s`
                : reason === "unfinished"
                  ? "⏱ Time's up — race unfinished (25s)"
                  : reason === "timeout"
                    ? "⏱ Timeout — bot took >50 ms to respond"
                    : `⚠ Ended: ${reason}`}
            </div>
            {raceResult && raceResult.totalCheckpoints > 0 && (
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
                Checkpoints: {raceResult.checkpointsHit}/{raceResult.totalCheckpoints}
                {" · "}Frames: {totalFrames}
              </div>
            )}
            {raceResult && raceResult.totalCheckpoints === 0 && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                No checkpoints on this track · {totalFrames} frames
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right: Code editor + submit ── */}
      <div style={styles.rightPanel}>
        <div style={styles.editorHeader}>
          <span style={{ fontSize: 16, fontWeight: "bold" }}>🐍 Bot Code</span>
          <button
            style={{
              ...styles.submitBtn,
              opacity: loading ? 0.6 : 1,
            }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "⏳ Running…" : "🚀 Run"}
          </button>
        </div>

        {error && (
          <div style={styles.errorBar}>❌ {error}</div>
        )}

        <div style={styles.editorWrap}>
          <CodeMirror
            value={code}
            onChange={setCode}
            height="100%"
            theme={oneDark}
            extensions={[python()]}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              tabSize: 4,
              indentOnInput: true,
            }}
            style={{ height: "100%", fontSize: 14 }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    display: "flex",
    height: "100vh",
    width: "100vw",
    background: "#0f0f23",
    color: "#eee",
    fontFamily: "monospace",
    overflow: "hidden",
  },
  leftPanel: {
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 16,
    gap: 12,
    background: "#0a0a1a",
    borderRight: "1px solid #222",
    overflow: "auto",
  },
  canvasWrap: {
    flexShrink: 0,
  },
  playbackBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 960,
  },
  btn: {
    background: "#1a1a3a",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#eee",
    fontSize: 18,
    padding: "6px 12px",
    cursor: "pointer",
    lineHeight: 1,
  },
  slider: {
    flex: 1,
    accentColor: "#e94560",
    cursor: "pointer",
  },
  tickLabel: {
    fontSize: 12,
    color: "#888",
    whiteSpace: "nowrap",
    minWidth: 160,
    textAlign: "right",
  },
  status: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  statusBox: {
    textAlign: "center",
    padding: "8px 0",
  },
  rightPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    overflow: "hidden",
  },
  editorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid #222",
    background: "#0a0a1a",
  },
  submitBtn: {
    background: "#e94560",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
    padding: "8px 24px",
    cursor: "pointer",
    fontFamily: "monospace",
  },
  errorBar: {
    padding: "8px 16px",
    background: "#3a0a0a",
    color: "#f87171",
    fontSize: 13,
    borderBottom: "1px solid #422",
  },
  editorWrap: {
    flex: 1,
    overflow: "auto",
  },
};
