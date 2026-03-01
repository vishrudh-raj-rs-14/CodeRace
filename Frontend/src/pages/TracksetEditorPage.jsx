import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import TrackEditor from "../components/TrackEditor";
import { getTrackset, createTrackset, updateTrackset } from "../api";
import { useAuth } from "../context/AuthContext";
import { neon, bg, border, text, font, glow } from "../theme";

const EMPTY_TRACK = {
  worldW: 4000,
  worldH: 4000,
  gridSize: 50,
  startX: 200,
  startY: 200,
  startHeading: 0,
  rects: [],
  checkpoints: [],
  finish: null,
};

export default function TracksetEditorPage() {
  const { id } = useParams(); // undefined for /tracksets/new, UUID for /tracksets/:id/edit
  const isNew = !id;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tracks, setTracks] = useState([{ ...EMPTY_TRACK }]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(!isNew);

  // ── Load existing trackset ────────────────────────────────────────────

  useEffect(() => {
    if (isNew) return;
    getTrackset(id)
      .then((ts) => {
        setName(ts.name);
        setDescription(ts.description || "");
        const sorted = (ts.tracks || []).sort((a, b) => a.orderIndex - b.orderIndex);
        const parsed = sorted.map((t) => {
          try { return JSON.parse(typeof t.data === "string" ? t.data : JSON.stringify(t.data)); }
          catch { return { ...EMPTY_TRACK }; }
        });
        setTracks(parsed.length > 0 ? parsed : [{ ...EMPTY_TRACK }]);
      })
      .catch(() => setMsg("❌ Failed to load trackset"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  // ── Track management ──────────────────────────────────────────────────

  const addTrack = () => {
    if (tracks.length >= 5) return;
    setTracks((prev) => [...prev, { ...EMPTY_TRACK }]);
    setActiveIdx(tracks.length);
  };

  const removeTrack = (i) => {
    if (tracks.length <= 1) return;
    setTracks((prev) => prev.filter((_, idx) => idx !== i));
    setActiveIdx((prev) => Math.min(prev, tracks.length - 2));
  };

  const onTrackChange = useCallback(
    (trackData) => {
      setTracks((prev) => {
        const next = [...prev];
        next[activeIdx] = trackData;
        return next;
      });
    },
    [activeIdx]
  );

  // ── Save ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) {
      setMsg("❌ Name is required");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      if (isNew) {
        const ts = await createTrackset(name, description, tracks);
        setMsg("✅ Created!");
        setTimeout(() => navigate(`/tracksets/${ts.id}/edit`, { replace: true }), 1000);
      } else {
        await updateTrackset(id, { name, description, tracks });
        setMsg("✅ Saved!");
      }
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 4000);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: bg.root, color: text.muted, fontFamily: font.mono }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: bg.root, color: text.primary, fontFamily: font.sans }}>
      {/* ── Top bar: name, description, track tabs, save ───────────────── */}
      <div style={styles.topBar}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Trackset Name"
          style={styles.nameInput}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          style={{ ...styles.nameInput, flex: 2, fontSize: 12 }}
        />
        <div style={styles.tabs}>
          {tracks.map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={() => setActiveIdx(i)}
                style={{
                  ...styles.tabBtn,
                  ...(activeIdx === i ? styles.tabActive : {}),
                }}
              >
                Track {i + 1}
              </button>
              {tracks.length > 1 && (
                <button
                  onClick={() => removeTrack(i)}
                  style={styles.removeBtn}
                  title="Remove track"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {tracks.length < 5 && (
            <button onClick={addTrack} style={styles.addBtn}>
              + Add
            </button>
          )}
        </div>
        <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
          {saving ? "Saving…" : isNew ? "🚀 Create" : "💾 Save"}
        </button>
        {msg && <span style={{ fontSize: 12, fontFamily: font.mono }}>{msg}</span>}
      </div>

      {/* ── Editor canvas ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <TrackEditor
          key={activeIdx}
          trackData={tracks[activeIdx]}
          onTrackChange={onTrackChange}
          embedded
        />
      </div>
    </div>
  );
}

const styles = {
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 16px",
    borderBottom: `1px solid ${border.light}`,
    background: bg.dark,
    flexWrap: "wrap",
  },
  nameInput: {
    background: bg.input,
    border: `1px solid ${border.default}`,
    borderRadius: 8,
    padding: "6px 12px",
    color: text.primary,
    fontFamily: font.mono,
    fontSize: 13,
    flex: 1,
    minWidth: 120,
    outline: "none",
  },
  tabs: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  tabBtn: {
    background: bg.elevated,
    border: `1px solid ${border.default}`,
    borderRadius: 6,
    color: text.secondary,
    padding: "4px 12px",
    cursor: "pointer",
    fontFamily: font.mono,
    fontSize: 11,
    fontWeight: 500,
    transition: "all 0.15s ease",
  },
  tabActive: {
    background: `rgba(0,165,255,0.1)`,
    color: neon.blue,
    borderColor: `rgba(0,165,255,0.3)`,
  },
  removeBtn: {
    background: "transparent",
    border: "none",
    color: neon.pink,
    cursor: "pointer",
    fontSize: 16,
    padding: "0 4px",
    lineHeight: 1,
  },
  addBtn: {
    background: `rgba(132,204,22,0.1)`,
    border: `1px solid rgba(132,204,22,0.25)`,
    borderRadius: 6,
    color: neon.green,
    padding: "4px 12px",
    cursor: "pointer",
    fontFamily: font.mono,
    fontSize: 11,
    fontWeight: 600,
  },
  saveBtn: {
    background: `rgba(228,111,255,0.1)`,
    border: `1px solid rgba(228,111,255,0.3)`,
    borderRadius: 8,
    color: neon.pink,
    fontWeight: 700,
    fontSize: 13,
    padding: "8px 20px",
    cursor: "pointer",
    fontFamily: font.mono,
    boxShadow: glow.pink,
    transition: "all 0.15s ease",
  },
};
