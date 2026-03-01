import { useEffect, useRef } from "react";

/**
 * Subtle animated grid background.
 * - Static grid lines at low opacity
 * - Horizontal & vertical "pulse" lines sweep across periodically
 * - Interacts with the MouseGlow (glow sits on top, grid bleeds through)
 */
export default function AnimatedGrid() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let t = 0;

    const GRID = 48;                 // grid cell size in px
    const LINE_ALPHA = 0.06;         // base grid line opacity (grey)
    const PULSE_ALPHA = 0.07;        // pulse peak opacity
    const PULSE_W = 180;             // pulse width in px (fade zone)

    // Pulse state: each pulse is { pos, speed, axis }
    // axis 0 = vertical line sweeping right, 1 = horizontal line sweeping down
    const pulses = [
      { pos: -200, speed: 0.35, axis: 0 },
      { pos: -600, speed: 0.25, axis: 1 },
      { pos: -900, speed: 0.45, axis: 0 },
      { pos: -400, speed: 0.30, axis: 1 },
    ];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // ── Static grid lines ─────────────────────────────────────────
      ctx.strokeStyle = `rgba(255, 255, 255, ${LINE_ALPHA})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = 0; x < w; x += GRID) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
      }
      for (let y = 0; y < h; y += GRID) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
      }
      ctx.stroke();

      // ── Animated pulse lines ──────────────────────────────────────
      for (const p of pulses) {
        p.pos += p.speed;

        // Wrap around
        const limit = p.axis === 0 ? w : h;
        if (p.pos > limit + PULSE_W) {
          p.pos = -PULSE_W;
        }

        if (p.axis === 0) {
          // Vertical sweep → highlights vertical grid lines near pos
          for (let x = 0; x < w; x += GRID) {
            const dist = Math.abs(x - p.pos);
            if (dist > PULSE_W) continue;
            const a = PULSE_ALPHA * (1 - dist / PULSE_W);
            ctx.strokeStyle = `rgba(132, 204, 22, ${a.toFixed(4)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, h);
            ctx.stroke();
          }
        } else {
          // Horizontal sweep → highlights horizontal grid lines near pos
          for (let y = 0; y < h; y += GRID) {
            const dist = Math.abs(y - p.pos);
            if (dist > PULSE_W) continue;
            const a = PULSE_ALPHA * (1 - dist / PULSE_W);
            ctx.strokeStyle = `rgba(132, 204, 22, ${a.toFixed(4)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(w, y + 0.5);
            ctx.stroke();
          }
        }
      }

      // ── Intersection dots at grid crossings near pulses ───────────
      for (const p of pulses) {
        const limit = p.axis === 0 ? canvas.width : canvas.height;
        for (let x = 0; x < w; x += GRID) {
          for (let y = 0; y < h; y += GRID) {
            const ref = p.axis === 0 ? x : y;
            const dist = Math.abs(ref - p.pos);
            if (dist > PULSE_W * 0.5) continue;
            const a = 0.08 * (1 - dist / (PULSE_W * 0.5));
            ctx.fillStyle = `rgba(132, 204, 22, ${a.toFixed(4)})`;
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      t++;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
