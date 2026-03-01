import { useEffect, useRef } from "react";

/**
 * Subtle blurred green glow that follows the mouse cursor.
 * Uses a single absolutely-positioned radial gradient div.
 */
export default function MouseGlow() {
  const glowRef = useRef(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;

    let x = -300, y = -300;
    let targetX = -300, targetY = -300;
    let raf;

    const onMove = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const onLeave = () => {
      targetX = -300;
      targetY = -300;
    };

    // Smooth lerp animation — low factor = more delay/lag
    const animate = () => {
      x += (targetX - x) * 0.045;
      y += (targetY - y) * 0.045;
      el.style.transform = `translate(${x - 250}px, ${y - 250}px)`;
      raf = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={glowRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 500,
        height: 500,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(132,204,22,0.14) 0%, rgba(132,204,22,0.06) 35%, rgba(132,204,22,0.01) 60%, transparent 75%)",
        pointerEvents: "none",
        zIndex: 9999,
        willChange: "transform",
        filter: "blur(30px)",
      }}
    />
  );
}
