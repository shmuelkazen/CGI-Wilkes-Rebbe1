// ============================================================
// ▸▸▸ CONFIGURE THESE TWO VALUES ◂◂◂
//   Find them: Supabase Dashboard → Settings → API
// ============================================================
const SUPABASE_URL = "https://skummroqvqwfjkiwarhp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrdW1tcm9xdnF3ZmpraXdhcmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTYzMzIsImV4cCI6MjA5MTg3MjMzMn0.LHpLgSzlZfIwI79WHsGdqeEnpbfXHcYdLPVS1xjukWM";

// ============================================================
// LIGHTWEIGHT SUPABASE CLIENT (no SDK dependency)
// ============================================================
const sb = {
  token: null,
  user: null,

  headers() {
    const h = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  },

  async query(table, { method = "GET", body, filters = "", select = "*", single = false, headers = {} } = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${filters}`;
    const opts = { method, headers: { ...this.headers(), ...headers } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.message || errJson.msg || errMsg;
      } catch {
        if (errText) errMsg = errText;
      }
      throw new Error(errMsg);
    }
    if (method === "DELETE" || res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    const data = JSON.parse(text);
    return single ? data[0] || null : data;
  },

  async getSession() {
    const stored = localStorage.getItem("sb_session");
    if (!stored) return null;
    try {
      const session = JSON.parse(stored);
      if (!session?.access_token) return null;
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
      });
      if (!res.ok) {
        if (session.refresh_token) {
          const ref = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({ refresh_token: session.refresh_token }),
          });
          if (ref.ok) {
            const newSession = await ref.json();
            this.setSession(newSession);
            return newSession;
          }
        }
        this.clearSession();
        return null;
      }
      const user = await res.json();
      this.token = session.access_token;
      this.user = user;
      return session;
    } catch {
      this.clearSession();
      return null;
    }
  },

  setSession(session) {
    localStorage.setItem("sb_session", JSON.stringify(session));
    this.token = session.access_token;
    this.user = session.user;
  },

  clearSession() {
    localStorage.removeItem("sb_session");
    this.token = null;
    this.user = null;
  },

  async signInWithEmail(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_description || err.msg || "Sign in failed");
    }
    const session = await res.json();
    this.setSession(session);
    return session;
  },

  async signUpWithEmail(email, password, firstName = "", lastName = "") {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({
        email,
        password,
        data: { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`.trim() },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_description || err.msg || "Sign up failed");
    }
    const data = await res.json();
    if (data.access_token) {
      this.setSession(data);
    }
    return data;
  },

  async resetPassword(email) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({
        email,
        redirect_to: window.location.origin,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_description || err.msg || "Failed to send reset email");
    }
    return true;
  },

  async updatePassword(newPassword) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_description || err.msg || "Failed to update password");
    }
    return await res.json();
  },

  // Handles recovery token from password reset email link
  async handleRecoveryCallback() {
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return null;
    const params = new URLSearchParams(hash.substring(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const type = params.get("type");
    if (!access_token) return null;

    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${access_token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!res.ok) return null;
    const user = await res.json();
    const session = { access_token, refresh_token, user };
    this.setSession(session);
    window.history.replaceState(null, "", window.location.pathname);
    return { session, type: type || "login" };
  },

  async signOut() {
    if (this.token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, apikey: SUPABASE_ANON_KEY },
      }).catch(() => {});
    }
    this.clearSession();
  },
};

// Helper functions
export async function ensureParentProfile(user) {
  try {
    const existing = await sb.query("parents", { filters: `&id=eq.${user.id}`, single: true });
    const meta = user.user_metadata || {};
    const firstName = meta.first_name || "";
    const lastName = meta.last_name || "";
    const fullName = meta.full_name || `${firstName} ${lastName}`.trim() || user.email?.split("@")[0] || "";
    if (!existing) {
      await sb.query("parents", {
        method: "POST",
        body: {
          id: user.id,
          email: user.email,
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
        },
        headers: { Prefer: "return=minimal" },
      });
    }
  } catch (e) {
    console.warn("Parent profile upsert:", e.message);
  }
}

export async function checkAdmin(userId) {
  try {
    const row = await sb.query("admin_users", { filters: `&id=eq.${userId}`, single: true });
    return !!row;
  } catch {
    return false;
  }
}

export async function getActiveSeason() {
  try {
    const row = await sb.query("seasons", { filters: "&active=eq.true", single: true });
    return row;
  } catch {
    return null;
  }
}

export async function getSeasons() {
  try {
    return await sb.query("seasons", { filters: "&order=year.desc" });
  } catch {
    return [];
  }
}

export default sb;