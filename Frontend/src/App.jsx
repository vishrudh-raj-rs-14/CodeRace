import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import NavBar from "./components/NavBar";
import RequireAuthRoute from "./components/RequireAuthRoute";
import MouseGlow from "./components/MouseGlow";
import HomePage from "./pages/HomePage";
import GamePage from "./pages/GamePage";
import BotPage from "./pages/BotPage";
import TracksetListPage from "./pages/TracksetListPage";
import TracksetPlayPage from "./pages/TracksetPlayPage";
import TracksetEditorPage from "./pages/TracksetEditorPage";
import MatchPage from "./pages/MatchPage";
import PlaygroundPage from "./pages/PlaygroundPage";
import GuidePage from "./pages/GuidePage";
import LeaderboardPage from "./pages/LeaderboardPage";

function App() {
  const location = useLocation();
  const showNavBar = location.pathname !== "/";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <MouseGlow />
      {showNavBar && <NavBar />}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />

          {/* Protected routes — redirect to home if not authenticated */}
          <Route path="/tracksets" element={<RequireAuthRoute><TracksetListPage /></RequireAuthRoute>} />
          <Route path="/tracksets/new" element={<RequireAuthRoute><TracksetEditorPage /></RequireAuthRoute>} />
          <Route path="/tracksets/:id/edit" element={<RequireAuthRoute><TracksetEditorPage /></RequireAuthRoute>} />
          <Route path="/play/:id" element={<RequireAuthRoute><TracksetPlayPage /></RequireAuthRoute>} />
          <Route path="/playground" element={<RequireAuthRoute><PlaygroundPage /></RequireAuthRoute>} />
          <Route path="/match/:id" element={<RequireAuthRoute><MatchPage /></RequireAuthRoute>} />

          {/* Legacy routes */}
          <Route path="/game" element={<GamePage />} />
          <Route path="/bot" element={<BotPage />} />

          {/* Redirect old editor to trackset editor */}
          <Route path="/editor" element={<Navigate to="/tracksets" replace />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
