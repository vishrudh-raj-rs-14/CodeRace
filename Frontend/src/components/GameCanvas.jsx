import { useRef, useEffect } from "react";
import carAsset from "../assets/Car.png";

const carImg = new Image();
carImg.src = carAsset;

/* ── Car sprite scale ──────────────────────────────────────────────────
   Adjust this single value to resize the car sprite everywhere.
   1.0 = match collider size exactly, 2.0 = twice as big, etc.          */
const CAR_SPRITE_SCALE = 1.3;

/**
 * Renders the game world with camera following the car.
 *
 * Props:
 *   frame     – live/playback frame (has car, camera, track, world, etc.)
 *   trackData – optional static track JSON for initial preview when frame is null
 */

/* ── Neon palette for canvas rendering ─────────────────────────────────── */
const C = {
  grassBg:    "#1a3518",
  boundary:   "#e46fff",
  carBody:    "#e46fff",
  carDrift:   "#ff8800",
  carHood:    "#0c0c0c",
  headlight:  "#ff8800",
  taillight:  "#e46fff",
  hudBg:      "rgba(0,0,0,0.85)",
  hudText:    "#e0e0e0",
  hudMuted:   "#888888",
  hudDim:     "#555555",
  speedBar:   "#00a5ff",
  speedDrift: "#ff8800",
  speedRev:   "#e46fff",
  neonGreen:  "#84cc16",
  neonBlue:   "#00a5ff",
  neonPink:   "#e46fff",
  neonGold:   "#ff8800",
  neonOrange: "#ff8800",
  cpActive:   "rgba(0,165,255,0.25)",
  cpDone:     "rgba(132,204,22,0.20)",
  cpBorderA:  "#00a5ff",
  cpBorderD:  "rgba(132,204,22,0.4)",
  cpTextA:    "#00a5ff",
  cpTextD:    "rgba(132,204,22,0.5)",
  mmBg:       "rgba(0,0,0,0.80)",
  font:       "'JetBrains Mono', 'Fira Code', monospace",
  roadEdge:   "rgba(255,255,255,0.08)",
  roadDash:   "rgba(255,255,255,0.15)",
};

export default function GameCanvas({ frame, trackData }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (frame) {
      renderFrame(canvas, frame);
      return;
    }

    if (trackData) {
      renderPreview(canvas, trackData);
      return;
    }

    // Empty state
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = C.grassBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `14px ${C.font}`;
    ctx.fillStyle = C.hudDim;
    ctx.textAlign = "center";
    ctx.fillText("Waiting for code…", canvas.width / 2, canvas.height / 2);
    ctx.textAlign = "start";
  }, [frame, trackData]);

  const w = frame?.camera?.w ?? 960;
  const h = frame?.camera?.h ?? 720;

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      style={{
        display: "block",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
        background: "#000",
      }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Static preview — camera centered on car (like gameplay view)
   ══════════════════════════════════════════════════════════════════════════ */

function renderPreview(canvas, td) {
  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;

  const worldW = td.worldW || 4000;
  const worldH = td.worldH || 4000;
  const rects = td.rects || [];
  const checkpoints = td.checkpoints || [];
  const finish = td.finish || null;
  const startX = td.startX ?? 200;
  const startY = td.startY ?? 200;
  const startHeading = td.startHeading ?? 0;

  // Camera centered on car position (matches gameplay camera)
  const camX = startX - cw / 2;
  const camY = startY - ch / 2;
  const ox = -camX;
  const oy = -camY;

  // Clear
  ctx.fillStyle = C.grassBg;
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.translate(ox, oy);

  // World default surface = grass (matches placed grass blocks)
  ctx.fillStyle = SURFACE_COLORS.grass;
  ctx.fillRect(0, 0, worldW, worldH);

  // Surface rects
  for (const r of rects) {
    const color = SURFACE_COLORS[r.surface] || r.color || "#555555";
    ctx.fillStyle = color;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Road markings
    if (r.surface === "road") {
      ctx.strokeStyle = C.roadEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = C.roadDash;
      ctx.lineWidth = 2;
      ctx.setLineDash([18, 14]);
      if (r.w > r.h) {
        const cy = r.y + r.h / 2;
        ctx.beginPath();
        ctx.moveTo(r.x, cy);
        ctx.lineTo(r.x + r.w, cy);
        ctx.stroke();
      }
      if (r.h > r.w) {
        const cx = r.x + r.w / 2;
        ctx.beginPath();
        ctx.moveTo(cx, r.y);
        ctx.lineTo(cx, r.y + r.h);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  // Checkpoints
  for (const cp of checkpoints) {
    ctx.fillStyle = C.cpActive;
    ctx.fillRect(cp.x, cp.y, cp.w, cp.h);
    ctx.strokeStyle = C.cpBorderA;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(cp.x, cp.y, cp.w, cp.h);
    ctx.setLineDash([]);
    const fontSize = Math.min(cp.w, cp.h) * 0.35;
    ctx.font = `bold ${Math.max(14, Math.min(fontSize, 32))}px ${C.font}`;
    ctx.fillStyle = C.cpTextA;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`CP${cp.order + 1}`, cp.x + cp.w / 2, cp.y + cp.h / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  // Finish
  if (finish) {
    const sq = 12;
    ctx.save();
    ctx.beginPath();
    ctx.rect(finish.x, finish.y, finish.w, finish.h);
    ctx.clip();
    for (let fy = finish.y; fy < finish.y + finish.h; fy += sq) {
      for (let fx = finish.x; fx < finish.x + finish.w; fx += sq) {
        const ci = Math.floor((fx - finish.x) / sq) + Math.floor((fy - finish.y) / sq);
        ctx.fillStyle = ci % 2 === 0 ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
        ctx.fillRect(fx, fy, sq, sq);
      }
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,136,0,0.4)";
    ctx.lineWidth = 3;
    ctx.strokeRect(finish.x, finish.y, finish.w, finish.h);
  }

  // World boundary
  ctx.strokeStyle = C.boundary;
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, worldW, worldH);

  // Car at start position
  const pL = 44, pW = 22; // collider: L along heading, W lateral
  const pScale = 1.8;     // sprite visual scale
  ctx.save();
  ctx.translate(startX, startY);
  ctx.rotate(startHeading);

  // Debug collider outline
  ctx.strokeStyle = "rgba(255,255,0,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-pL / 2, -pW / 2, pL, pW);

  // Sprite (image faces UP → rotate +90° so top-of-image points along +X heading)
  ctx.shadowColor = C.neonGreen;
  ctx.shadowBlur = 15;
  if (carImg.complete && carImg.naturalWidth > 0) {
    const aspect = carImg.naturalWidth / carImg.naturalHeight;
    const sprH = pL * CAR_SPRITE_SCALE;
    const sprW = sprH * aspect;
    ctx.save();
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(carImg, -sprW / 2, -sprH / 2, sprW, sprH);
    ctx.restore();
  } else {
    ctx.fillStyle = C.carBody;
    roundRect(ctx, -pL / 2, -pW / 2, pL, pW, 4);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.restore(); // un-translate camera

  // Label
  ctx.font = `bold 13px ${C.font}`;
  ctx.fillStyle = C.hudDim;
  ctx.textAlign = "center";
  ctx.fillText("▶ Run code to start the race", cw / 2, ch - 16);
  ctx.textAlign = "start";
}

const SURFACE_COLORS = {
  road:  "#555566",
  grass: "#2d5a27",
  dirt:  "#8B7355",
  sand:  "#8B7355", // backward compat
  ice:   "#b8e0f0",
  wall:  "#333344",
};

/* ══════════════════════════════════════════════════════════════════════════
   Live frame rendering — neon-themed
   ══════════════════════════════════════════════════════════════════════════ */

function renderFrame(canvas, frame) {
  const ctx = canvas.getContext("2d");
  const { car, camera, track, world } = frame;
  const checkpoints = frame.checkpoints || [];
  const finish = frame.finish || null;
  const race = frame.race || { checkpointsHit: [], totalCheckpoints: 0, finished: false };
  const hitSet = new Set(race.checkpointsHit || []);

  const ox = -camera.x;
  const oy = -camera.y;

  // Clear — dark green for areas outside the world boundary
  ctx.fillStyle = C.grassBg;
  ctx.fillRect(0, 0, camera.w, camera.h);

  ctx.save();
  ctx.translate(ox, oy);

  // World default surface = grass (so unplaced areas match placed grass blocks)
  ctx.fillStyle = SURFACE_COLORS.grass;
  ctx.fillRect(0, 0, world.w, world.h);

  // Track surfaces
  for (const rect of track) {
    ctx.fillStyle = rect.color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  // Road markings
  for (const rect of track) {
    if (rect.name === "road") {
      ctx.strokeStyle = C.roadEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      ctx.strokeStyle = C.roadDash;
      ctx.lineWidth = 2;
      ctx.setLineDash([18, 14]);
      if (rect.w > rect.h) {
        const cy = rect.y + rect.h / 2;
        ctx.beginPath();
        ctx.moveTo(rect.x, cy);
        ctx.lineTo(rect.x + rect.w, cy);
        ctx.stroke();
      }
      if (rect.h > rect.w) {
        const cx = rect.x + rect.w / 2;
        ctx.beginPath();
        ctx.moveTo(cx, rect.y);
        ctx.lineTo(cx, rect.y + rect.h);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  // Checkpoints
  for (const cp of checkpoints) {
    const collected = hitSet.has(cp.order);
    ctx.fillStyle = collected ? C.cpDone : C.cpActive;
    ctx.fillRect(cp.x, cp.y, cp.w, cp.h);
    ctx.strokeStyle = collected ? C.cpBorderD : C.cpBorderA;
    ctx.lineWidth = collected ? 2 : 3;
    ctx.setLineDash(collected ? [] : [10, 6]);
    ctx.strokeRect(cp.x, cp.y, cp.w, cp.h);
    ctx.setLineDash([]);
    const fontSize = Math.min(cp.w, cp.h) * 0.35;
    ctx.font = `bold ${Math.max(14, Math.min(fontSize, 32))}px ${C.font}`;
    ctx.fillStyle = collected ? C.cpTextD : C.cpTextA;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(collected ? `✓ CP${cp.order + 1}` : `CP${cp.order + 1}`, cp.x + cp.w / 2, cp.y + cp.h / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  // Finish zone
  if (finish) {
    const allCollected = race.totalCheckpoints > 0 && hitSet.size >= race.totalCheckpoints;
    const sq = 12;
    ctx.save();
    ctx.beginPath();
    ctx.rect(finish.x, finish.y, finish.w, finish.h);
    ctx.clip();
    for (let fy = finish.y; fy < finish.y + finish.h; fy += sq) {
      for (let fx = finish.x; fx < finish.x + finish.w; fx += sq) {
        const ci = Math.floor((fx - finish.x) / sq) + Math.floor((fy - finish.y) / sq);
        ctx.fillStyle = ci % 2 === 0
          ? (allCollected ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)")
          : (allCollected ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.5)");
        ctx.fillRect(fx, fy, sq, sq);
      }
    }
    ctx.restore();
    ctx.strokeStyle = allCollected ? C.neonGold : "rgba(255,136,0,0.4)";
    ctx.lineWidth = 3;
    ctx.strokeRect(finish.x, finish.y, finish.w, finish.h);
  }

  // World boundary
  ctx.strokeStyle = C.boundary;
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, world.w, world.h);

  // Drift skid marks
  if (car.drifting) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#111";
    const skidW = car.w * 0.4;
    const skidLen = Math.min(Math.abs(car.lateralV) * 0.15, 20);
    const cos = Math.cos(car.heading);
    const sin = Math.sin(car.heading);
    for (const side of [-1, 1]) {
      const rx = car.x - cos * car.h * 0.4 + (-sin) * side * car.w * 0.45;
      const ry = car.y - sin * car.h * 0.4 + cos * side * car.w * 0.45;
      ctx.beginPath();
      ctx.arc(rx, ry, skidW + skidLen, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  // ── Raycasts ──────────────────────────────────────────────────────
  const raycasts = frame.raycasts || [];
  if (raycasts.length > 0) {
    const RAY_COLORS = [
      C.neonGreen,   // forward
      C.neonBlue,    // left 45
      C.neonBlue,    // right 45
      C.neonPink,    // left 90
      C.neonPink,    // right 90
    ];
    for (let ri = 0; ri < raycasts.length; ri++) {
      const ray = raycasts[ri];
      ctx.strokeStyle = RAY_COLORS[ri] || C.neonGreen;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(car.x, car.y);
      ctx.lineTo(ray.endX, ray.endY);
      ctx.stroke();
      ctx.setLineDash([]);
      // Hit point dot
      ctx.fillStyle = RAY_COLORS[ri] || C.neonGreen;
      ctx.beginPath();
      ctx.arc(ray.endX, ray.endY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  // ── Other players' cars (multiplayer) ─────────────────────────────
  const otherCars = frame.otherCars || [];
  for (const oc of otherCars) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.translate(oc.x, oc.y);
    ctx.rotate(oc.heading);
    const oL = oc.h || car.h;
    const oW = oc.w || car.w;
    // Underglow for other player
    ctx.shadowColor = C.neonBlue;
    ctx.shadowBlur = 10;
    if (carImg.complete && carImg.naturalWidth > 0) {
      const aspect = carImg.naturalWidth / carImg.naturalHeight;
      const sprH = oL * CAR_SPRITE_SCALE;
      const sprW = sprH * aspect;
      ctx.save();
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(carImg, -sprW / 2, -sprH / 2, sprW, sprH);
      ctx.restore();
    } else {
      ctx.fillStyle = C.neonBlue;
      roundRect(ctx, -oL / 2, -oW / 2, oL, oW, 4);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
    // Name tag
    if (oc.name) {
      ctx.globalAlpha = 0.7;
      ctx.font = `bold 11px ${C.font}`;
      ctx.fillStyle = C.neonBlue;
      ctx.textAlign = "center";
      ctx.fillText(oc.name, oc.x, oc.y - oW - 6);
      ctx.textAlign = "start";
      ctx.globalAlpha = 1.0;
    }
  }

  // Car
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);

  const L = car.h;  // length along heading
  const W = car.w;  // lateral width

  // Debug collider outline
  ctx.strokeStyle = "rgba(255,255,0,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-L / 2, -W / 2, L, W);

  // Neon underglow
  ctx.shadowColor = car.drifting ? C.neonOrange : C.neonPink;
  ctx.shadowBlur = 12;

  // Sprite (image faces UP → rotate +90° so top-of-image points along +X heading)
  if (carImg.complete && carImg.naturalWidth > 0) {
    const aspect = carImg.naturalWidth / carImg.naturalHeight;
    const sprH = L * CAR_SPRITE_SCALE;
    const sprW = sprH * aspect;
    ctx.save();
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(carImg, -sprW / 2, -sprH / 2, sprW, sprH);
    ctx.restore();
  } else {
    ctx.fillStyle = car.drifting ? C.carDrift : C.carBody;
    roundRect(ctx, -L / 2, -W / 2, L, W, 4);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  ctx.restore(); // un-rotate car
  ctx.restore(); // un-translate camera

  // ── HUD ────────────────────────────────────────────────────────────
  const speedKmh = Math.abs(car.speed * 0.36).toFixed(0);
  const hudX = 14;
  let hudY = 24;
  const lineH = 20;

  ctx.fillStyle = C.hudBg;
  roundRect(ctx, 8, 8, 230, 160, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(132,204,22,0.12)";
  ctx.lineWidth = 1;
  roundRect(ctx, 8, 8, 230, 160, 8);
  ctx.stroke();

  ctx.font = `bold 14px ${C.font}`;
  ctx.fillStyle = C.hudText;
  ctx.fillText(`Speed: ${speedKmh} km/h`, hudX, hudY);
  hudY += lineH;

  // Speed bar
  const barW = 200;
  const barFill = Math.min(Math.abs(car.speed) / 960, 1.0) * barW;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, hudX, hudY - 12, barW, 12, 3);
  ctx.fill();

  const barColor = car.drifting ? C.speedDrift : car.speed < 0 ? C.speedRev : C.speedBar;
  ctx.fillStyle = barColor;
  if (barFill > 0) {
    roundRect(ctx, hudX, hudY - 12, barFill, 12, 3);
    ctx.fill();
    ctx.shadowColor = barColor;
    ctx.shadowBlur = 6;
    roundRect(ctx, hudX, hudY - 12, barFill, 12, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  hudY += lineH;

  ctx.font = `12px ${C.font}`;
  ctx.fillStyle = C.hudMuted;
  ctx.fillText(`Surface: ${car.surface}`, hudX, hudY);
  hudY += lineH - 2;

  if (car.drifting) {
    ctx.fillStyle = C.neonOrange;
    ctx.font = `bold 13px ${C.font}`;
    ctx.fillText("🔥 DRIFT", hudX, hudY);
  }
  hudY += lineH - 2;
  ctx.fillStyle = C.hudDim;
  ctx.font = `11px ${C.font}`;
  ctx.fillText(`Tick ${frame.tick}  Slip ${Math.abs(car.lateralV).toFixed(0)}`, hudX, hudY);
  hudY += lineH - 2;

  // Race progress
  if (race.totalCheckpoints > 0) {
    ctx.font = `bold 12px ${C.font}`;
    ctx.fillStyle = hitSet.size >= race.totalCheckpoints ? C.neonGreen : C.neonBlue;
    ctx.fillText(`CP: ${hitSet.size}/${race.totalCheckpoints}`, hudX, hudY);
    hudY += lineH - 4;
  }
  if (race.finished) {
    ctx.font = `bold 13px ${C.font}`;
    ctx.fillStyle = C.neonGold;
    ctx.fillText(`🏁 FINISHED`, hudX, hudY);
  }

  // ── Minimap ────────────────────────────────────────────────────────
  const mmW = 150, mmH = 150;
  const mmX = camera.w - mmW - 12, mmY = 12;
  const sx = mmW / world.w, sy = mmH / world.h;

  ctx.fillStyle = C.mmBg;
  roundRect(ctx, mmX - 2, mmY - 2, mmW + 4, mmH + 4, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(132,204,22,0.1)";
  ctx.lineWidth = 1;
  roundRect(ctx, mmX - 2, mmY - 2, mmW + 4, mmH + 4, 6);
  ctx.stroke();

  // Minimap surfaces
  for (const rect of track) {
    ctx.fillStyle = rect.color;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(
      mmX + rect.x * sx,
      mmY + rect.y * sy,
      Math.max(rect.w * sx, 1),
      Math.max(rect.h * sy, 1)
    );
  }
  ctx.globalAlpha = 1.0;

  // Checkpoint dots
  for (const cp of checkpoints) {
    ctx.fillStyle = hitSet.has(cp.order) ? "rgba(132,204,22,0.7)" : "rgba(0,165,255,0.7)";
    ctx.fillRect(mmX + cp.x * sx, mmY + cp.y * sy, Math.max(cp.w * sx, 2), Math.max(cp.h * sy, 2));
  }
  // Finish on minimap
  if (finish) {
    ctx.fillStyle = "rgba(255,136,0,0.8)";
    ctx.fillRect(mmX + finish.x * sx, mmY + finish.y * sy, Math.max(finish.w * sx, 2), Math.max(finish.h * sy, 2));
  }

  // Car dot on minimap
  ctx.fillStyle = C.neonGreen;
  ctx.shadowColor = C.neonGreen;
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(mmX + car.x * sx, mmY + car.y * sy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Other players on minimap
  for (const oc of otherCars) {
    ctx.fillStyle = C.neonBlue;
    ctx.shadowColor = C.neonBlue;
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(mmX + oc.x * sx, mmY + oc.y * sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Viewport rect on minimap
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    mmX + camera.x * sx,
    mmY + camera.y * sy,
    camera.w * sx,
    camera.h * sy
  );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
