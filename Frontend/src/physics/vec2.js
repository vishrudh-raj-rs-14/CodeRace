/**
 * Immutable 2D vector — mirrors Backend/engine/physics/vec2.go exactly.
 * All methods return new Vec2 instances.
 */
export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  static fromAngle(angle) {
    return new Vec2(Math.cos(angle), Math.sin(angle));
  }

  add(o) {
    return new Vec2(this.x + o.x, this.y + o.y);
  }

  sub(o) {
    return new Vec2(this.x - o.x, this.y - o.y);
  }

  scale(s) {
    return new Vec2(this.x * s, this.y * s);
  }

  dot(o) {
    return this.x * o.x + this.y * o.y;
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  length() {
    return Math.sqrt(this.lengthSq());
  }

  normalize() {
    const l = this.length();
    if (l < 1e-12) return new Vec2(0, 0);
    return new Vec2(this.x / l, this.y / l);
  }

  /** Right-hand perpendicular: (-y, x). */
  perp() {
    return new Vec2(-this.y, this.x);
  }

  rotate(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }

  lerp(o, t) {
    return new Vec2(this.x + (o.x - this.x) * t, this.y + (o.y - this.y) * t);
  }
}
