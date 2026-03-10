import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Custom hook that manages the WebSocket lifecycle for a game session.
 *
 * - Connects on mount (or when `enabled` flips to true), disconnects on unmount.
 * - Streams WASD key state to the backend continuously.
 * - Receives frame data from the backend and exposes the latest frame.
 *
 * @param {Object} options
 * @param {string} [options.trackId]  – DB track UUID to load; omit for legacy file-based track.
 * @param {boolean} [options.enabled] – set to false to prevent connecting (default true).
 */
export default function useGameSocket({ trackId, enabled = true } = {}) {
  const wsRef = useRef(null);
  const [frame, setFrame] = useState(null);
  const [connected, setConnected] = useState(false);

  // Mutable ref for the current key state so the send-loop
  // always reads the latest without re-renders.
  const keysRef = useRef({ w: false, a: false, s: false, d: false });

  // --- send WASD state at a fixed rate ---
  const sendIntervalRef = useRef(null);

  const startSending = useCallback(() => {
    if (sendIntervalRef.current) return;
    sendIntervalRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(keysRef.current));
      }
    }, 1000 / 60); // ~60 Hz to match server tick
  }, []);

  const stopSending = useCallback(() => {
    clearInterval(sendIntervalRef.current);
    sendIntervalRef.current = null;
  }, []);

  // --- keyboard listeners ---
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e) => {
      const key = e.key.toLowerCase();
      if (!["w", "a", "s", "d"].includes(key)) return;
      keysRef.current = {
        ...keysRef.current,
        [key]: e.type === "keydown",
      };
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [enabled]);

  // --- WebSocket connection ---
  useEffect(() => {
    if (!enabled) {
      setFrame(null);
      setConnected(false);
      return;
    }

    const qs = trackId ? `?trackId=${trackId}` : "";
    const url = `wss://${window.location.host}/api/game/ws${qs}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      startSending();
    };

    ws.onmessage = (e) => {
      try {
        setFrame(JSON.parse(e.data));
      } catch {
        // ignore bad frames
      }
    };

    ws.onclose = () => {
      setConnected(false);
      stopSending();
    };

    ws.onerror = () => {
      ws.close();
    };

    return () => {
      stopSending();
      ws.close();
    };
  }, [enabled, trackId, startSending, stopSending]);

  return { frame, connected };
}
