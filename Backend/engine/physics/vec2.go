package physics

import "math"

// Vec2 is an immutable 2D vector used throughout the physics engine.
type Vec2 struct {
	X, Y float64
}

// NewVec2 creates a new Vec2.
func NewVec2(x, y float64) Vec2 {
	return Vec2{X: x, Y: y}
}

// FromAngle creates a unit vector from an angle in radians.
func FromAngle(angle float64) Vec2 {
	return Vec2{X: math.Cos(angle), Y: math.Sin(angle)}
}

// Add returns v + o.
func (v Vec2) Add(o Vec2) Vec2 {
	return Vec2{X: v.X + o.X, Y: v.Y + o.Y}
}

// Sub returns v - o.
func (v Vec2) Sub(o Vec2) Vec2 {
	return Vec2{X: v.X - o.X, Y: v.Y - o.Y}
}

// Scale returns v * s.
func (v Vec2) Scale(s float64) Vec2 {
	return Vec2{X: v.X * s, Y: v.Y * s}
}

// Dot returns the dot product of v and o.
func (v Vec2) Dot(o Vec2) float64 {
	return v.X*o.X + v.Y*o.Y
}

// LengthSq returns the squared length.
func (v Vec2) LengthSq() float64 {
	return v.X*v.X + v.Y*v.Y
}

// Length returns the Euclidean length.
func (v Vec2) Length() float64 {
	return math.Sqrt(v.LengthSq())
}

// Normalize returns a unit-length vector, or zero if length < 1e-12.
func (v Vec2) Normalize() Vec2 {
	l := v.Length()
	if l < 1e-12 {
		return Vec2{}
	}
	return Vec2{X: v.X / l, Y: v.Y / l}
}

// Perp returns the right-hand perpendicular: (-Y, X).
func (v Vec2) Perp() Vec2 {
	return Vec2{X: -v.Y, Y: v.X}
}

// Rotate rotates the vector by angle radians.
func (v Vec2) Rotate(angle float64) Vec2 {
	c := math.Cos(angle)
	s := math.Sin(angle)
	return Vec2{X: v.X*c - v.Y*s, Y: v.X*s + v.Y*c}
}

// Lerp linearly interpolates between v and o by t.
func (v Vec2) Lerp(o Vec2, t float64) Vec2 {
	return Vec2{X: v.X + (o.X-v.X)*t, Y: v.Y + (o.Y-v.Y)*t}
}
