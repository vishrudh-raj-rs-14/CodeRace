/**
 * Surface definitions — mirrors Backend/engine/racer/racer.go exactly.
 * Keep these in sync with the Go constants.
 */

export const SURFACES = {
  road:  { grip: 1.00, dragMult: 1.0, speedMult: 1.00, color: "#555566", name: "road"  },
  grass: { grip: 0.45, dragMult: 3.0, speedMult: 0.50, color: "#2d5a27", name: "grass" },
  dirt:  { grip: 0.35, dragMult: 3.5, speedMult: 0.60, color: "#8B7355", name: "dirt"  },
  ice:   { grip: 0.07, dragMult: 0.3, speedMult: 1.00, color: "#b8e0f0", name: "ice"   },
  wall:  { grip: 0.00, dragMult: 0.0, speedMult: 0.00, color: "#333344", name: "wall"  },
};

/** Last matching rect wins (painter order); default grass. */
export function surfaceAt(rects, x, y) {
  let result = SURFACES.grass;
  for (const r of rects) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      result = SURFACES[r.surface] || SURFACES.grass;
    }
  }
  return result;
}
