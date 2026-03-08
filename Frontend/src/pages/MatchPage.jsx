import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import GameCanvas from "../components/GameCanvas";
import useMultiplayerSocket from "../hooks/useMultiplayerSocket";
import { useAuth } from "../context/AuthContext";
import { getMatch, startMatch, restartMatch } from "../api";
import { neon, bg, border, text, font, glow } from "../theme";

export default function MatchPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [matchInfo, setMatchInfo] = useState(null);
  const [error, setError] = useState("");
  const [votedRestart, setVotedRestart] = useState(false);

  // Load match info
  useEffect(() => {
    getMatch(id)
      .then(setMatchInfo)
      .catch((e) => setError(e.message));
  }, [id]);

  const {
    frame,
    connected,
    roomState,
    players,
    countdown,
    results,
    hostLeft,
    restartVotes,
    totalPlayers,
    sendMessage,
  } = useMultiplayerSocket({
    matchId: id,
    userId: user?.id,
    name: user?.displayName || "Player",
    enabled: !!user,
  });

  const isCreator = matchInfo?.creatorId === user?.id;

  // Reset votedRestart when room goes back to waiting
  useEffect(() => {
    if (roomState === "waiting") {
      setVotedRestart(false);
    }
  }, [roomState]);

  const handleStart = async () => {
    try {
      await startMatch(id);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRestart = async () => {
    if (isCreator) {
      // Creator can force restart
      try {
        await restartMatch(id);
      } catch (e) {
        setError(e.message);
      }
    } else {
      // Non-creator: vote to restart
      sendMessage("restart_vote");
      setVotedRestart(true);
    }
  };

  const handleExit = () => {
    sendMessage("exit");
    navigate("/playground");
  };

  if (error) {
    return (
      <div style={{ ...styles.page, justifyContent: "center", alignItems: "center" }}>
        <div style={styles.errorBox}>
          <span style={{ color: neon.orange, fontSize: 24 }}>⚠</span>
          <p style={{ color: text.primary, margin: "8px 0 0" }}>{error}</p>
          <button style={styles.btn} onClick={() => navigate("/playground")}>
            Back to Playground
          </button>
        </div>
      </div>
    );
  }

  // Host left — show message and redirect option
  if (hostLeft) {
    return (
      <div style={{ ...styles.page, justifyContent: "center", alignItems: "center" }}>
        <div style={styles.errorBox}>
          <span style={{ fontSize: 32 }}>👋</span>
          <p style={{ color: text.primary, fontSize: 18, margin: "12px 0 4px", fontFamily: font.mono }}>
            Host Left the Match
          </p>
          <p style={{ color: text.secondary, fontSize: 13, margin: "0 0 16px" }}>
            The match is over because the host disconnected.
          </p>
          <button style={styles.startBtn} onClick={() => navigate("/playground")}>
            Back to Playground
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Left: Game canvas */}
      <div style={styles.canvasPanel}>
        {roomState === "racing" && frame ? (
          <GameCanvas frame={frame} />
        ) : (
          <div style={styles.canvasPlaceholder}>
            {roomState === "starting" ? (
              <div style={styles.countdown}>
                <span style={{ fontSize: 80, color: neon.orange, fontFamily: font.mono }}>
                  {countdown}
                </span>
                <p style={{ color: text.secondary, marginTop: 12 }}>Get ready!</p>
              </div>
            ) : roomState === "finished" ? (
              <div style={styles.countdown}>
                <span style={{ fontSize: 32, color: neon.green }}>🏁</span>
                <p style={{ color: text.primary, fontSize: 20, margin: "8px 0" }}>Race Complete!</p>
              </div>
            ) : (
              <div style={styles.countdown}>
                <span style={{ fontSize: 28, color: neon.blue }}>🏎️</span>
                <p style={{ color: text.secondary, marginTop: 8 }}>Waiting for race to start...</p>
                <p style={{ color: text.muted, fontSize: 12 }}>Use WASD to drive</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Lobby / Results panel */}
      <div style={styles.rightPanel}>
        <div style={styles.header}>
          <h2 style={{ margin: 0, color: text.primary, fontFamily: font.mono, fontSize: 18 }}>
            Match <span style={{ color: neon.green }}>{id}</span>
          </h2>
          <div style={{
            padding: "3px 10px",
            borderRadius: 4,
            background: roomState === "racing" ? neon.green : roomState === "finished" ? neon.orange : neon.blue,
            color: "#000",
            fontFamily: font.mono,
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
          }}>
            {roomState}
          </div>
        </div>

        {/* Connection status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: connected ? neon.green : "#ff4444",
          }} />
          <span style={{ color: text.secondary, fontSize: 12, fontFamily: font.mono }}>
            {connected ? "Connected" : "Connecting..."}
          </span>
        </div>

        {/* Players list */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>
            Players ({players.length})
          </h3>
          <div style={styles.playerList}>
            {players.map((p) => (
              <div key={p.id} style={styles.playerRow}>
                <span style={{
                  color: p.id === user?.id ? neon.green : neon.blue,
                  fontFamily: font.mono,
                  fontSize: 13,
                }}>
                  {p.displayName}
                  {p.id === matchInfo?.creatorId && (
                    <span style={{ color: neon.orange, marginLeft: 6, fontSize: 10 }}>👑</span>
                  )}
                  {p.id === user?.id && (
                    <span style={{ color: text.muted, marginLeft: 6, fontSize: 10 }}>(you)</span>
                  )}
                </span>
              </div>
            ))}
            {players.length === 0 && (
              <p style={{ color: text.muted, fontSize: 12, margin: 0 }}>No players yet...</p>
            )}
          </div>
        </div>

        {/* Share link */}
        {roomState === "waiting" && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Share Link</h3>
            <div style={styles.shareBox}>
              <code style={{ color: neon.green, fontFamily: font.mono, fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {window.location.origin}/match/{id}
              </code>
              <button
                style={styles.copyBtn}
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/match/${id}`)}
              >
                📋
              </button>
            </div>
          </div>
        )}

        {/* Start button (creator only) */}
        {roomState === "waiting" && isCreator && (
          <div style={{ padding: "0 16px 16px" }}>
            <button style={styles.startBtn} onClick={handleStart}>
              🏁 Start Race
            </button>
          </div>
        )}

        {/* Results */}
        {roomState === "finished" && results && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Results</h3>
            <div style={styles.resultsList}>
              {results.map((r, i) => (
                <div key={r.userId} style={{
                  ...styles.resultRow,
                  borderLeft: `3px solid ${i === 0 ? neon.gold : i === 1 ? "#aaa" : neon.blue}`,
                }}>
                  <span style={{
                    color: i === 0 ? neon.gold : text.primary,
                    fontFamily: font.mono,
                    fontWeight: 700,
                    fontSize: 14,
                    minWidth: 24,
                  }}>
                    #{r.place}
                  </span>
                  <span style={{ color: text.primary, fontFamily: font.mono, fontSize: 13, flex: 1 }}>
                    {r.displayName}
                  </span>
                  <span style={{
                    color: r.finished ? neon.green : text.muted,
                    fontFamily: font.mono,
                    fontSize: 12,
                  }}>
                    {r.finished ? `${r.finishTime.toFixed(2)}s` : "DNF"}
                  </span>
                </div>
              ))}
            </div>

            {/* Restart vote progress (non-creator) */}
            {!isCreator && totalPlayers > 0 && (
              <div style={styles.voteBar}>
                <span style={{ color: text.muted, fontFamily: font.mono, fontSize: 10 }}>
                  Restart votes: {restartVotes}/{totalPlayers}
                </span>
                <div style={styles.voteProgress}>
                  <div style={{ ...styles.voteProgressFill, width: `${(restartVotes / totalPlayers) * 100}%` }} />
                </div>
              </div>
            )}

            {/* Restart / Exit buttons */}
            <div style={styles.postRaceActions}>
              {isCreator ? (
                <button style={styles.restartBtn} onClick={handleRestart}>
                  🔄 Restart
                </button>
              ) : (
                <button
                  style={{
                    ...styles.restartBtn,
                    ...(votedRestart ? styles.restartBtnVoted : {}),
                  }}
                  onClick={handleRestart}
                  disabled={votedRestart}
                >
                  {votedRestart ? "✓ Voted Restart" : "🔄 Restart"}
                </button>
              )}
              <button style={styles.exitBtn} onClick={handleExit}>
                🚪 Exit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    height: "100%",
    background: bg.root,
    overflow: "hidden",
  },
  canvasPanel: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: bg.dark,
    minWidth: 0,
  },
  canvasPlaceholder: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 960,
    height: 720,
    background: bg.panel,
    borderRadius: 8,
    border: `1px solid ${border.default}`,
  },
  countdown: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  rightPanel: {
    width: 320,
    background: bg.panel,
    borderLeft: `1px solid ${border.default}`,
    display: "flex",
    flexDirection: "column",
    overflow: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px",
    borderBottom: `1px solid ${border.default}`,
  },
  section: {
    padding: "12px 16px",
    borderBottom: `1px solid ${border.default}`,
  },
  sectionTitle: {
    margin: "0 0 8px",
    color: text.secondary,
    fontFamily: font.mono,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  playerList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    padding: "6px 10px",
    background: bg.card,
    borderRadius: 4,
    border: `1px solid ${border.default}`,
  },
  shareBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    background: bg.input,
    borderRadius: 4,
    border: `1px solid ${border.default}`,
  },
  copyBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    padding: 2,
  },
  startBtn: {
    width: "100%",
    padding: "12px",
    background: neon.green,
    color: "#000",
    border: "none",
    borderRadius: 6,
    fontFamily: font.mono,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: glow.green,
  },
  btn: {
    padding: "8px 16px",
    background: bg.elevated,
    color: text.primary,
    border: `1px solid ${border.default}`,
    borderRadius: 4,
    fontFamily: font.mono,
    fontSize: 12,
    cursor: "pointer",
  },
  resultsList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  resultRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    background: bg.card,
    borderRadius: 4,
  },
  postRaceActions: {
    display: "flex",
    gap: 8,
    paddingTop: 14,
  },
  restartBtn: {
    flex: 1,
    padding: "10px",
    background: neon.green,
    color: "#000",
    border: "none",
    borderRadius: 6,
    fontFamily: font.mono,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: glow.green,
    transition: "all 0.15s ease",
  },
  restartBtnVoted: {
    background: "rgba(132,204,22,0.15)",
    color: neon.green,
    boxShadow: "none",
    cursor: "default",
  },
  exitBtn: {
    flex: 1,
    padding: "10px",
    background: bg.elevated,
    color: text.primary,
    border: `1px solid ${border.default}`,
    borderRadius: 6,
    fontFamily: font.mono,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  voteBar: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingTop: 10,
  },
  voteProgress: {
    width: "100%",
    height: 4,
    background: bg.elevated,
    borderRadius: 2,
    overflow: "hidden",
  },
  voteProgressFill: {
    height: "100%",
    background: neon.green,
    borderRadius: 2,
    transition: "width 0.3s ease",
  },
  errorBox: {
    textAlign: "center",
    padding: 32,
    background: bg.panel,
    borderRadius: 8,
    border: `1px solid ${border.default}`,
  },
};
