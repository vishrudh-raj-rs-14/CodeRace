# 🔦 Raycasts — Bot Sensor System

CodeRace bots have access to **5 raycasts** emanating from the car's centre.
Each ray travels outward until it hits a surface change (e.g. road → grass)
or a wall / world boundary, up to a maximum distance of **1200 px**.

## Ray Directions

| Index | Name        | Relative Angle | Description                    |
|-------|-------------|----------------|--------------------------------|
| 0     | forward     | 0°             | Straight ahead (car heading)   |
| 1     | left 45°    | −45°           | Diagonal front-left            |
| 2     | right 45°   | +45°           | Diagonal front-right           |
| 3     | left 90°    | −90°           | Perpendicular left             |
| 4     | right 90°   | +90°           | Perpendicular right            |

## Ray Data

Each ray in `state.raycasts[i]` has:

| Field       | Type   | Description                               |
|-------------|--------|-------------------------------------------|
| `distance`  | float  | Distance in px to the surface hit          |
| `surface`   | string | Name of the surface hit (`grass`, `wall`, `sand`, `ice`, `boundary`, `none`) |
| `endX`      | float  | World X coordinate of the hit point       |
| `endY`      | float  | World Y coordinate of the hit point       |
| `angle`     | float  | Absolute world angle of the ray (radians) |
| `relAngle`  | float  | Angle relative to car heading (radians)   |

## Helper Functions

These are available globally in your bot code (no import needed):

```python
# Individual ray distances
ray_forward(state)    # → float: distance ahead
ray_left_45(state)    # → float: distance to front-left
ray_right_45(state)   # → float: distance to front-right
ray_left_90(state)    # → float: distance to left
ray_right_90(state)   # → float: distance to right

# All 5 distances as a tuple
fwd, l45, r45, l90, r90 = rays(state)

# Navigation to next checkpoint / finish
angle_to_checkpoint(state)      # → signed angle in radians (negative = left)
distance_to_checkpoint(state)   # → distance in px
next_checkpoint_center(state)   # → (x, y) or None

# Utility
normalize_angle(a)              # → angle clamped to [-π, π]
```

## Visual Rendering

Raycasts are rendered on the game canvas as dashed lines:
- **Green** — forward ray
- **Blue** — 45° diagonal rays
- **Pink** — 90° perpendicular rays

Each ray ends with a small dot at the hit point.

## Example: Road-Following Bot

```python
def drive(state):
    # Steer toward the next checkpoint
    angle = angle_to_checkpoint(state)
    steer_left = angle < -0.05
    steer_right = angle > 0.05

    # Use raycasts to stay on the road
    fwd, l45, r45, l90, r90 = rays(state)

    # Emergency wall avoidance
    if l90 < 40:
        steer_right = True
        steer_left = False
    elif r90 < 40:
        steer_left = True
        steer_right = False

    # Brake if obstacle ahead
    brake = fwd < 80 and abs(state.car.speed) > 100

    return {
        "w": not brake,
        "a": steer_left,
        "s": brake,
        "d": steer_right,
    }
```

## How It Works

The raycast system uses **ray marching** (sampling at 4px intervals) through
the track's surface rectangles. Starting from the car's centre position:

1. The ray checks `surfaceAt()` at each sample point
2. If the car is on **road**, the ray reports the first **non-road** surface
3. If the car is on a non-road surface, the ray reports any surface **change**
4. **Walls** are always reported immediately
5. **World boundaries** are reported when the ray exits the map
6. If nothing is hit within 1200px, `distance = 1200` and `surface = "none"`
