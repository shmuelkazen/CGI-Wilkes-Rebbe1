import { useState, useEffect, useRef } from "react";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner } from "./UI";

export default function LandingPage({ onEmailSignIn, onEmailSignUp, onForgotPassword, onUpdatePassword, initialMode = "landing" }) {
  const [mode, setMode] = useState(initialMode); // landing | login | signup | forgot | newpassword
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const captchaRef = useRef(null);
  const captchaWidgetId = useRef(null);

  // Load hCaptcha script once
  useEffect(() => {
    if (document.getElementById("hcaptcha-script")) return;
    const script = document.createElement("script");
    script.id = "hcaptcha-script";
    script.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Render/reset captcha widget when mode changes to login or signup
  useEffect(() => {
    if (mode !== "login" && mode !== "signup") return;
    setCaptchaToken(null);
    const interval = setInterval(() => {
      if (window.hcaptcha && captchaRef.current) {
        clearInterval(interval);
        if (captchaWidgetId.current !== null) {
          try { window.hcaptcha.reset(captchaWidgetId.current); } catch (e) { /* ignore */ }
          try { window.hcaptcha.remove(captchaWidgetId.current); } catch (e) { /* ignore */ }
        }
        captchaRef.current.innerHTML = "";
        captchaWidgetId.current = window.hcaptcha.render(captchaRef.current, {
          sitekey: "0fa260b6-dc36-488e-926e-162609f20dae",
          theme: "dark",
          callback: (token) => setCaptchaToken(token),
          "expired-callback": () => setCaptchaToken(null),
          "error-callback": () => setCaptchaToken(null),
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (mode === "forgot") {
      if (!email) return setError("Please enter your email address.");
    } else if (mode === "newpassword") {
      if (!password) return setError("Please enter a new password.");
      if (password.length < 6) return setError("Password must be at least 6 characters.");
      if (password !== confirmPassword) return setError("Passwords do not match.");
    } else {
      if (!email) return setError("Please enter your email address.");
      if (!password) return setError("Please fill in all fields.");
      if (mode === "signup" && (!firstName.trim() || !lastName.trim())) return setError("First and last name are required.");
      if (password.length < 6) return setError("Password must be at least 6 characters.");
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await onEmailSignIn(email, password, captchaToken);
      } else if (mode === "signup") {
        await onEmailSignUp(email, password, firstName.trim(), lastName.trim(), captchaToken);
      } else if (mode === "forgot") {
        await onForgotPassword(email);
        setSuccess("Check your email for a password reset link.");
      } else if (mode === "newpassword") {
        await onUpdatePassword(password);
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setCaptchaToken(null);
      if (window.hcaptcha && captchaWidgetId.current !== null) {
        try { window.hcaptcha.reset(captchaWidgetId.current); } catch (e) { /* ignore */ }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
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
        <div style={{ position: "absolute", top: 12, right: 16, color: "#fff", fontSize: 15, fontWeight: "bold", fontFamily: "serif", textShadow: "0 1px 3px rgba(0,0,0,.3)" }}>בס״ד</div>
        <div style={{ animation: "fadeIn .5s ease", maxWidth: 420, width: "100%" }}>
          <img src="/logo.png" alt="CGI Wilkes Rebbe" style={{ width: 100, height: 100, objectFit: "contain", marginBottom: 8 }} />
          <h1 style={{ fontFamily: font.display, fontSize: "clamp(32px, 6vw, 52px)", color: "#fff", lineHeight: 1.1, marginBottom: 12 }}>CGI Wilkes Rebbe</h1>
          <p style={{ color: "rgba(255,255,255,.8)", fontSize: 18, maxWidth: 440, margin: "0 auto 8px", lineHeight: 1.5 }}>Summer 5786 - 2026 Registration</p>
          <p style={{ color: "rgba(255,255,255,.5)", fontSize: 14, maxWidth: 440, margin: "0 auto 32px", lineHeight: 1.6 }}>New registration system<br />All families please create an account</p>

          <button onClick={() => switchMode("signup")} style={{ ...s.btn("primary"), background: colors.white, color: colors.forest, fontSize: 16, padding: "14px 32px", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,.15)", gap: 12, width: "100%", justifyContent: "center", marginBottom: 12 }}>
            Create your account
          </button>
          <button onClick={() => switchMode("login")} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.7)", fontSize: 14, padding: "10px 20px", width: "100%", justifyContent: "center" }}>
            Already set up? <span style={{ color: "#fff", fontWeight: 600, textDecoration: "underline", marginLeft: 4 }}>Sign in</span>
          </button>

          <div style={{ marginTop: 32, fontSize: 12, color: "rgba(255,255,255,.4)" }}>
            <a href="/privacy.html" style={{ color: "rgba(255,255,255,.5)", textDecoration: "underline" }}>Privacy Policy</a>
          </div>
        </div>
      </div>
    );
  }

  // Form views: login | signup | forgot | newpassword
  const titles = {
    login: "Welcome Back",
    signup: "Create Account",
    forgot: "Reset Password",
    newpassword: "Set New Password",
  };
  const subtitles = {
    login: "Sign in to manage your registrations",
    signup: "Register to sign up your campers",
    forgot: "Enter your email and we'll send you a reset link",
    newpassword: "Enter your new password below",
  };
  const buttonLabels = {
    login: "Sign In",
    signup: "Create Account",
    forgot: "Send Reset Link",
    newpassword: "Update Password",
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: `linear-gradient(170deg, ${colors.forest} 0%, ${colors.forestLight} 50%, ${colors.amber} 150%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ position: "absolute", top: 12, right: 16, color: "#fff", fontSize: 15, fontWeight: "bold", fontFamily: "serif", textShadow: "0 1px 3px rgba(0,0,0,.3)" }}>בס״ד</div>
      <div style={{ animation: "fadeIn .35s ease", maxWidth: 400, width: "100%" }}>
        {/* Back button — not on newpassword since they arrived via email link */}
        {mode !== "newpassword" && (
          <button onClick={() => switchMode("landing")} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.7)", padding: "6px 0", marginBottom: 20, fontSize: 14 }}>
            {Icons.arrowLeft({ size: 16, color: "rgba(255,255,255,.7)" })} Back
          </button>
        )}

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/logo.png" alt="CGI Wilkes Rebbe" style={{ width: 56, height: 56, objectFit: "contain" }} />
          <h2 style={{ fontFamily: font.display, color: "#fff", fontSize: 28, marginTop: 8 }}>
            {titles[mode]}
          </h2>
          <p style={{ color: "rgba(255,255,255,.6)", fontSize: 14, marginTop: 4 }}>
            {subtitles[mode]}
          </p>
        </div>

        <style>{placeholderCSS}</style>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Full name — signup only */}
          {mode === "signup" && (
            <div style={{ display: "flex", gap: 10 }}>
              <input
                className="auth-input"
                type="text"
                placeholder="First Name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={inputStyle}
                required
              />
              <input
                className="auth-input"
                type="text"
                placeholder="Last Name *"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          )}

          {/* Email — login, signup, forgot (not newpassword) */}
          {mode !== "newpassword" && (
            <input
              className="auth-input"
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          )}

          {/* Password — login, signup (not forgot, not newpassword) */}
          {(mode === "login" || mode === "signup") && (
            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          )}

          {/* New password + confirm — newpassword only */}
          {mode === "newpassword" && (
            <>
              <input
                className="auth-input"
                type="password"
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
              <input
                className="auth-input"
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={inputStyle}
              />
            </>
          )}

          {/* hCaptcha — login and signup only */}
          {(mode === "login" || mode === "signup") && (
            <div ref={captchaRef} style={{ display: "flex", justifyContent: "center", minHeight: 78 }} />
          )}

          {/* Error message */}
          {error && (
            <div style={{ background: "rgba(220,74,58,.15)", border: "1px solid rgba(220,74,58,.3)", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13 }}>
              {Icons.alertCircle({ size: 14, color: "#fca5a5" })} {error}
            </div>
          )}

          {/* Success message */}
          {success && (
            <div style={{ background: "rgba(45,122,69,.15)", border: "1px solid rgba(45,122,69,.3)", borderRadius: 8, padding: "10px 14px", color: "#86efac", fontSize: 13 }}>
              {success}
            </div>
          )}

          {/* Submit button — hide after forgot password success */}
          {!success && (
            <button type="submit" disabled={submitting} style={{ ...s.btn("primary"), background: colors.white, color: colors.forest, fontSize: 15, padding: "13px 28px", borderRadius: 12, width: "100%", justifyContent: "center", marginTop: 4 }}>
              {submitting ? <Spinner size={18} /> : buttonLabels[mode]}
            </button>
          )}
        </form>

        {/* Forgot password link — login only */}
        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button onClick={() => switchMode("forgot")} style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
              Forgot your password?
            </button>
          </div>
        )}

        {/* Toggle login/signup — login and signup only */}
        {(mode === "login" || mode === "signup") && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <span style={{ color: "rgba(255,255,255,.5)", fontSize: 14 }}>
              {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button onClick={() => switchMode(mode === "login" ? "signup" : "login")} style={{ background: "none", border: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
              {mode === "login" ? "Sign Up" : "Sign In"}
            </button>
          </div>
        )}

        {/* Back to sign in — forgot only */}
        {mode === "forgot" && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => switchMode("login")} style={{ background: "none", border: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
              Back to Sign In
            </button>
          </div>  
        )}

        {/* Privacy link — all form views */}
        <div style={{ marginTop: 32, fontSize: 12, color: "rgba(255,255,255,.4)", textAlign: "center" }}>
          <a href="/privacy.html" style={{ color: "rgba(255,255,255,.5)", textDecoration: "underline" }}>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}