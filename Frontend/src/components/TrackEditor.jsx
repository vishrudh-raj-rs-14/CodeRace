import { useRef, useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { neon, bg, border, text, font } from "../theme";
import carAsset from "../assets/Car.png";

const carImg = new Image();
carImg.src = carAsset;

/* ── surface palette ─────────────────────────────────────────────────────── */
const SURFACES = [
  { name: "road",  color: "#555566", label: "🛣️ Road" },
  { name: "grass", color: "#2d5a27", label: "🌿 Grass" },
  { name: "dirt",  color: "#8B7355", label: "🟤 Dirt" },
  { name: "ice",   color: "#b8e0f0", label: "❄️ Ice" },
  { name: "wall",  color: "#333344", label: "🧱 Wall" },
];
const COLORS = Object.fromEntries(SURFACES.map((s) => [s.name, s.color]));

/**
 * Subtract rectangle `cut` from `rect`. Returns 0-4 pieces (the parts of
 * `rect` that are NOT covered by `cut`). Both must be {x,y,w,h}.
 */
function subtractRect(rect, cut) {
  const rr = rect.x + rect.w, rb = rect.y + rect.h;
  const cr = cut.x + cut.w, cb = cut.y + cut.h;
  // no overlap → return original
  if (cut.x >= rr || cr <= rect.x || cut.y >= rb || cb <= rect.y) return [rect];
  const pieces = [];
  // top strip
  if (cut.y > rect.y)
    pieces.push({ ...rect, h: cut.y - rect.y });
  // bottom strip
  if (cb < rb)
    pieces.push({ ...rect, y: cb, h: rb - cb });
  // left strip (middle band only)
  const midTop = Math.max(rect.y, cut.y);
  const midBot = Math.min(rb, cb);
  if (midBot > midTop) {
    if (cut.x > rect.x)
      pieces.push({ ...rect, y: midTop, w: cut.x - rect.x, h: midBot - midTop });
    if (cr < rr)
      pieces.push({ ...rect, x: cr, y: midTop, w: rr - cr, h: midBot - midTop });
  }
  return pieces;
}

export default function TrackEditor({ trackData, onTrackChange, embedded }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  /* ── track data (state so React re-renders on change) ─────────────────── */
  const [rects, setRects] = useState(trackData?.rects ?? []);
  const [checkpoints, setCheckpoints] = useState(trackData?.checkpoints ?? []);
  const [finish, setFinish] = useState(trackData?.finish ?? null);
  const [worldW, setWorldW] = useState(trackData?.worldW ?? 4000);
  const [worldH, setWorldH] = useState(trackData?.worldH ?? 4000);
  const [gridSize, setGridSize] = useState(trackData?.gridSize ?? 50);
  const [startPos, setStartPos] = useState({
    x: trackData?.startX ?? 200,
    y: trackData?.startY ?? 200,
    heading: trackData?.startHeading ?? 0,
  });

  /* ── editor UI state ──────────────────────────────────────────────────── */
  const [surface, setSurface] = useState("road");
  const [mode, setMode] = useState("place"); // "place" | "start"
  const [zoom, setZoom] = useState(0.5);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  /* ── refs for smooth interaction (mutated during drag, read by rAF) ──── */
  const cam = useRef({ x: 0, y: 0 });
  const drag = useRef({
    pan: false,
    panStart: null,
    panCam: null,
    sel: false,
    selA: null,
    selB: null,
    mouse: { x: 0, y: 0 },
  });
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const rafId = useRef(0);

  // Keep latest surface & mode in refs so rAF can read them.
  const surfaceRef = useRef(surface);
  useEffect(() => {
    surfaceRef.current = surface;
  }, [surface]);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  /* ── coordinate helpers ───────────────────────────────────────────────── */
  const s2w = useCallback(
    (sx, sy) => ({
      x: sx / zoomRef.current + cam.current.x,
      y: sy / zoomRef.current + cam.current.y,
    }),
    [],
  );
  const snap = useCallback(
    (wx, wy) => {
      const maxGx = Math.floor((worldW - 1) / gridSize);
      const maxGy = Math.floor((worldH - 1) / gridSize);
      return {
        gx: Math.max(0, Math.min(maxGx, Math.floor(wx / gridSize))),
        gy: Math.max(0, Math.min(maxGy, Math.floor(wy / gridSize))),
      };
    },
    [gridSize, worldW, worldH],
  );
  const selRect = useCallback(
    (a, b) => {
      const x1 = Math.min(a.gx, b.gx);
      const y1 = Math.min(a.gy, b.gy);
      const x2 = Math.max(a.gx, b.gx);
      const y2 = Math.max(a.gy, b.gy);
      return {
        x: x1 * gridSize,
        y: y1 * gridSize,
        w: (x2 - x1 + 1) * gridSize,
        h: (y2 - y1 + 1) * gridSize,
      };
    },
    [gridSize],
  );

  /* ── load saved track on mount (standalone mode only) ──────────────────── */
  useEffect(() => {
    if (embedded) return; // In embedded mode, data comes from props.
    fetch("/api/track/load")
      .then((r) => r.json())
      .then((d) => {
        if (d.rects?.length) setRects(d.rects);
        if (d.checkpoints?.length) setCheckpoints(d.checkpoints);
        if (d.finish) setFinish(d.finish);
        if (d.worldW > 0) setWorldW(d.worldW);
        if (d.worldH > 0) setWorldH(d.worldH);
        if (d.gridSize > 0) setGridSize(d.gridSize);
        if (d.startX != null)
          setStartPos({
            x: d.startX,
            y: d.startY,
            heading: d.startHeading || 0,
          });
      })
      .catch(() => {});
  }, [embedded]);

  /* ── notify parent of track changes (embedded mode) ──────────────────── */
  useEffect(() => {
    if (!embedded || !onTrackChange) return;
    onTrackChange({
      worldW,
      worldH,
      gridSize,
      startX: startPos.x,
      startY: startPos.y,
      startHeading: startPos.heading,
      rects,
      checkpoints,
      finish,
    });
  }, [embedded, onTrackChange, rects, checkpoints, finish, worldW, worldH, gridSize, startPos]);

  /* ── keep canvas sized to its container ───────────────────────────────── */
  useEffect(() => {
    const fit = () => {
      const c = canvasRef.current;
      const w = wrapRef.current;
      if (c && w) {
        c.width = w.clientWidth;
        c.height = w.clientHeight;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  /* ── render loop (requestAnimationFrame) ──────────────────────────────── */
  useEffect(() => {
    const draw = () => {
      const cvs = canvasRef.current;
      if (!cvs) {
        rafId.current = requestAnimationFrame(draw);
        return;
      }
      const ctx = cvs.getContext("2d");
      const cw = cvs.width;
      const ch = cvs.height;
      const z = zoomRef.current;
      const cx = cam.current.x;
      const cy = cam.current.y;
      const d = drag.current;

      // ── clear ──────────────────────────────────────────────────────────
      ctx.fillStyle = bg.panel;
      ctx.fillRect(0, 0, cw, ch);

      ctx.save();
      ctx.scale(z, z);
      ctx.translate(-cx, -cy);

      // ── world background (grass default) ───────────────────────────────
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(0, 0, worldW, worldH);

      // ── placed rects (painter order) ───────────────────────────────────
      for (const r of rects) {
        ctx.fillStyle = COLORS[r.surface] || "#555";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        // Wall cross-hatch
        if (r.surface === "wall") {
          ctx.save();
          ctx.beginPath();
          ctx.rect(r.x, r.y, r.w, r.h);
          ctx.clip();
          ctx.strokeStyle = "rgba(255,255,255,0.10)";
          ctx.lineWidth = 2 / z;
          const step = 16;
          for (let i = -r.h; i < r.w + r.h; i += step) {
            ctx.beginPath();
            ctx.moveTo(r.x + i, r.y);
            ctx.lineTo(r.x + i + r.h, r.y + r.h);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // ── checkpoints ─────────────────────────────────────────────────────
      for (const cp of checkpoints) {
        // Semi-transparent blue overlay.
        ctx.fillStyle = "rgba(0,150,255,0.30)";
        ctx.fillRect(cp.x, cp.y, cp.w, cp.h);
        ctx.strokeStyle = neon.blue;
        ctx.lineWidth = 3 / z;
        ctx.setLineDash([8 / z, 4 / z]);
        ctx.strokeRect(cp.x, cp.y, cp.w, cp.h);
        ctx.setLineDash([]);
        // Number label.
        ctx.font = `bold ${Math.max(16, 24 / z)}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = neon.blue;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`CP${cp.order + 1}`, cp.x + cp.w / 2, cp.y + cp.h / 2);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }

      // ── finish zone ─────────────────────────────────────────────────────
      if (finish) {
        // Checkered pattern.
        const sq = Math.max(8, 16 / z);
        ctx.save();
        ctx.beginPath();
        ctx.rect(finish.x, finish.y, finish.w, finish.h);
        ctx.clip();
        for (let fy = finish.y; fy < finish.y + finish.h; fy += sq) {
          for (let fx = finish.x; fx < finish.x + finish.w; fx += sq) {
            const ci = Math.floor((fx - finish.x) / sq) + Math.floor((fy - finish.y) / sq);
            ctx.fillStyle = ci % 2 === 0 ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)";
            ctx.fillRect(fx, fy, sq, sq);
          }
        }
        ctx.restore();
        ctx.strokeStyle = "#ff8800";
        ctx.lineWidth = 3 / z;
        ctx.strokeRect(finish.x, finish.y, finish.w, finish.h);
        ctx.font = `bold ${Math.max(14, 18 / z)}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = neon.gold;
        ctx.textAlign = "center";
        ctx.fillText("🏁 FINISH", finish.x + finish.w / 2, finish.y - 8 / z);
        ctx.textAlign = "start";
      }

      // ── grid lines ─────────────────────────────────────────────────────
      if (z >= 0.1) {
        const alpha = z > 0.35 ? 0.1 : 0.04;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 1 / z;
        const gx0 = Math.max(0, Math.floor(cx / gridSize) * gridSize);
        const gy0 = Math.max(0, Math.floor(cy / gridSize) * gridSize);
        const ex = Math.min(cx + cw / z, worldW);
        const ey = Math.min(cy + ch / z, worldH);
        for (let x = gx0; x <= ex; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, Math.max(0, gy0));
          ctx.lineTo(x, ey);
          ctx.stroke();
        }
        for (let y = gy0; y <= ey; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(Math.max(0, gx0), y);
          ctx.lineTo(ex, y);
          ctx.stroke();
        }
      }

      // ── world border ───────────────────────────────────────────────────
      ctx.strokeStyle = neon.pink;
      ctx.lineWidth = 4 / z;
      ctx.strokeRect(0, 0, worldW, worldH);

      // ── selection preview ──────────────────────────────────────────────
      if (d.sel && d.selA && d.selB) {
        const s = selRect(d.selA, d.selB);
        const m = modeRef.current;
        ctx.fillStyle = m === "checkpoint" ? "rgba(0,150,255,0.35)"
                      : m === "finish" ? "rgba(255,136,0,0.35)"
                      : (COLORS[surfaceRef.current] || "#555") + "80";
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = m === "checkpoint" ? "#00a5ff" : m === "finish" ? "#ff8800" : "#fff";
        ctx.lineWidth = 2 / z;
        ctx.setLineDash([6 / z, 4 / z]);
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        ctx.setLineDash([]);
      }

      // ── hover cell highlight ───────────────────────────────────────────
      if (!d.sel && !d.pan && modeRef.current === "place") {
        const wm = s2w(d.mouse.x, d.mouse.y);
        if (wm.x >= 0 && wm.x < worldW && wm.y >= 0 && wm.y < worldH) {
          const gm = snap(wm.x, wm.y);
          ctx.fillStyle = (COLORS[surfaceRef.current] || "#555") + "40";
          ctx.fillRect(gm.gx * gridSize, gm.gy * gridSize, gridSize, gridSize);
        }
      }

      // ── start marker ───────────────────────────────────────────────────
      const eL = 44, eW = 22, eScale = 2.5; // eScale = sprite scale (adjust to taste)
      ctx.save();
      ctx.translate(startPos.x, startPos.y);
      ctx.rotate(startPos.heading);

      // Debug collider outline
      ctx.strokeStyle = "rgba(255,255,0,0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(-eL / 2, -eW / 2, eL, eW);

      if (carImg.complete && carImg.naturalWidth > 0) {
        const aspect = carImg.naturalWidth / carImg.naturalHeight;
        const sprH = eL * eScale;
        const sprW = sprH * aspect;
        ctx.save();
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(carImg, -sprW / 2, -sprH / 2, sprW, sprH);
        ctx.restore();
      } else {
        ctx.fillStyle = neon.pink;
        ctx.fillRect(-eL / 2, -eW / 2, eL, eW);
      }
      // Arrow pointing forward
      ctx.fillStyle = neon.gold;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(12, -8);
      ctx.lineTo(12, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Label
      ctx.font = `bold ${Math.max(12, 14 / z)}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = neon.gold;
      ctx.textAlign = "center";
      ctx.fillText("START", startPos.x, startPos.y - 24);
      ctx.textAlign = "start";

      ctx.restore(); // un-zoom/pan

      // ── HUD (screen space) ─────────────────────────────────────────────
      const wm = s2w(d.mouse.x, d.mouse.y);
      const gm = snap(wm.x, wm.y);
      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.fillStyle = text.dim;
      ctx.fillText(
        `Grid ${gm.gx},${gm.gy}  |  World ${Math.round(wm.x)},${Math.round(wm.y)}  |  Zoom ${(z * 100).toFixed(0)}%  |  Rects ${rects.length}`,
        10,
        ch - 10,
      );

      rafId.current = requestAnimationFrame(draw);
    };

    rafId.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId.current);
  }, [rects, checkpoints, finish, worldW, worldH, gridSize, startPos, selRect, s2w, snap]);

  /* ── mouse handlers ───────────────────────────────────────────────────── */
  const onDown = useCallback(
    (e) => {
      const r = canvasRef.current.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const d = drag.current;

      // Right / middle button → pan
      if (e.button === 1 || e.button === 2) {
        d.pan = true;
        d.panStart = { x: sx, y: sy };
        d.panCam = { ...cam.current };
        return;
      }

      // Left click in start-position mode
      if (e.button === 0 && mode === "start") {
        const w = s2w(sx, sy);
        if (w.x < 0 || w.y < 0 || w.x >= worldW || w.y >= worldH) return;
        const g = snap(w.x, w.y);
        setStartPos((p) => ({
          x: g.gx * gridSize + gridSize / 2,
          y: g.gy * gridSize + gridSize / 2,
          heading: p.heading,
        }));
        return;
      }

      // Left click → start rectangular selection
      if (e.button === 0) {
        const w = s2w(sx, sy);
        if (w.x < 0 || w.y < 0 || w.x >= worldW || w.y >= worldH) return;
        const g = snap(w.x, w.y);
        d.sel = true;
        d.selA = g;
        d.selB = g;
      }
    },
    [mode, s2w, snap, gridSize],
  );

  const onMove = useCallback(
    (e) => {
      const r = canvasRef.current.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const d = drag.current;
      d.mouse = { x: sx, y: sy };

      if (d.pan) {
        cam.current = {
          x: d.panCam.x - (sx - d.panStart.x) / zoomRef.current,
          y: d.panCam.y - (sy - d.panStart.y) / zoomRef.current,
        };
        return;
      }

      if (d.sel) {
        const w = s2w(sx, sy);
        d.selB = snap(w.x, w.y);
      }
    },
    [s2w, snap],
  );

  const onUp = useCallback(() => {
    const d = drag.current;
    if (d.pan) {
      d.pan = false;
      return;
    }
    if (d.sel && d.selA && d.selB) {
      const s = selRect(d.selA, d.selB);
      const clamped = {
        x: Math.max(0, s.x),
        y: Math.max(0, s.y),
        w: Math.min(s.w, worldW - Math.max(0, s.x)),
        h: Math.min(s.h, worldH - Math.max(0, s.y)),
      };
      if (clamped.w > 0 && clamped.h > 0) {
        if (mode === "checkpoint") {
          setCheckpoints((prev) => [
            ...prev,
            { ...clamped, order: prev.length },
          ]);
        } else if (mode === "finish") {
          setFinish(clamped);
        } else {
          setRects((prev) => {
            // Subtract the new rect's area from every existing rect so
            // overlapping walls (or any surface) are properly replaced.
            let remaining = [];
            for (const r of prev) {
              remaining.push(...subtractRect(r, clamped).map((p) => ({ ...p, surface: r.surface })));
            }
            remaining.push({ ...clamped, surface });
            return remaining;
          });
        }
      }
      d.sel = false;
      d.selA = null;
      d.selB = null;
    }
  }, [surface, mode, worldW, worldH, selRect]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const r = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const oldZ = zoomRef.current;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZ = Math.max(0.04, Math.min(4, oldZ * factor));
    // Keep world-point under cursor fixed.
    cam.current = {
      x: cam.current.x + sx / oldZ - sx / newZ,
      y: cam.current.y + sy / oldZ - sy / newZ,
    };
    setZoom(newZ);
  }, []);

  const noCtx = useCallback((e) => e.preventDefault(), []);

  /* ── keyboard shortcuts ───────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
      }
      const numMap = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4 };
      if (numMap[e.key] !== undefined && SURFACES[numMap[e.key]]) {
        setSurface(SURFACES[numMap[e.key]].name);
        setMode("place");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  /* ── actions ──────────────────────────────────────────────────────────── */
  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/track/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldW,
          worldH,
          gridSize,
          startX: startPos.x,
          startY: startPos.y,
          startHeading: startPos.heading,
          rects,
          checkpoints,
          finish,
        }),
      });
      setMsg(res.ok ? "✅ Saved!" : "❌ Error");
    } catch {
      setMsg("❌ Network error");
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const undo = () => {
    if (mode === "checkpoint") {
      setCheckpoints((p) => p.slice(0, -1));
    } else if (mode === "finish") {
      setFinish(null);
    } else {
      setRects((p) => p.slice(0, -1));
    }
  };
  const clear = () => {
    if (window.confirm("Clear all placed blocks, checkpoints and finish?")) {
      setRects([]);
      setCheckpoints([]);
      setFinish(null);
    }
  };
  const rotateStart = () =>
    setStartPos((p) => ({ ...p, heading: p.heading + Math.PI / 2 }));

  /* ── render ───────────────────────────────────────────────────────────── */
  return (
    <div
      style={{
        display: "flex",
        height: embedded ? "100%" : "100vh",
        background: bg.panel,
        color: text.primary,
        fontFamily: font.sans,
      }}
    >
      {/* ── sidebar ────────────────────────────────────────────────────── */}
      <div
        style={{
          width: 240,
          padding: 16,
          background: bg.dark,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          borderRight: `1px solid ${border.default}`,
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontFamily: font.mono, fontWeight: 700, color: text.primary }}>🏗️ Track Editor</h2>
          <Link
            to="/"
            style={{ color: text.muted, fontSize: 10, textDecoration: "none", fontFamily: font.mono }}
          >
            ← Home
          </Link>
        </div>

        {/* mode toggle */}
        <Lbl>Mode</Lbl>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <Btn active={mode === "place"} onClick={() => setMode("place")}>
            🖌️ Place
          </Btn>
          <Btn active={mode === "start"} onClick={() => setMode("start")}>
            🚗 Start
          </Btn>
          <Btn active={mode === "checkpoint"} onClick={() => setMode("checkpoint")}
               style={mode === "checkpoint" ? { background: `rgba(0,165,255,0.15)`, borderColor: neon.blue, color: neon.blue } : {}}>
            🔵 Checkpoint
          </Btn>
          <Btn active={mode === "finish"} onClick={() => setMode("finish")}
               style={mode === "finish" ? { background: `rgba(255,136,0,0.15)`, borderColor: neon.gold, color: neon.gold } : {}}>
            🏁 Finish
          </Btn>
        </div>

        {/* surface picker (place mode) */}
        {mode === "place" && (
          <>
            <Lbl>Surface (1-5)</Lbl>
            {SURFACES.map((s, i) => (
              <button
                key={s.name}
                onClick={() => setSurface(s.name)}
                style={{
                  ...btn,
                  background: surface === s.name ? s.color : bg.elevated,
                  color: surface === s.name ? "#fff" : text.secondary,
                  border:
                    surface === s.name
                      ? `1px solid ${neon.blue}`
                      : `1px solid ${border.default}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    background: s.color,
                    border: `1px solid ${border.light}`,
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, textAlign: "left" }}>{s.label}</span>
                <span style={{ fontSize: 9, color: text.dim }}>{i + 1}</span>
              </button>
            ))}
          </>
        )}

        {/* start position controls */}
        {mode === "start" && (
          <>
            <Lbl>Start Position</Lbl>
            <p style={{ fontSize: 10, color: text.secondary, margin: 0, fontFamily: font.mono }}>
              Click on the grid to place the car spawn.
            </p>
            <Btn onClick={rotateStart}>🔄 Rotate 90°</Btn>
            <p style={{ fontSize: 10, color: text.dim, margin: 0, fontFamily: font.mono }}>
              Pos: {Math.round(startPos.x)}, {Math.round(startPos.y)}
              &nbsp;&nbsp; Heading:{" "}
              {Math.round((startPos.heading * 180) / Math.PI)}°
            </p>
          </>
        )}

        {/* checkpoint mode controls */}
        {mode === "checkpoint" && (
          <>
            <Lbl>Checkpoints</Lbl>
            <p style={{ fontSize: 10, color: text.secondary, margin: 0, fontFamily: font.mono }}>
              Drag to place checkpoint zones. The car must pass through them in order.
            </p>
            <p style={{ fontSize: 10, color: neon.blue, margin: 0, fontFamily: font.mono }}>
              {checkpoints.length} checkpoint{checkpoints.length !== 1 ? "s" : ""} placed
            </p>
            {checkpoints.length > 0 && (
              <Btn onClick={() => setCheckpoints((p) => p.slice(0, -1))}>
                ↩️ Remove Last CP
              </Btn>
            )}
          </>
        )}

        {/* finish mode controls */}
        {mode === "finish" && (
          <>
            <Lbl>Finish Line</Lbl>
            <p style={{ fontSize: 10, color: text.secondary, margin: 0, fontFamily: font.mono }}>
              Drag to place the finish zone. Collect all checkpoints first, then cross the finish.
            </p>
            {finish ? (
              <>
                <p style={{ fontSize: 10, color: neon.gold, margin: 0, fontFamily: font.mono }}>
                  ✅ Finish zone placed
                </p>
                <Btn onClick={() => setFinish(null)}>🗑️ Remove Finish</Btn>
              </>
            ) : (
              <p style={{ fontSize: 10, color: text.dim, margin: 0, fontFamily: font.mono }}>
                No finish zone yet
              </p>
            )}
          </>
        )}

        <Hr />

        {/* world settings */}
        <Lbl>World Size</Lbl>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <Inp
            value={worldW}
            onChange={(e) => {
              const v = Math.max(200, Math.min(20000, +e.target.value || 200));
              setWorldW(v);
              setRects((prev) => prev.flatMap((r) => {
                if (r.x >= v) return [];
                return [{ ...r, w: Math.min(r.w, v - r.x) }];
              }));
              setCheckpoints((prev) => prev.filter((c) => c.x < v).map((c) => ({ ...c, w: Math.min(c.w, v - c.x) })));
              setFinish((f) => f && f.x < v ? { ...f, w: Math.min(f.w, v - f.x) } : f && f.x >= v ? null : f);
            }}
            step={500}
            min={200}
            max={20000}
          />
          <span style={{ color: "#555" }}>×</span>
          <Inp
            value={worldH}
            onChange={(e) => {
              const v = Math.max(200, Math.min(20000, +e.target.value || 200));
              setWorldH(v);
              setRects((prev) => prev.flatMap((r) => {
                if (r.y >= v) return [];
                return [{ ...r, h: Math.min(r.h, v - r.y) }];
              }));
              setCheckpoints((prev) => prev.filter((c) => c.y < v).map((c) => ({ ...c, h: Math.min(c.h, v - c.y) })));
              setFinish((f) => f && f.y < v ? { ...f, h: Math.min(f.h, v - f.y) } : f && f.y >= v ? null : f);
            }}
            step={500}
            min={200}
            max={20000}
          />
        </div>
        <Lbl>Grid Size</Lbl>
        <Inp
          value={gridSize}
          onChange={(e) => setGridSize(Math.max(10, Math.min(500, +e.target.value || 10)))}
          step={10}
          min={10}
          max={500}
        />

        <Hr />

        {/* actions */}
        <Btn onClick={undo}>↩️ Undo (Ctrl+Z)</Btn>
        <Btn onClick={clear} style={{ color: neon.pink }}>
          🗑️ Clear All
        </Btn>

        <Hr />

        {!embedded && (
          <>
            <button
              onClick={save}
              disabled={saving}
              style={{
                ...btn,
                background: `rgba(228,111,255,0.1)`,
                color: neon.pink,
                fontWeight: 700,
                fontSize: 13,
                padding: "10px 0",
                border: `1px solid rgba(228,111,255,0.3)`,
              }}
            >
              {saving ? "Saving…" : "💾 Save Track"}
            </button>
            {msg && (
              <p style={{ fontSize: 11, textAlign: "center", margin: 0, fontFamily: font.mono }}>
                {msg}
              </p>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        <p style={{ fontSize: 9, color: text.dim, margin: 0, lineHeight: 1.6, fontFamily: font.mono }}>
          Left drag → place blocks
          <br />
          Right / middle drag → pan
          <br />
          Scroll → zoom (cursor-centered)
          <br />
          1-5 → select surface
          <br />
          Ctrl+Z → undo
        </p>
      </div>

      {/* ── canvas ─────────────────────────────────────────────────────── */}
      <div
        ref={wrapRef}
        style={{ flex: 1, overflow: "hidden", position: "relative" }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onWheel={onWheel}
          onContextMenu={noCtx}
          style={{
            display: "block",
            cursor: mode === "start" ? "crosshair" : "default",
          }}
        />
      </div>
    </div>
  );
}

/* ── tiny styled primitives ──────────────────────────────────────────────── */
const btn = {
  background: bg.elevated,
  color: text.secondary,
  border: `1px solid ${border.default}`,
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  fontFamily: font.mono,
  fontSize: 11,
  flex: 1,
  transition: "all 0.15s ease",
};

function Btn({ active, style: extra, ...p }) {
  return (
    <button
      {...p}
      style={{
        ...btn,
        ...(active
          ? { background: `rgba(0,165,255,0.1)`, color: neon.blue, borderColor: `rgba(0,165,255,0.3)` }
          : {}),
        ...extra,
      }}
    />
  );
}

function Lbl({ children }) {
  return <label style={{ fontSize: 10, color: text.muted, fontFamily: font.mono, textTransform: "uppercase", letterSpacing: "0.5px" }}>{children}</label>;
}

function Inp(p) {
  return (
    <input
      type="number"
      {...p}
      style={{
        background: bg.input,
        color: text.primary,
        border: `1px solid ${border.default}`,
        borderRadius: 6,
        padding: "4px 8px",
        fontFamily: font.mono,
        fontSize: 11,
        width: "100%",
        outline: "none",
      }}
    />
  );
}

function Hr() {
  return <hr style={{ border: `1px solid ${border.default}`, width: "100%", margin: 0 }} />;
}
