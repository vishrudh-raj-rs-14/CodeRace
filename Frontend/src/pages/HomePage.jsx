import { Link } from "react-router-dom";
import { neon, bg, text, font, glow, border } from "../theme";

export default function HomePage() {
  return (
    <div style={styles.page}>
      <h1 style={styles.title}>
        <span style={{ color: neon.pink, textShadow: glow.pink }}>🏎️</span>{" "}
        <span style={styles.titleGrad}>CodeRace</span>
      </h1>
      <p style={styles.subtitle}>
        Write Python bots. Race through tracks. Compete on leaderboards.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
        <Link to="/tracksets" style={styles.btnPrimary}>
          Browse Tracksets
        </Link>
        <Link to="/tracksets/new" style={styles.btnSecondary}>
          🏗️ Create Trackset
        </Link>
      </div>
      <p style={styles.footer}>
        Server-side sandboxed execution • nsjail isolation • 60Hz physics
      </p>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "calc(100vh - 50px)",
    background: bg.root,
    color: text.primary,
    fontFamily: font.sans,
  },
  title: {
    fontSize: "3.5rem",
    marginBottom: 8,
    fontWeight: 900,
    letterSpacing: "-1px",
  },
  titleGrad: {
    background: `linear-gradient(135deg, ${neon.blue}, ${neon.green}, ${neon.pink})`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  subtitle: {
    marginBottom: 36,
    color: text.secondary,
    fontSize: 16,
    fontWeight: 400,
  },
  btnPrimary: {
    padding: "14px 40px",
    background: "#1f0a24",
    color: neon.pink,
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 17,
    fontFamily: font.mono,
    border: `1px solid rgba(228, 111, 255, 0.3)`,
    boxShadow: glow.pink,
    transition: "all 0.15s ease",
  },
  btnSecondary: {
    padding: "14px 40px",
    background: "#0f1a06",
    color: neon.green,
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 17,
    fontFamily: font.mono,
    border: `1px solid rgba(132, 204, 22, 0.25)`,
    boxShadow: glow.green,
    transition: "all 0.15s ease",
  },
  footer: {
    marginTop: 52,
    color: text.dim,
    fontSize: 11,
    fontFamily: font.mono,
    letterSpacing: "0.5px",
  },
};
