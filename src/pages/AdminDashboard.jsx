import { useState, useEffect, useCallback } from "react";
import sb from "../lib/supabase";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner, EmptyState, StatusBadge, Modal, Field } from "../components/UI";

// ============================================================
// DIVISION FORM MODAL
// ============================================================
function DivisionModal({ division, onClose, onSave, saving }) {
  const isEdit = !!division;
  const [form, setForm] = useState({
    name: division?.name || "",
    description: division?.description || "",
    gender_filter: division?.gender_filter || "any",
    min_dob: division?.min_dob || "",
    max_dob: division?.max_dob || "",
    min_grade: division?.min_grade ?? "",
    max_grade: division?.max_grade ?? "",
    schedule_type: division?.schedule_type || "full_day",
    per_week_price: division?.per_week_price ?? 35000,
    sort_order: division?.sort_order ?? 0,
    active: division?.active ?? true,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title={isEdit ? "Edit Division" : "Create Division"} onClose={onClose} width={540}>
      <Field label="Division Name *">
        <input style={s.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Boys Division" />
      </Field>
      <Field label="Description">
        <input style={s.input} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Full day program for boys" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="Gender Filter *">
          <select style={s.input} value={form.gender_filter} onChange={(e) => set("gender_filter", e.target.value)}>
            <option value="any">Any</option>
            <option value="male">Boys Only</option>
            <option value="female">Girls Only</option>
          </select>
        </Field>
        <Field label="Schedule *">
          <select style={s.input} value={form.schedule_type} onChange={(e) => set("schedule_type", e.target.value)}>
            <option value="full_day">Full Day</option>
            <option value="half_day">Half Day</option>
          </select>
        </Field>
        <Field label="Min DOB (born on or after)">
          <input type="date" style={s.input} value={form.min_dob} onChange={(e) => set("min_dob", e.target.value)} />
        </Field>
        <Field label="Max DOB (born on or before)">
          <input type="date" style={s.input} value={form.max_dob} onChange={(e) => set("max_dob", e.target.value)} />
        </Field>
        <Field label="Price Per Week (cents) *">
          <div style={{ position: "relative" }}>
            <input type="number" style={{ ...s.input, paddingRight: 60 }} value={form.per_week_price} onChange={(e) => set("per_week_price", e.target.value)} min={0} step={100} />
            <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(form.per_week_price / 100).toFixed(2)}</span>
          </div>
        </Field>
        <Field label="Sort Order">
          <input type="number" style={s.input} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} min={0} />
        </Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
        Active (visible to parents)
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => {
          if (!form.name.trim()) return alert("Division name is required.");
          onSave({
            name: form.name.trim(),
            description: form.description.trim(),
            gender_filter: form.gender_filter,
            min_dob: form.min_dob || null,
            max_dob: form.max_dob || null,
            min_grade: form.min_grade !== "" ? Number(form.min_grade) : null,
            max_grade: form.max_grade !== "" ? Number(form.max_grade) : null,
            schedule_type: form.schedule_type,
            per_week_price: Number(form.per_week_price),
            sort_order: Number(form.sort_order),
            active: form.active,
          });
        }} disabled={saving} style={s.btn("primary")}>
          {saving ? <Spinner size={16} /> : isEdit ? "Save Changes" : "Create Division"}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// WEEK FORM MODAL
// ============================================================
function WeekModal({ week, division, onClose, onSave, saving }) {
  const isEdit = !!week;
  const [form, setForm] = useState({
    name: week?.name || "",
    start_date: week?.start_date || "",
    end_date: week?.end_date || "",
    price_override_cents: week?.price_override_cents ?? "",
    capacity: week?.capacity ?? 50,
    sort_order: week?.sort_order ?? 1,
    active: week?.active ?? true,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title={isEdit ? `Edit ${week.name}` : `Add Week to ${division?.name}`} onClose={onClose} width={480}>
      <Field label="Week Name *">
        <input style={s.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Week 1" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="Start Date *"><input type="date" style={s.input} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
        <Field label="End Date *"><input type="date" style={s.input} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></Field>
        <Field label="Capacity *"><input type="number" style={s.input} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} min={1} /></Field>
        <Field label="Price Override (cents)">
          <div style={{ position: "relative" }}>
            <input type="number" style={{ ...s.input, paddingRight: 60 }} value={form.price_override_cents} onChange={(e) => set("price_override_cents", e.target.value)} placeholder="Use division price" min={0} step={100} />
            {form.price_override_cents && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(form.price_override_cents / 100).toFixed(2)}</span>}
          </div>
        </Field>
        <Field label="Sort Order"><input type="number" style={s.input} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} min={0} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => {
          if (!form.name.trim()) return alert("Week name is required.");
          if (!form.start_date || !form.end_date) return alert("Dates are required.");
          onSave({
            name: form.name.trim(),
            start_date: form.start_date,
            end_date: form.end_date,
            price_override_cents: form.price_override_cents !== "" ? Number(form.price_override_cents) : null,
            capacity: Number(form.capacity),
            sort_order: Number(form.sort_order),
            active: form.active,
            division_id: division?.id,
          });
        }} disabled={saving} style={s.btn("primary")}>
          {saving ? <Spinner size={16} /> : isEdit ? "Save Changes" : "Add Week"}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// DISCOUNT CODE MODAL
// ============================================================
function DiscountCodeModal({ code, onClose, onSave, saving }) {
  const isEdit = !!code;
  const [form, setForm] = useState({
    code: code?.code || "",
    description: code?.description || "",
    discount_type: code?.discount_type || "percent",
    discount_value: code?.discount_value ?? 10,
    applies_to: code?.applies_to || "all",
    max_uses: code?.max_uses ?? "",
    active: code?.active ?? true,
    valid_from: code?.valid_from || "",
    valid_until: code?.valid_until || "",
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
          <select style={s.input} value={form.discount_type} onChange={(e) => set("discount_type", e.target.value)}>
            <option value="percent">Percentage (%)</option>
            <option value="fixed">Fixed Amount (cents)</option>
            <option value="per_week">Per Week (cents)</option>
          </select>
        </Field>
        <Field label={form.discount_type === "percent" ? "Percent Off *" : "Amount (cents) *"}>
          <input type="number" style={s.input} value={form.discount_value} onChange={(e) => set("discount_value", e.target.value)} min={0} />
        </Field>
        <Field label="Applies To">
          <select style={s.input} value={form.applies_to} onChange={(e) => set("applies_to", e.target.value)}>
            <option value="all">All Divisions</option>
            <option value="preschool">Preschool Only</option>
            <option value="boys">Boys Only</option>
            <option value="girls">Girls Only</option>
          </select>
        </Field>
        <Field label="Max Uses">
          <input type="number" style={s.input} value={form.max_uses} onChange={(e) => set("max_uses", e.target.value)} placeholder="Unlimited" min={1} />
        </Field>
        <Field label="Valid From"><input type="date" style={s.input} value={form.valid_from} onChange={(e) => set("valid_from", e.target.value)} /></Field>
        <Field label="Valid Until"><input type="date" style={s.input} value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => {
          if (!form.code.trim()) return alert("Code is required.");
          if (Number(form.discount_value) <= 0) return alert("Discount value must be greater than 0.");
          onSave({
            code: form.code.trim().toUpperCase(),
            description: form.description.trim(),
            discount_type: form.discount_type,
            discount_value: Number(form.discount_value),
            applies_to: form.applies_to,
            max_uses: form.max_uses ? Number(form.max_uses) : null,
            active: form.active,
            valid_from: form.valid_from || null,
            valid_until: form.valid_until || null,
          });
        }} disabled={saving} style={s.btn("primary")}>
          {saving ? <Spinner size={16} /> : isEdit ? "Save Changes" : "Create Code"}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// SETTINGS MODAL
// ============================================================
function SettingsModal({ settings, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    camp_name: settings.camp_name || "CGI Wilkes Rebbe",
    camp_season: settings.camp_season || "Summer 2026",
    early_bird_deadline: settings.early_bird_deadline || "",
    early_bird_discount_percent: settings.early_bird_discount_percent ?? 10,
    sibling_discount_type: settings.sibling_discount_type || "per_child",
    sibling_discount_value: settings.sibling_discount_value ?? 5,
    sibling_discount_starts_at: settings.sibling_discount_starts_at ?? 2,
    registration_open: settings.registration_open ?? true,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title="Camp Settings" onClose={onClose} width={500}>
      <Field label="Camp Name"><input style={s.input} value={form.camp_name} onChange={(e) => set("camp_name", e.target.value)} /></Field>
      <Field label="Season Name"><input style={s.input} value={form.camp_season} onChange={(e) => set("camp_season", e.target.value)} /></Field>
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Early Bird Discount</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field label="Deadline"><input type="date" style={s.input} value={form.early_bird_deadline} onChange={(e) => set("early_bird_deadline", e.target.value)} /></Field>
          <Field label="Discount %"><input type="number" style={s.input} value={form.early_bird_discount_percent} onChange={(e) => set("early_bird_discount_percent", e.target.value)} min={0} max={100} /></Field>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Sibling Discount</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field label="Discount % Per Sibling"><input type="number" style={s.input} value={form.sibling_discount_value} onChange={(e) => set("sibling_discount_value", e.target.value)} min={0} max={100} /></Field>
          <Field label="Starts at Child #"><input type="number" style={s.input} value={form.sibling_discount_starts_at} onChange={(e) => set("sibling_discount_starts_at", e.target.value)} min={2} /></Field>
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={form.registration_open} onChange={(e) => set("registration_open", e.target.checked)} /> Registration Open
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => onSave(form)} disabled={saving} style={s.btn("primary")}>
          {saving ? <Spinner size={16} /> : "Save Settings"}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// FAMILY LEDGER MODAL
// ============================================================
function LedgerModal({ ledger, parent, payments, onClose, onRecordPayment, onClearBalance, saving }) {
  const [payForm, setPayForm] = useState({ amount_cents: "", method: "cash", notes: "" });
  const [clearReason, setClearReason] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [showClear, setShowClear] = useState(false);

  const balance = (ledger?.total_due_cents || 0) - (ledger?.total_paid_cents || 0);

  return (
    <Modal title={`${parent?.full_name || "Family"} — Billing`} onClose={onClose} width={560}>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div style={{ ...s.card, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: colors.textMid, fontWeight: 600 }}>Total Due</div>
          <div style={{ fontFamily: font.display, fontSize: 22 }}>${((ledger?.total_due_cents || 0) / 100).toFixed(0)}</div>
        </div>
        <div style={{ ...s.card, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: colors.textMid, fontWeight: 600 }}>Paid</div>
          <div style={{ fontFamily: font.display, fontSize: 22, color: colors.success }}>${((ledger?.total_paid_cents || 0) / 100).toFixed(0)}</div>
        </div>
        <div style={{ ...s.card, padding: 14, textAlign: "center", border: balance > 0 ? `1px solid ${colors.amber}` : `1px solid ${colors.success}` }}>
          <div style={{ fontSize: 11, color: colors.textMid, fontWeight: 600 }}>Balance</div>
          <div style={{ fontFamily: font.display, fontSize: 22, color: balance > 0 ? colors.amber : colors.success }}>${(balance / 100).toFixed(0)}</div>
        </div>
      </div>

      {ledger?.balance_cleared && (
        <div style={{ background: colors.forestPale, border: `1px solid ${colors.success}`, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
          {Icons.check({ size: 14, color: colors.success })} <strong>Balance cleared</strong>{ledger.balance_cleared_reason ? `: ${ledger.balance_cleared_reason}` : ""}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => { setShowPay(!showPay); setShowClear(false); }} style={s.btn("primary")}>Record Payment</button>
        {!ledger?.balance_cleared && balance > 0 && (
          <button onClick={() => { setShowClear(!showClear); setShowPay(false); }} style={s.btn("secondary")}>Clear Balance</button>
        )}
      </div>

      {/* Record Payment Form */}
      {showPay && (
        <div style={{ ...s.card, marginBottom: 16, border: `1px solid ${colors.forest}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Record Offline Payment</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Amount (cents) *">
              <div style={{ position: "relative" }}>
                <input type="number" style={s.input} value={payForm.amount_cents} onChange={(e) => setPayForm({ ...payForm, amount_cents: e.target.value })} min={0} />
                {payForm.amount_cents > 0 && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(payForm.amount_cents / 100).toFixed(2)}</span>}
              </div>
            </Field>
            <Field label="Method *">
              <select style={s.input} value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="zelle">Zelle</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <Field label="Notes"><input style={s.input} value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} placeholder="e.g. Check #1234" /></Field>
          <button onClick={() => {
            if (!payForm.amount_cents || Number(payForm.amount_cents) <= 0) return alert("Enter an amount.");
            onRecordPayment({ amount_cents: Number(payForm.amount_cents), method: payForm.method, notes: payForm.notes.trim() });
            setPayForm({ amount_cents: "", method: "cash", notes: "" });
            setShowPay(false);
          }} disabled={saving} style={s.btn("primary")}>
            {saving ? <Spinner size={16} /> : "Save Payment"}
          </button>
        </div>
      )}

      {/* Clear Balance Form */}
      {showClear && (
        <div style={{ ...s.card, marginBottom: 16, border: `1px solid ${colors.amber}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Clear Balance</div>
          <Field label="Reason *"><input style={s.input} value={clearReason} onChange={(e) => setClearReason(e.target.value)} placeholder="e.g. Scholarship, family arrangement" /></Field>
          <button onClick={() => {
            if (!clearReason.trim()) return alert("Please enter a reason.");
            onClearBalance(clearReason.trim());
            setShowClear(false);
          }} disabled={saving} style={s.btn("amber")}>
            {saving ? <Spinner size={16} /> : "Clear Balance"}
          </button>
        </div>
      )}

      {/* Payment History */}
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Payment History</div>
      {(!payments || payments.length === 0) ? (
        <div style={{ fontSize: 13, color: colors.textMid, padding: "12px 0" }}>No payments recorded.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {payments.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: colors.bg, borderRadius: 8, fontSize: 13 }}>
              <div>
                <span style={{ fontWeight: 600 }}>${(p.amount_cents / 100).toFixed(2)}</span>
                <span style={{ color: colors.textMid }}> · {p.method}</span>
                {p.notes && <span style={{ color: colors.textLight }}> · {p.notes}</span>}
              </div>
              <span style={{ color: colors.textLight, fontSize: 12 }}>{new Date(p.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
export default function AdminDashboard({ user, setView, showToast }) {
  const [tab, setTab] = useState("registrations");
  const [registrations, setRegistrations] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [children, setChildren] = useState([]);
  const [parents, setParents] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [settings, setSettings] = useState({});
  const [discountCodes, setDiscountCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDivision, setFilterDivision] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Modal state
  const [divisionModal, setDivisionModal] = useState(null);
  const [weekModal, setWeekModal] = useState(null);
  const [weekModalDivision, setWeekModalDivision] = useState(null);
  const [discountModal, setDiscountModal] = useState(null);
  const [settingsModal, setSettingsModal] = useState(false);
  const [ledgerModal, setLedgerModal] = useState(null);
  const [ledgerPayments, setLedgerPayments] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [reg, divs, wks, ch, par, codes, ledg, settingsRows] = await Promise.all([
        sb.query("registrations", { select: "*", filters: "&order=created_at.desc" }),
        sb.query("divisions", { filters: "&order=sort_order.asc" }),
        sb.query("division_weeks", { filters: "&order=sort_order.asc" }),
        sb.query("children"),
        sb.query("parents"),
        sb.query("discount_codes", { filters: "&order=created_at.desc" }).catch(() => []),
        sb.query("family_ledger").catch(() => []),
        sb.query("camp_settings").catch(() => []),
      ]);
      setRegistrations(reg || []);
      setDivisions(divs || []);
      setWeeks(wks || []);
      setChildren(ch || []);
      setParents(par || []);
      setDiscountCodes(codes || []);
      setLedgers(ledg || []);

      const st = {};
      (settingsRows || []).forEach((row) => {
        try { st[row.key] = JSON.parse(row.value); } catch { st[row.key] = row.value; }
      });
      setSettings(st);
    } catch (e) {
      console.error("Admin load:", e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSignOut = async () => { await sb.signOut(); window.location.reload(); };

  const childMap = Object.fromEntries((children || []).map((c) => [c.id, c]));
  const parentMap = Object.fromEntries((parents || []).map((p) => [p.id, p]));
  const divisionMap = Object.fromEntries((divisions || []).map((d) => [d.id, d]));
  const weekMap = Object.fromEntries((weeks || []).map((w) => [w.id, w]));
  const ledgerMap = Object.fromEntries((ledgers || []).map((l) => [l.parent_id, l]));

  const updateRegistration = async (regId, updates) => {
    try {
      await sb.query("registrations", { method: "PATCH", body: updates, filters: `&id=eq.${regId}`, headers: { Prefer: "return=minimal" } });
      showToast("Updated!");
      load();
    } catch (e) { alert("Error: " + e.message); }
  };

  // ─── Division CRUD ───
  const handleSaveDivision = async (data) => {
    setSaving(true);
    try {
      if (divisionModal && divisionModal !== "create") {
        await sb.query("divisions", { method: "PATCH", body: { ...data, updated_at: new Date().toISOString() }, filters: `&id=eq.${divisionModal.id}`, headers: { Prefer: "return=minimal" } });
        showToast("Division updated!");
      } else {
        await sb.query("divisions", { method: "POST", body: data, headers: { Prefer: "return=minimal" } });
        showToast("Division created!");
      }
      setDivisionModal(null);
      load();
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };

  const handleDeleteDivision = async (div) => {
    const weekCount = weeks.filter((w) => w.division_id === div.id).length;
    if (!window.confirm(`Delete "${div.name}"${weekCount ? ` and its ${weekCount} weeks` : ""}? This cannot be undone.`)) return;
    try {
      await sb.query("divisions", { method: "DELETE", filters: `&id=eq.${div.id}` });
      showToast("Division deleted.");
      load();
    } catch (e) { alert("Error: " + e.message); }
  };

  // ─── Week CRUD ───
  const handleSaveWeek = async (data) => {
    setSaving(true);
    try {
      if (weekModal && weekModal !== "create") {
        await sb.query("division_weeks", { method: "PATCH", body: data, filters: `&id=eq.${weekModal.id}`, headers: { Prefer: "return=minimal" } });
        showToast("Week updated!");
      } else {
        await sb.query("division_weeks", { method: "POST", body: data, headers: { Prefer: "return=minimal" } });
        showToast("Week added!");
      }
      setWeekModal(null);
      setWeekModalDivision(null);
      load();
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };

  const handleDeleteWeek = async (wk) => {
    if (!window.confirm(`Delete "${wk.name}"? This cannot be undone.`)) return;
    try {
      await sb.query("division_weeks", { method: "DELETE", filters: `&id=eq.${wk.id}` });
      showToast("Week deleted.");
      load();
    } catch (e) { alert("Error: " + e.message); }
  };

  // ─── Settings ───
  const handleSaveSettings = async (data) => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(data)) {
        const jsonVal = JSON.stringify(value);
        // Upsert: try update first, then insert
        const existing = await sb.query("camp_settings", { filters: `&key=eq.${key}` });
        if (existing && existing.length > 0) {
          await sb.query("camp_settings", { method: "PATCH", body: { value: jsonVal, updated_at: new Date().toISOString() }, filters: `&key=eq.${key}`, headers: { Prefer: "return=minimal" } });
        } else {
          await sb.query("camp_settings", { method: "POST", body: { key, value: jsonVal }, headers: { Prefer: "return=minimal" } });
        }
      }
      showToast("Settings saved!");
      setSettingsModal(false);
      load();
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };

  // ─── Family Ledger ───
  const openLedger = async (parentId) => {
    const ledger = ledgerMap[parentId] || null;
    try {
      const payments = await sb.query("payment_log", { filters: `&parent_id=eq.${parentId}&order=created_at.desc` });
      setLedgerPayments(payments || []);
    } catch { setLedgerPayments([]); }
    setLedgerModal({ parentId, ledger });
  };

  const handleRecordPayment = async (data) => {
    setSaving(true);
    try {
      const parentId = ledgerModal.parentId;
      // Log payment
      await sb.query("payment_log", {
        method: "POST",
        body: { parent_id: parentId, amount_cents: data.amount_cents, method: data.method, notes: data.notes, recorded_by: user.id },
        headers: { Prefer: "return=minimal" },
      });
      // Update ledger
      const ledger = ledgerMap[parentId];
      if (ledger) {
        await sb.query("family_ledger", {
          method: "PATCH",
          body: { total_paid_cents: (ledger.total_paid_cents || 0) + data.amount_cents, updated_at: new Date().toISOString() },
          filters: `&parent_id=eq.${parentId}`,
          headers: { Prefer: "return=minimal" },
        });
      }
      showToast("Payment recorded!");
      load();
      openLedger(parentId); // refresh modal
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };

  const handleClearBalance = async (reason) => {
    setSaving(true);
    try {
      const parentId = ledgerModal.parentId;
      await sb.query("family_ledger", {
        method: "PATCH",
        body: { balance_cleared: true, balance_cleared_reason: reason, balance_cleared_by: user.id, balance_cleared_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        filters: `&parent_id=eq.${parentId}`,
        headers: { Prefer: "return=minimal" },
      });
      showToast("Balance cleared!");
      load();
      openLedger(parentId);
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };

  // ─── Filtering ───
  const filtered = registrations.filter((r) => {
    if (filterDivision !== "all" && r.division_id !== filterDivision) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const child = childMap[r.child_id];
      const par = child ? parentMap[child.parent_id] : null;
      const term = search.toLowerCase();
      const haystack = `${child?.first_name || ""} ${child?.last_name || ""} ${par?.full_name || ""} ${par?.email || ""}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const rows = [["Child", "Age", "Parent", "Email", "Phone", "Division", "Week", "Status", "Price", "Allergies", "Medical", "Registered"]];
    filtered.forEach((r) => {
      const c = childMap[r.child_id];
      const p = c ? parentMap[c.parent_id] : {};
      const div = divisionMap[r.division_id];
      const wk = weekMap[r.week_id];
      const age = c?.date_of_birth ? Math.floor((Date.now() - new Date(c.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "";
      rows.push([
        `${c?.first_name || ""} ${c?.last_name || ""}`, age, p?.full_name || "", p?.email || "", p?.phone || "",
        div?.name || "", wk?.name || "", r.status, `$${(r.price_cents / 100).toFixed(0)}`,
        c?.allergies || "", c?.medical_notes || c?.medical_info || "",
        new Date(r.created_at).toLocaleDateString(),
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cgi-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast("Exported!");
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}><Spinner size={32} /></div>;

  const totalRegs = registrations.length;
  const totalPending = registrations.filter((r) => r.status === "pending").length;
  const totalConfirmed = registrations.filter((r) => r.status === "confirmed").length;
  const totalRevenue = ledgers.reduce((sum, l) => sum + (l.total_paid_cents || 0), 0);
  const campName = settings.camp_name || "CGI Wilkes Rebbe";

  return (
    <div style={{ minHeight: "100vh", background: colors.bg }}>
      {/* Header */}
      <header style={{ background: colors.forest, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {Icons.trees({ color: "#fff", size: 24 })}
          <span style={{ fontFamily: font.display, color: "#fff", fontSize: 20 }}>{campName}</span>
          <span style={s.badge("#fff")}>Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setView("parent")} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.8)", padding: "6px 14px", fontSize: 13 }}>{Icons.home({ size: 14, color: "rgba(255,255,255,.8)" })} Parent View</button>
          <button onClick={handleSignOut} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.6)", padding: "6px 10px" }}>{Icons.logout({ size: 16, color: "rgba(255,255,255,.6)" })}</button>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: colors.textMid, fontWeight: 600, marginBottom: 4 }}>Total Registrations</div>
            <div style={{ fontFamily: font.display, fontSize: 28 }}>{totalRegs}</div>
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
            <div style={{ fontSize: 12, color: colors.textMid, fontWeight: 600, marginBottom: 4 }}>Revenue (Collected)</div>
            <div style={{ fontFamily: font.display, fontSize: 28, color: colors.forest }}>${(totalRevenue / 100).toLocaleString()}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${colors.border}`, paddingBottom: 0, flexWrap: "wrap" }}>
          {[
            { key: "registrations", label: "Registrations", icon: Icons.clipboard },
            { key: "divisions", label: "Divisions & Weeks", icon: Icons.calendar },
            { key: "families", label: "Families", icon: Icons.users },
            { key: "discounts", label: "Discounts", icon: Icons.dollar },
            { key: "settings", label: "Settings", icon: Icons.shield },
          ].map((t) => (
            <button key={t.key} onClick={() => t.key === "settings" ? setSettingsModal(true) : setTab(t.key)} style={{
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
              <select style={{ ...s.input, width: "auto", minWidth: 160 }} value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)}>
                <option value="all">All Divisions</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select style={{ ...s.input, width: "auto", minWidth: 130 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="waitlisted">Waitlisted</option>
                <option value="cancelled">Cancelled</option>
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
                      {["Camper", "Parent", "Division", "Week", "Status", "Price", "Date", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: colors.textMid, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const c = childMap[r.child_id];
                      const p = c ? parentMap[c.parent_id] : {};
                      const div = divisionMap[r.division_id];
                      const wk = weekMap[r.week_id];
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c?.first_name} {c?.last_name}</td>
                          <td style={{ padding: "10px 14px" }}>{p?.full_name}<div style={{ fontSize: 12, color: colors.textMid }}>{p?.email}</div></td>
                          <td style={{ padding: "10px 14px" }}>{div?.name}</td>
                          <td style={{ padding: "10px 14px" }}>{wk?.name}<div style={{ fontSize: 12, color: colors.textMid }}>{wk?.start_date ? new Date(wk.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</div></td>
                          <td style={{ padding: "10px 14px" }}><StatusBadge status={r.status} /></td>
                          <td style={{ padding: "10px 14px", fontSize: 13 }}>${(r.price_cents / 100).toFixed(0)}</td>
                          <td style={{ padding: "10px 14px", fontSize: 13, color: colors.textMid }}>{new Date(r.created_at).toLocaleDateString()}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {r.status === "pending" && <button onClick={() => updateRegistration(r.id, { status: "confirmed" })} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.success }}>{Icons.check({ size: 13, color: colors.success })} Confirm</button>}
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

        {/* ═══ DIVISIONS & WEEKS TAB ═══ */}
        {tab === "divisions" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: colors.textMid }}>{divisions.length} division{divisions.length !== 1 ? "s" : ""}</div>
              <button onClick={() => setDivisionModal("create")} style={s.btn("primary")}>{Icons.plus({ size: 16, color: "#fff" })} Add Division</button>
            </div>

            {divisions.length === 0 ? (
              <div style={s.card}>
                <EmptyState icon={Icons.calendar} title="No divisions yet" sub="Create your first division (e.g. Preschool, Boys, Girls)." />
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {divisions.map((div) => {
                  const divWeeks = weeks.filter((w) => w.division_id === div.id).sort((a, b) => a.sort_order - b.sort_order);
                  const totalEnrolled = registrations.filter((r) => r.division_id === div.id && r.status !== "cancelled").length;
                  return (
                    <div key={div.id} style={{ ...s.card, opacity: div.active === false ? 0.55 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontFamily: font.display, fontSize: 18 }}>{div.name}</span>
                            {div.active === false && <span style={s.badge(colors.textMid)}>Inactive</span>}
                            <span style={s.badge(colors.forest)}>{div.schedule_type === "half_day" ? "Half Day" : "Full Day"}</span>
                          </div>
                          <div style={{ fontSize: 14, color: colors.textMid }}>
                            ${(div.per_week_price / 100).toFixed(0)}/week · {div.gender_filter === "any" ? "All" : div.gender_filter === "male" ? "Boys" : "Girls"} · {totalEnrolled} registrations
                          </div>
                          {div.description && <div style={{ fontSize: 13, color: colors.textLight, marginTop: 4 }}>{div.description}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button onClick={() => setDivisionModal(div)} style={{ ...s.btn("secondary"), padding: "7px 12px", fontSize: 13 }}>{Icons.edit({ size: 14 })} Edit</button>
                          <button onClick={() => handleDeleteDivision(div)} style={{ ...s.btn("ghost"), padding: "7px 10px", color: colors.coral }}>{Icons.trash({ size: 14, color: colors.coral })}</button>
                        </div>
                      </div>

                      {/* Weeks under this division */}
                      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: colors.textMid }}>{divWeeks.length} Week{divWeeks.length !== 1 ? "s" : ""}</span>
                          <button onClick={() => { setWeekModalDivision(div); setWeekModal("create"); }} style={{ ...s.btn("ghost"), padding: "4px 10px", fontSize: 12, color: colors.forest }}>{Icons.plus({ size: 13, color: colors.forest })} Add Week</button>
                        </div>
                        {divWeeks.length === 0 ? (
                          <div style={{ fontSize: 13, color: colors.textLight, padding: "8px 0" }}>No weeks added yet.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 6 }}>
                            {divWeeks.map((wk) => {
                              const enrolled = registrations.filter((r) => r.week_id === wk.id && r.status !== "cancelled").length;
                              const price = wk.price_override_cents ?? div.per_week_price;
                              return (
                                <div key={wk.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: colors.bg, borderRadius: 8, fontSize: 13 }}>
                                  <div>
                                    <span style={{ fontWeight: 600 }}>{wk.name}</span>
                                    <span style={{ color: colors.textMid }}> · {new Date(wk.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(wk.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                    <span style={{ color: colors.textMid }}> · ${(price / 100).toFixed(0)}</span>
                                    <span style={{ color: colors.textLight }}> · {enrolled}/{wk.capacity}</span>
                                  </div>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button onClick={() => { setWeekModalDivision(div); setWeekModal(wk); }} style={{ ...s.btn("ghost"), padding: "3px 6px", fontSize: 11 }}>{Icons.edit({ size: 12 })}</button>
                                    <button onClick={() => handleDeleteWeek(wk)} style={{ ...s.btn("ghost"), padding: "3px 6px", color: colors.coral }}>{Icons.trash({ size: 12, color: colors.coral })}</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ FAMILIES TAB ═══ */}
        {tab === "families" && (
          <div>
            <div style={{ fontSize: 14, color: colors.textMid, marginBottom: 16 }}>{parents.length} families</div>
            <div style={{ ...s.card, padding: 0, overflow: "auto" }}>
              {parents.length === 0 ? (
                <EmptyState icon={Icons.users} title="No families yet" sub="Families appear here when parents register." />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg }}>
                      {["Parent", "Email", "Children", "Total Due", "Paid", "Balance", "Status", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: colors.textMid }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parents.map((p) => {
                      const kids = children.filter((c) => c.parent_id === p.id);
                      const ledger = ledgerMap[p.id];
                      const due = ledger?.total_due_cents || 0;
                      const paid = ledger?.total_paid_cents || 0;
                      const balance = due - paid;
                      const cleared = ledger?.balance_cleared;
                      return (
                        <tr key={p.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600 }}>{p.full_name || "—"}</td>
                          <td style={{ padding: "10px 14px", color: colors.textMid }}>{p.email}</td>
                          <td style={{ padding: "10px 14px" }}>{kids.map((k) => k.first_name).join(", ") || "—"}</td>
                          <td style={{ padding: "10px 14px" }}>${(due / 100).toFixed(0)}</td>
                          <td style={{ padding: "10px 14px", color: colors.success }}>${(paid / 100).toFixed(0)}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 600, color: cleared ? colors.success : balance > 0 ? colors.amber : colors.success }}>
                            {cleared ? "Cleared" : `$${(balance / 100).toFixed(0)}`}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            {cleared ? <StatusBadge status="confirmed" /> : balance === 0 && due > 0 ? <StatusBadge status="paid" /> : balance > 0 ? <StatusBadge status="unpaid" /> : "—"}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <button onClick={() => openLedger(p.id)} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.forest }}>{Icons.dollar({ size: 13, color: colors.forest })} Billing</button>
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
                      {["Code", "Description", "Discount", "Uses", "Valid Until", "Status", "Actions"].map((h) => (
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
                          {dc.discount_type === "percent" ? `${dc.discount_value}%` : `$${(dc.discount_value / 100).toFixed(0)}`}
                          {dc.discount_type === "per_week" ? "/week" : ""} off
                        </td>
                        <td style={{ padding: "10px 14px" }}>{dc.times_used || 0}{dc.max_uses ? ` / ${dc.max_uses}` : ""}</td>
                        <td style={{ padding: "10px 14px", fontSize: 13, color: colors.textMid }}>{dc.valid_until ? new Date(dc.valid_until).toLocaleDateString() : "Never"}</td>
                        <td style={{ padding: "10px 14px" }}><StatusBadge status={dc.active ? "confirmed" : "cancelled"} /></td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => setDiscountModal(dc)} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12 }}>{Icons.edit({ size: 13 })} Edit</button>
                            <button onClick={async () => {
                              if (!window.confirm(`Delete code "${dc.code}"?`)) return;
                              try { await sb.query("discount_codes", { method: "DELETE", filters: `&id=eq.${dc.id}` }); showToast("Deleted!"); load(); }
                              catch (e) { alert("Error: " + e.message); }
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
      </div>

      {/* Modals */}
      {divisionModal && (
        <DivisionModal
          division={divisionModal === "create" ? null : divisionModal}
          onClose={() => setDivisionModal(null)}
          onSave={handleSaveDivision}
          saving={saving}
        />
      )}
      {weekModal && (
        <WeekModal
          week={weekModal === "create" ? null : weekModal}
          division={weekModalDivision}
          onClose={() => { setWeekModal(null); setWeekModalDivision(null); }}
          onSave={handleSaveWeek}
          saving={saving}
        />
      )}
      {discountModal && (
        <DiscountCodeModal
          code={discountModal === "create" ? null : discountModal}
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
      {settingsModal && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsModal(false)}
          onSave={handleSaveSettings}
          saving={saving}
        />
      )}
      {ledgerModal && (
        <LedgerModal
          ledger={ledgerModal.ledger}
          parent={parentMap[ledgerModal.parentId]}
          payments={ledgerPayments}
          onClose={() => { setLedgerModal(null); setLedgerPayments([]); }}
          onRecordPayment={handleRecordPayment}
          onClearBalance={handleClearBalance}
          saving={saving}
        />
      )}
    </div>
  );
}