import { Link } from "react-router-dom";
import { neon, bg, border, text, font, glow, radius } from "../theme";

export default function GuidePage() {
  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.title}>Bot Strategy Guide</h1>
        <p style={styles.subtitle}>
          Welcome to CodeRace! Your goal is to write a Python script that autonomously drives a car around a track to secure the fastest lap time possible.
        </p>

        <section style={styles.section}>
          <h2 style={styles.h2}>🏎️ The <code>drive(state)</code> Function</h2>
          <p style={styles.p}>
            Your code will be evaluated in an isolated sandbox at <strong>60 frames per second (FPS)</strong>. On each frame (or "tick"), the game engine provides your bot with the current state of the car and the track, and expects you to return the steering and pedal actions.
          </p>
          <p style={styles.p}>
            To control your car, you must define a <code>drive(state)</code> function in your Python script. This is the main entry point called by the game engine every tick. Your function must return a dictionary with the control inputs for that frame:
          </p>
          <div style={styles.codeBlock}>
            <pre style={styles.pre}>
{`def drive(state):
    # Your logic here...
    
    return {
        "w": True,  # Accelerate (gas pedal)
        "a": False, # Steer Left
        "s": False, # Brake / Reverse
        "d": False  # Steer Right
    }`}
            </pre>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>⏱️ Engine Timings</h2>
          <ul style={styles.ul}>
            <li><strong>Tick Rate:</strong> 60 ticks per second</li>
            <li><strong>Delta Time (DT):</strong> <code>1.0 / 60</code> seconds per tick.</li>
            <li><strong>Max Ticks:</strong> A race typically runs up to 1500 ticks (25 seconds). If you haven't finished by then, you DNF (Did Not Finish).</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>🌍 The State Object</h2>
          <p style={styles.p}>
            The <code>state</code> parameter is an object that contains everything your car "sees" and "feels" at the current tick.
          </p>
          
          <h3 style={styles.h3}>Car Kinematics</h3>
          <ul style={styles.ul}>
            <li><code>state.tick</code>: The current tick number (integer).</li>
            <li><code>state.car.x</code> / <code>state.car.y</code>: Absolute world coordinates of your car (pixels).</li>
            <li><code>state.car.heading</code>: The direction your car is facing in radians (0 is East/Right, π/2 is South/Down).</li>
            <li><code>state.car.speed</code>: Your car's forward velocity (px/s).</li>
            <li><code>state.car.lateralV</code>: Your car's lateral (sliding/slip) velocity (px/s).</li>
            <li><code>state.car.steerAngle</code>: The current angle of your front wheels relative to the car body.</li>
            <li><code>state.car.drifting</code>: Boolean indicating if the car has lost traction and is currently drifting.</li>
          </ul>

          <h3 style={styles.h3}>Surface Info</h3>
          <p style={styles.p}>The surface exactly beneath the car's centre:</p>
          <ul style={styles.ul}>
            <li><code>state.car.surface</code> or <code>state.surface.name</code>: Name of the surface (<code>road</code>, <code>grass</code>, <code>dirt</code>, <code>ice</code>, <code>wall</code>).</li>
            <li><code>state.surface.grip</code>: Multiplier for cornering traction (0 to 1).</li>
            <li><code>state.surface.drag_mult</code>: Multiplier for rolling resistance.</li>
            <li><code>state.surface.speed_mult</code>: Top-speed limit multiplier.</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>🛣️ Terrain & Surface Constants</h2>
          <p style={styles.p}>
            Your car behaves very differently depending on the surface it's driving on. Knowing these modifiers is crucial for cutting corners optimally without spinning out!
          </p>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Surface</th>
                  <th style={styles.th}>Grip</th>
                  <th style={styles.th}>Drag Mult</th>
                  <th style={styles.th}>Speed Mult</th>
                  <th style={styles.th}>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={styles.td}><strong>Road</strong></td>
                  <td style={styles.td}><code>1.00</code></td>
                  <td style={styles.td}><code>1.0</code></td>
                  <td style={styles.td}><code>1.00</code></td>
                  <td style={styles.td}>Standard racing surface. Full traction and speed.</td>
                </tr>
                <tr>
                  <td style={styles.td}><strong>Grass</strong></td>
                  <td style={styles.td}><code>0.45</code></td>
                  <td style={styles.td}><code>3.0</code></td>
                  <td style={styles.td}><code>0.50</code></td>
                  <td style={styles.td}>Slippery and applies high drag. Top speed is halved.</td>
                </tr>
                <tr>
                  <td style={styles.td}><strong>Dirt</strong></td>
                  <td style={styles.td}><code>0.35</code></td>
                  <td style={styles.td}><code>3.5</code></td>
                  <td style={styles.td}><code>0.60</code></td>
                  <td style={styles.td}>Very slippery and severely slows you down.</td>
                </tr>
                <tr>
                  <td style={styles.td}><strong>Ice</strong></td>
                  <td style={styles.td}><code>0.07</code></td>
                  <td style={styles.td}><code>0.3</code></td>
                  <td style={styles.td}><code>1.00</code></td>
                  <td style={styles.td}>Extremely low friction. Hard to turn, but maintains top speed well.</td>
                </tr>
                <tr>
                  <td style={styles.td}><strong>Wall</strong></td>
                  <td style={styles.td}><code>0.00</code></td>
                  <td style={styles.td}><code>0.0</code></td>
                  <td style={styles.td}><code>0.00</code></td>
                  <td style={styles.td}>Out of bounds. Hitting it stalls the car.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>🔦 Raycasts (Vision System)</h2>
          <p style={styles.p}>
            To avoid hardcoding pathways, bots have access to <strong>5 raycasts</strong> emanating from the car's centre. Raycasts travel outward up to a maximum distance of <strong>1200 px</strong> and stop when they detect a surface change (e.g., road changing to grass) or a wall boundary.
          </p>
          <ul style={styles.ul}>
            <li><code>[0]</code>: Forward (0°)</li>
            <li><code>[1]</code>: Diagonal Front-Left (-45°)</li>
            <li><code>[2]</code>: Diagonal Front-Right (+45°)</li>
            <li><code>[3]</code>: Perpendicular Left (-90°)</li>
            <li><code>[4]</code>: Perpendicular Right (+90°)</li>
          </ul>
          <p style={styles.p}>
            Each ray returns an object with details of the hit: <code>distance</code>, <code>surface</code>, <code>endX</code>, <code>endY</code>, <code>angle</code> (world angle), and <code>relAngle</code> (relative to car).
          </p>
          <h3 style={styles.h3}>Global Ray Helper Functions</h3>
          <p style={styles.p}>You don't need to manually traverse the list. You can use these built-in global functions anywhere in your code:</p>
          <div style={styles.codeBlock}>
            <pre style={styles.pre}>
{`fwd = ray_forward(state)          # Distance straight ahead
l45 = ray_left_45(state)          # Distance to front-left edge
r45 = ray_right_45(state)         # Distance to front-right edge
l90 = ray_left_90(state)          # Distance to left edge
r90 = ray_right_90(state)         # Distance to right edge

# Or unpack all 5 at once:
fwd, l45, r45, l90, r90 = rays(state)`}
            </pre>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>🏁 Navigation & Checkpoints</h2>
          <p style={styles.p}>Your globally available environment knowledge:</p>
          <ul style={styles.ul}>
            <li><code>TRACK</code>: List of rectangles making up the track (<code>.x</code>, <code>.y</code>, <code>.w</code>, <code>.h</code>, <code>.surface</code>).</li>
            <li><code>CHECKPOINTS</code>: List of checkpoint zones the car must pass through (<code>.x</code>, <code>.y</code>, <code>.w</code>, <code>.h</code>, <code>.order</code>).</li>
            <li><code>FINISH</code>: Finish line zone configuration.</li>
            <li><code>WORLD</code>: The map boundaries (<code>.w</code>, <code>.h</code>).</li>
          </ul>

          <h3 style={styles.h3}>Global Navigation Helpers</h3>
          <p style={styles.p}>Instead of parsing coordinates manually, use these powerful global helpers:</p>
          <div style={styles.codeBlock}>
            <pre style={styles.pre}>
{`# Returns the absolute center (x,y) coordinates of your next required objective
target_pos = next_checkpoint_center(state)

# Returns a list of all checkpoint objects in the order they must be collected
all_cps = get_all_checkpoints()

# Returns distance in pixels to the next checkpoint / finish line
dist = distance_to_checkpoint(state)

# Returns the signed angle in radians required to look at the next checkpoint 
# (Negative = checkpoint is to your left, Positive = to your right)
steer_angle = angle_to_checkpoint(state)

# Safely clamps an angle to between -π and π
clamped = normalize_angle(angle)`}
            </pre>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>🧠 Example Strategy: The Road-Follower</h2>
          <p style={styles.p}>
            Here is a ready-to-run bot that relies on the navigation helpers to roughly aim for the next checkpoint, but overrides its steering using the raycasts to ensure it stays on the track avoiding walls/grass!
          </p>
          <div style={styles.codeBlock}>
            <pre style={styles.pre}>
{`def drive(state):
    # 1. Aim for the next checkpoint
    target_angle = angle_to_checkpoint(state)
    
    # 2. Simple deadband to avoid jitter 
    steer_left = target_angle < -0.05
    steer_right = target_angle > 0.05

    # 3. Get raycast distances to track edges
    fwd, l45, r45, l90, r90 = rays(state)

    # 4. Emergency surface avoidance overriding the checkpoint aiming
    # If the left edge of the road is too close, aggressively steer right
    if l90 < 40 or l45 < 60:
        steer_right = True
        steer_left = False
    # If the right edge of the road is too close, aggressively steer left
    elif r90 < 40 or r45 < 60:
        steer_left = True
        steer_right = False

    # 5. Brake if an obstacle/sharp turn is rapidly approaching
    # Only brake if we are moving fast enough
    brake = fwd < 100 and abs(state.car.speed) > 150

    # 6. Output controls
    return {
        "w": not brake,
        "a": steer_left,
        "s": brake, # Hit the brakes!
        "d": steer_right,
    }`}
            </pre>
          </div>
          <p style={styles.p}>
            <em>Tip: Experiment with checking the car's current speed and dynamically adjusting the thresholds for braking and steering! You can also check <code>state.car.drifting</code> to temporarily lay off the accelerator when sliding.</em>
          </p>

          <div style={{ marginTop: 40, textAlign: "center" }}>
            <Link to="/playground" style={styles.ctaButton}>
              Try it in the Playground →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "40px 20px",
    fontFamily: font.sans,
    color: text.primary,
    backgroundColor: bg.root,
    minHeight: "100%",
  },
  content: {
    maxWidth: 800,
    margin: "0 auto",
  },
  title: {
    fontSize: 48,
    fontWeight: 800,
    color: neon.green,
    textShadow: glow.green,
    marginBottom: 16,
    letterSpacing: "-1px",
  },
  subtitle: {
    fontSize: 18,
    color: text.secondary,
    lineHeight: 1.6,
    marginBottom: 48,
  },
  section: {
    marginBottom: 48,
    paddingBottom: 24,
    borderBottom: `1px solid ${border.default}`,
  },
  h2: {
    fontSize: 28,
    fontWeight: 700,
    color: neon.blue,
    marginBottom: 20,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  h3: {
    fontSize: 20,
    fontWeight: 600,
    color: neon.orange,
    marginTop: 24,
    marginBottom: 16,
  },
  p: {
    fontSize: 15,
    lineHeight: 1.6,
    color: text.primary,
    marginBottom: 16,
  },
  ul: {
    paddingLeft: 24,
    marginBottom: 16,
    lineHeight: 1.6,
    color: text.primary,
  },
  codeBlock: {
    background: bg.panel,
    border: `1px solid ${border.light}`,
    borderRadius: radius.md,
    padding: 20,
    overflowX: "auto",
    marginBottom: 16,
  },
  pre: {
    margin: 0,
    fontFamily: font.mono,
    fontSize: 14,
    color: neon.green,
  },
  tableContainer: {
    overflowX: "auto",
    marginBottom: 16,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    border: `1px solid ${border.default}`,
  },
  th: {
    background: bg.panel,
    padding: "12px 16px",
    textAlign: "left",
    fontWeight: 600,
    borderBottom: `1px solid ${border.default}`,
    color: text.secondary,
  },
  td: {
    padding: "12px 16px",
    borderBottom: `1px solid ${border.default}`,
    verticalAlign: "top",
  },
  ctaButton: {
    display: "inline-block",
    padding: "12px 24px",
    background: bg.elevated,
    color: neon.green,
    border: `1px solid ${neon.green}`,
    borderRadius: radius.md,
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 16,
    boxShadow: glow.green,
    transition: "all 0.2s ease",
  },
};
