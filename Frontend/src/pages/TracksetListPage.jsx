import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listTracksets, getLeaderboard } from "../api";
import { useAuth } from "../context/AuthContext";
import { neon, bg, border, text, font, glow } from "../theme";
import TrackMinimap from "../components/TrackMinimap";

/* ═══════════════════════════════════════════════════════════════════════════
   CSS-in-JS keyframes (injected once)
   ═══════════════════════════════════════════════════════════════════════════ */
const STYLE_ID = "trackset-list-fx";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const sheet = document.createElement("style");
  sheet.id = STYLE_ID;
  sheet.textContent = `
    @keyframes tl-glitch {
      0%,80%,100% { clip-path: inset(0); transform: none; }
      82%  { clip-path: inset(40% 0 20% 0); transform: translateX(-3px); }
      86%  { clip-path: inset(10% 0 60% 0); transform: translateX(3px); }
      90%  { clip-path: inset(60% 0 5% 0);  transform: translateX(-2px); }
    }
    @keyframes tl-pulse {
      0%,100% { opacity: 0.6; }
      50%     { opacity: 1; }
    }
    .tl-card-backing {
      transition: background 0.22s ease, border-color 0.22s ease !important;
    }
    .tl-card:hover > .tl-card-backing {
      background: #5ead03 !important;
      border-color: #5ead03 !important;
    }
    .tl-card:hover > .tl-card-inner {
      transform: translate(-3px, -3px) !important;
      border-color: rgba(132,204,22,0.6) !important;
      box-shadow: 0 6px 24px rgba(132,204,22,0.06) !important;
    }
    .tl-card:active > .tl-card-backing {
      background: #5ead03 !important;
      border-color: #5ead03 !important;
    }
    .tl-card:active > .tl-card-inner {
      transform: translate(1px, 1px) !important;
      border-color: #84cc16 !important;
      transition-duration: 0.06s !important;
    }
    .tl-card-selected > .tl-card-backing {
      background: #5ead03 !important;
      border-color: rgba(132,204,22,0.5) !important;
    }
    .tl-card-selected > .tl-card-inner {
      border-color: rgba(132,204,22,0.7) !important;
      box-shadow: 0 0 12px rgba(132,204,22,0.08) !important;
    }
    .tl-btn {
      transition: all 0.18s ease !important;
      position: relative;
      overflow: hidden;
    }
    .tl-btn:hover {
      transform: translateY(-1px) !important;
      filter: brightness(1.2) !important;
    }
    .tl-btn:active {
      transform: scale(0.97) !important;
    }
    .tl-filter-btn {
      transition: all 0.18s ease !important;
    }
    .tl-filter-btn:hover {
      background: #111 !important;
      color: #84cc16 !important;
      border-color: rgba(132,204,22,0.2) !important;
    }
    .tl-preview-dot {
      transition: all 0.15s ease !important;
    }
    .tl-preview-dot:hover {
      transform: scale(1.3) !important;
    }
    .tl-lb-row {
      transition: all 0.12s ease !important;
    }
    .tl-lb-row:hover {
      background: #141414 !important;
      border-color: rgba(132,204,22,0.15) !important;
    }
  `;
  document.head.appendChild(sheet);
}

/* ═══════════════════════════════════════════════════════════════════════════
   TracksetListPage
   ═══════════════════════════════════════════════════════════════════════════ */
export default function TracksetListPage() {
  const [tracksets, setTracksets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedTs, setSelectedTs] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [previewIdx, setPreviewIdx] = useState({});
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filter === "official") params.official = "true";
    if (filter === "community") params.official = "false";
    if (filter === "mine") params.mine = "true";
    listTracksets(params)
      .then((data) => setTracksets(data || []))
      .catch(() => setTracksets([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    if (!selectedTs) { setLeaderboard([]); return; }
    setLbLoading(true);
    getLeaderboard(selectedTs.id)
      .then((data) => setLeaderboard(data || []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLbLoading(false));
  }, [selectedTs]);

  const getPreview = useCallback((ts) => previewIdx[ts.id] ?? 0, [previewIdx]);
  const setPreview = useCallback((tsId, idx) => setPreviewIdx((p) => ({ ...p, [tsId]: idx })), []);

  const parseTrackData = (track) => {
    if (!track?.data) return null;
    try {
      return typeof track.data === "string" ? JSON.parse(track.data) : track.data;
    } catch { return null; }
  };

  return (
    <div style={S.page}>
      {/* Scanline overlay for retro feel */}
      <div style={S.scanline} />

      {/* ── Hero header ────────────────────────────────────────────────── */}
      <div style={S.heroWrap}>
        <div style={S.hero}>
          <div style={S.heroGlitch}>
            <h1 style={S.heroTitle}>TRACKSETS</h1>
          </div>
          <p style={S.heroSub}>Choose your arena. Master the code. Dominate the leaderboard.</p>

          <div style={S.filters}>
            {["all", "official", "community", ...(user ? ["mine"] : [])].map((f) => (
              <button
                key={f}
                className="tl-filter-btn"
                onClick={() => setFilter(f)}
                style={{
                  ...S.filterBtn,
                  ...(filter === f ? S.filterActive : {}),
                }}
              >
                {f === "all" ? "⚡ All" : f === "official" ? "⭐ Official" : f === "community" ? "🌍 Community" : "👤 Mine"}
              </button>
            ))}
            {user && (
              <Link to="/tracksets/new" className="tl-btn" style={S.createBtn}>
                + New Trackset
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Content area ───────────────────────────────────────────────── */}
      <div style={S.content}>
        <div style={S.main}>
          {loading ? (
            <div style={S.emptyState}>
              <div style={S.spinner} />
              <span style={{ color: text.muted, fontFamily: font.mono, fontSize: 13 }}>Loading tracksets…</span>
            </div>
          ) : tracksets.length === 0 ? (
            <div style={S.emptyState}>
              <span style={{ fontSize: 40 }}>🏁</span>
              <span style={{ color: text.secondary, fontFamily: font.mono, fontSize: 14 }}>
                No tracksets found. {user ? "Create one!" : "Log in to create one."}
              </span>
            </div>
          ) : (
            <div style={S.grid}>
              {tracksets.map((ts) => {
                const tracks = ts.tracks || [];
                const pi = getPreview(ts);
                const td = tracks[pi] ? parseTrackData(tracks[pi]) : null;
                const isSelected = selectedTs?.id === ts.id;

                return (
                  <div
                    key={ts.id}
                    className={`tl-card${isSelected ? " tl-card-selected" : ""}`}
                    style={S.card}
                    onClick={() => setSelectedTs(ts)}
                    onDoubleClick={() => navigate(`/play/${ts.id}`)}
                  >
                    {/* Backing card (3D offset) */}
                    <div className="tl-card-backing" style={S.cardBacking} />

                    <div className="tl-card-inner" style={S.cardInner}>
                      {/* Track minimap preview */}
                      <div style={S.previewArea}>
                        {td ? (
                          <TrackMinimap trackData={td} width={280} height={150} />
                        ) : (
                          <div style={S.previewEmpty}>
                            <span style={{ fontSize: 28, opacity: 0.4 }}>🗺️</span>
                            <span style={{ color: text.muted, fontSize: 10, fontFamily: font.mono }}>No preview</span>
                          </div>
                        )}
                        {tracks.length > 1 && (
                          <div style={S.previewDots}>
                            {tracks.map((_, i) => (
                              <button
                                key={i}
                                className="tl-preview-dot"
                                style={{
                                  ...S.dot,
                                  ...(i === pi ? S.dotActive : {}),
                                }}
                                onClick={(e) => { e.stopPropagation(); setPreview(ts.id, i); }}
                              />
                            ))}
                          </div>
                        )}
                        <div style={S.trackBadge}>
                          {tracks.length} track{tracks.length !== 1 ? "s" : ""}
                        </div>
                      </div>

                      <div style={S.cardBody}>
                        <div style={S.cardTitleRow}>
                          <span style={S.cardTitle}>
                            {ts.official && <span style={S.officialBadge}>OFFICIAL</span>}
                            {ts.name}
                          </span>
                        </div>
                        {ts.description && (
                          <p style={S.cardDesc}>{ts.description}</p>
                        )}
                        <div style={S.cardFooter}>
                          <span style={S.creator}>
                            by {ts.creator?.displayName || "Unknown"}
                          </span>
                          <div style={{ display: "flex", gap: 6 }}>
                            {(user?.id === ts.createdBy || user?.isAdmin) && (
                              <Link
                                to={`/tracksets/${ts.id}/edit`}
                                className="tl-btn"
                                style={S.editBtn}
                                onClick={(e) => e.stopPropagation()}
                              >
                                ✏️ Edit
                              </Link>
                            )}
                            <Link
                              to={`/play/${ts.id}`}
                              className="tl-btn"
                              style={S.playBtn}
                              onClick={(e) => e.stopPropagation()}
                            >
                              ▶ PLAY
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Leaderboard sidebar ──────────────────────────────────────── */}
        <div style={S.sidebar}>
          <div style={S.sidebarHeader}>
            <span style={S.sidebarIcon}>🏆</span>
            <span style={S.sidebarTitle}>LEADERBOARD</span>
            <div style={S.sidebarLine} />
          </div>

          {!selectedTs ? (
            <div style={S.sidebarEmpty}>
              <span style={{ fontSize: 32, opacity: 0.3 }}>📊</span>
              <span style={{ color: text.muted, fontSize: 11, fontFamily: font.mono, textAlign: "center" }}>
                Select a trackset to<br />view its leaderboard
              </span>
            </div>
          ) : lbLoading ? (
            <div style={S.sidebarEmpty}>
              <div style={S.spinner} />
            </div>
          ) : leaderboard.length === 0 ? (
            <div style={S.sidebarEmpty}>
              <span style={{ fontSize: 24, opacity: 0.3 }}>🤷</span>
              <span style={{ color: text.muted, fontSize: 11, fontFamily: font.mono }}>No scores yet</span>
            </div>
          ) : (
            <div style={S.lbList}>
              {leaderboard.map((e, i) => (
                <div key={e.userId} className="tl-lb-row" style={S.lbRow}>
                  <span style={{
                    ...S.lbRank,
                    color: i === 0 ? neon.gold : i === 1 ? "#c0c0c0" : i === 2 ? "#cd7f32" : text.muted,
                  }}>
                    {i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${e.rank}`}
                  </span>
                  <span style={S.lbName}>{e.displayName}</span>
                  <span style={S.lbScore}>{e.score}</span>
                  <span style={S.lbTime}>{e.totalTime.toFixed(2)}s</span>
                </div>
              ))}
            </div>
          )}

          {selectedTs && (
            <div style={S.sidebarFooter}>
              <div style={S.sidebarLine} />
              <span style={{ fontFamily: font.mono, fontSize: 11, color: neon.green, fontWeight: 700 }}>
                {selectedTs.name}
              </span>
              <Link
                to={`/play/${selectedTs.id}`}
                className="tl-btn"
                style={{ ...S.playBtn, width: "100%", textAlign: "center", display: "block", padding: "8px 0" }}
              >
                ▶ PLAY NOW
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════════════════════ */
const S = {
  page: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: bg.root,
    color: text.primary,
    fontFamily: font.sans,
    overflow: "hidden",
    position: "relative",
  },
  scanline: {
    pointerEvents: "none",
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
    mixBlendMode: "overlay",
  },
  heroWrap: {
    position: "relative",
    borderBottom: `1px solid ${border.default}`,
    background: `linear-gradient(180deg, rgba(132,204,22,0.03) 0%, transparent 100%)`,
    overflow: "hidden",
  },
  hero: {
    padding: "28px 32px 20px",
    maxWidth: 1400,
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
  },
  heroGlitch: {
    animation: "tl-glitch 3s infinite",
  },
  heroTitle: {
    margin: 0,
    fontSize: 36,
    fontFamily: font.mono,
    fontWeight: 900,
    letterSpacing: "6px",
    color: neon.green,
    textShadow: `0 0 30px rgba(132,204,22,0.3), 0 0 60px rgba(132,204,22,0.1)`,
  },
  heroSub: {
    margin: "6px 0 16px",
    fontSize: 13,
    color: text.secondary,
    fontFamily: font.mono,
    letterSpacing: "1px",
  },
  filters: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  filterBtn: {
    background: bg.elevated,
    border: `1px solid ${border.default}`,
    borderRadius: 6,
    color: text.secondary,
    padding: "7px 16px",
    cursor: "pointer",
    fontFamily: font.mono,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.5px",
  },
  filterActive: {
    background: "rgba(132,204,22,0.08)",
    color: neon.green,
    borderColor: "rgba(132,204,22,0.3)",
    boxShadow: "0 0 12px rgba(132,204,22,0.08)",
  },
  createBtn: {
    marginLeft: "auto",
    background: "rgba(132,204,22,0.06)",
    color: neon.green,
    padding: "7px 20px",
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 12,
    textDecoration: "none",
    fontFamily: font.mono,
    letterSpacing: "0.5px",
    border: `1px solid rgba(132,204,22,0.25)`,
    boxShadow: "0 0 12px rgba(132,204,22,0.06)",
  },
  content: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  main: {
    flex: 1,
    padding: "20px 28px",
    overflowY: "auto",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 24,
    paddingBottom: 40,
  },
  card: {
    position: "relative",
    cursor: "pointer",
  },
  cardBacking: {
    position: "absolute",
    top: 6,
    left: 6,
    width: "100%",
    height: "100%",
    background: "#161616",
    borderRadius: 5,
    border: `1.5px solid ${border.default}`,
    transition: "background 0.22s ease, border-color 0.22s ease",
  },
  cardInner: {
    position: "relative",
    background: bg.card,
    border: `1px solid ${border.default}`,
    borderRadius: 5,
    overflow: "hidden",
    zIndex: 1,
    transition: "transform 0.2s ease, border-color 0.22s ease, box-shadow 0.22s ease",
  },
  previewArea: {
    position: "relative",
    background: "#0a0a0a",
    borderBottom: `1px solid ${border.default}`,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  previewEmpty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 150,
    width: "100%",
  },
  previewDots: {
    position: "absolute",
    bottom: 8,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 6,
    padding: "3px 8px",
    background: "rgba(0,0,0,0.7)",
    borderRadius: 5,
    backdropFilter: "blur(4px)",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    border: "none",
    background: "rgba(255,255,255,0.25)",
    cursor: "pointer",
    padding: 0,
  },
  dotActive: {
    background: neon.green,
    boxShadow: "0 0 6px rgba(132,204,22,0.5)",
  },
  trackBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    background: "rgba(0,0,0,0.75)",
    color: neon.blue,
    fontSize: 10,
    fontFamily: font.mono,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 4,
    backdropFilter: "blur(4px)",
    border: "1px solid rgba(0,165,255,0.15)",
    letterSpacing: "0.5px",
  },
  cardBody: {
    padding: "12px 16px 14px",
  },
  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontWeight: 700,
    fontSize: 15,
    color: text.primary,
    fontFamily: font.mono,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  officialBadge: {
    fontSize: 8,
    fontWeight: 800,
    letterSpacing: "1.5px",
    color: neon.gold,
    background: "rgba(255,136,0,0.1)",
    border: "1px solid rgba(255,136,0,0.2)",
    borderRadius: 3,
    padding: "2px 6px",
  },
  cardDesc: {
    fontSize: 12,
    color: text.secondary,
    margin: "2px 0 10px",
    lineHeight: 1.4,
    fontFamily: font.mono,
  },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  creator: {
    color: text.muted,
    fontSize: 10,
    fontFamily: font.mono,
    letterSpacing: "0.3px",
  },
  editBtn: {
    background: "rgba(0,165,255,0.06)",
    color: neon.blue,
    padding: "5px 14px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    textDecoration: "none",
    fontFamily: font.mono,
    border: "1px solid rgba(0,165,255,0.15)",
    letterSpacing: "0.3px",
  },
  playBtn: {
    background: "rgba(132,204,22,0.08)",
    color: neon.green,
    padding: "5px 18px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 800,
    textDecoration: "none",
    fontFamily: font.mono,
    border: "1px solid rgba(132,204,22,0.2)",
    letterSpacing: "1px",
    boxShadow: "0 0 10px rgba(132,204,22,0.06)",
  },
  sidebar: {
    width: 280,
    background: bg.dark,
    borderLeft: `1px solid ${border.default}`,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflowY: "auto",
    flexShrink: 0,
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  sidebarIcon: {
    fontSize: 18,
  },
  sidebarTitle: {
    fontFamily: font.mono,
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: "2px",
    color: neon.gold,
    textShadow: "0 0 8px rgba(255,136,0,0.2)",
  },
  sidebarLine: {
    flex: 1,
    height: 1,
    background: `linear-gradient(90deg, rgba(255,136,0,0.2), transparent)`,
  },
  sidebarEmpty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  sidebarFooter: {
    marginTop: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  lbList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  lbRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    background: bg.panel,
    borderRadius: 6,
    fontSize: 11,
    fontFamily: font.mono,
    border: `1px solid ${border.default}`,
  },
  lbRank: {
    fontWeight: 800,
    width: 28,
    textAlign: "center",
    fontSize: 12,
  },
  lbName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: text.primary,
    fontWeight: 500,
  },
  lbScore: {
    fontWeight: 700,
    color: neon.green,
    width: 45,
    textAlign: "right",
  },
  lbTime: {
    color: text.muted,
    width: 55,
    textAlign: "right",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    minHeight: 300,
  },
  spinner: {
    width: 24,
    height: 24,
    border: `2px solid ${border.default}`,
    borderTopColor: neon.green,
    borderRadius: "50%",
    animation: "tl-pulse 0.8s linear infinite",
  },
};
