import { useState, useEffect, useCallback } from "react";
import sb, { getActiveSeason, getSeasons } from "../lib/supabase";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner, EmptyState, StatusBadge, Modal, Field } from "../components/UI";

// ============================================================
// SESSION FORM MODAL
// ============================================================
function SessionModal({ session, onClose, onSave, saving }) {
  const isEdit = !!session;
  const [form, setForm] = useState({
    name: session?.name || "",
    dates: session?.dates || "",
    start_date: session?.start_date || "",
    end_date: session?.end_date || "",
    capacity: session?.capacity ?? 30,
    price_cents: session?.price_cents ?? 40000,
    age_min: session?.age_min ?? 6,
    age_max: session?.age_max ?? 15,
    description: session?.description || "",
    active: session?.active ?? true,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = () => {
    if (!form.name.trim()) return alert("Session name is required.");
    if (!form.dates.trim()) return alert("Display dates are required (e.g. 'Jun 16–20').");
    if (form.capacity < 1) return alert("Capacity must be at least 1.");
    if (form.price_cents < 0) return alert("Price can't be negative.");
    onSave({
      name: form.name.trim(),
      dates: form.dates.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      capacity: Number(form.capacity),
      price_cents: Number(form.price_cents),
      age_min: Number(form.age_min),
      age_max: Number(form.age_max),
      description: form.description.trim(),
      active: form.active,
    });
  };

  return (
    <Modal title={isEdit ? "Edit Session" : "Create Session"} onClose={onClose} width={540}>
      <Field label="Session Name *">
        <input style={s.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Adventure Week" />
      </Field>
      <Field label="Display Dates *">
        <input style={s.input} value={form.dates} onChange={(e) => set("dates", e.target.value)} placeholder="e.g. Jun 16–20" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="Start Date"><input type="date" style={s.input} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
        <Field label="End Date"><input type="date" style={s.input} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></Field>
        <Field label="Capacity *"><input type="number" style={s.input} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} min={1} /></Field>
        <Field label="Price (cents) *">
          <div style={{ position: "relative" }}>
            <input type="number" style={{ ...s.input, paddingRight: 60 }} value={form.price_cents} onChange={(e) => set("price_cents", e.target.value)} min={0} step={100} />
            <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(form.price_cents / 100).toFixed(2)}</span>
          </div>
        </Field>
        <Field label="Min Age"><input type="number" style={s.input} value={form.age_min} onChange={(e) => set("age_min", e.target.value)} min={1} max={20} /></Field>
        <Field label="Max Age"><input type="number" style={s.input} value={form.age_max} onChange={(e) => set("age_max", e.target.value)} min={1} max={20} /></Field>
      </div>
      <Field label="Description">
        <textarea style={{ ...s.input, minHeight: 70 }} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Brief description for parents…" />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
        Active (visible to parents)
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving} style={s.btn("primary")}>
          {saving ? <Spinner size={16} /> : isEdit ? "Save Changes" : "Create Session"}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// NEW SEASON MODAL
// ============================================================
function SeasonModal({ onClose, onSave, saving }) {
  const nextYear = new Date().getFullYear() + 1;
  const [form, setForm] = useState({ name: `Summer ${nextYear}`, year: nextYear });
  return (
    <Modal title="Create New Season" onClose={onClose} width={400}>
      <Field label="Season Name *"><input style={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Summer 2027" /></Field>
      <Field label="Year *"><input type="number" style={s.input} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
      <p style={{ fontSize: 13, color: colors.textMid, marginBottom: 20 }}>Creating a new season won't affect existing data. You can switch between seasons anytime.</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => { if (!form.name.trim()) return alert("Name is required."); onSave(form); }} disabled={saving} style={s.btn("primary")}>
          {saving ? <Spinner size={16} /> : "Create Season"}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// DISCOUNT CODE MODAL
// ============================================================
function DiscountCodeModal({ code, seasons, onClose, onSave, saving }) {
  const isEdit = !!code;
  const [form, setForm] = useState({
    code: code?.code || "",
    description: code?.description || "",
    type: code?.type || "flat",
    amount: code?.amount ?? 0,
    season_id: code?.season_id || "",
    max_uses: code?.max_uses ?? "",
    active: code?.active ?? true,
    expires_at: code?.expires_at ? code.expires_at.slice(0, 10) : "",
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title={isEdit ? "Edit Discount Code" : "Create Discount Code"} onClose={onClose} width={480}>
      <Field label="Code *">
        <input style={s.input} value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="e.g. EARLYBIRD" />
      </Field>
      <Field label="Description"><input style={s.input} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Early bird 10% off" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="Discount Type *">
          <select style={s.input} value={form.type} onChange={(e) => set("type", e.target.value)}>
            <option value="flat">Flat Amount ($)</option>
            <option value="percent">Percentage (%)</option>
          </select>
        </Field>
        <Field label={form.type === "percent" ? "Percent Off *" : "Amount Off (cents) *"}>
          <div style={{ position: "relative" }}>
            <input type="number" style={s.input} value={form.amount} onChange={(e) => set("amount", e.target.value)} min={0} />
            {form.type === "flat" && form.amount > 0 && (
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(form.amount / 100).toFixed(2)}</span>
            )}
            {form.type === "percent" && (
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>%</span>
            )}
          </div>
        </Field>
        <Field label="Season">
          <select style={s.input} value={form.season_id} onChange={(e) => set("season_id", e.target.value)}>
            <option value="">All Seasons</option>
            {seasons.map((sn) => <option key={sn.id} value={sn.id}>{sn.name}</option>)}
          </select>
        </Field>
        <Field label="Max Uses">
          <input type="number" style={s.input} value={form.max_uses} onChange={(e) => set("max_uses", e.target.value)} placeholder="Unlimited" min={1} />
        </Field>
        <Field label="Expires">
          <input type="date" style={s.input} value={form.expires_at} onChange={(e) => set("expires_at", e.target.value)} />
        </Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => {
          if (!form.code.trim()) return alert("Code is required.");
          if (Number(form.amount) <= 0) return alert("Amount must be greater than 0.");
          onSave({
            code: form.code.trim().toUpperCase(),
            description: form.description.trim(),
            type: form.type,
            amount: Number(form.amount),
            season_id: form.season_id || null,
            max_uses: form.max_uses ? Number(form.max_uses) : null,
            active: form.active,
            expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
          });
        }} disabled={saving} style={s.btn("primary")}>
          {saving ? <Spinner size={16} /> : isEdit ? "Save Changes" : "Create Code"}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// OFFLINE PAYMENT MODAL
// ============================================================
function OfflinePaymentModal({ registration, child, session, parent, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    amount_cents: registration.payment_amount_cents || session?.price_cents || 0,
    method: "cash",
    notes: "",
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title="Record Offline Payment" onClose={onClose} width={440}>
      <div style={{ background: colors.bg, borderRadius: 8, padding: 14, marginBottom: 20, fontSize: 14 }}>
        <div><strong>Camper:</strong> {child?.first_name} {child?.last_name}</div>
        <div><strong>Session:</strong> {session?.name}</div>
        <div><strong>Parent:</strong> {parent?.full_name}</div>
        <div><strong>Amount Due:</strong> ${((registration.payment_amount_cents || 0) / 100).toFixed(2)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="Amount Received (cents) *">
          <div style={{ position: "relative" }}>
            <input type="number" style={s.input} value={form.amount_cents} onChange={(e) => set("amount_cents", e.target.value)} min={0} />
            <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(form.amount_cents / 100).toFixed(2)}</span>
          </div>
        </Field>
        <Field label="Method *">
          <select style={s.input} value={form.method} onChange={(e) => set("method", e.target.value)}>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="zelle">Zelle</option>
            <option value="venmo">Venmo</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea style={{ ...s.input, minHeight: 60 }} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Check #1234, received at pickup" /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => {
          if (Number(form.amount_cents) <= 0) return alert("Amount must be greater than 0.");
          onSave({ amount_cents: Number(form.amount_cents), method: form.method, notes: form.notes.trim() });
        }} disabled={saving} style={s.btn("primary")}>
          {saving ? <Spinner size={16} /> : "Record Payment"}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
export default function AdminDashboard({ user, setView, showToast }) {
  const [tab, setTab] = useState("registrations");
  const [registrations, setRegistrations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [children, setChildren] = useState([]);
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSession, setFilterSession] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Season state
  const [seasons, setSeasons] = useState([]);
  const [activeSeason, setActiveSeason] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null); // what admin is viewing
  const [seasonModal, setSeasonModal] = useState(false);

  // Session CRUD state
  const [sessionModal, setSessionModal] = useState(null);
  const [saving, setSaving] = useState(false);

  // Discount codes state
  const [discountCodes, setDiscountCodes] = useState([]);
  const [discountModal, setDiscountModal] = useState(null); // null | "create" | code object

  // Offline payment modal
  const [paymentModal, setPaymentModal] = useState(null); // null | registration object

  const load = useCallback(async () => {
    try {
      const [allSeasons, active] = await Promise.all([getSeasons(), getActiveSeason()]);
      setSeasons(allSeasons || []);
      setActiveSeason(active);
      const viewingSeason = selectedSeason || active;
      if (!selectedSeason && active) setSelectedSeason(active);

      const [reg, ses, ch, par, codes] = await Promise.all([
        sb.query("registrations", { select: "*", filters: "&order=created_at.desc" }),
        sb.query("session_enrollment"),
        sb.query("children"),
        sb.query("parents"),
        sb.query("discount_codes", { filters: "&order=created_at.desc" }).catch(() => []),
      ]);

      // Filter sessions by selected season
      const seasonSessions = (ses || []).filter((s) => !viewingSeason || s.season_id === viewingSeason.id);
      const sessionIds = new Set(seasonSessions.map((s) => s.id));

      // Filter registrations to only those in current season's sessions
      const seasonRegs = (reg || []).filter((r) => sessionIds.has(r.session_id));

      setRegistrations(seasonRegs);
      setSessions(seasonSessions);
      setChildren(ch || []);
      setParents(par || []);
      setDiscountCodes(codes || []);
    } catch (e) {
      console.error("Admin load:", e);
    } finally { setLoading(false); }
  }, [selectedSeason]);

  useEffect(() => { load(); }, [load]);

  const handleSignOut = async () => { await sb.signOut(); window.location.reload(); };

  const childMap = Object.fromEntries((children || []).map((c) => [c.id, c]));
  const parentMap = Object.fromEntries((parents || []).map((p) => [p.id, p]));
  const sessionMap = Object.fromEntries((sessions || []).map((ses) => [ses.id, ses]));

  const updateRegistration = async (regId, updates) => {
    try {
      await sb.query("registrations", { method: "PATCH", body: updates, filters: `&id=eq.${regId}`, headers: { Prefer: "return=minimal" } });
      showToast("Updated!");
      load();
    } catch (e) { alert("Error: " + e.message); }
  };

  // ─── Season handlers ───
  const handleCreateSeason = async (data) => {
    setSaving(true);
    try {
      await sb.query("seasons", { method: "POST", body: { name: data.name.trim(), year: Number(data.year), active: false }, headers: { Prefer: "return=minimal" } });
      showToast("Season created!");
      setSeasonModal(false);
      load();
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };

  const handleSetActiveSeason = async (seasonId) => {
    try {
      // Deactivate all
      await sb.query("seasons", { method: "PATCH", body: { active: false }, filters: "&active=eq.true", headers: { Prefer: "return=minimal" } });
      // Activate selected
      await sb.query("seasons", { method: "PATCH", body: { active: true }, filters: `&id=eq.${seasonId}`, headers: { Prefer: "return=minimal" } });
      showToast("Active season updated!");
      load();
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleSwitchSeason = (seasonId) => {
    const s = seasons.find((x) => x.id === seasonId);
    if (s) { setSelectedSeason(s); setLoading(true); }
  };

  // ─── Session CRUD handlers ───
  const handleCreateSession = async (data) => {
    setSaving(true);
    try {
      await sb.query("sessions", {
        method: "POST",
        body: { ...data, season_id: selectedSeason?.id },
        headers: { Prefer: "return=minimal" },
      });
      showToast("Session created!");
      setSessionModal(null);
      load();
    } catch (e) { alert("Error creating session: " + e.message); }
    finally { setSaving(false); }
  };

  const handleUpdateSession = async (data) => {
    setSaving(true);
    try {
      await sb.query("sessions", {
        method: "PATCH",
        body: data,
        filters: `&id=eq.${sessionModal.id}`,
        headers: { Prefer: "return=minimal" },
      });
      showToast("Session updated!");
      setSessionModal(null);
      load();
    } catch (e) { alert("Error updating session: " + e.message); }
    finally { setSaving(false); }
  };

  const handleDeleteSession = async (sesId, sesName) => {
    const enrolled = sessions.find((ses) => ses.id === sesId)?.enrolled || 0;
    const msg = enrolled > 0
      ? `"${sesName}" has ${enrolled} enrolled camper(s). Deleting will remove their registrations too. Are you sure?`
      : `Delete session "${sesName}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await sb.query("sessions", { method: "DELETE", filters: `&id=eq.${sesId}` });
      showToast("Session deleted.");
      load();
    } catch (e) { alert("Error deleting session: " + e.message); }
  };

  const filtered = registrations.filter((r) => {
    if (filterSession !== "all" && r.session_id !== filterSession) return false;
    if (filterStatus !== "all" && r.status !== filterStatus && r.payment_status !== filterStatus) return false;
    if (search) {
      const child = childMap[r.child_id];
      const par = parentMap[r.parent_id];
      const term = search.toLowerCase();
      const haystack = `${child?.first_name || ""} ${child?.last_name || ""} ${par?.full_name || ""} ${par?.email || ""}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const rows = [["Child", "Age", "Parent", "Email", "Phone", "Session", "Status", "Payment", "Allergies", "Medical Notes", "Registered"]];
    filtered.forEach((r) => {
      const c = childMap[r.child_id];
      const p = parentMap[r.parent_id];
      const ses = sessionMap[r.session_id];
      const age = c?.date_of_birth ? Math.floor((Date.now() - new Date(c.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "";
      rows.push([
        `${c?.first_name || ""} ${c?.last_name || ""}`, age, p?.full_name || "", p?.email || "", p?.phone || "",
        ses?.name || "", r.status, r.payment_status, c?.allergies || "", c?.medical_notes || "",
        new Date(r.created_at).toLocaleDateString(),
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cgi-registrations-${selectedSeason?.name || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast("Exported!");
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}><Spinner size={32} /></div>;

  const totalRevenue = registrations.filter((r) => r.payment_status === "paid").reduce((sum, r) => sum + (r.payment_amount_cents || 0), 0);
  const totalPending = registrations.filter((r) => r.status === "pending").length;
  const totalConfirmed = registrations.filter((r) => r.status === "confirmed").length;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg }}>
      {/* Header */}
      <header style={{ background: colors.forest, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {Icons.trees({ color: "#fff", size: 24 })}
          <span style={{ fontFamily: font.display, color: "#fff", fontSize: 20 }}>CGI Wilkes Rebbe</span>
          <span style={s.badge("#fff")}>Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Season Switcher */}
          {seasons.length > 0 && (
            <select
              value={selectedSeason?.id || ""}
              onChange={(e) => handleSwitchSeason(e.target.value)}
              style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 6, padding: "5px 10px", fontSize: 13, cursor: "pointer" }}
            >
              {seasons.map((sn) => (
                <option key={sn.id} value={sn.id} style={{ color: "#333" }}>{sn.name}{sn.active ? " ✓" : ""}</option>
              ))}
            </select>
          )}
          <button onClick={() => setView("parent")} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.8)", padding: "6px 14px", fontSize: 13 }}>{Icons.home({ size: 14, color: "rgba(255,255,255,.8)" })} Parent View</button>
          <button onClick={handleSignOut} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.6)", padding: "6px 10px" }}>{Icons.logout({ size: 16, color: "rgba(255,255,255,.6)" })}</button>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: colors.textMid, fontWeight: 600, marginBottom: 4 }}>Total Registrations</div>
            <div style={{ fontFamily: font.display, fontSize: 28 }}>{registrations.length}</div>
          </div>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: colors.textMid, fontWeight: 600, marginBottom: 4 }}>Confirmed</div>
            <div style={{ fontFamily: font.display, fontSize: 28, color: colors.success }}>{totalConfirmed}</div>
          </div>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: colors.textMid, fontWeight: 600, marginBottom: 4 }}>Pending</div>
            <div style={{ fontFamily: font.display, fontSize: 28, color: colors.amber }}>{totalPending}</div>
          </div>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: colors.textMid, fontWeight: 600, marginBottom: 4 }}>Revenue (Paid)</div>
            <div style={{ fontFamily: font.display, fontSize: 28, color: colors.forest }}>${(totalRevenue / 100).toLocaleString()}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${colors.border}`, paddingBottom: 0 }}>
          {[
            { key: "registrations", label: "Registrations", icon: Icons.clipboard },
            { key: "sessions", label: "Sessions", icon: Icons.calendar },
            { key: "discounts", label: "Discounts", icon: Icons.dollar },
            { key: "seasons", label: "Seasons", icon: Icons.calendar },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              ...s.btn("ghost"), borderBottom: `2px solid ${tab === t.key ? colors.forest : "transparent"}`,
              color: tab === t.key ? colors.forest : colors.textMid, borderRadius: 0, padding: "10px 16px", fontWeight: 600, fontSize: 14,
            }}>
              {t.icon({ size: 15, color: tab === t.key ? colors.forest : colors.textMid })} {t.label}
            </button>
          ))}
        </div>

        {/* ═══ REGISTRATIONS TAB ═══ */}
        {tab === "registrations" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>{Icons.search({ size: 16, color: colors.textLight })}</span>
                <input style={{ ...s.input, paddingLeft: 36 }} placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select style={{ ...s.input, width: "auto", minWidth: 160 }} value={filterSession} onChange={(e) => setFilterSession(e.target.value)}>
                <option value="all">All Sessions</option>
                {sessions.map((ses) => <option key={ses.id} value={ses.id}>{ses.name}</option>)}
              </select>
              <select style={{ ...s.input, width: "auto", minWidth: 130 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="waitlisted">Waitlisted</option>
                <option value="cancelled">Cancelled</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
              <button onClick={exportCSV} style={s.btn("secondary")}>{Icons.download({ size: 14 })} Export CSV</button>
            </div>

            <div style={{ ...s.card, padding: 0, overflow: "auto" }}>
              {filtered.length === 0 ? (
                <EmptyState icon={Icons.clipboard} title="No registrations found" sub="Adjust your filters or wait for parents to register." />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg }}>
                      {["Camper", "Parent", "Session", "Status", "Payment", "Date", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: colors.textMid, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const c = childMap[r.child_id];
                      const p = parentMap[r.parent_id];
                      const ses = sessionMap[r.session_id];
                      const age = c?.date_of_birth ? Math.floor((Date.now() - new Date(c.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "?";
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c?.first_name} {c?.last_name}<div style={{ fontSize: 12, color: colors.textMid, fontWeight: 400 }}>Age {age}</div></td>
                          <td style={{ padding: "10px 14px" }}>{p?.full_name}<div style={{ fontSize: 12, color: colors.textMid }}>{p?.email}</div></td>
                          <td style={{ padding: "10px 14px" }}>{ses?.name}<div style={{ fontSize: 12, color: colors.textMid }}>{ses?.dates}</div></td>
                          <td style={{ padding: "10px 14px" }}><StatusBadge status={r.status} /></td>
                          <td style={{ padding: "10px 14px" }}><StatusBadge status={r.payment_status} /><div style={{ fontSize: 12, color: colors.textMid, marginTop: 2 }}>${((r.payment_amount_cents || 0) / 100).toFixed(0)}</div></td>
                          <td style={{ padding: "10px 14px", fontSize: 13, color: colors.textMid }}>{new Date(r.created_at).toLocaleDateString()}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {r.status === "pending" && <button onClick={() => updateRegistration(r.id, { status: "confirmed" })} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.success }}>{Icons.check({ size: 13, color: colors.success })} Confirm</button>}
                              {r.payment_status === "unpaid" && <button onClick={() => updateRegistration(r.id, { payment_status: "paid" })} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.forest }}>{Icons.dollar({ size: 13, color: colors.forest })} Mark Paid</button>}
                              {r.payment_status === "unpaid" && <button onClick={() => setPaymentModal(r)} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.sky }}>Record Payment</button>}
                              {r.status !== "cancelled" && <button onClick={() => { if (window.confirm("Cancel this registration?")) updateRegistration(r.id, { status: "cancelled" }); }} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.coral }}>{Icons.x({ size: 13, color: colors.coral })}</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ═══ SESSIONS TAB ═══ */}
        {tab === "sessions" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: colors.textMid }}>{sessions.length} session{sessions.length !== 1 ? "s" : ""} in {selectedSeason?.name || "—"}</div>
              <button onClick={() => setSessionModal("create")} style={s.btn("primary")}>{Icons.plus({ size: 16, color: "#fff" })} Add Session</button>
            </div>

            {sessions.length === 0 ? (
              <div style={s.card}>
                <EmptyState icon={Icons.calendar} title="No sessions yet" sub={`Create your first session for ${selectedSeason?.name || "this season"}.`} />
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {sessions.map((ses) => (
                  <div key={ses.id} style={{ ...s.card, opacity: ses.active === false ? 0.55 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontFamily: font.display, fontSize: 18 }}>{ses.name}</span>
                          {ses.active === false && <span style={s.badge(colors.textMid)}>Inactive</span>}
                        </div>
                        <div style={{ fontSize: 14, color: colors.textMid, marginBottom: 4 }}>
                          {ses.dates} · Ages {ses.age_min}–{ses.age_max} · ${(ses.price_cents / 100).toFixed(0)}/camper
                        </div>
                        {ses.description && <div style={{ fontSize: 13, color: colors.textLight, marginBottom: 8 }}>{ses.description}</div>}
                        <div style={{ fontSize: 13, color: colors.textMid }}>{ses.enrolled || 0} registered</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-start" }}>
                        <button onClick={() => setSessionModal(ses)} style={{ ...s.btn("secondary"), padding: "7px 12px", fontSize: 13 }}>
                          {Icons.edit({ size: 14 })} Edit
                        </button>
                        <button onClick={() => handleDeleteSession(ses.id, ses.name)} style={{ ...s.btn("ghost"), padding: "7px 10px", color: colors.coral }}>
                          {Icons.trash({ size: 14, color: colors.coral })}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ DISCOUNTS TAB ═══ */}
        {tab === "discounts" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: colors.textMid }}>{discountCodes.length} discount code{discountCodes.length !== 1 ? "s" : ""}</div>
              <button onClick={() => setDiscountModal("create")} style={s.btn("primary")}>{Icons.plus({ size: 16, color: "#fff" })} Create Code</button>
            </div>

            {discountCodes.length === 0 ? (
              <div style={s.card}>
                <EmptyState icon={Icons.dollar} title="No discount codes" sub="Create a code for early bird, sibling discounts, or promos." />
              </div>
            ) : (
              <div style={{ ...s.card, padding: 0, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg }}>
                      {["Code", "Description", "Discount", "Uses", "Expires", "Status", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: colors.textMid }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {discountCodes.map((dc) => (
                      <tr key={dc.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                        <td style={{ padding: "10px 14px", fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{dc.code}</td>
                        <td style={{ padding: "10px 14px", color: colors.textMid }}>{dc.description || "—"}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                          {dc.type === "percent" ? `${dc.amount}%` : `$${(dc.amount / 100).toFixed(0)}`} off
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {dc.times_used || 0}{dc.max_uses ? ` / ${dc.max_uses}` : ""}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 13, color: colors.textMid }}>
                          {dc.expires_at ? new Date(dc.expires_at).toLocaleDateString() : "Never"}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <StatusBadge status={dc.active ? "confirmed" : "cancelled"} />
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => setDiscountModal(dc)} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12 }}>{Icons.edit({ size: 13 })} Edit</button>
                            <button onClick={async () => {
                              if (!window.confirm(`Delete code "${dc.code}"?`)) return;
                              try {
                                await sb.query("discount_codes", { method: "DELETE", filters: `&id=eq.${dc.id}` });
                                showToast("Deleted!");
                                load();
                              } catch (e) { alert("Error: " + e.message); }
                            }} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.coral }}>{Icons.trash({ size: 13, color: colors.coral })}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══ SEASONS TAB ═══ */}
        {tab === "seasons" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: colors.textMid }}>{seasons.length} season{seasons.length !== 1 ? "s" : ""}</div>
              <button onClick={() => setSeasonModal(true)} style={s.btn("primary")}>{Icons.plus({ size: 16, color: "#fff" })} New Season</button>
            </div>

            {seasons.length === 0 ? (
              <div style={s.card}>
                <EmptyState icon={Icons.calendar} title="No seasons" sub="Create your first season to get started." />
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {seasons.map((sn) => (
                  <div key={sn.id} style={{ ...s.card, border: sn.active ? `2px solid ${colors.forest}` : `1px solid ${colors.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontFamily: font.display, fontSize: 18 }}>{sn.name}</span>
                          {sn.active && <span style={s.badge(colors.success)}>Active</span>}
                        </div>
                        <div style={{ fontSize: 13, color: colors.textMid }}>Year: {sn.year}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {!sn.active && (
                          <button onClick={() => handleSetActiveSeason(sn.id)} style={s.btn("primary")}>
                            Set as Active
                          </button>
                        )}
                        <button onClick={() => { setSelectedSeason(sn); setTab("sessions"); setLoading(true); }} style={s.btn("secondary")}>
                          View Sessions
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {sessionModal && (
        <SessionModal
          session={sessionModal === "create" ? null : sessionModal}
          onClose={() => setSessionModal(null)}
          onSave={sessionModal === "create" ? handleCreateSession : handleUpdateSession}
          saving={saving}
        />
      )}
      {seasonModal && (
        <SeasonModal onClose={() => setSeasonModal(false)} onSave={handleCreateSeason} saving={saving} />
      )}
      {discountModal && (
        <DiscountCodeModal
          code={discountModal === "create" ? null : discountModal}
          seasons={seasons}
          onClose={() => setDiscountModal(null)}
          onSave={async (data) => {
            setSaving(true);
            try {
              if (discountModal === "create") {
                await sb.query("discount_codes", { method: "POST", body: data, headers: { Prefer: "return=minimal" } });
                showToast("Discount code created!");
              } else {
                await sb.query("discount_codes", { method: "PATCH", body: data, filters: `&id=eq.${discountModal.id}`, headers: { Prefer: "return=minimal" } });
                showToast("Discount code updated!");
              }
              setDiscountModal(null);
              load();
            } catch (e) { alert("Error: " + e.message); }
            finally { setSaving(false); }
          }}
          saving={saving}
        />
      )}
      {paymentModal && (
        <OfflinePaymentModal
          registration={paymentModal}
          child={childMap[paymentModal.child_id]}
          session={sessionMap[paymentModal.session_id]}
          parent={parentMap[paymentModal.parent_id]}
          onClose={() => setPaymentModal(null)}
          onSave={async (data) => {
            setSaving(true);
            try {
              // Create payment record
              await sb.query("payments", {
                method: "POST",
                body: {
                  parent_id: paymentModal.parent_id,
                  registration_id: paymentModal.id,
                  amount_cents: data.amount_cents,
                  provider: "offline",
                  provider_payment_id: null,
                  status: "completed",
                  method: data.method,
                  notes: data.notes,
                },
                headers: { Prefer: "return=minimal" },
              });
              // Update registration
              await sb.query("registrations", {
                method: "PATCH",
                body: { payment_status: "paid", status: "confirmed" },
                filters: `&id=eq.${paymentModal.id}`,
                headers: { Prefer: "return=minimal" },
              });
              showToast("Payment recorded!");
              setPaymentModal(null);
              load();
            } catch (e) { alert("Error: " + e.message); }
            finally { setSaving(false); }
          }}
          saving={saving}
        />
      )}
    </div>
  );
}