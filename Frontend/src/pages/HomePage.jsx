import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useDragControls } from "framer-motion";
import { GoogleLogin } from "@react-oauth/google";
import { neon, bg, text, font, glow, border, radius } from "../theme";
import { useAuth } from "../context/AuthContext";
import { googleLogin } from "../api";

export default function HomePage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [bootSequence, setBootSequence] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeCommand, setActiveCommand] = useState(null);
  const [authError, setAuthError] = useState("");
  const controls = useDragControls();
  const terminalRef = useRef(null);

  const errorParam = searchParams.get("error");
  const loginParam = searchParams.get("login");

  useEffect(() => {
    if (errorParam === "unauthorized") {
      setAuthError("401 Unauthorized. Login required to execute this command.");
      setActiveCommand("./protected_module.sh");
    } else if (loginParam === "true") {
      setAuthError("Authentication required.");
      setActiveCommand("./auth.sh");
    }
  }, [errorParam, loginParam]);

  const lines = [
    { text: "Initializing kernel modules...", wait: 200 },
    { text: "Mounting vfs...", wait: 150 },
    { text: "Loading custom track physics...", wait: 400 },
    { text: "Setting container jail policies [nsjail]...", wait: 300 },
    { text: "Binding Python 3.12 sandbox environment...", wait: 600 },
    { text: "[OK] Game Engine ready.", wait: 200, color: neon.green },
  ];

  useEffect(() => {
    if (bootSequence < lines.length) {
      const timer = setTimeout(() => setBootSequence(curr => curr + 1), lines[bootSequence].wait);
      return () => clearTimeout(timer);
    }
  }, [bootSequence]);

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setAuthError(""); // Clear errors
      const userData = await googleLogin(credentialResponse.credential);
      login(userData);
      setActiveCommand(null); // Clear active auth prompt on success
      if (searchParams.has("login") || searchParams.has("error")) {
        setSearchParams({});
      }
    } catch (err) {
      console.error("Login failed", err);
      setAuthError(err.message || "Failed to validate Google Session. Check Client ID and Backend logs.");
    }
  };

  const handleMenuClick = (e, path, cmd) => {
    if (!user && path !== "/guide") {
      e.preventDefault();
      setActiveCommand(cmd);
      setAuthError(`401 Unauthorized. Login required to execute '${cmd}'.`);
    }
  };

  const bootFinished = bootSequence >= lines.length;

  return (
    <div style={styles.page}>
      <div style={styles.gridBackground} />
      
      {/* Decorative floating decorative background elements */}
      <div style={styles.floatingDecoTopLeft}>{"<system.core>"}<br/>0x8AA70<br/>VIRT_MEM</div>
      <div style={styles.floatingDecoBottomRight}>[status: ONLINE]<br/>LAT: 12ms<br/>UPLINK: ACTV</div>
      <div style={styles.floatingDecoMiddleRight}>{`// ENGINE_TICK\nfps: 60\nphysics: calc\nsync: ...ok`}</div>
      <div style={styles.floatingDecoBottomLeft}>{`> mount -t proc proc /proc\n> exec /bin/sh...`}</div>

      <motion.div
        ref={terminalRef}
        drag={!isMaximized}
        dragControls={controls}
        dragListener={false}
        dragMomentum={false}
        animate={isMaximized ? { x: 0, y: 0, width: "100vw", height: "calc(100vh - 55px)", borderRadius: 0 } : { width: 1000, height: 600, borderRadius: radius.md }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        style={{...styles.terminal, position: isMaximized ? 'fixed' : 'relative', top: isMaximized ? 0 : 'auto', zIndex: 10}}
      >
        <div style={styles.header} onPointerDown={(e) => controls.start(e)}>
          <div style={styles.dots}>
            <div style={{ ...styles.dot, background: "#ff5f56" }} />
            <div style={{ ...styles.dot, background: "#ffbd2e" }} />
            <div onClick={() => setIsMaximized(!isMaximized)} style={{ ...styles.dot, background: "#27c93f", cursor: "pointer" }} />
          </div>
          <div style={styles.headerTitle}>coderace@root:~</div>
          <div style={styles.headerSpacer} />
        </div>

        <div style={styles.body}>
          <div style={styles.bootLog}>
            {lines.slice(0, bootSequence).map((line, i) => (
              <div key={i} style={{ color: line.color || text.dim }}>
                <span style={{ color: neon.purple }}>root@sys:~#</span> {line.text}
              </div>
            ))}
            {bootSequence < lines.length && (
              <div style={styles.cursorBlock} />
            )}
          </div>

          {bootFinished && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div style={styles.asciiArt}>
{`   ____          __     ____                
  / __ \\____  __/ /__  / __ \\____  ________ 
 / / / / __ \\/ / / _ \\/ /_/ / __ \\/ ___/ _ \\
/ /_/ / /_/ / / /  __/ _, _/ /_/ / /__/  __/
\\____/\\____/_/_/\\___/_/ |_|\\__,_/\\___/\\___/ `}
              </div>

              <div style={styles.promptLine}>
                <span style={styles.promptUser}>guest@coderace</span>:<span style={styles.promptDir}>~/menu</span>$ ./show_menu.sh
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={styles.menu}>
                  <div style={{ color: text.secondary, marginBottom: 16 }}>
                    Welcome{user ? " back, " + user.displayName : ""}. Select a command to continue:
                  </div>
                  
                  <div style={styles.buttonGroup}>
                    <Link to="/tracksets" onClick={(e) => handleMenuClick(e, "/tracksets", "./browse_tracksets.sh")} style={{...styles.cmdBtn, borderColor: neon.blue, color: neon.blue, boxShadow: `0 0 10px ${neon.blue}33`}}>
                      <span>[1]</span> Browse Tracksets
                    </Link>
                    <Link to="/tracksets/new" onClick={(e) => handleMenuClick(e, "/tracksets/new", "./create_trackset.sh")} style={{...styles.cmdBtn, borderColor: neon.green, color: neon.green, boxShadow: `0 0 10px ${neon.green}33`}}>
                      <span>[2]</span> Create Trackset
                    </Link>
                    <Link to="/playground" onClick={(e) => handleMenuClick(e, "/playground", "./playground_sandbox.sh")} style={{...styles.cmdBtn, borderColor: neon.pink, color: neon.pink, boxShadow: `0 0 10px ${neon.pink}33`}}>
                      <span>[3]</span> Playground Sandbox
                    </Link>
                    <Link to="/guide" style={{...styles.cmdBtn, borderColor: neon.orange, color: neon.orange, boxShadow: `0 0 10px ${neon.orange}33`}}>
                      <span>[4]</span> View Bot Guide
                    </Link>
                  </div>
                </div>
              </div>

              {activeCommand && !user && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 20 }}>
                  <div style={styles.promptLine}>
                    <span style={styles.promptUser}>guest@coderace</span>:<span style={styles.promptDir}>~</span>$ {activeCommand}
                  </div>
                  
                  <div style={styles.authBox}>
                    <div style={{ color: "#ff5f56", marginBottom: 15, fontWeight: "bold" }}>
                      [ERROR] {authError}
                    </div>
                    <div style={{ marginBottom: 15, color: text.secondary }}>
                      Initiating Google OAuth Handshake...
                    </div>
                    <div style={{ display: 'inline-block', background: '#fff', borderRadius: 4, padding: 2 }}>
                       <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => setAuthError("Google Login widget failed to load.")}
                        theme="outline"
                        text="continue_with"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              <div style={styles.activePrompt}>
                <span style={styles.promptUser}>{user ? user.displayName.toLowerCase().replace(/\s/g, '') : "guest"}@coderace</span>:<span style={styles.promptDir}>~</span>$ <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} style={styles.cursorBlockMain} />
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "calc(100vh - 55px)",
    background: bg.root,
    color: text.primary,
    fontFamily: font.mono,
    position: "relative",
    overflow: "hidden",
  },
  gridBackground: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundImage: `linear-gradient(rgba(132, 204, 22, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(132, 204, 22, 0.05) 1px, transparent 1px)`,
    backgroundSize: "40px 40px",
    backgroundPosition: "center center",
    zIndex: 0,
    maskImage: "radial-gradient(ellipse at center, black 0%, transparent 70%)",
  },
  terminal: {
    background: bg.dark,
    border: `1px solid ${border.light}`,
    boxShadow: `0 20px 60px rgba(0,0,0,0.8), ${glow.green}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    background: bg.panel,
    height: 36,
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    borderBottom: `1px solid ${border.default}`,
    cursor: "grab",
  },
  dots: {
    display: "flex",
    gap: 8,
    width: 60,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: text.secondary,
    fontSize: 13,
    fontWeight: 600,
  },
  headerSpacer: {
    width: 60,
  },
  body: {
    padding: 24,
    flex: 1,
    overflowY: "auto",
    fontSize: 14,
    lineHeight: 1.5,
  },
  bootLog: {
    marginBottom: 20,
    fontSize: 13,
  },
  cursorBlock: {
    display: "inline-block",
    width: 8,
    height: 14,
    background: neon.green,
    verticalAlign: "middle",
    marginLeft: 4,
  },
  asciiArt: {
    color: neon.pink,
    whiteSpace: "pre",
    marginBottom: 24,
    textShadow: `0 0 10px ${neon.pink}44`,
    fontSize: 12,
  },
  promptLine: {
    marginBottom: 16,
  },
  promptUser: {
    color: neon.green,
    fontWeight: "bold",
  },
  promptDir: {
    color: neon.blue,
    fontWeight: "bold",
  },
  menu: {
    padding: "0 0 20px 20px",
    borderLeft: `2px solid ${border.light}`,
  },
  buttonGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxWidth: 300,
  },
  cmdBtn: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid",
    borderRadius: 6,
    textDecoration: "none",
    fontWeight: "bold",
    transition: "all 0.2s ease",
    cursor: "pointer",
  },
  authBox: {
    padding: 24,
    background: "rgba(0, 0, 0, 0.5)",
    border: `1px dashed ${border.light}`,
    borderRadius: radius.md,
    marginBottom: 20,
  },
  activePrompt: {
    marginTop: 20,
  },
  cursorBlockMain: {
    display: "inline-block",
    width: 10,
    height: 18,
    background: "#fff",
    verticalAlign: "middle",
  },
  floatingDecoTopLeft: {
    position: "absolute",
    top: 40,
    left: 40,
    color: neon.green,
    opacity: 0.2,
    fontFamily: font.mono,
    fontSize: 10,
    lineHeight: 1.6,
  },
  floatingDecoBottomRight: {
    position: "absolute",
    bottom: 40,
    right: 40,
    color: neon.blue,
    opacity: 0.2,
    fontFamily: font.mono,
    fontSize: 10,
    textAlign: "right",
    lineHeight: 1.6,
  },
  floatingDecoMiddleRight: {
    position: "absolute",
    top: "40%",
    right: 40,
    color: neon.pink,
    opacity: 0.2,
    fontFamily: font.mono,
    fontSize: 10,
    textAlign: "right",
    lineHeight: 1.6,
    whiteSpace: "pre",
  },
  floatingDecoBottomLeft: {
    position: "absolute",
    bottom: 40,
    left: 40,
    color: text.secondary,
    opacity: 0.2,
    fontFamily: font.mono,
    fontSize: 10,
    lineHeight: 1.6,
    whiteSpace: "pre",
  }
};
