import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { neon, bg, border, text, font, glow } from "../theme";

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <nav style={styles.nav}>
      <Link to="/" style={styles.brand}>
        🏎️ CodeRace
      </Link>

      <div style={styles.links}>
        <Link to="/tracksets" style={styles.link}>
          Tracksets
        </Link>
      </div>

      <div style={styles.right}>
        {user ? (
          <>
            <span style={styles.name}>{user.displayName}</span>
            {user.isAdmin && <span style={styles.badge}>admin</span>}
            <button onClick={handleLogout} style={styles.btn}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={styles.btn}>
              Login
            </Link>
            <Link to="/register" style={{ ...styles.btn, background: neon.pink, color: "#fff", boxShadow: glow.pink }}>
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "10px 24px",
    background: bg.dark,
    borderBottom: `1px solid ${border.default}`,
    fontFamily: font.sans,
    position: "sticky",
    top: 0,
    zIndex: 1000,
  },
  brand: {
    fontWeight: 800,
    fontSize: 18,
    color: neon.pink,
    textDecoration: "none",
    marginRight: 16,
    fontFamily: font.mono,
    textShadow: glow.pink,
    letterSpacing: "-0.5px",
  },
  links: {
    display: "flex",
    gap: 4,
    flex: 1,
  },
  link: {
    color: text.secondary,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: 6,
    transition: "all 0.15s ease",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  name: {
    color: neon.green,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: font.mono,
    textShadow: "0 0 6px rgba(132,204,22,0.25)",
  },
  badge: {
    fontSize: 9,
    background: "#261600",
    color: neon.orange,
    padding: "2px 8px",
    borderRadius: 4,
    textTransform: "uppercase",
    fontWeight: 700,
    letterSpacing: "0.5px",
    border: `1px solid rgba(255, 136, 0, 0.3)`,
  },
  btn: {
    padding: "6px 14px",
    background: bg.elevated,
    color: text.primary,
    border: `1px solid ${border.light}`,
    borderRadius: 6,
    cursor: "pointer",
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: font.sans,
    transition: "all 0.15s ease",
  },
};
