import { useState, useEffect } from "react";
import { neon, bg, border, text, font, glow, radius } from "../theme";
import { getGlobalLeaderboard } from "../api";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getGlobalLeaderboard(50);
        setEntries(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Global Leaderboard</h1>
          <p style={styles.subtitle}>Ranking based on combined scores from all official tracksets.</p>
        </div>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading leaderboards...</div>
      ) : error ? (
        <div style={styles.error}>{error}</div>
      ) : entries.length === 0 ? (
        <div style={styles.empty}>No entries found.</div>
      ) : (
        <div style={styles.list}>
          <div style={styles.tableHeader}>
            <div style={{ ...styles.colRank, textAlign: "center" }}>Rank</div>
            <div style={styles.colName}>Player</div>
            <div style={{ ...styles.colScore, textAlign: "right" }}>Score</div>
            <div style={{ ...styles.colTime, textAlign: "right" }}>Total Time</div>
          </div>
          
          {entries.map((entry, index) => {
            const isTop = index < 3;
            return (
              <div
                key={entry.userId}
                style={{
                  ...styles.row,
                  ...(index === 0 ? styles.rowFirst : {}),
                  ...(index === 1 ? styles.rowSecond : {}),
                  ...(index === 2 ? styles.rowThird : {}),
                }}
              >
                <div style={{ ...styles.colRank, textAlign: "center", color: isTop ? "#fff" : text.secondary, fontWeight: isTop ? 800 : 500 }}>
                  {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${entry.rank}`}
                </div>
                <div style={{ ...styles.colName, color: isTop ? "#fff" : neon.green }}>
                  {entry.displayName}
                </div>
                <div style={{ ...styles.colScore, textAlign: "right" }}>
                  {entry.totalScore.toLocaleString()} pts
                </div>
                <div style={{ ...styles.colTime, textAlign: "right" }}>
                  {entry.totalTime.toFixed(2)}s
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 800,
    margin: "0 auto",
    padding: "40px 20px",
    fontFamily: font.sans,
    color: text.primary,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 40,
    borderBottom: `1px solid ${border.default}`,
    paddingBottom: 24,
  },
  title: {
    margin: 0,
    fontSize: 40,
    fontWeight: 800,
    color: neon.gold,
    textShadow: glow.gold,
    letterSpacing: "-1px",
  },
  subtitle: {
    margin: "8px 0 0 0",
    color: text.secondary,
    fontSize: 15,
  },
  loading: {
    textAlign: "center",
    padding: 60,
    color: text.secondary,
    fontFamily: font.mono,
  },
  error: {
    background: "rgba(255,50,50,0.1)",
    color: "#ff5555",
    padding: 16,
    borderRadius: radius.md,
    border: "1px solid rgba(255,50,50,0.2)",
  },
  empty: {
    textAlign: "center",
    padding: 80,
    color: text.muted,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  tableHeader: {
    display: "flex",
    padding: "10px 16px",
    color: text.muted,
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "1px",
    borderBottom: `1px solid ${border.default}`,
    marginBottom: 8,
  },
  row: {
    display: "flex",
    alignItems: "center",
    background: bg.panel,
    border: `1px solid ${border.light}`,
    borderRadius: radius.md,
    padding: "16px",
    transition: "transform 0.15s ease",
  },
  rowFirst: {
    background: "rgba(255, 136, 0, 0.1)",
    border: `1px solid ${neon.gold}`,
    boxShadow: glow.gold,
    transform: "scale(1.02)",
    zIndex: 3,
  },
  rowSecond: {
    background: "rgba(0, 165, 255, 0.1)",
    border: `1px solid ${neon.blue}`,
    boxShadow: glow.blue,
    transform: "scale(1.01)",
    zIndex: 2,
  },
  rowThird: {
    background: "rgba(228, 111, 255, 0.1)",
    border: `1px solid ${neon.pink}`,
    boxShadow: glow.pink,
    zIndex: 1,
  },
  colRank: {
    width: 60,
    fontSize: 16,
    paddingRight: 16,
  },
  colName: {
    flex: 1,
    fontSize: 16,
    fontWeight: 600,
  },
  colScore: {
    width: 120,
    fontFamily: font.mono,
    color: neon.gold,
    fontWeight: 500,
  },
  colTime: {
    width: 120,
    fontFamily: font.mono,
    color: text.secondary,
    fontSize: 14,
  },
};
