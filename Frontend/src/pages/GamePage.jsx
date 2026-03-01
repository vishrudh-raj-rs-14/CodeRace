import useGameSocket from "../hooks/useGameSocket";
import GameCanvas from "../components/GameCanvas";

export default function GamePage() {
  const { frame, connected } = useGameSocket({ enabled: true });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0f0f23",
        color: "#eee",
        fontFamily: "monospace",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>🏎️ CodeRace</h1>

      <p style={{ marginBottom: 16, color: connected ? "#4ade80" : "#f87171" }}>
        {connected ? "● Connected" : "○ Connecting…"}
      </p>

      <GameCanvas frame={frame} />

      <div style={{ marginTop: 16, opacity: 0.6, fontSize: 14 }}>
        <b>W</b> throttle · <b>S</b> brake/reverse · <b>A/D</b> steer
      </div>
    </div>
  );
}
