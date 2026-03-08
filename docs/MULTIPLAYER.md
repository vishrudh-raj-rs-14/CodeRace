# 🏎️ Multiplayer Racing

CodeRace supports **real-time 1v1+ multiplayer keyboard racing**. Players
drive using WASD controls and see each other's cars on the canvas in real time.

## How It Works

### 1. Create a Match

From any trackset play page, click the **🏎️ Race** button. This creates a
match room with a unique short code (e.g. `a1b2c3d4`) for the currently
selected track.

You can also create a match via the API:

```
POST /api/match/create
Body: { "trackId": "<uuid>" }
Response: { "matchId": "a1b2c3d4", "trackId": "<uuid>" }
```

### 2. Share & Join

Share the match URL with friends:
```
https://yoursite.com/match/a1b2c3d4
```

Anyone who opens the link (and is logged in) automatically joins the lobby.
The lobby shows all connected players in real time.

### 3. Start the Race

Only the **room creator** (shown with 👑) can start the race. Click
**🏁 Start Race** when everyone is ready.

A **3-second countdown** is broadcast to all players, then the race begins.

```
POST /api/match/:id/start
```

### 4. Race!

- All players drive simultaneously using **WASD** keys
- Each player sees their own car (green glow) plus other players' cars (blue glow)
- The minimap shows all players as dots
- Race duration: **30 seconds max**
- Collect all checkpoints in order, then cross the finish line

### 5. Results

When all players finish (or 30s elapses), results are shown:
- Placement (1st, 2nd, etc.)
- Finish time or DNF
- Sorted by time, DNF players listed last

## Architecture

### Backend

| Component | File | Purpose |
|-----------|------|---------|
| Room Manager | `engine/match/room.go` | Room lifecycle, player management, race loop |
| REST Controller | `controller/matchController.go` | Create/get/start match endpoints |
| WS Controller | `controller/matchController.go` | `MatchSocketController` for real-time racing |
| Router | `router/matchRouter.go` | Route setup under `/api/match/` |

### Frontend

| Component | File | Purpose |
|-----------|------|---------|
| MatchPage | `pages/MatchPage.jsx` | Lobby, canvas, results UI |
| useMultiplayerSocket | `hooks/useMultiplayerSocket.js` | WS connection, WASD streaming |
| GameCanvas | `components/GameCanvas.jsx` | Renders other cars from `frame.otherCars` |

### Protocol

**WebSocket endpoint:** `ws://host/api/match/:id/ws?userId=<id>&name=<name>`

**Client → Server:** WASD input at 60 Hz
```json
{"w": true, "a": false, "s": false, "d": false}
```

**Server → Client (lobby):**
```json
{
  "roomState": "waiting",
  "countdown": 0,
  "players": [{"id": "...", "displayName": "..."}]
}
```

**Server → Client (racing):** Full frame + other cars
```json
{
  "tick": 42,
  "car": { "x": 100, "y": 200, "heading": 0, ... },
  "track": [...],
  "raycasts": [...],
  "otherCars": [
    { "x": 150, "y": 210, "heading": 0.1, "name": "Player2", ... }
  ],
  "roomState": "racing"
}
```

**Server → Client (finished):**
```json
{
  "roomState": "finished",
  "results": [
    { "userId": "...", "displayName": "Alice", "finished": true, "finishTime": 12.5, "place": 1 },
    { "userId": "...", "displayName": "Bob", "finished": false, "finishTime": 0, "place": 2 }
  ]
}
```

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/match/create` | ✅ | Create a match room |
| GET | `/api/match/:id` | ❌ | Get match info (state, players) |
| POST | `/api/match/:id/start` | ✅ | Start countdown (creator only) |
| WS | `/api/match/:id/ws` | ❌* | Join and race (query params: userId, name) |

\* WebSocket auth is via query parameters, not JWT header.

## Room Lifecycle

```
[waiting] → [starting] → [racing] → [finished]
                3s countdown     30s max race
```

- Rooms auto-expire after **10 minutes**
- Players can join during `waiting` and `starting` states
- Each player gets their own Racer instance with staggered start positions
- Physics runs at **60 Hz** server-side (same as bot mode)
