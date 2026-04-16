import { useState, useEffect, useCallback } from "react";
import sb, { ensureParentProfile, checkAdmin } from "./lib/supabase";
import { globalCSS, colors } from "./lib/styles";
import { Spinner, Toast } from "./components/UI";
import LandingPage from "./components/LandingPage";
import ParentDashboard from "./pages/ParentDashboard";
import AdminDashboard from "./pages/AdminDashboard";

export default function App() {
  const [view, setView] = useState("loading");
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const showToast = useCallback((msg) => setToast(msg), []);

  // Shared post-login routine
  const completeLogin = async (u) => {
    setUser(u);
    await ensureParentProfile(u);
    const admin = await checkAdmin(u.id);
    setIsAdmin(admin);
    setView(admin ? "admin" : "parent");
  };

  useEffect(() => {
    (async () => {
      // Check OAuth callback first
      const cbSession = await sb.handleOAuthCallback();
      if (cbSession) {
        await completeLogin(cbSession.user);
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

  // Google OAuth
  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    await sb.signInWithGoogle();
  };

  // Email/password sign in
  const handleEmailSignIn = async (email, password) => {
    const session = await sb.signInWithEmail(email, password);
    await completeLogin(session.user);
  };

  // Email/password sign up
  const handleEmailSignUp = async (email, password, fullName) => {
    const data = await sb.signUpWithEmail(email, password, fullName);
    // If Supabase requires email confirmation, data won't have access_token
    if (data.access_token && data.user) {
      await completeLogin(data.user);
    } else if (data.user && !data.access_token) {
      // Email confirmation required
      throw new Error("Check your email for a confirmation link, then come back and sign in.");
    } else {
      throw new Error("Something went wrong during signup.");
    }
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
          onSignIn={handleGoogleSignIn}
          onEmailSignIn={handleEmailSignIn}
          onEmailSignUp={handleEmailSignUp}
          loading={authLoading}
        />
      )}
      {view === "parent" && user && <ParentDashboard user={user} isAdmin={isAdmin} setView={setView} showToast={showToast} />}
      {view === "admin" && user && <AdminDashboard user={user} setView={setView} showToast={showToast} />}
    </>
  );
}
