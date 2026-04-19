import { useState } from "react";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner } from "./UI";

export default function LandingPage({ onSignIn, onEmailSignIn, onEmailSignUp, loading }) {
  const [mode, setMode] = useState("landing"); // landing | login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) return setError("Please fill in all fields.");
    if (mode === "signup" && !fullName) return setError("Please enter your full name.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await onEmailSignIn(email, password);
      } else {
        await onEmailSignUp(email, password, fullName);
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    fontSize: 15,
    outline: "none",
    background: "rgba(255,255,255,.15)",
    border: "1px solid rgba(255,255,255,.25)",
    color: "#ffffff",
    WebkitTextFillColor: "#ffffff",
  };

  const placeholderCSS = `
    .auth-input::placeholder { color: rgba(255,255,255,.45); -webkit-text-fill-color: rgba(255,255,255,.45); }
    .auth-input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px rgba(26,74,58,.95) inset !important; -webkit-text-fill-color: #ffffff !important; }
  `;

  // Main landing view
  if (mode === "landing") {
    return (
      <div style={{ position: "relative", minHeight: "100vh", background: `linear-gradient(170deg, ${colors.forest} 0%, ${colors.forestLight} 50%, ${colors.amber} 150%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div style={{ position: "absolute", top: 12, right: 16, color: "rgba(255,255,255,.6)", fontSize: 13, fontFamily: "serif" }}>בס״ד</div>
        <div style={{ animation: "fadeIn .5s ease", maxWidth: 420, width: "100%" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{Icons.trees({ size: 64, color: "#fff" })}</div>
          <h1 style={{ fontFamily: font.display, fontSize: "clamp(32px, 6vw, 52px)", color: "#fff", lineHeight: 1.1, marginBottom: 12 }}>CGI Wilkes Rebbe</h1>
          <p style={{ color: "rgba(255,255,255,.8)", fontSize: 18, maxWidth: 440, margin: "0 auto 36px", lineHeight: 1.5 }}>Summer 2026 Registration<br />Adventure awaits — sign up today!</p>

          {/* Google Sign In */}
          <button onClick={onSignIn} disabled={loading} style={{ ...s.btn("primary"), background: colors.white, color: colors.forest, fontSize: 16, padding: "14px 32px", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,.15)", gap: 12, width: "100%", justifyContent: "center", marginBottom: 12 }}>
            {loading ? <Spinner size={18} /> : <>{Icons.google({ size: 22 })} Sign in with Google</>}
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.25)" }} />
            <span style={{ color: "rgba(255,255,255,.5)", fontSize: 13, fontWeight: 500 }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.25)" }} />
          </div>

          {/* Email options */}
          <button onClick={() => setMode("login")} style={{ ...s.btn("secondary"), background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", fontSize: 15, padding: "13px 28px", borderRadius: 12, width: "100%", justifyContent: "center", marginBottom: 10 }}>
            Sign in with Email
          </button>
          <button onClick={() => setMode("signup")} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.7)", fontSize: 14, padding: "10px 20px", width: "100%", justifyContent: "center" }}>
            New parent? Create an account
          </button>

          <div style={{ marginTop: 32, fontSize: 12, color: "rgba(255,255,255,.4)" }}>
            <a href="/privacy.html" style={{ color: "rgba(255,255,255,.5)", textDecoration: "underline" }}>Privacy Policy</a>
          </div>
        </div>
      </div>
    );
  }

  // Login / Signup form
  return (
    <div style={{ position: "relative", minHeight: "100vh", background: `linear-gradient(170deg, ${colors.forest} 0%, ${colors.forestLight} 50%, ${colors.amber} 150%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ position: "absolute", top: 12, right: 16, color: "rgba(255,255,255,.6)", fontSize: 13, fontFamily: "serif" }}>בס״ד</div>
      <div style={{ animation: "fadeIn .35s ease", maxWidth: 400, width: "100%" }}>
        {/* Back button */}
        <button onClick={() => { setMode("landing"); setError(null); }} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.7)", padding: "6px 0", marginBottom: 20, fontSize: 14 }}>
          {Icons.arrowLeft({ size: 16, color: "rgba(255,255,255,.7)" })} Back
        </button>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {Icons.trees({ size: 40, color: "#fff" })}
          <h2 style={{ fontFamily: font.display, color: "#fff", fontSize: 28, marginTop: 8 }}>
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h2>
          <p style={{ color: "rgba(255,255,255,.6)", fontSize: 14, marginTop: 4 }}>
            {mode === "login" ? "Sign in to manage your registrations" : "Register to sign up your campers"}
          </p>
        </div>

        <style>{placeholderCSS}</style>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "signup" && (
            <input
              className="auth-input"
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={inputStyle}
            />
          )}
          <input
            className="auth-input"
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />

          {error && (
            <div style={{ background: "rgba(220,74,58,.15)", border: "1px solid rgba(220,74,58,.3)", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13 }}>
              {Icons.alertCircle({ size: 14, color: "#fca5a5" })} {error}
            </div>
          )}

          <button type="submit" disabled={submitting} style={{ ...s.btn("primary"), background: colors.white, color: colors.forest, fontSize: 15, padding: "13px 28px", borderRadius: 12, width: "100%", justifyContent: "center", marginTop: 4 }}>
            {submitting ? <Spinner size={18} /> : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {/* Toggle login/signup */}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <span style={{ color: "rgba(255,255,255,.5)", fontSize: 14 }}>
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }} style={{ background: "none", border: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
            {mode === "login" ? "Sign Up" : "Sign In"}
          </button>
        </div>

        {/* Divider back to Google */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "24px 0 16px" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.2)" }} />
          <span style={{ color: "rgba(255,255,255,.4)", fontSize: 12 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.2)" }} />
        </div>
        <button onClick={onSignIn} disabled={loading} style={{ ...s.btn("secondary"), background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontSize: 14, padding: "11px 24px", borderRadius: 10, width: "100%", justifyContent: "center", gap: 10 }}>
          {Icons.google({ size: 18 })} Continue with Google
        </button>

        <div style={{ marginTop: 32, fontSize: 12, color: "rgba(255,255,255,.4)", textAlign: "center" }}>
          <a href="/privacy.html" style={{ color: "rgba(255,255,255,.5)", textDecoration: "underline" }}>Privacy Policy</a>
        </div>
      </div>
    </div>  
  );
}