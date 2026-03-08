// ─── API helper with JWT support ────────────────────────────────────────────

const API_BASE = "/api";

/** Get the stored JWT token. */
export function getToken() {
  return localStorage.getItem("coderace_token");
}

/** Store a JWT token. */
export function setToken(token) {
  localStorage.setItem("coderace_token", token);
}

/** Clear the stored JWT token. */
export function clearToken() {
  localStorage.removeItem("coderace_token");
}

/** Build headers with optional Authorization. */
function authHeaders() {
  const token = getToken();
  const h = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

/** Generic fetch wrapper. */
async function request(method, path, body) {
  const opts = { method, headers: authHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);

  if (res.status === 401) {
    // Token expired or invalid — let the caller handle it.
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return data;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function register(email, password, displayName) {
  const data = await request("POST", "/auth/register", {
    email,
    password,
    displayName,
  });
  setToken(data.token);
  return data.user;
}

export async function login(email, password) {
  const data = await request("POST", "/auth/login", { email, password });
  setToken(data.token);
  return data.user;
}

export async function fetchMe() {
  return request("GET", "/auth/me");
}

export function logout() {
  clearToken();
}

// ── Tracksets ────────────────────────────────────────────────────────────────

export async function listTracksets(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request("GET", `/tracksets${qs ? `?${qs}` : ""}`);
}

export async function getTrackset(id) {
  return request("GET", `/tracksets/${id}`);
}

export async function createTrackset(name, description, tracks) {
  return request("POST", "/tracksets", { name, description, tracks });
}

export async function updateTrackset(id, payload) {
  return request("PUT", `/tracksets/${id}`, payload);
}

export async function deleteTrackset(id) {
  return request("DELETE", `/tracksets/${id}`);
}

// ── Game / Bot ───────────────────────────────────────────────────────────────

export async function runTrack(code, tracksetId, trackIndex) {
  return request("POST", "/game/run", { code, tracksetId, trackIndex });
}

export async function submitTrackset(code, tracksetId) {
  return request("POST", "/game/submit", { code, tracksetId });
}

// Legacy (file-based track).
export async function runBot(code) {
  return request("POST", "/game/bot", { code });
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

export async function getLeaderboard(tracksetId, limit = 50) {
  return request("GET", `/tracksets/${tracksetId}/leaderboard?limit=${limit}`);
}

export async function getMyScore(tracksetId) {
  return request("GET", `/tracksets/${tracksetId}/my-score`);
}

export async function getMySubmissions(tracksetId, limit = 50) {
  return request("GET", `/tracksets/${tracksetId}/my-submissions?limit=${limit}`);
}

// ── Match (multiplayer) ──────────────────────────────────────────────────────

export async function listPlaygroundTracks() {
  return request("GET", "/match/tracks");
}

export async function createMatch(trackId) {
  return request("POST", "/match/create", { trackId });
}

export async function getMatch(matchId) {
  return request("GET", `/match/${matchId}`);
}

export async function startMatch(matchId) {
  return request("POST", `/match/${matchId}/start`);
}

export async function restartMatch(matchId) {
  return request("POST", `/match/${matchId}/restart`);
}
