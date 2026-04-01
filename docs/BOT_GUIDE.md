# CodeRace Bot Strategy Guide

Welcome to CodeRace! In this game, your goal is to write a Python script that autonomously drives a car around a track to secure the fastest lap time possible. 

Your code will be evaluated in an isolated sandbox at **60 frames per second (FPS)**. On each frame (or "tick"), the game engine provides your bot with the current state of the car and the track, and expects you to return the steering and pedal actions.

---

## 🏎️ The `drive(state)` Function

To control your car, you must define a `drive(state)` function in your Python script. This is the main entry point called by the game engine every tick.

Your function must return a dictionary with the control inputs for that frame:

```python
def drive(state):
    # Your logic here...
    
    return {
        "w": True,  # Accelerate (gas pedal)
        "a": False, # Steer Left
        "s": False, # Brake / Reverse
        "d": False  # Steer Right
    }
```

---

## ⏱️ Engine Timings

The game engine simulates the physics deterministically:
- **Tick Rate:** 60 ticks per second
- **Delta Time (DT):** `1.0 / 60` seconds per tick.
- **Max Ticks:** A race typically runs up to 1500 ticks (25 seconds). If you haven't finished by then, you DNF (Did Not Finish).

---

## 🌍 The State Object

The `state` parameter is an object that contains everything your car "sees" and "feels" at the current tick.

### Car Kinematics
- `state.tick`: The current tick number (integer).
- `state.car.x` / `state.car.y`: Absolute world coordinates of your car (pixels).
- `state.car.heading`: The direction your car is facing in radians (0 is East/Right, $\pi/2$ is South/Down).
- `state.car.speed`: Your car's forward velocity (px/s).
- `state.car.lateralV`: Your car's lateral (sliding/slip) velocity (px/s).
- `state.car.steerAngle`: The current angle of your front wheels relative to the car body.
- `state.car.drifting`: Boolean indicating if the car has lost traction and is currently drifting.

### Surface Info
The surface exactly beneath the car's centre:
- `state.car.surface` or `state.surface.name`: Name of the surface (`road`, `grass`, `dirt`, `ice`, `wall`).
- `state.surface.grip`: Multiplier for cornering traction (0 to 1).
- `state.surface.drag_mult`: Multiplier for rolling resistance.
- `state.surface.speed_mult`: Top-speed limit multiplier.

---

## 🛣️ Terrain & Surface Constants

Your car behaves very differently depending on the surface it's driving on. Knowing these modifiers is crucial for cutting corners optimally without spinning out!

| Surface | Grip | Drag Mult | Speed Mult | Description |
|---------|------|-----------|------------|-------------|
| **Road** | `1.00` | `1.0` | `1.00` | Standard racing surface. Full traction and speed. |
| **Grass** | `0.45` | `3.0` | `0.50` | Slippery and applies high drag. Top speed is halved. |
| **Dirt** | `0.35` | `3.5` | `0.60` | Very slippery and severely slows you down. |
| **Ice** | `0.07` | `0.3` | `1.00` | Extremely low friction. Hard to turn, but maintains top speed well. |
| **Wall** | `0.00` | `0.0` | `0.00` | Out of bounds. Hitting it stalls the car. |

---

## 🔦 Raycasts (Vision System)

To avoid hardcoding pathways, bots have access to **5 raycasts** emanating from the car's centre. Raycasts travel outward up to a maximum distance of **1200 px** and stop when they detect a surface change (e.g., road changing to grass) or a wall boundary.

The rays are available as a list in `state.raycasts`:
- `[0]`: Forward (0°)
- `[1]`: Diagonal Front-Left (-45°)
- `[2]`: Diagonal Front-Right (+45°)
- `[3]`: Perpendicular Left (-90°)
- `[4]`: Perpendicular Right (+90°)

Each ray returns an object with details of the hit: `distance`, `surface`, `endX`, `endY`, `angle` (world angle), and `relAngle` (relative to car).

### Global Ray Helper Functions
You don't need to manually traverse the list. You can use these built-in global functions anywhere in your code:

```python
fwd = ray_forward(state)          # Distance straight ahead
l45 = ray_left_45(state)          # Distance to front-left edge
r45 = ray_right_45(state)         # Distance to front-right edge
l90 = ray_left_90(state)          # Distance to left edge
r90 = ray_right_90(state)         # Distance to right edge

# Or unpack all 5 at once:
fwd, l45, r45, l90, r90 = rays(state)
```

---

## 🏁 Navigation & Checkpoints

Your globally available environment knowledge:
- `TRACK`: List of rectangles making up the track (`.x`, `.y`, `.w`, `.h`, `.surface`).
- `CHECKPOINTS`: List of checkpoint zones the car must pass through (`.x`, `.y`, `.w`, `.h`, `.order`).
- `FINISH`: Finish line zone configuration.
- `WORLD`: The map boundaries (`.w`, `.h`).

### Global Navigation Helpers
Instead of parsing coordinates manually, use these powerful global helpers:

```python
# Returns the absolute center (x,y) coordinates of your next required objective
target_pos = next_checkpoint_center(state)

# Returns a list of all checkpoint objects in the order they must be collected
all_cps = get_all_checkpoints()

# Returns distance in pixels to the next checkpoint / finish line
dist = distance_to_checkpoint(state)

# Returns the signed angle in radians required to look at the next checkpoint 
# (Negative = checkpoint is to your left, Positive = to your right)
steer_angle = angle_to_checkpoint(state)

# Safely clamps an angle to between -π and π
clamped = normalize_angle(angle)
```

---

## 🧠 Example Strategy: The Road-Follower

Here is a ready-to-run bot that relies on the navigation helpers to roughly aim for the next checkpoint, but overrides its steering using the raycasts to ensure it stays on the track avoiding walls/grass!

```python
def drive(state):
    # 1. Aim for the next checkpoint
    target_angle = angle_to_checkpoint(state)
    
    # Simple deadband to avoid jitter 
    steer_left = target_angle < -0.05
    steer_right = target_angle > 0.05

    # 2. Get raycast distances to track edges
    fwd, l45, r45, l90, r90 = rays(state)

    # 3. Emergency surface avoidance overriding the checkpoint aiming
    # If the left edge of the road is too close, aggressively steer right
    if l90 < 40 or l45 < 60:
        steer_right = True
        steer_left = False
    # If the right edge of the road is too close, aggressively steer left
    elif r90 < 40 or r45 < 60:
        steer_left = True
        steer_right = False

    # 4. Brake if an obstacle/sharp turn is rapidly approaching
    # Only brake if we are moving fast enough
    brake = fwd < 100 and abs(state.car.speed) > 150

    # 5. Output controls
    return {
        "w": not brake,
        "a": steer_left,
        "s": brake, # Hit the brakes!
        "d": steer_right,
    }
```

*Tip: Experiment with checking the car's current speed and dynamically adjusting the thresholds for braking and steering! You can also check `state.car.drifting` to temporarily lay off the accelerator when sliding.*
