import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Custom hook for multiplayer match WebSocket.
 *
 * Connects to ws://host/api/match/:matchId/ws?userId=...&name=...
 * Streams WASD input and receives match frames with other cars.
 * Also supports sending control messages (restart_vote, exit).
 *
 * @param {Object} options
 * @param {string} options.matchId  – match room ID
 * @param {string} options.userId   – current user ID
 * @param {string} options.name     – display name
 * @param {boolean} [options.enabled] – set to false to prevent connecting
 */
export default function useMultiplayerSocket({ matchId, userId, name, enabled = true } = {}) {
  const wsRef = useRef(null);
  const [frame, setFrame] = useState(null);
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState("waiting");
  const [players, setPlayers] = useState([]);
  const [countdown, setCountdown] = useState(0);
  const [results, setResults] = useState(null);
  const [hostLeft, setHostLeft] = useState(false);
  const [restartVotes, setRestartVotes] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  const keysRef = useRef({ w: false, a: false, s: false, d: false });
  const sendIntervalRef = useRef(null);

  const startSending = useCallback(() => {
    if (sendIntervalRef.current) return;
    sendIntervalRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(keysRef.current));
      }
    }, 1000 / 60);
  }, []);

  const stopSending = useCallback(() => {
    clearInterval(sendIntervalRef.current);
    sendIntervalRef.current = null;
  }, []);

  /** Send a typed control message (restart_vote, exit). */
  const sendMessage = useCallback((type) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type }));
    }
  }, []);

  // Keyboard listeners
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e) => {
      const key = e.key.toLowerCase();
      if (!["w", "a", "s", "d"].includes(key)) return;
      keysRef.current = { ...keysRef.current, [key]: e.type === "keydown" };
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [enabled]);

  // WebSocket connection
  useEffect(() => {
    if (!enabled || !matchId || !userId) {
      setFrame(null);
      setConnected(false);
      return;
    }

    const qs = `?userId=${encodeURIComponent(userId)}&name=${encodeURIComponent(name || "Player")}`;
    const url = `ws://${window.location.host}/api/match/${matchId}/ws${qs}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      startSending();
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        // Host left
        if (data.roomState === "host_left") {
          setHostLeft(true);
          setRoomState("host_left");
          return;
        }

        // Update room state info if present
        if (data.roomState) {
          setRoomState(data.roomState);
          // When transitioning back to waiting (restart), clear results and votes
          if (data.roomState === "waiting") {
            setResults(null);
            setRestartVotes(0);
            setTotalPlayers(0);
          }
        }
        if (data.players) setPlayers(data.players);
        if (data.countdown !== undefined) setCountdown(data.countdown);
        if (data.results) setResults(data.results);

        // Restart vote counts
        if (data.restartVotes !== undefined) setRestartVotes(data.restartVotes);
        if (data.totalPlayers !== undefined) setTotalPlayers(data.totalPlayers);

        // If it's a game frame (has car data), update frame
        if (data.car) {
          setFrame(data);
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      stopSending();
    };

    ws.onerror = () => ws.close();

    return () => {
      stopSending();
      ws.close();
    };
  }, [enabled, matchId, userId, name, startSending, stopSending]);

  return {
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
  };
}
