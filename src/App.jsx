import { useState, useEffect, useCallback } from "react";
import sb, { ensureParentProfile, checkAdmin } from "./lib/supabase";
import { globalCSS, colors } from "./lib/styles";
import { Spinner, Toast } from "./components/UI";
import LandingPage from "./components/LandingPage";
import ParentDashboard from "./pages/ParentDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import TshirtPage from "./pages/TshirtPage";

export default function App() {
  const [view, setView] = useState("loading");
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState(null);
  const [landingMode, setLandingMode] = useState("landing");
  const [pendingView, setPendingView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") || null;
  });

  const showToast = useCallback((msg) => setToast(msg), []);

  // Shared post-login routine
  const completeLogin = async (u) => {
    setUser(u);
    await ensureParentProfile(u);
    const admin = await checkAdmin(u.id);
    setIsAdmin(admin);
    if (pendingView === "tshirts") {
      setPendingView(null);
      setView("tshirts");
    } else {
      setView(admin ? "admin" : "parent");
    }
  };

  useEffect(() => {
    (async () => {
      // Check for recovery callback first (from password reset email link)
      const recovery = await sb.handleRecoveryCallback();
      if (recovery) {
        if (recovery.type === "recovery") {
          // Show the "set new password" form
          setUser(recovery.session.user);
          setLandingMode("newpassword");
          setView("landing");
          return;
        }
        // Any other hash callback — just log in
        await completeLogin(recovery.session.user);
        return;
      }
      // Check existing session
      const session = await sb.getSession();
      if (session && sb.user) {
        await completeLogin(sb.user);
      } else {
        setView("landing");
      }
    })();
  }, []);

  // Email/password sign in
  const handleEmailSignIn = async (email, password) => {
    const session = await sb.signInWithEmail(email, password);
    await completeLogin(session.user);
  };

  // Email/password sign up
  const handleEmailSignUp = async (email, password, firstName, lastName) => {
    const data = await sb.signUpWithEmail(email, password, firstName, lastName);
    if (data.access_token && data.user) {
      await completeLogin(data.user);
    } else if (data.user && !data.access_token) {
      throw new Error("Check your email for a confirmation link, then come back and sign in.");
    } else {
      throw new Error("Something went wrong during signup.");
    }
  };

  // Forgot password
  const handleForgotPassword = async (email) => {
    await sb.resetPassword(email);
  };

  // Update password (after recovery)
  const handleUpdatePassword = async (newPassword) => {
    await sb.updatePassword(newPassword);
    await completeLogin(sb.user);
  };

  return (
    <>
      <style>{globalCSS}</style>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      {view === "loading" && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: colors.bg }}>
          <Spinner size={32} />
        </div>
      )}
      {view === "landing" && (
        <LandingPage
          onEmailSignIn={handleEmailSignIn}
          onEmailSignUp={handleEmailSignUp}
          onForgotPassword={handleForgotPassword}
          onUpdatePassword={handleUpdatePassword}
          initialMode={landingMode}
        />
      )}
      {view === "parent" && user && <ParentDashboard user={user} isAdmin={isAdmin} setView={setView} showToast={showToast} />}
      {view === "admin" && user && <AdminDashboard user={user} setView={setView} showToast={showToast} />}
      {view === "tshirts" && user && <TshirtPage user={user} setView={setView} showToast={showToast} />}
    </>
  );
}