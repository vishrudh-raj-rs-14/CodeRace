import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listPlaygroundTracks, createMatch } from "../api";
import { useAuth } from "../context/AuthContext";
import { neon, bg, border, text, font, glow } from "../theme";
import TrackMinimap from "../components/TrackMinimap";

/* ═══════════════════════════════════════════════════════════════════════════
   CSS-in-JS keyframes (injected once)
   ═══════════════════════════════════════════════════════════════════════════ */
const STYLE_ID = "playground-fx";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const sheet = document.createElement("style");
  sheet.id = STYLE_ID;
  sheet.textContent = `
    @keyframes pg-glitch {
      0%,80%,100% { clip-path: inset(0); transform: none; }
      82%  { clip-path: inset(40% 0 20% 0); transform: translateX(-3px); }
      86%  { clip-path: inset(10% 0 60% 0); transform: translateX(3px); }
      90%  { clip-path: inset(60% 0 5% 0);  transform: translateX(-2px); }
    }
    @keyframes pg-pulse {
      0%,100% { opacity: 0.6; }
      50%     { opacity: 1; }
    }
    .pg-card-backing {
      transition: background 0.22s ease, border-color 0.22s ease !important;
    }
    .pg-card:hover > .pg-card-backing {
      background: #5ead03 !important;
      border-color: #5ead03 !important;
    }
    .pg-card:hover > .pg-card-inner {
      transform: translate(-3px, -3px) !important;
      border-color: rgba(132,204,22,0.6) !important;
      box-shadow: 0 6px 24px rgba(132,204,22,0.06) !important;
    }
    .pg-card:active > .pg-card-backing {
      background: #5ead03 !important;
      border-color: #5ead03 !important;
    }
    .pg-card:active > .pg-card-inner {
      transform: translate(1px, 1px) !important;
      border-color: #84cc16 !important;
      transition-duration: 0.06s !important;
    }
    .pg-card-selected > .pg-card-backing {
      background: #5ead03 !important;
      border-color: rgba(132,204,22,0.5) !important;
    }
    .pg-card-selected > .pg-card-inner {
      border-color: rgba(132,204,22,0.7) !important;
      box-shadow: 0 0 12px rgba(132,204,22,0.08) !important;
    }
    .pg-btn {
      transition: all 0.18s ease !important;
      position: relative;
      overflow: hidden;
    }
    .pg-btn:hover {
      transform: translateY(-1px) !important;
      filter: brightness(1.2) !important;
    }
    .pg-btn:active {
      transform: scale(0.97) !important;
    }
  `;
  document.head.appendChild(sheet);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PlaygroundPage
   ═══════════════════════════════════════════════════════════════════════════ */
export default function PlaygroundPage() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [creating, setCreating] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    listPlaygroundTracks()
      .then((data) => setTracks(data || []))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, []);

  const parseTrackData = useCallback((track) => {
    if (!track?.data) return null;
    try {
      return typeof track.data === "string" ? JSON.parse(track.data) : track.data;
    } catch { return null; }
  }, []);

  const handleCreateMatch = async (trackId) => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await createMatch(trackId);
      navigate(`/match/${res.matchId}`);
    } catch (e) {
      alert(e.message || "Failed to create match");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={S.page}>
      {/* Scanline overlay for retro feel */}
      <div style={S.scanline} />

      {/* ── Hero header ────────────────────────────────────────────────── */}
      <div style={S.heroWrap}>
        <div style={S.hero}>
          <div style={S.heroGlitch}>
            <h1 style={S.heroTitle}>PLAYGROUND</h1>
          </div>
          <p style={S.heroSub}>Pick a track. Race friends. Share the link. Dominate.</p>
        </div>
      </div>

      {/* ── Content area ───────────────────────────────────────────────── */}
      <div style={S.content}>
        <div style={S.main}>
          {loading ? (
            <div style={S.emptyState}>
              <div style={S.spinner} />
              <span style={{ color: text.muted, fontFamily: font.mono, fontSize: 13 }}>Loading tracks…</span>
            </div>
          ) : tracks.length === 0 ? (
            <div style={S.emptyState}>
              <span style={{ fontSize: 40 }}>🏁</span>
              <span style={{ color: text.secondary, fontFamily: font.mono, fontSize: 14 }}>
                No tracks available yet. Create a trackset first!
              </span>
            </div>
          ) : (
            <div style={S.grid}>
              {tracks.map((t) => {
                const td = parseTrackData(t);
                const isSelected = selectedTrack?.id === t.id;

                return (
                  <div
                    key={t.id}
                    className={`pg-card${isSelected ? " pg-card-selected" : ""}`}
                    style={S.card}
                    onClick={() => setSelectedTrack(t)}
                    onDoubleClick={() => handleCreateMatch(t.id)}
                  >
                    {/* Backing card (3D offset) */}
                    <div className="pg-card-backing" style={S.cardBacking} />

                    <div className="pg-card-inner" style={S.cardInner}>
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
                      </div>

                      <div style={S.cardBody}>
                        <div style={S.cardTitleRow}>
                          <span style={S.cardTitle}>
                            {t.tracksetName || "Untitled Trackset"}
                          </span>
                          <span style={S.trackIndexBadge}>
                            Track #{t.orderIndex + 1}
                          </span>
                        </div>

                        <div style={S.cardFooter}>
                          <div style={S.trackMeta}>
                            {td && (
                              <span style={S.metaTag}>
                                {td.worldW || 4000}×{td.worldH || 4000}
                              </span>
                            )}
                            {td?.checkpoints && (
                              <span style={S.metaTag}>
                                {td.checkpoints.length} CP{td.checkpoints.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <button
                            className="pg-btn"
                            style={S.raceBtn}
                            onClick={(e) => { e.stopPropagation(); handleCreateMatch(t.id); }}
                            disabled={creating}
                          >
                            {creating ? "…" : "🏎️ RACE"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right sidebar – selected track info ──────────────────────── */}
        <div style={S.sidebar}>
          <div style={S.sidebarHeader}>
            <span style={S.sidebarIcon}>🏎️</span>
            <span style={S.sidebarTitle}>QUICK RACE</span>
            <div style={S.sidebarLine} />
          </div>

          {!selectedTrack ? (
            <div style={S.sidebarEmpty}>
              <span style={{ fontSize: 32, opacity: 0.3 }}>🎯</span>
              <span style={{ color: text.muted, fontSize: 11, fontFamily: font.mono, textAlign: "center" }}>
                Select a track to<br />create a match
              </span>
            </div>
          ) : (
            <div style={S.sidebarContent}>
              {/* Preview */}
              <div style={S.sidebarPreview}>
                {parseTrackData(selectedTrack) ? (
                  <TrackMinimap trackData={parseTrackData(selectedTrack)} width={240} height={130} />
                ) : (
                  <div style={{ ...S.previewEmpty, height: 130 }}>
                    <span style={{ fontSize: 24, opacity: 0.3 }}>🗺️</span>
                  </div>
                )}
              </div>

              <div style={S.sidebarInfo}>
                <h3 style={S.sidebarTrackName}>
                  {selectedTrack.tracksetName || "Untitled"}
                  <span style={{ color: text.muted, fontWeight: 400, fontSize: 11 }}> / Track #{selectedTrack.orderIndex + 1}</span>
                </h3>

                {(() => {
                  const td = parseTrackData(selectedTrack);
                  if (!td) return null;
                  return (
                    <div style={S.sidebarStats}>
                      <div style={S.statRow}>
                        <span style={S.statLabel}>World</span>
                        <span style={S.statValue}>{td.worldW || 4000}×{td.worldH || 4000}</span>
                      </div>
                      <div style={S.statRow}>
                        <span style={S.statLabel}>Checkpoints</span>
                        <span style={S.statValue}>{td.checkpoints?.length || 0}</span>
                      </div>
                      <div style={S.statRow}>
                        <span style={S.statLabel}>Surfaces</span>
                        <span style={S.statValue}>{td.rects?.length || 0} rects</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={S.sidebarActions}>
                <button
                  className="pg-btn"
                  style={S.createMatchBtn}
                  onClick={() => handleCreateMatch(selectedTrack.id)}
                  disabled={creating}
                >
                  {creating ? "Creating…" : "🏁 Create Match"}
                </button>
                <p style={S.sidebarHint}>
                  Creates a match room with a shareable link.<br />
                  Solo or multiplayer — your call.
                </p>
              </div>
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
    background: `linear-gradient(180deg, rgba(228,111,255,0.03) 0%, transparent 100%)`,
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
    animation: "pg-glitch 3s infinite",
  },
  heroTitle: {
    margin: 0,
    fontSize: 36,
    fontFamily: font.mono,
    fontWeight: 900,
    letterSpacing: "6px",
    color: neon.purple,
    textShadow: `0 0 30px rgba(228,111,255,0.3), 0 0 60px rgba(228,111,255,0.1)`,
  },
  heroSub: {
    margin: "6px 0 0",
    fontSize: 13,
    color: text.secondary,
    fontFamily: font.mono,
    letterSpacing: "1px",
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
  cardBody: {
    padding: "12px 16px 14px",
  },
  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: text.primary,
    fontFamily: font.mono,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  trackIndexBadge: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.5px",
    color: neon.blue,
    background: "rgba(0,165,255,0.08)",
    border: "1px solid rgba(0,165,255,0.15)",
    borderRadius: 4,
    padding: "2px 8px",
    fontFamily: font.mono,
    flexShrink: 0,
  },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trackMeta: {
    display: "flex",
    gap: 6,
  },
  metaTag: {
    fontSize: 10,
    color: text.muted,
    fontFamily: font.mono,
    background: bg.elevated,
    padding: "2px 6px",
    borderRadius: 3,
    border: `1px solid ${border.default}`,
  },
  raceBtn: {
    background: "rgba(228,111,255,0.08)",
    color: neon.purple,
    padding: "5px 18px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 800,
    fontFamily: font.mono,
    border: "1px solid rgba(228,111,255,0.2)",
    letterSpacing: "1px",
    boxShadow: "0 0 10px rgba(228,111,255,0.06)",
    cursor: "pointer",
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
    color: neon.purple,
    textShadow: "0 0 8px rgba(228,111,255,0.2)",
  },
  sidebarLine: {
    flex: 1,
    height: 1,
    background: `linear-gradient(90deg, rgba(228,111,255,0.2), transparent)`,
  },
  sidebarEmpty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  sidebarContent: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  sidebarPreview: {
    borderRadius: 6,
    overflow: "hidden",
    border: `1px solid ${border.default}`,
  },
  sidebarInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  sidebarTrackName: {
    margin: 0,
    fontSize: 14,
    fontFamily: font.mono,
    fontWeight: 700,
    color: neon.purple,
  },
  sidebarStats: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "5px 8px",
    background: bg.panel,
    borderRadius: 4,
    border: `1px solid ${border.default}`,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: font.mono,
    color: text.muted,
  },
  statValue: {
    fontSize: 11,
    fontFamily: font.mono,
    color: text.primary,
    fontWeight: 600,
  },
  sidebarActions: {
    marginTop: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  createMatchBtn: {
    width: "100%",
    padding: "12px",
    background: neon.purple,
    color: "#000",
    border: "none",
    borderRadius: 6,
    fontFamily: font.mono,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: glow.purple,
    textAlign: "center",
  },
  sidebarHint: {
    margin: 0,
    fontSize: 10,
    color: text.muted,
    fontFamily: font.mono,
    textAlign: "center",
    lineHeight: 1.5,
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
    borderTopColor: neon.purple,
    borderRadius: "50%",
    animation: "pg-pulse 0.8s linear infinite",
  },
};
