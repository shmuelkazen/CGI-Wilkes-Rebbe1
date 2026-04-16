import { useState } from "react";
import sb from "../lib/supabase";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner } from "../components/UI";

export default function LandingPage({ onSignIn, loading }) {
  const [mode, setMode] = useState("landing"); // "landing" | "email-login" | "email-signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleEmailAuth = async (isSignUp) => {
    if (!email || !password) { setError("Please enter email and password"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setEmailLoading(true);
    setError("");
    setMessage("");
    try {
      if (isSignUp) {
        await sb.signUpWithEmail(email, password);
        setMessage("Check your email for a confirmation link, then sign in.");
        setMode("email-login");
      } else {
        await sb.signInWithEmail(email, password);
        window.location.reload();
      }
    } catch (e) {
      setError(e.message || "Authentication failed");
    }
    setEmailLoading(false);
  };

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: "1.5px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.1)",
    color: "#fff", fontSize: 15, fontFamily: font.body, outline: "none",
    boxSizing: "border-box", marginBottom: 10,
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(135deg, ${colors.primary} 0%, #1a5c2e 50%, #0d3b1a 100%)`,
      fontFamily: font.body,
    }}>
      <div style={{ textAlign: "center", padding: 40, maxWidth: 420 }}>
        <h1 style={{
          color: "#fff", fontSize: 38, fontFamily: font.heading,
          margin: "0 0 8px", textShadow: "0 2px 12px rgba(0,0,0,.2)",
        }}>CGI Wilkes Rebbe</h1>
        <p style={{ color: "rgba(255,255,255,.75)", fontSize: 17, margin: "0 0 36px" }}>Summer 2026 Registration</p>

        {mode === "landing" && (
          <>
            {/* Google sign-in */}
            <button onClick={onSignIn} disabled={loading} style={{
              ...s.button, width: "100%", background: "#fff", color: colors.text,
              padding: "14px 20px", fontSize: 16, fontWeight: 600, borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              opacity: loading ? 0.7 : 1, boxShadow: "0 4px 16px rgba(0,0,0,.15)",
              marginBottom: 12,
            }}>
              {loading ? <Spinner size={18} /> : <>{Icons.google({ size: 22 })} Sign in with Google</>}
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.2)" }} />
              <span style={{ color: "rgba(255,255,255,.5)", fontSize: 13 }}>or</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.2)" }} />
            </div>

            {/* Email options */}
            <button onClick={() => setMode("email-login")} style={{
              ...s.button, width: "100%", background: "rgba(255,255,255,.15)",
              color: "#fff", padding: "14px 20px", fontSize: 15, borderRadius: 12,
              border: "1.5px solid rgba(255,255,255,.2)", marginBottom: 10,
            }}>Sign in with Email</button>
            <button onClick={() => setMode("email-signup")} style={{
              ...s.button, width: "100%", background: "transparent",
              color: "rgba(255,255,255,.7)", padding: "10px 20px", fontSize: 14, borderRadius: 12,
              border: "none",
            }}>Don't have an account? Sign up</button>
          </>
        )}

        {(mode === "email-login" || mode === "email-signup") && (
          <>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 18 }}>
              {mode === "email-login" ? "Sign In" : "Create Account"}
            </h3>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              style={inputStyle} />
            <input type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} style={inputStyle}
              onKeyDown={(e) => e.key === "Enter" && handleEmailAuth(mode === "email-signup")} />

            {error && <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 10 }}>{error}</div>}
            {message && <div style={{ color: "#86efac", fontSize: 13, marginBottom: 10 }}>{message}</div>}

            <button onClick={() => handleEmailAuth(mode === "email-signup")} disabled={emailLoading} style={{
              ...s.button, width: "100%", background: "#fff", color: colors.primary,
              padding: "14px 20px", fontSize: 16, fontWeight: 700, borderRadius: 12,
              opacity: emailLoading ? 0.7 : 1, marginBottom: 12,
            }}>
              {emailLoading ? "..." : mode === "email-login" ? "Sign In" : "Create Account"}
            </button>

            <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
              <button onClick={() => { setMode("landing"); setError(""); setMessage(""); }}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,.6)", fontSize: 13, cursor: "pointer" }}>← Back</button>
              {mode === "email-login" ? (
                <button onClick={() => { setMode("email-signup"); setError(""); }}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.6)", fontSize: 13, cursor: "pointer" }}>Create account</button>
              ) : (
                <button onClick={() => { setMode("email-login"); setError(""); }}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.6)", fontSize: 13, cursor: "pointer" }}>Already have an account?</button>
              )}
            </div>
          </>
        )}

        <p style={{ color: "rgba(255,255,255,.4)", fontSize: 12, marginTop: 32 }}>
          Parents: sign in to register your campers for summer camp
        </p>
      </div>
    </div>
  );
}