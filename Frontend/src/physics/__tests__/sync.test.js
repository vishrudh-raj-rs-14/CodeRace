/**
 * Cross-language sync test: validates that the JS CarEngine produces
 * identical output to the Go racer engine, tick-by-tick.
 *
 * Reads:
 *   tests/fixtures/physics_scenario.json  — shared track + input sequence
 *   tests/fixtures/golden_output.json     — Go-generated reference output
 *
 * To regenerate golden output:
 *   cd Backend && go test ./engine/racer/ -run TestGenerateGolden -v
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { CarEngine } from "../../physics/car.js";

const FIXTURES = resolve(import.meta.dirname, "../../../../tests/fixtures");

const scenario = JSON.parse(readFileSync(resolve(FIXTURES, "physics_scenario.json"), "utf-8"));
const golden = JSON.parse(readFileSync(resolve(FIXTURES, "golden_output.json"), "utf-8"));

const EPSILON = 1e-9;

function buildInputLookup(seq) {
  const map = new Map();
  for (const entry of seq) {
    for (let t = entry.fromTick; t <= entry.toTick; t++) {
      map.set(t, entry.input);
    }
  }
  return map;
}

describe("Physics sync: JS vs Go golden output", () => {
  const { track, inputSequence, totalTicks } = scenario;

  const engine = new CarEngine(
    track.rects,
    track.worldW,
    track.worldH,
    track.startX,
    track.startY,
    track.startHeading
  );

  const inputMap = buildInputLookup(inputSequence);

  it(`should match all ${totalTicks} ticks within epsilon=${EPSILON}`, () => {
    expect(golden.length).toBe(totalTicks);

    for (let tick = 0; tick < totalTicks; tick++) {
      const input = inputMap.get(tick) || { w: false, a: false, s: false, d: false };
      engine.updateInput(input);
      engine.tick();

      const state = engine.getState();
      const ref = golden[tick];

      const fields = ["x", "y", "heading", "speed", "lateralV", "velX", "velY", "steerAngle"];
      for (const f of fields) {
        const jsVal = state[f];
        const goVal = ref[f];
        const diff = Math.abs(jsVal - goVal);
        if (diff > EPSILON) {
          throw new Error(
            `Tick ${tick} field "${f}": JS=${jsVal} Go=${goVal} diff=${diff}`
          );
        }
      }

      // Boolean and string fields — exact match
      expect(state.drifting).toBe(ref.drifting);
      expect(state.surface).toBe(ref.surface);
    }
  });
});
