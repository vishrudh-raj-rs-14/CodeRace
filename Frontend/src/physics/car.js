/**
 * CarEngine — client-side physics simulation.
 * Mirrors Backend/engine/racer/racer.go update() EXACTLY.
 *
 * Every constant, every formula, every order-of-operations must match
 * the Go version so that running the same inputs produces identical
 * state tick-by-tick.
 */

import { Vec2 } from "./vec2.js";
import { SURFACES, surfaceAt } from "./surfaces.js";

// ─── constants (must match racer.go) ─────────────────────────────────────────

export const TICK_RATE = 60;
export const TICK_DELTA = 1.0 / TICK_RATE;

export const CAR_W = 22;
export const CAR_H = 44;
export const WHEELBASE = 46.0;

export const ENGINE_FORCE = 520.0;
export const ENGINE_FORCE_HIGH = 120.0;
export const POWER_BAND_KNEE = 480.0;
export const BRAKE_FORCE = 750.0;
export const REVERSE_POWER = 200.0;
export const MAX_SPEED = 960.0;
export const MAX_REVERSE_SPD = 160.0;
export const DRAG_COEFF = 0.00015;
export const ROLLING_FRICT = 22.0;

export const MAX_STEER_ANGLE = 33.0 * (Math.PI / 180);
export const STEER_SPEED = 5.0;
export const STEER_RETURN = 8.0;

export const TRACTION_COEFF = 15.0;
export const MAX_TRACTION_FORCE = 2200.0;
export const DRIFT_THRESHOLD = 25.0;
export const BRAKE_GRIP_PENALTY = 0.25;
export const DRIVE_GRIP_SCALE = 2.5;
export const BRAKE_DRIFT_BOOST = 1.8;
export const BRAKE_DRIFT_MIN_SPD = 120.0;

export const WALL_BOUNCE = -0.3;

// ─── helpers (must match racer.go) ───────────────────────────────────────────

function sign(v) {
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + sign(target - current) * maxDelta;
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// ─── CarEngine ───────────────────────────────────────────────────────────────

export class CarEngine {
  /**
   * @param {Array<{x,y,w,h,surface:string}>} trackRects
   * @param {number} worldW
   * @param {number} worldH
   * @param {number} startX
   * @param {number} startY
   * @param {number} startHeading
   */
  constructor(trackRects, worldW, worldH, startX, startY, startHeading) {
    this.trackRects = trackRects;
    this.worldW = worldW;
    this.worldH = worldH;

    this.x = startX;
    this.y = startY;
    this.heading = startHeading;
    this.speed = 0;
    this.lateralV = 0;
    this.steerAngle = 0;
    this.drifting = false;
    this.surface = surfaceAt(trackRects, startX, startY).name;

    this.velX = 0;
    this.velY = 0;
    this.tick_ = 0;

    this.input = { w: false, a: false, s: false, d: false };
  }

  updateInput(input) {
    this.input = input;
  }

  /** Advance physics by one tick. Must match racer.go update() exactly. */
  tick() {
    const dt = TICK_DELTA;
    const input = this.input;

    const surf = surfaceAt(this.trackRects, this.x, this.y);
    this.surface = surf.name;

    const speed = Math.sqrt(this.velX * this.velX + this.velY * this.velY);

    // ── 1. steering (bicycle model) ───────────────────────────────────

    let targetSteer = 0.0;
    if (input.a) targetSteer = -MAX_STEER_ANGLE;
    if (input.d) targetSteer = MAX_STEER_ANGLE;

    if (targetSteer !== 0) {
      this.steerAngle = moveToward(this.steerAngle, targetSteer, STEER_SPEED * dt);
    } else {
      this.steerAngle = moveToward(this.steerAngle, 0, STEER_RETURN * dt);
    }

    const speedRatio = Math.min(speed / MAX_SPEED, 1.0);
    const effectiveSteer = this.steerAngle * (1.0 - 0.3 * speedRatio);

    if (speed > 0.5) {
      const turnRadius = WHEELBASE / Math.tan(Math.abs(effectiveSteer) + 0.001);
      let angVel = speed / turnRadius;

      // Grip-limited angular velocity: a = v × ω, ω_max = maxLatAccel / v.
      // Floor of 0.4 on grip so heading always turns — traction (step 5) still limits velocity.
      const steerGrip = Math.max(surf.grip, 0.4);
      const maxAngVel = MAX_TRACTION_FORCE * steerGrip / speed;
      if (angVel > maxAngVel) {
        angVel = maxAngVel;
      }

      if (effectiveSteer < 0) angVel = -angVel;
      this.heading += angVel * dt;
      this.heading = normalizeAngle(this.heading);
    }

    // Brake-drift: braking while steering at speed kicks the rear end out.
    if (input.s && Math.abs(this.steerAngle) > MAX_STEER_ANGLE * 0.3 && speed > BRAKE_DRIFT_MIN_SPD) {
      const boost = BRAKE_DRIFT_BOOST * (speed / MAX_SPEED) * surf.grip;
      this.heading += sign(effectiveSteer) * boost * dt;
      this.heading = normalizeAngle(this.heading);
    }

    // ── 2. decompose velocity into forward / lateral ──────────────────

    const fwdX = Math.cos(this.heading);
    const fwdY = Math.sin(this.heading);
    const latX = -fwdY;
    const latY = fwdX;

    let fwdSpeed = this.velX * fwdX + this.velY * fwdY;
    let latSpeed = this.velX * latX + this.velY * latY;

    // ── 3. engine / brake ─────────────────────────────────────────────

    // driveGrip: at low speed wheels slip on low-grip surfaces; fades as speed builds.
    const driveGripBase = Math.min(1.0, surf.grip * DRIVE_GRIP_SCALE);
    const speedFrac = Math.min(speed / (MAX_SPEED * 0.5), 1.0);
    const driveGrip = driveGripBase + (1.0 - driveGripBase) * speedFrac;
    let braking = false;

    if (input.w) {
      const topSpd = MAX_SPEED * surf.speedMult;
      // Two-phase power band: full force below knee, fades above.
      let thrust;
      if (speed < POWER_BAND_KNEE) {
        thrust = ENGINE_FORCE;
      } else {
        let t = (speed - POWER_BAND_KNEE) / (topSpd - POWER_BAND_KNEE + 0.001);
        if (t > 1.0) t = 1.0;
        thrust = ENGINE_FORCE + (ENGINE_FORCE_HIGH - ENGINE_FORCE) * t;
      }
      const wheelX = Math.cos(this.heading + effectiveSteer);
      const wheelY = Math.sin(this.heading + effectiveSteer);
      this.velX += wheelX * thrust * driveGrip * dt;
      this.velY += wheelY * thrust * driveGrip * dt;
      // Re-decompose after thrust
      fwdSpeed = this.velX * fwdX + this.velY * fwdY;
      latSpeed = this.velX * latX + this.velY * latY;
      if (fwdSpeed > topSpd) {
        fwdSpeed = topSpd;
      }
    }

    if (input.s) {
      if (fwdSpeed > 2.0) {
        braking = true;
        fwdSpeed -= BRAKE_FORCE * driveGrip * dt;
        if (fwdSpeed < 0) fwdSpeed = 0;
      } else {
        fwdSpeed -= REVERSE_POWER * driveGrip * dt;
        if (fwdSpeed < -MAX_REVERSE_SPD) fwdSpeed = -MAX_REVERSE_SPD;
      }
    }

    // ── 4. drag + rolling friction ────────────────────────────────────

    const drag = -DRAG_COEFF * fwdSpeed * Math.abs(fwdSpeed);
    fwdSpeed += drag * dt;

    const roll = ROLLING_FRICT * surf.dragMult;
    if (Math.abs(fwdSpeed) < roll * dt) {
      fwdSpeed = 0;
    } else {
      fwdSpeed -= sign(fwdSpeed) * roll * dt;
    }

    // ── 5. traction (proportional + saturation cap) ───────────────────

    let gripMul = surf.grip;
    if (braking) gripMul *= BRAKE_GRIP_PENALTY;

    const tractionCap = MAX_TRACTION_FORCE * gripMul;
    const tractionForce = Math.min(TRACTION_COEFF * Math.abs(latSpeed), tractionCap);
    const latDelta = tractionForce * dt;

    if (Math.abs(latSpeed) <= latDelta) {
      latSpeed = 0;
    } else {
      latSpeed -= sign(latSpeed) * latDelta;
    }

    this.drifting = Math.abs(latSpeed) > DRIFT_THRESHOLD;

    // ── 6. recompose world velocity ───────────────────────────────────

    this.velX = fwdX * fwdSpeed + latX * latSpeed;
    this.velY = fwdY * fwdSpeed + latY * latSpeed;
    this.speed = fwdSpeed;
    this.lateralV = latSpeed;

    // ── 7. integrate position ─────────────────────────────────────────

    this.x += this.velX * dt;
    this.y += this.velY * dt;

    // ── wall-block collisions ─────────────────────────────────────────

    const halfCW = CAR_W / 2;
    const halfCH = CAR_H / 2;
    for (const tr of this.trackRects) {
      if ((SURFACES[tr.surface] || SURFACES.grass) !== SURFACES.wall) continue;
      if (
        this.x + halfCW > tr.x &&
        this.x - halfCW < tr.x + tr.w &&
        this.y + halfCH > tr.y &&
        this.y - halfCH < tr.y + tr.h
      ) {
        if (surfaceAt(this.trackRects, this.x, this.y).name !== "wall") continue;
        const penL = (this.x + halfCW) - tr.x;
        const penR = (tr.x + tr.w) - (this.x - halfCW);
        const penU = (this.y + halfCH) - tr.y;
        const penD = (tr.y + tr.h) - (this.y - halfCH);
        const minPen = Math.min(Math.min(penL, penR), Math.min(penU, penD));
        if (minPen === penL) {
          this.x = tr.x - halfCW - 0.5;
          this.velX *= WALL_BOUNCE;
        } else if (minPen === penR) {
          this.x = tr.x + tr.w + halfCW + 0.5;
          this.velX *= WALL_BOUNCE;
        } else if (minPen === penU) {
          this.y = tr.y - halfCH - 0.5;
          this.velY *= WALL_BOUNCE;
        } else {
          this.y = tr.y + tr.h + halfCH + 0.5;
          this.velY *= WALL_BOUNCE;
        }
      }
    }

    // World boundary collisions
    const margin = CAR_H;
    if (this.x < margin) {
      this.x = margin;
      if (this.velX < 0) this.velX *= WALL_BOUNCE;
    }
    if (this.x > this.worldW - margin) {
      this.x = this.worldW - margin;
      if (this.velX > 0) this.velX *= WALL_BOUNCE;
    }
    if (this.y < margin) {
      this.y = margin;
      if (this.velY < 0) this.velY *= WALL_BOUNCE;
    }
    if (this.y > this.worldH - margin) {
      this.y = this.worldH - margin;
      if (this.velY > 0) this.velY *= WALL_BOUNCE;
    }

    this.tick_++;
  }

  /** Returns the current car state (matches Go Car struct fields). */
  getState() {
    return {
      tick: this.tick_,
      x: this.x,
      y: this.y,
      heading: this.heading,
      speed: this.speed,
      lateralV: this.lateralV,
      steerAngle: this.steerAngle,
      drifting: this.drifting,
      surface: this.surface,
      velX: this.velX,
      velY: this.velY,
    };
  }
}
