import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { login as apiLogin } from "../api";
import { useAuth } from "../context/AuthContext";
import { neon, bg, border, text, font, glow } from "../theme";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from || "/tracksets";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await apiLogin(email, password);
      login(user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <h2 style={{ margin: 0, marginBottom: 8, fontFamily: font.mono, fontWeight: 800, color: neon.blue, textShadow: "0 0 8px rgba(0,165,255,0.2)" }}>
          🏎️ Login
        </h2>
        {error && <div style={styles.error}>{error}</div>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          required
        />
        <button type="submit" style={styles.btn} disabled={loading}>
          {loading ? "Logging in…" : "Log In"}
        </button>
        <p style={{ fontSize: 13, color: text.secondary, margin: 0, fontFamily: font.sans }}>
          Don't have an account?{" "}
          <Link to="/register" style={{ color: neon.pink, textShadow: "0 0 4px rgba(228,111,255,0.2)" }}>
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: bg.root,
    fontFamily: font.sans,
    color: text.primary,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    background: bg.card,
    padding: 32,
    borderRadius: 12,
    border: `1px solid ${border.light}`,
    width: 360,
    boxShadow: "0 0 40px rgba(0,165,255,0.04)",
  },
  input: {
    background: bg.input,
    border: `1px solid ${border.default}`,
    borderRadius: 8,
    padding: "10px 14px",
    color: text.primary,
    fontFamily: font.mono,
    fontSize: 13,
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  },
  btn: {
    background: "#001a2a",
    border: `1px solid rgba(0,165,255,0.3)`,
    borderRadius: 8,
    color: neon.blue,
    fontWeight: 700,
    fontSize: 14,
    padding: "10px 0",
    cursor: "pointer",
    fontFamily: font.mono,
    boxShadow: glow.blue,
    transition: "all 0.15s ease",
  },
  error: {
    background: "#1a0a1f",
    color: neon.pink,
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 12,
    fontFamily: font.mono,
    border: `1px solid rgba(228,111,255,0.15)`,
  },
};
