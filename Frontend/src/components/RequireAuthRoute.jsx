import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { bg, text, font } from "../theme";

/**
 * Wraps a route element so that unauthenticated visitors are sent to /login.
 * After login the user is redirected back to where they wanted to go.
 */
export default function RequireAuthRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 50px)",
          background: bg.root,
          color: text.muted,
          fontFamily: font.mono,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
