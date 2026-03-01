import { useRef, useEffect } from "react";

/**
 * Renders a tiny bird's-eye-view minimap of a track.
 * Props:
 *   trackData – the full track JSON (worldW, worldH, rects, checkpoints, finish, startX, startY)
 *   width     – canvas CSS width (default 220)
 *   height    – canvas CSS height (default 140)
 */

const SURFACE_COLORS = {
  road:  "#555566",
  grass: "#2d5a27",
  sand:  "#c2b280",
  ice:   "#b8e0f0",
  wall:  "#333344",
};

export default function TrackMinimap({ trackData, width = 220, height = 140 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trackData) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const td = typeof trackData === "string" ? JSON.parse(trackData) : trackData;
    const worldW = td.worldW || 4000;
    const worldH = td.worldH || 4000;
    const rects = td.rects || [];
    const checkpoints = td.checkpoints || [];
    const finish = td.finish || null;
    const startX = td.startX ?? 200;
    const startY = td.startY ?? 200;

    // Fit world into canvas with padding
    const pad = 6;
    const availW = width - pad * 2;
    const availH = height - pad * 2;
    const scale = Math.min(availW / worldW, availH / worldH);
    const offX = pad + (availW - worldW * scale) / 2;
    const offY = pad + (availH - worldH * scale) / 2;

    // Background
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // World grass
    ctx.fillStyle = SURFACE_COLORS.grass;
    ctx.fillRect(0, 0, worldW, worldH);

    // Surface rects
    for (const r of rects) {
      ctx.fillStyle = SURFACE_COLORS[r.surface] || r.color || "#555";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    // Checkpoints
    for (const cp of checkpoints) {
      ctx.fillStyle = "rgba(0,165,255,0.4)";
      ctx.fillRect(cp.x, cp.y, cp.w, cp.h);
    }

    // Finish
    if (finish) {
      ctx.fillStyle = "rgba(255,136,0,0.5)";
      ctx.fillRect(finish.x, finish.y, finish.w, finish.h);
    }

    // World border
    ctx.strokeStyle = "rgba(228,111,255,0.4)";
    ctx.lineWidth = 3 / scale;
    ctx.strokeRect(0, 0, worldW, worldH);

    // Start position dot
    ctx.fillStyle = "#84cc16";
    ctx.shadowColor = "#84cc16";
    ctx.shadowBlur = 6 / scale;
    ctx.beginPath();
    ctx.arc(startX, startY, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }, [trackData, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        display: "block",
        borderRadius: 4,
      }}
    />
  );
}
