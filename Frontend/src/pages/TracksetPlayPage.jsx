import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import GameCanvas from "../components/GameCanvas";
import useGameSocket from "../hooks/useGameSocket";
import { getTrackset, runTrack, submitTrackset as apiSubmit, getLeaderboard } from "../api";
import { useAuth } from "../context/AuthContext";
import { neon, bg, border, text, font, glow, neonCodeTheme } from "../theme";
import playIcon from "../assets/play.png";
import pauseIcon from "../assets/pause.png";
import ffIcon from "../assets/fast-forward.png";

const PLACEHOLDER_CODE = `# ─── CodeRace Bot ───────────────────────────────────────────
# Write a  drive(state)  function that is called every tick.
# Collect all checkpoints in order, then cross the finish line!
#
# Return: {"w": bool, "a": bool, "s": bool, "d": bool}
#   w = accelerate, s = brake, a = steer left, d = steer right
# ─────────────────────────────────────────────────────────────

def drive(state):
    return {"w": True, "a": False, "s": False, "d": False}
`;

const TICK_RATE = 60;

export default function TracksetPlayPage() {
  const { id } = useParams();
  const { user } = useAuth();

  // ── Trackset data ─────────────────────────────────────────────────
  const [trackset, setTrackset] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [activeTrack, setActiveTrack] = useState(0);

  // ── Code ──────────────────────────────────────────────────────────
  const [code, setCode] = useState(PLACEHOLDER_CODE);

  // ── Run result (per track) ────────────────────────────────────────
  const [frames, setFrames] = useState([]);
  const [stdoutLines, setStdoutLines] = useState([]);
  const [reason, setReason] = useState("");
  const [raceResult, setRaceResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Submit result ─────────────────────────────────────────────────
  const [submitResult, setSubmitResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Playback ──────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [currentTick, setCurrentTick] = useState(0);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const tickAccRef = useRef(0);

  // ── Leaderboard ───────────────────────────────────────────────────
  const [leaderboard, setLeaderboard] = useState([]);

  // ── WASD live mode (admin) ────────────────────────────────────────
  const [wasdMode, setWasdMode] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────
  const [splitX, setSplitX] = useState(55);
  const [splitY, setSplitY] = useState(68);
  const [dragging, setDragging] = useState(null);
  const [rightTab, setRightTab] = useState("code");  const [cooldown, setCooldown] = useState(false);  const pageRef = useRef(null);
  const leftRef = useRef(null);
  const termRef = useRef(null);

  // ── Derived ───────────────────────────────────────────────────────
  const totalFrames = frames.length;
  const currentFrame = frames[currentTick] ?? null;
  const trackCount = trackset?.tracks?.length || 0;

  const sortedTracks = trackset?.tracks
    ? [...trackset.tracks].sort((a, b) => a.orderIndex - b.orderIndex)
    : [];
  const currentTrackId = sortedTracks[activeTrack]?.id || null;

  const { frame: liveFrame, connected: wsConnected } = useGameSocket({
    trackId: currentTrackId,
    enabled: wasdMode && !!currentTrackId,
  });

  // ── Load trackset ─────────────────────────────────────────────────

  useEffect(() => {
    getTrackset(id)
      .then(setTrackset)
      .catch((e) => setLoadError(e.message));
    getLeaderboard(id)
      .then((data) => setLeaderboard(data || []))
      .catch(() => {});
  }, [id]);

  // ── Run (single track) ────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    setLoading(true);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 5000);
    setError("");
    setFrames([]);
    setStdoutLines([]);
    setReason("");
    setRaceResult(null);
    setSubmitResult(null);
    setPlaying(false);
    setCurrentTick(0);
    lastTimeRef.current = null;
    tickAccRef.current = 0;

    try {
      const data = await runTrack(code, id, activeTrack);
      setFrames(data.frames ?? []);
      setStdoutLines(data.stdout ?? []);
      setReason(data.reason ?? "unknown");
      setRaceResult({
        finished: data.finished,
        finishTime: data.finishTime,
        checkpointsHit: data.checkpointsHit,
        totalCheckpoints: data.totalCheckpoints,
      });
      if (data.frames?.length > 0) {
        setCurrentTick(0);
        setPlaying(true);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [code, id, activeTrack]);

  // ── Submit (all tracks) ───────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 5000);
    setError("");
    setSubmitResult(null);

    try {
      const data = await apiSubmit(code, id);
      setSubmitResult(data);
      getLeaderboard(id)
        .then((lb) => setLeaderboard(lb || []))
        .catch(() => {});
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [code, id]);

  // ── Playback loop ─────────────────────────────────────────────────

  useEffect(() => {
    if (!playing || totalFrames === 0) {
      lastTimeRef.current = null;
      tickAccRef.current = 0;
      return;
    }

    const step = (timestamp) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const delta = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;
      tickAccRef.current += delta;

      const tickDuration = 1 / TICK_RATE;
      setCurrentTick((prev) => {
        let next = prev;
        while (tickAccRef.current >= tickDuration && next < totalFrames - 1) {
          tickAccRef.current -= tickDuration;
          next++;
        }
        if (next >= totalFrames - 1) setPlaying(false);
        return next;
      });

      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, totalFrames]);

  // ── Playback controls ─────────────────────────────────────────────

  const togglePlay = () => {
    if (totalFrames === 0) return;
    if (currentTick >= totalFrames - 1) {
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
    setCurrentTick(parseInt(e.target.value, 10));
    setPlaying(false);
    lastTimeRef.current = null;
    tickAccRef.current = 0;
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "TEXTAREA" || e.target.closest(".cm-editor")) return;
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (e.key === "ArrowLeft") { setPlaying(false); setCurrentTick((t) => Math.max(0, t - 1)); }
      if (e.key === "ArrowRight") { setPlaying(false); setCurrentTick((t) => Math.min(totalFrames - 1, t + 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Resize logic ──────────────────────────────────────────────────

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      if (dragging === "x") {
        const rect = pageRef.current.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        setSplitX(Math.max(30, Math.min(75, pct)));
      } else if (dragging === "y") {
        const rect = leftRef.current.getBoundingClientRect();
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        setSplitY(Math.max(25, Math.min(85, pct)));
      }
    };
    const onUp = () => setDragging(null);
    document.body.style.cursor = dragging === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // ── Auto-scroll terminal ──────────────────────────────────────────

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [currentTick, reason, submitResult]);

  // ── Terminal data ─────────────────────────────────────────────────


  const currentStdout = stdoutLines[currentTick] || "";

  // ── Derived track data ────────────────────────────────────────────

  const currentTrackData = (() => {
    const t = sortedTracks[activeTrack];
    if (!t) return null;
    try {
      return typeof t.data === "string" ? JSON.parse(t.data) : t.data;
    } catch { return null; }
  })();

  const gameTimeStr = totalFrames
    ? `${(currentTick / TICK_RATE).toFixed(2)}s / ${(totalFrames / TICK_RATE).toFixed(2)}s`
    : "0.00s";

  // ── Loading / Error states ────────────────────────────────────────

  if (loadError) {
    return (
      <div style={{ ...S.page, alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: neon.purple, fontFamily: font.mono }}>❌ {loadError}</p>
      </div>
    );
  }

  if (!trackset) {
    return (
      <div style={{ ...S.page, alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: text.muted, fontFamily: font.mono }}>Loading trackset…</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div ref={pageRef} style={S.page}>
      {/* ═══ LEFT PANEL ═══════════════════════════════════════════════ */}
      <div ref={leftRef} style={{ ...S.leftPanel, width: `${splitX}%` }}>

        {/* ── Canvas Window ────────────────────────────────────────── */}
        <div style={{ ...S.window, flex: `0 0 ${splitY}%`, display: "flex", flexDirection: "column" }}>
          <div style={S.titleBar}>
            <span style={{ color: neon.green, fontSize: 10, lineHeight: 1 }}>●</span>
            <span style={S.titleText}>GAME CANVAS</span>
            {trackCount > 1 && (
              <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
                {sortedTracks.map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveTrack(i);
                      setWasdMode(false);
                      setPlaying(false);
                      setFrames([]);
                      setStdoutLines([]);
                      setReason("");
                      setRaceResult(null);
                      setSubmitResult(null);
                      setCurrentTick(0);
                      setError("");
                      lastTimeRef.current = null;
                      tickAccRef.current = 0;
                    }}
                    style={{ ...S.miniTab, ...(activeTrack === i ? S.miniTabActive : {}) }}
                  >
                    Track {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={S.canvasArea}>
            {wasdMode ? (
              <GameCanvas frame={liveFrame} trackData={currentTrackData} />
            ) : (
              <GameCanvas frame={currentFrame} trackData={currentTrackData} />
            )}
            {/* Video-style playback overlay */}
            {!wasdMode && (
              <div style={S.playbackOverlay}>
                <button
                  style={S.pbBtn}
                  onClick={() => { setPlaying(false); setCurrentTick((t) => Math.max(0, t - 1)); }}
                  disabled={totalFrames === 0}
                ><img src={ffIcon} alt="Rewind" style={{ width: 14, height: 14, transform: "scaleX(-1)" }} /></button>
                <button style={S.pbBtn} onClick={togglePlay} disabled={totalFrames === 0}>
                  <img src={playing ? pauseIcon : playIcon} alt={playing ? "Pause" : "Play"} style={{ width: 14, height: 14 }} />
                </button>
                <button
                  style={S.pbBtn}
                  onClick={() => { setPlaying(false); setCurrentTick((t) => Math.min(totalFrames - 1, t + 1)); }}
                  disabled={totalFrames === 0}
                ><img src={ffIcon} alt="Forward" style={{ width: 14, height: 14 }} /></button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(totalFrames - 1, 0)}
                  value={currentTick}
                  onChange={handleSlider}
                  disabled={totalFrames === 0}
                  style={S.slider}
                />
                <span style={S.timeLabel}>{gameTimeStr}</span>
              </div>
            )}
            {wasdMode && (
              <div style={S.wasdBadge}>
                <span style={{ color: wsConnected ? neon.green : neon.purple }}>
                  {wsConnected ? "● LIVE" : "○ Connecting…"}
                </span>
                <span style={{ color: text.muted, fontSize: 10 }}>
                  <b>W</b>/<b>A</b>/<b>S</b>/<b>D</b>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Horizontal resize handle ─────────────────────────────── */}
        <div style={S.hResize} onMouseDown={() => setDragging("y")}>
          <div style={S.hResizeDots}>⋯</div>
        </div>

        {/* ── Terminal Window ──────────────────────────────────────── */}
        <div style={{ ...S.window, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={S.titleBar}>
            <span style={{ color: neon.blue, fontSize: 10, lineHeight: 1 }}>●</span>
            <span style={S.titleText}>TERMINAL</span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: text.dim, fontFamily: font.mono }}>DEBUG</span>
          </div>
          <pre ref={termRef} style={S.termBody}>
            <span style={{ color: neon.green }}>◆</span>
            <span style={{ color: text.secondary }}> CodeRace Engine v2.0 — Sandbox Ready{"\n"}</span>
            <span style={{ color: neon.green }}>◆</span>
            <span style={{ color: text.secondary }}> 60Hz physics · nsjail isolation{"\n"}</span>
            <span style={{ color: neon.blue }}>◆</span>
            <span style={{ color: text.muted }}> Write a drive(state) function, hit ▶ Run{"\n"}</span>
            <span style={{ color: text.dim }}>{"─".repeat(44)}{"\n"}</span>
            {loading && (
              <>
                <span style={{ color: neon.orange }}>◆</span>
                <span style={{ color: text.secondary }}> Executing bot code…{"\n"}</span>
              </>
            )}
            {currentStdout && totalFrames > 0 && (
              <>
                <span style={{ color: neon.blue }}>[tick {currentTick}]</span>
                <span style={{ color: text.primary }}> {currentStdout}{"\n"}</span>
              </>
            )}
            {reason && !playing && (
              <>
                <span style={{ color: text.dim }}>{"\n"}{"═".repeat(34)}{"\n"}</span>
                <span style={{ color: reason === "finished" ? neon.green : neon.orange, fontWeight: 700 }}>
                  {reason === "finished"
                    ? `🏁 Finished in ${raceResult?.finishTime?.toFixed(3)}s`
                    : reason === "unfinished"
                      ? "⏱ Time's up (25s limit)"
                      : reason === "timeout"
                        ? "⏱ Bot exceeded 50ms timeout"
                        : `⚠ ${reason}`}
                  {"\n"}
                </span>
                {raceResult && raceResult.totalCheckpoints > 0 && (
                  <span style={{ color: text.secondary }}>
                    <span style={{ color: neon.green }}>◆</span> Checkpoints: {raceResult.checkpointsHit}/{raceResult.totalCheckpoints}{"\n"}
                  </span>
                )}
              </>
            )}
            {submitResult && (
              <>
                <span style={{ color: text.dim }}>{"\n"}{"═".repeat(34)}{"\n"}</span>
                <span style={{ color: submitResult.allFinished ? neon.green : neon.purple, fontWeight: 700 }}>
                  {submitResult.allFinished ? "✅ Submission Passed" : "❌ Submission Failed"}{"\n"}
                </span>
                {submitResult.trackResults?.map((tr, i) => (
                  <span key={i} style={{ color: tr.finished ? neon.green : neon.purple }}>
                    <span style={{ color: neon.green }}>◆</span> Track {i + 1}: {tr.finished ? `✓ ${tr.finishTime.toFixed(3)}s` : tr.reason}{"\n"}
                  </span>
                ))}
                {submitResult.allFinished && (
                  <span style={{ color: neon.orange }}>
                    <span style={{ color: neon.green }}>◆</span> Score: {submitResult.score} · Total: {submitResult.totalTime.toFixed(3)}s{"\n"}
                  </span>
                )}
              </>
            )}
          </pre>
        </div>
      </div>

      {/* ═══ VERTICAL RESIZE HANDLE ══════════════════════════════════ */}
      <div style={S.vResize} onMouseDown={() => setDragging("x")}>
        <div style={S.vResizeDots}>⋮</div>
      </div>

      {/* ═══ RIGHT PANEL ═════════════════════════════════════════════ */}
      <div style={{ ...S.rightPanel, width: `calc(${100 - splitX}% - 6px)` }}>
        <div style={{ ...S.window, display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Title bar with tabs */}
          <div style={S.titleBar}>
            <span style={{ color: neon.purple, fontSize: 10, lineHeight: 1 }}>●</span>
            <span style={S.titleText}>
              {trackset.official ? "" : ""}{trackset.name}
            </span>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto", alignItems: "center" }}>
              <button
                onClick={() => setRightTab("code")}
                style={{ ...S.tab, ...(rightTab === "code" ? S.tabActive : {}) }}
              >
                {"<>"} Code
              </button>
              <button
                onClick={() => setRightTab("leaderboard")}
                style={{ ...S.tab, ...(rightTab === "leaderboard" ? S.tabActive : {}) }}
              >
                🏆 Board
              </button>
              {user?.isAdmin && (
                <button
                  style={{
                    ...S.tab,
                    color: wasdMode ? neon.orange : text.muted,
                    borderColor: wasdMode ? "rgba(255,136,0,0.3)" : "transparent",
                  }}
                  onClick={() => setWasdMode((m) => !m)}
                >
                  {wasdMode ? "🤖 Bot" : "🎮 Play"}
                </button>
              )}
            </div>
          </div>

          {/* Content area — Code or Leaderboard */}
          <div style={S.editorArea}>
            {rightTab === "code" ? (
              <CodeMirror
                value={code}
                onChange={setCode}
                height="100%"
                theme={neonCodeTheme}
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
            ) : (
              <div style={S.lbContent}>
                <div style={{ fontSize: 15, fontWeight: 700, color: neon.orange, fontFamily: font.mono, marginBottom: 16 }}>
                  🏆 Leaderboard
                </div>
                {leaderboard.length === 0 ? (
                  <p style={{ color: text.muted, fontSize: 12, fontFamily: font.mono }}>No scores yet. Be the first!</p>
                ) : (
                  <div style={S.lbList}>
                    {leaderboard.slice(0, 15).map((e) => (
                      <div key={e.userId} style={S.lbRow}>
                        <span style={S.lbRank}>#{e.rank}</span>
                        <span style={S.lbName}>{e.displayName}</span>
                        <span style={S.lbScore}>{e.score}</span>
                        <span style={S.lbTime}>{e.totalTime.toFixed(3)}s</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action bar with Run / Submit */}
          <div style={S.actionBar}>
            {error && <div style={S.errorMsg}>❌ {error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                style={{ ...S.actionBtn, ...S.runBtn, opacity: (loading || cooldown) ? 0.6 : 1 }}
                onClick={handleRun}
                disabled={loading || submitting || wasdMode || cooldown}
              >
                {loading ? "⏳ Running…" : cooldown ? "⏳ Wait…" : `▶ Run Track ${activeTrack + 1}`}
              </button>
              {user && (
                <button
                  style={{ ...S.actionBtn, ...S.submitBtn, opacity: (submitting || cooldown) ? 0.6 : 1 }}
                  onClick={handleSubmit}
                  disabled={loading || submitting || cooldown}
                >
                  {submitting ? "⏳ Submitting…" : cooldown ? "⏳ Wait…" : "🚀 Submit All"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Styles
// ═════════════════════════════════════════════════════════════════════════════

const S = {
  page: {
    display: "flex",
    height: "100%",
    width: "100vw",
    background: bg.root,
    color: text.primary,
    fontFamily: font.sans,
    overflow: "hidden",
  },

  /* ── Panels ──────────────────────────────────────────────────────── */
  leftPanel: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    padding: 4,
    gap: 0,
  },
  rightPanel: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    padding: 4,
    paddingLeft: 0,
  },

  /* ── Window chrome ───────────────────────────────────────────────── */
  window: {
    border: `1px solid rgba(132, 204, 22, 0.18)`,
    borderRadius: 8,
    overflow: "hidden",
    background: bg.dark,
  },
  titleBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 12px",
    background: bg.panel,
    borderBottom: `1px solid rgba(132, 204, 22, 0.18)`,
    minHeight: 30,
    flexShrink: 0,
  },
  titleText: {
    fontSize: 11,
    fontWeight: 700,
    fontFamily: font.mono,
    color: text.secondary,
    textTransform: "uppercase",
    letterSpacing: "1px",
  },

  /* ── Canvas area ─────────────────────────────────────────────────── */
  canvasArea: {
    flex: 1,
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background: "#1a3518",
    minHeight: 0,
  },

  /* ── Video-style playback overlay ────────────────────────────────── */
  playbackOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 14px 8px",
    background: "linear-gradient(transparent, rgba(0,0,0,0.9))",
    zIndex: 2,
  },
  pbBtn: {
    background: "#0a1103",
    border: "1px solid rgba(132, 204, 22, 0.25)",
    color: neon.green,
    fontSize: 16,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 6,
    lineHeight: 1,
    transition: "all 0.15s ease",
  },
  slider: {
    flex: 1,
    accentColor: neon.green,
    cursor: "pointer",
    height: 4,
  },
  timeLabel: {
    fontSize: 11,
    color: text.muted,
    fontFamily: font.mono,
    whiteSpace: "nowrap",
    minWidth: 110,
    textAlign: "right",
  },
  wasdBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    display: "flex",
    gap: 12,
    padding: "4px 12px",
    background: "rgba(0,0,0,0.85)",
    borderRadius: 6,
    fontSize: 11,
    fontFamily: font.mono,
    border: `1px solid ${border.default}`,
    zIndex: 2,
  },

  /* ── Resize handles ──────────────────────────────────────────────── */
  hResize: {
    height: 6,
    cursor: "row-resize",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: bg.root,
  },
  hResizeDots: {
    color: text.dim,
    fontSize: 10,
    lineHeight: 1,
    userSelect: "none",
  },
  vResize: {
    width: 6,
    cursor: "col-resize",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: bg.root,
  },
  vResizeDots: {
    color: text.dim,
    fontSize: 10,
    lineHeight: 1,
    userSelect: "none",
  },

  /* ── Terminal ────────────────────────────────────────────────────── */
  termBody: {
    flex: 1,
    margin: 0,
    padding: "10px 14px",
    fontSize: 12,
    color: text.secondary,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    fontFamily: font.mono,
    overflow: "auto",
    background: bg.dark,
    lineHeight: 1.7,
    minHeight: 0,
  },

  /* ── Tabs ─────────────────────────────────────────────────────────── */
  miniTab: {
    background: "none",
    border: "1px solid transparent",
    borderRadius: 4,
    color: text.muted,
    padding: "2px 8px",
    cursor: "pointer",
    fontFamily: font.mono,
    fontSize: 10,
    fontWeight: 600,
  },
  miniTabActive: {
    color: neon.green,
    borderColor: "rgba(132, 204, 22, 0.3)",
    background: "#0d1504",
  },
  tab: {
    background: "none",
    border: "1px solid transparent",
    borderRadius: 4,
    color: text.muted,
    padding: "3px 10px",
    cursor: "pointer",
    fontFamily: font.mono,
    fontSize: 11,
    fontWeight: 600,
    transition: "all 0.15s ease",
  },
  tabActive: {
    color: neon.green,
    borderColor: "rgba(132, 204, 22, 0.3)",
    background: "#0d1504",
  },

  /* ── Editor / Leaderboard content ────────────────────────────────── */
  editorArea: {
    flex: 1,
    overflow: "auto",
    minHeight: 0,
  },
  lbContent: {
    padding: 20,
    height: "100%",
    overflowY: "auto",
  },
  lbList: { display: "flex", flexDirection: "column", gap: 6 },
  lbRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    background: bg.panel,
    borderRadius: 6,
    fontSize: 12,
    fontFamily: font.mono,
    border: `1px solid ${border.default}`,
  },
  lbRank: { fontWeight: 700, color: neon.orange, width: 32 },
  lbName: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: text.primary },
  lbScore: { fontWeight: 700, color: neon.green, width: 48, textAlign: "right" },
  lbTime: { color: text.muted, width: 64, textAlign: "right" },

  /* ── Action bar ──────────────────────────────────────────────────── */
  actionBar: {
    padding: "10px 14px",
    borderTop: `1px solid ${border.default}`,
    background: bg.panel,
    flexShrink: 0,
  },
  actionBtn: {
    border: "1px solid",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 12,
    padding: "8px 20px",
    cursor: "pointer",
    fontFamily: font.mono,
    transition: "all 0.15s ease",
  },
  runBtn: {
    background: "#0f1a06",
    color: neon.green,
    borderColor: "rgba(132, 204, 22, 0.3)",
    boxShadow: glow.green,
  },
  submitBtn: {
    background: "#1f0a24",
    color: neon.purple,
    borderColor: "rgba(228, 111, 255, 0.3)",
    boxShadow: glow.purple,
  },
  errorMsg: {
    color: neon.purple,
    fontSize: 12,
    fontFamily: font.mono,
    marginBottom: 8,
    padding: "4px 8px",
    background: "#170818",
    borderRadius: 4,
  },
};
