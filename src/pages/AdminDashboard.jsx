import { useState, useEffect, useCallback } from "react";
import sb from "../lib/supabase";
import BunkAssignments from "./BunkAssignments";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner, EmptyState, StatusBadge, Modal, Field } from "../components/UI";
import { RegisterModal } from "../components/ParentModals";

// ============================================================
// SHARED HELPERS
// ============================================================
function fmtDate(dateStr, opts) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", opts || { month: "short", day: "numeric" });
}

const PRESCHOOL_CLASSES = [
  { value: "-5", label: "Infants" },
  { value: "-4", label: "Toddler" },
  { value: "-3", label: "Pre Nursery" },
  { value: "-2", label: "Nursery" },
  { value: "-1", label: "Pre K" },
];

const ELEMENTARY_GRADES = [
  { value: "0", label: "Kindergarten" },
  ...Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `Grade ${i + 1}` })),
];

function getGradeOptions(division) {
  if (!division) return [...PRESCHOOL_CLASSES, ...ELEMENTARY_GRADES];
  const name = (division.name || "").toLowerCase();
  if (name.includes("preschool") || name.includes("pre-school") || name.includes("half day")) {
    return PRESCHOOL_CLASSES;
  }
  return ELEMENTARY_GRADES;
}

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
    schedule_type: division?.schedule_type || "",
    per_week_price: division?.per_week_price ?? 35000,
    elrc_weekly_price: division?.elrc_weekly_price ?? "",
    early_bird_discount_cents: division?.early_bird_discount_cents ?? "",
    class_capacities_json: division?.class_capacities ? JSON.stringify(division.class_capacities, null, 2) : "",
    sort_order: division?.sort_order ?? 0,
    active: division?.active ?? true,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const isPreschoolType = (form.name || "").toLowerCase().includes("preschool") || (form.name || "").toLowerCase().includes("half day");

  return (
    <Modal title={isEdit ? "Edit Division" : "Create Division"} onClose={onClose} width={540}>
      <Field label="Division Name *">
        <input style={s.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Boys Division" />
      </Field>
      <Field label="Description">
        <input style={s.input} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional description" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="Gender Filter *">
          <select style={s.input} value={form.gender_filter} onChange={(e) => set("gender_filter", e.target.value)}>
            <option value="any">Any</option>
            <option value="male">Boys Only</option>
            <option value="female">Girls Only</option>
          </select>
        </Field>
        <Field label="Sort Order">
          <input type="number" style={s.input} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} min={0} />
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
        <Field label="ELRC/Childcare Rate (cents)">
          <div style={{ position: "relative" }}>
            <input type="number" style={{ ...s.input, paddingRight: 60 }} value={form.elrc_weekly_price} onChange={(e) => set("elrc_weekly_price", e.target.value)} placeholder="Leave blank if N/A" min={0} step={100} />
            {form.elrc_weekly_price && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(form.elrc_weekly_price / 100).toFixed(2)}</span>}
          </div>
        </Field>
        <Field label="Early Bird Discount (cents/week)">
          <div style={{ position: "relative" }}>
            <input type="number" style={{ ...s.input, paddingRight: 60 }} value={form.early_bird_discount_cents} onChange={(e) => set("early_bird_discount_cents", e.target.value)} placeholder="e.g. 4500 = $45 off" min={0} step={100} />
            {form.early_bird_discount_cents && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(form.early_bird_discount_cents / 100).toFixed(2)} off</span>}
          </div>
        </Field>
      </div>

      {/* Class Capacities — for preschool divisions */}
      {isPreschoolType && (
        <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Class Capacities</div>
          <div style={{ fontSize: 12, color: colors.textLight, marginBottom: 8 }}>Set max enrollment per class. JSON format, e.g. {`{"Infants": 10, "Toddler": 15}`}</div>
          <textarea
            style={{ ...s.input, minHeight: 80, fontFamily: "monospace", fontSize: 12 }}
            value={form.class_capacities_json}
            onChange={(e) => set("class_capacities_json", e.target.value)}
            placeholder='{"Infants": 10, "Toddler": 15, "Pre Nursery": 15, "Nursery": 20, "Pre K": 20}'
          />
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
        Active (visible to parents)
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => {
          if (!form.name.trim()) return alert("Division name is required.");
          let classCapacities = null;
          if (form.class_capacities_json.trim()) {
            try { classCapacities = JSON.parse(form.class_capacities_json); }
            catch { return alert("Class capacities must be valid JSON."); }
          }
          onSave({
            name: form.name.trim(),
            description: form.description.trim(),
            gender_filter: form.gender_filter,
            min_dob: form.min_dob || null,
            max_dob: form.max_dob || null,
            min_grade: form.min_grade !== "" ? Number(form.min_grade) : null,
            max_grade: form.max_grade !== "" ? Number(form.max_grade) : null,
            schedule_type: form.schedule_type || null,
            per_week_price: Number(form.per_week_price),
            elrc_weekly_price: form.elrc_weekly_price !== "" ? Number(form.elrc_weekly_price) : null,
            early_bird_discount_cents: form.early_bird_discount_cents !== "" ? Number(form.early_bird_discount_cents) : null,
            class_capacities: classCapacities,
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
    sibling_discount_cents: settings.sibling_discount_cents ?? 1500,
    sibling_discount_starts_at: settings.sibling_discount_starts_at ?? 2,
    sibling_discount_elementary_only: settings.sibling_discount_elementary_only ?? true,
    registration_fee_cents: settings.registration_fee_cents ?? 4500,
    registration_fee_required: settings.registration_fee_required ?? true,
    registration_fee_override_code: settings.registration_fee_override_code || "",
    minimum_weekly_price_cents: settings.minimum_weekly_price_cents ?? 6500,
    registration_open: settings.registration_open ?? true,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title="Camp Settings" onClose={onClose} width={520}>
      <Field label="Camp Name"><input style={s.input} value={form.camp_name} onChange={(e) => set("camp_name", e.target.value)} /></Field>
      <Field label="Season Name"><input style={s.input} value={form.camp_season} onChange={(e) => set("camp_season", e.target.value)} /></Field>

      {/* Registration Fee */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Registration Fee</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field label="Fee Amount (cents)">
            <div style={{ position: "relative" }}>
              <input type="number" style={{ ...s.input, paddingRight: 60 }} value={form.registration_fee_cents} onChange={(e) => set("registration_fee_cents", e.target.value)} min={0} step={100} />
              {form.registration_fee_cents > 0 && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(form.registration_fee_cents / 100).toFixed(2)}</span>}
            </div>
          </Field>
          <Field label="Override Code">
            <input style={s.input} value={form.registration_fee_override_code} onChange={(e) => set("registration_fee_override_code", e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="e.g. FEEWAVED" />
          </Field>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 4 }}>
          <input type="checkbox" checked={form.registration_fee_required} onChange={(e) => set("registration_fee_required", e.target.checked)} />
          Require registration fee before enrollment
        </label>
        <div style={{ fontSize: 12, color: colors.textLight, marginLeft: 26 }}>If enabled, families must pay the registration fee before they can register for weeks. Override code lets specific families skip it.</div>
      </div>

      {/* Early Bird */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Early Bird Discount</div>
        <div style={{ fontSize: 12, color: colors.textLight, marginBottom: 12 }}>Discount amounts are set per division. Only applies to full-price weeks (not prorated partial weeks). This is the deadline for paying in full to qualify.</div>
        <Field label="Pay-in-Full Deadline"><input type="date" style={s.input} value={form.early_bird_deadline} onChange={(e) => set("early_bird_deadline", e.target.value)} /></Field>
      </div>

      {/* Sibling Discount */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Sibling Discount</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field label="Discount Per Sibling (cents/week)">
            <div style={{ position: "relative" }}>
              <input type="number" style={{ ...s.input, paddingRight: 60 }} value={form.sibling_discount_cents} onChange={(e) => set("sibling_discount_cents", e.target.value)} min={0} step={100} />
              {form.sibling_discount_cents > 0 && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(form.sibling_discount_cents / 100).toFixed(2)}/wk</span>}
            </div>
          </Field>
          <Field label="Starts at Child #"><input type="number" style={s.input} value={form.sibling_discount_starts_at} onChange={(e) => set("sibling_discount_starts_at", e.target.value)} min={2} /></Field>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={form.sibling_discount_elementary_only} onChange={(e) => set("sibling_discount_elementary_only", e.target.checked)} />
          Elementary divisions only (exclude preschool)
        </label>
      </div>

      {/* Minimum Price Floor */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Minimum Weekly Price</div>
        <div style={{ fontSize: 12, color: colors.textLight, marginBottom: 12 }}>No matter how many discounts stack, the price per child per week will never go below this amount. Prorated for partial weeks.</div>
        <Field label="Floor (cents)">
          <div style={{ position: "relative" }}>
            <input type="number" style={{ ...s.input, paddingRight: 60 }} value={form.minimum_weekly_price_cents} onChange={(e) => set("minimum_weekly_price_cents", e.target.value)} min={0} step={100} />
            {form.minimum_weekly_price_cents > 0 && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: colors.textMid }}>= ${(form.minimum_weekly_price_cents / 100).toFixed(2)}/wk</span>}
          </div>
        </Field>
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
function FamilyModal({ parent, familyChildren, divisions, registrations, weeks, weekMap, divisionMap, ledger, payments, onClose, onSaveParent, onEditChild, onAddChild, onRegisterChild, onRecordPayment, onClearBalance, onSavePaymentPlan, saving, isStaff }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: parent?.full_name || "", phone: parent?.phone || "", street_address: parent?.street_address || "", city: parent?.city || "Kingston", state: parent?.state || "PA", zip: parent?.zip || "18704", parent2_first_name: parent?.parent2_first_name || "", parent2_last_name: parent?.parent2_last_name || "", parent2_phone: parent?.parent2_phone || "", elrc_status: parent?.elrc_status ?? false });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const [emails, setEmails] = useState(() => { try { return Array.isArray(parent?.additional_emails) ? parent.additional_emails : JSON.parse(parent?.additional_emails || "[]"); } catch { return []; } });
  const [newEmail, setNewEmail] = useState({ name: "", email: "" });
  const addEmail = () => { if (!newEmail.name.trim() || !newEmail.email.trim()) return alert("Both name and email are required."); if (!/\S+@\S+\.\S+/.test(newEmail.email)) return alert("Please enter a valid email address."); setEmails([...emails, { name: newEmail.name.trim(), email: newEmail.email.trim() }]); setNewEmail({ name: "", email: "" }); };
  const removeEmail = (idx) => setEmails(emails.filter((_, i) => i !== idx));

  const [payForm, setPayForm] = useState({ amount_cents: "", method: "cash", notes: "" });
  const [clearReason, setClearReason] = useState("");
  const [scholarshipCents, setScholarshipCents] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [ppToggle, setPpToggle] = useState(ledger?.payment_plan || false);
  const [ppNote, setPpNote] = useState(ledger?.payment_plan_note || "");
  const [showPpNote, setShowPpNote] = useState(!!(ledger?.payment_plan));
  const forgiven = ledger?.forgiven_cents || 0;
  const balance = (ledger?.total_due_cents || 0) - (ledger?.total_paid_cents || 0) - forgiven;

  return (
    <Modal title={parent?.full_name || "Family"} onClose={onClose} width={640}>
      {/* ── Parent Info ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Parent Info</div>
          {!editing && !isStaff && <button onClick={() => setEditing(true)} style={{ ...s.btn("ghost"), padding: "3px 8px", fontSize: 12, color: colors.forest }}>{Icons.edit({ size: 12 })} Edit</button>}
        </div>
        {editing ? (
          <>
            <Field label="Full Name *"><input style={s.input} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <Field label="Phone"><input style={s.input} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label="Login Email"><input style={{ ...s.input, background: colors.bg, color: colors.textMid }} value={parent?.email || ""} disabled /></Field>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, marginBottom: 4, color: colors.textMid }}>Address</div>
            <Field label="Street Address"><input style={s.input} value={form.street_address} onChange={(e) => set("street_address", e.target.value)} placeholder="123 Main St" /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0 10px" }}>
              <Field label="City"><input style={s.input} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Kingston" /></Field>
              <Field label="State"><input style={s.input} value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} placeholder="PA" maxLength={2} /></Field>
              <Field label="ZIP"><input style={s.input} value={form.zip} onChange={(e) => set("zip", e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="18704" maxLength={5} /></Field>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, marginBottom: 4, color: colors.textMid }}>Parent / Guardian 2</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 10px" }}>
              <Field label="First Name"><input style={s.input} value={form.parent2_first_name} onChange={(e) => set("parent2_first_name", e.target.value)} /></Field>
              <Field label="Last Name"><input style={s.input} value={form.parent2_last_name} onChange={(e) => set("parent2_last_name", e.target.value)} /></Field>
              <Field label="Phone"><input style={s.input} value={form.parent2_phone} onChange={(e) => set("parent2_phone", e.target.value)} /></Field>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginTop: 8, marginBottom: 4 }}><input type="checkbox" checked={form.elrc_status} onChange={(e) => set("elrc_status", e.target.checked)} /><strong>ELRC / Childcare Subsidy</strong></label>
            <div style={{ fontSize: 12, color: colors.textLight, marginLeft: 26, marginBottom: 8 }}>This family receives ELRC childcare subsidies and will be charged the reduced rate.</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: colors.textMid }}>Additional Email Recipients</div>
            {emails.length > 0 && (<div style={{ display: "grid", gap: 4, marginBottom: 8 }}>{emails.map((em, idx) => (<div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: colors.bg, borderRadius: 6, fontSize: 12 }}><span style={{ fontWeight: 600 }}>{em.name}</span><span style={{ color: colors.textMid }}>{em.email}</span><button onClick={() => removeEmail(idx)} style={{ ...s.btn("ghost"), padding: "1px 4px", marginLeft: "auto", color: colors.coral }}>{Icons.x({ size: 10, color: colors.coral })}</button></div>))}</div>)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, alignItems: "end" }}>
              <Field label="Name"><input style={s.input} value={newEmail.name} onChange={(e) => setNewEmail({ ...newEmail, name: e.target.value })} placeholder="e.g. Dad" /></Field>
              <Field label="Email"><input style={s.input} value={newEmail.email} onChange={(e) => setNewEmail({ ...newEmail, email: e.target.value })} placeholder="dad@email.com" /></Field>
              <button onClick={addEmail} style={{ ...s.btn("secondary"), padding: "8px 12px", marginBottom: 10 }}>{Icons.plus({ size: 12 })} Add</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setEditing(false)} style={s.btn("secondary")}>Cancel</button>
              <button onClick={() => { if (!form.full_name.trim()) return alert("Parent name is required."); onSaveParent({ full_name: form.full_name.trim(), phone: form.phone.trim(), street_address: form.street_address.trim(), city: form.city.trim(), state: form.state.trim(), zip: form.zip.trim(), parent2_first_name: form.parent2_first_name.trim() || null, parent2_last_name: form.parent2_last_name.trim() || null, parent2_phone: form.parent2_phone.trim() || null, elrc_status: form.elrc_status, additional_emails: JSON.stringify(emails) }); setEditing(false); }} disabled={saving} style={s.btn("primary")}>{saving ? <Spinner size={14} /> : "Save"}</button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div><span style={{ color: colors.textMid }}>Email:</span> {parent?.email}</div>
            <div><span style={{ color: colors.textMid }}>Phone:</span> {parent?.phone || "—"}</div>
            <div><span style={{ color: colors.textMid }}>Address:</span> {[parent?.street_address, parent?.city, parent?.state, parent?.zip].filter(Boolean).join(", ") || parent?.address || "—"}</div>
            {parent?.parent2_first_name && <div><span style={{ color: colors.textMid }}>Parent/Guardian 2:</span> {parent.parent2_first_name} {parent.parent2_last_name}{parent.parent2_phone ? ` · ${parent.parent2_phone}` : ""}</div>}
            {parent?.elrc_status && <div><span style={{ ...s.badge(colors.forest), fontSize: 11 }}>ELRC</span></div>}
            {emails.length > 0 && <div><span style={{ color: colors.textMid }}>Additional emails:</span> {emails.map((e) => e.email).join(", ")}</div>}
          </div>
        )}
      </div>

      {/* ── Children + Registered Weeks ── */}
      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Children ({familyChildren.length})</div>
          {!isStaff && <button onClick={onAddChild} style={{ ...s.btn("ghost"), padding: "3px 8px", fontSize: 12, color: colors.forest }}>{Icons.plus({ size: 12, color: colors.forest })} Add Child</button>}
        </div>
        {familyChildren.length === 0 ? (<div style={{ fontSize: 13, color: colors.textLight, padding: "8px 0" }}>No children added yet.</div>) : (
          <div style={{ display: "grid", gap: 10 }}>{familyChildren.map((kid) => {
            const age = kid.date_of_birth ? Math.floor((Date.now() - new Date(kid.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
            const div = divisions.find((d) => { if (d.gender_filter !== "any" && d.gender_filter !== kid.gender) return false; if (kid.date_of_birth) { const dob = new Date(kid.date_of_birth); if (d.min_dob && dob < new Date(d.min_dob)) return false; if (d.max_dob && dob > new Date(d.max_dob)) return false; } return true; });
            const kidRegs = registrations.filter((r) => r.child_id === kid.id && r.status !== "cancelled");
            return (
              <div key={kid.id} style={{ padding: "10px 12px", background: colors.bg, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{kid.first_name} {kid.last_name}</span>
                    {age !== null && <span style={{ color: colors.textMid }}> · Age {age}</span>}
                    {kid.gender && <span style={{ color: colors.textMid }}> · {kid.gender === "male" ? "M" : "F"}</span>}
                    {div && <span style={{ color: colors.forest }}> · {div.name}</span>}
                  </div>
                  {!isStaff && <button onClick={() => onEditChild(kid)} style={{ ...s.btn("ghost"), padding: "2px 6px", fontSize: 11 }}>{Icons.edit({ size: 11 })} Edit</button>}
                  {!isStaff && <button onClick={() => onRegisterChild(kid)} style={{ ...s.btn("ghost"), padding: "2px 6px", fontSize: 11, color: colors.forest }}>{Icons.calendar({ size: 11, color: colors.forest })} Register</button>}
                </div>
                {kid.has_food_allergies && <div style={{ fontSize: 11, color: colors.textMid }}>Allergies: {kid.allergies}</div>}
                {kid.has_medical_condition && <div style={{ fontSize: 11, color: colors.textMid }}>Medical: {kid.medical_notes}</div>}
                {kid.has_medications && <div style={{ fontSize: 11, color: colors.textMid }}>Meds: {kid.medications}</div>}
                {kid.receives_services && <div style={{ fontSize: 11, color: colors.textMid }}>Services: {kid.services_description}</div>}
                {kid.emergency_contact_name && <div style={{ fontSize: 11, color: colors.textLight }}>Emergency: {kid.emergency_contact_name} · {kid.emergency_contact_phone}</div>}
                {kidRegs.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    {kidRegs.map((r) => {
                      const wk = weekMap[r.week_id];
                      const statusColor = r.status === "waitlisted" ? colors.amber : r.status === "confirmed" ? colors.success : colors.forest;
                      const statusLabel = r.status === "waitlisted" ? " ⏳" : r.status === "confirmed" ? " ✓" : "";
                      return <span key={r.id} style={{ ...s.badge(statusColor), fontSize: 10 }}>{wk?.name || "Week"}{!isStaff && ` · $${(r.price_cents / 100).toFixed(0)}`}{statusLabel}</span>;
                    })}
                  </div>
                )}
                {kidRegs.length === 0 && <div style={{ fontSize: 11, color: colors.textLight, marginTop: 4 }}>Not registered for any weeks</div>}
              </div>
            );
          })}</div>
        )}
      </div>

      {/* ── Billing ── */}
      {!isStaff && <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Billing</div>
        <div style={{ display: "grid", gridTemplateColumns: forgiven > 0 ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ ...s.card, padding: 10, textAlign: "center" }}><div style={{ fontSize: 10, color: colors.textMid, fontWeight: 600 }}>Total Due</div><div style={{ fontFamily: font.display, fontSize: 20 }}>${((ledger?.total_due_cents || 0) / 100).toFixed(0)}</div></div>
          <div style={{ ...s.card, padding: 10, textAlign: "center" }}><div style={{ fontSize: 10, color: colors.textMid, fontWeight: 600 }}>Paid</div><div style={{ fontFamily: font.display, fontSize: 20, color: colors.success }}>${((ledger?.total_paid_cents || 0) / 100).toFixed(0)}</div></div>
          {forgiven > 0 && <div style={{ ...s.card, padding: 10, textAlign: "center", border: `1px solid ${colors.success}` }}><div style={{ fontSize: 10, color: colors.success, fontWeight: 600 }}>Scholarship</div><div style={{ fontFamily: font.display, fontSize: 20, color: colors.success }}>${(forgiven / 100).toFixed(0)}</div></div>}
          <div style={{ ...s.card, padding: 10, textAlign: "center", border: balance > 0 ? `1px solid ${colors.amber}` : `1px solid ${colors.success}` }}><div style={{ fontSize: 10, color: colors.textMid, fontWeight: 600 }}>Balance</div><div style={{ fontFamily: font.display, fontSize: 20, color: balance > 0 ? colors.amber : colors.success }}>${(balance / 100).toFixed(0)}</div></div>
        </div>
        {(ledger?.balance_cleared || (forgiven > 0 && balance <= 0)) && (<div style={{ background: colors.forestPale, border: `1px solid ${colors.success}`, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>{Icons.check({ size: 12, color: colors.success })} <strong>Scholarship applied</strong>{ledger.balance_cleared_reason ? `: ${ledger.balance_cleared_reason}` : ""}</div>)}
        {/* ── Payment Plan Toggle ── */}
        <div style={{ ...s.card, marginBottom: 14, border: `1px solid ${ppToggle ? colors.forest : colors.border}`, background: ppToggle ? colors.forestPale : colors.card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={ppToggle} onChange={(e) => { const val = e.target.checked; setPpToggle(val); setShowPpNote(val); if (!val) { onSavePaymentPlan({ payment_plan: false, payment_plan_note: "" }); setPpNote(""); } }} />
              Payment Plan in Place
            </label>
            {ppToggle && <span style={{ fontSize: 11, color: colors.forest, fontWeight: 600 }}>Will skip balance reminders</span>}
          </div>
          {showPpNote && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMid, marginBottom: 4 }}>Notes</div>
                  <input style={s.input} value={ppNote} onChange={(e) => setPpNote(e.target.value)} placeholder="e.g. Paying via Stripe invoices monthly" />
                </div>
                <button onClick={() => onSavePaymentPlan({ payment_plan: true, payment_plan_note: ppNote.trim() })} disabled={saving} style={{ ...s.btn("primary"), padding: "8px 14px", fontSize: 12, marginBottom: 10 }}>{saving ? "…" : "Save"}</button>
              </div>
              {ledger?.payment_plan_note && ppNote === ledger.payment_plan_note && <div style={{ fontSize: 11, color: colors.success, marginTop: 2 }}>✓ Saved</div>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => { setShowPay(!showPay); setShowClear(false); }} style={{ ...s.btn("primary"), padding: "6px 14px", fontSize: 13 }}>Record Payment</button>
          {balance > 0 && (<button onClick={() => { setShowClear(!showClear); setShowPay(false); setScholarshipCents(String(balance)); }} style={{ ...s.btn("secondary"), padding: "6px 14px", fontSize: 13 }}>Apply Scholarship</button>)}
        </div>
        {showPay && (<div style={{ ...s.card, marginBottom: 12, border: `1px solid ${colors.forest}` }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Record Offline Payment</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}><Field label="Amount (cents) *"><div style={{ position: "relative" }}><input type="number" style={s.input} value={payForm.amount_cents} onChange={(e) => setPayForm({ ...payForm, amount_cents: e.target.value })} min={0} />{payForm.amount_cents > 0 && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: colors.textMid }}>= ${(payForm.amount_cents / 100).toFixed(2)}</span>}</div></Field><Field label="Method *"><select style={s.input} value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}><option value="cash">Cash</option><option value="check">Check</option><option value="zelle">Zelle</option><option value="other">Other</option></select></Field></div><Field label="Notes"><input style={s.input} value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} placeholder="e.g. Check #1234" /></Field><button onClick={() => { if (!payForm.amount_cents || Number(payForm.amount_cents) <= 0) return alert("Enter an amount."); onRecordPayment({ amount_cents: Number(payForm.amount_cents), method: payForm.method, notes: payForm.notes.trim() }); setPayForm({ amount_cents: "", method: "cash", notes: "" }); setShowPay(false); }} disabled={saving} style={s.btn("primary")}>{saving ? <Spinner size={14} /> : "Save Payment"}</button></div>)}
        {showClear && (<div style={{ ...s.card, marginBottom: 12, border: `1px solid ${colors.amber}` }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Apply Scholarship</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}><Field label="Amount (cents) *"><div style={{ position: "relative" }}><input type="number" style={s.input} value={scholarshipCents} onChange={(e) => setScholarshipCents(e.target.value)} min={0} max={balance} />{scholarshipCents > 0 && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: colors.textMid }}>= ${(scholarshipCents / 100).toFixed(2)}</span>}</div></Field><Field label="Reason *"><input style={s.input} value={clearReason} onChange={(e) => setClearReason(e.target.value)} placeholder="e.g. Scholarship, family arrangement" /></Field></div><div style={{ fontSize: 11, color: colors.textMid, marginBottom: 8 }}>{Number(scholarshipCents) >= balance ? "Full scholarship — will clear entire remaining balance" : `Partial scholarship — $${((balance - Number(scholarshipCents || 0)) / 100).toFixed(0)} will remain due`}</div><button onClick={() => { if (!clearReason.trim()) return alert("Please enter a reason."); const amt = Number(scholarshipCents); if (!amt || amt <= 0) return alert("Enter a scholarship amount."); if (amt > balance) return alert("Scholarship amount cannot exceed the remaining balance."); onClearBalance({ reason: clearReason.trim(), amount_cents: amt }); setShowClear(false); setClearReason(""); setScholarshipCents(""); }} disabled={saving} style={s.btn("amber")}>{saving ? <Spinner size={14} /> : "Apply Scholarship"}</button></div>)}
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Payment History</div>
        {(!payments || payments.length === 0) ? (<div style={{ fontSize: 12, color: colors.textMid, padding: "6px 0" }}>No payments recorded.</div>) : (<div style={{ display: "grid", gap: 4 }}>{payments.map((p) => (<div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: colors.bg, borderRadius: 6, fontSize: 12 }}><div><span style={{ fontWeight: 600 }}>${(p.amount_cents / 100).toFixed(2)}</span><span style={{ color: colors.textMid }}> · {p.method}</span>{p.notes && <span style={{ color: colors.textLight }}> · {p.notes}</span>}</div><span style={{ color: colors.textLight, fontSize: 11 }}>{new Date(p.created_at).toLocaleDateString()}</span></div>))}</div>)}
      </div>}
    </Modal>
  );
}

// ============================================================
// ADMIN CHILD MODAL — with yes/no toggles
// ============================================================
function AdminChildModal({ child, parentId, divisions, onClose, onSave, saving }) {
  const isEdit = !!child;
  const [form, setForm] = useState({
    first_name: child?.first_name || "",
    last_name: child?.last_name || "",
    date_of_birth: child?.date_of_birth || "",
    gender: child?.gender || "",
    grade: child?.grade ?? "",
    tshirt_size: child?.tshirt_size || "",
    has_food_allergies: child?.has_food_allergies === true ? "yes" : child?.has_food_allergies === false ? "no" : (child?.allergies ? "yes" : ""),
    allergies: child?.allergies || "",
    has_medical_condition: child?.has_medical_condition === true ? "yes" : child?.has_medical_condition === false ? "no" : (child?.medical_notes ? "yes" : ""),
    medical_notes: child?.medical_notes || "",
    has_medications: child?.has_medications === true ? "yes" : child?.has_medications === false ? "no" : (child?.medications ? "yes" : ""),
    medications: child?.medications || "",
    emergency_contact_name: child?.emergency_contact_name || "",
    emergency_contact_phone: child?.emergency_contact_phone || "",
    emergency_contact_relation: child?.emergency_contact_relation || "",
    receives_services: child?.receives_services ? "yes" : child?.receives_services === false ? "no" : "",
    services_description: child?.services_description || "",
    additional_notes: child?.additional_notes || "",
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const matchedDivision = (() => {
    if (!form.date_of_birth || !form.gender) return null;
    const dob = new Date(form.date_of_birth);
    return divisions.find((d) => {
      if (d.gender_filter !== "any" && d.gender_filter !== form.gender) return false;
      if (d.min_dob && dob < new Date(d.min_dob)) return false;
      if (d.max_dob && dob > new Date(d.max_dob)) return false;
      return true;
    }) || null;
  })();

  const gradeOptions = getGradeOptions(matchedDivision);

  return (
    <Modal title={isEdit ? `Edit ${child.first_name}` : "Add Child"} onClose={onClose} width={520}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="First Name *"><input style={s.input} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} /></Field>
        <Field label="Last Name *"><input style={s.input} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
        <Field label="Date of Birth *"><input type="date" style={s.input} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
        <Field label="Gender *">
          <select style={s.input} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">Select…</option><option value="male">Male</option><option value="female">Female</option>
          </select>
        </Field>
        <Field label="Class/Grade finishing this year *">
          <select style={s.input} value={form.grade} onChange={(e) => set("grade", e.target.value)}>
            <option value="">Select…</option>
            {gradeOptions.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </Field>
        <Field label="T-Shirt Size *">
          <select style={s.input} value={form.tshirt_size} onChange={(e) => set("tshirt_size", e.target.value)}>
            <option value="">Select…</option>
            {["YXS","YS","YM","YL","AS","AM","AL","AXL","A2XL"].map((sz) => <option key={sz} value={sz}>{sz}</option>)}
          </select>
        </Field>
      </div>

      {matchedDivision && (
        <div style={{ background: colors.forestPale, border: `1px solid ${colors.success}`, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>
          {Icons.check({ size: 14, color: colors.success })} <strong>Division:</strong> {matchedDivision.name}
        </div>
      )}
      {form.date_of_birth && form.gender && !matchedDivision && (
        <div style={{ background: colors.amberLight, border: `1px solid ${colors.amber}`, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13, color: colors.amber }}>
          No matching division found for this DOB/gender combination.
        </div>
      )}

      {/* Medical Information — yes/no toggles */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "12px 0", paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: colors.textMid }}>Medical Information</div>

        <Field label="Food allergies or dietary restrictions? *">
          <select style={s.input} value={form.has_food_allergies} onChange={(e) => set("has_food_allergies", e.target.value)}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {form.has_food_allergies === "yes" && (
          <Field label="Describe *"><textarea style={{ ...s.input, minHeight: 60 }} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="Describe food allergies or dietary restrictions…" /></Field>
        )}

        <Field label="Medical conditions? *">
          <select style={s.input} value={form.has_medical_condition} onChange={(e) => set("has_medical_condition", e.target.value)}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {form.has_medical_condition === "yes" && (
          <Field label="Describe *"><textarea style={{ ...s.input, minHeight: 60 }} value={form.medical_notes} onChange={(e) => set("medical_notes", e.target.value)} placeholder="Describe the medical condition…" /></Field>
        )}

        <Field label="Takes medication? *">
          <select style={s.input} value={form.has_medications} onChange={(e) => set("has_medications", e.target.value)}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {form.has_medications === "yes" && (
          <Field label="Describe *"><textarea style={{ ...s.input, minHeight: 60 }} value={form.medications} onChange={(e) => set("medications", e.target.value)} placeholder="Describe the medication…" /></Field>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "12px 0", paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: colors.textMid }}>Emergency Contact</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field label="Name"><input style={s.input} value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></Field>
          <Field label="Phone"><input style={s.input} value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></Field>
        </div>
        <Field label="Relationship"><input style={s.input} value={form.emergency_contact_relation} onChange={(e) => set("emergency_contact_relation", e.target.value)} placeholder="e.g. Mother, Uncle" /></Field>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "12px 0", paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: colors.textMid }}>Support & Services</div>
        <Field label="Receives support or services?">
          <select style={s.input} value={form.receives_services} onChange={(e) => set("receives_services", e.target.value)}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {form.receives_services === "yes" && (
          <Field label="Description"><textarea style={{ ...s.input, minHeight: 60 }} value={form.services_description} onChange={(e) => set("services_description", e.target.value)} placeholder="Describe services…" /></Field>
        )}
        <Field label="Additional Notes (from parent)"><textarea style={{ ...s.input, minHeight: 60 }} value={form.additional_notes} onChange={(e) => set("additional_notes", e.target.value)} placeholder="Anything else the parent shared…" /></Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => {
          if (!form.first_name.trim() || !form.last_name.trim()) return alert("Name is required.");
          if (!form.date_of_birth) return alert("Date of birth is required.");
          if (!form.gender) return alert("Gender is required.");
          if (form.grade === "") return alert("Class/grade is required.");
          const isPreschool = matchedDivision && (matchedDivision.name || "").toLowerCase().includes("preschool");
          if (!form.tshirt_size && !isPreschool) return alert("T-shirt size is required.");
          onSave({
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            date_of_birth: form.date_of_birth,
            gender: form.gender,
            grade: form.grade !== "" ? Number(form.grade) : null,
            tshirt_size: form.tshirt_size,
            has_food_allergies: form.has_food_allergies === "yes",
            allergies: form.has_food_allergies === "yes" ? form.allergies.trim() : "",
            has_medical_condition: form.has_medical_condition === "yes",
            medical_notes: form.has_medical_condition === "yes" ? form.medical_notes.trim() : "",
            has_medications: form.has_medications === "yes",
            medications: form.has_medications === "yes" ? form.medications.trim() : "",
            emergency_contact_name: form.emergency_contact_name.trim(),
            emergency_contact_phone: form.emergency_contact_phone.trim(),
            emergency_contact_relation: form.emergency_contact_relation.trim(),
            receives_services: form.receives_services === "yes" ? true : form.receives_services === "no" ? false : null,
            services_description: form.services_description.trim() || null,
            additional_notes: form.additional_notes.trim() || null,
            parent_id: parentId,
            assigned_division_id: matchedDivision?.id || null,
          });
        }} disabled={saving} style={s.btn("primary")}>
          {saving ? <Spinner size={16} /> : isEdit ? "Save Changes" : "Add Child"}
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
  const [divisions, setDivisions] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [children, setChildren] = useState([]);
  const [parents, setParents] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [settings, setSettings] = useState({});
  const [discountCodes, setDiscountCodes] = useState([]);
  const [shirtOrders, setShirtOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDivision, setFilterDivision] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [familySearch, setFamilySearch] = useState("");
  const [filterBalance, setFilterBalance] = useState("all");
  const [filterElrc, setFilterElrc] = useState("all");
  const [divisionModal, setDivisionModal] = useState(null);
  const [weekModal, setWeekModal] = useState(null);
  const [weekModalDivision, setWeekModalDivision] = useState(null);
  const [discountModal, setDiscountModal] = useState(null);
  const [settingsModal, setSettingsModal] = useState(false);
  const [ledgerPayments, setLedgerPayments] = useState([]);
  const [familyModal, setFamilyModal] = useState(null);
  const [adminChildModal, setAdminChildModal] = useState(null);
  const [adminChildParentId, setAdminChildParentId] = useState(null);
  const [registerChild, setRegisterChild] = useState(null);
  const [saving, setSaving] = useState(false);
  const [adminRole, setAdminRole] = useState("admin");
  const [waitlistApprovalRegs, setWaitlistApprovalRegs] = useState(null); // array of regs for modal
  const [waitlistApprovalSelected, setWaitlistApprovalSelected] = useState(new Set());
  const [reminderModal, setReminderModal] = useState(null); // 'no_weeks' | 'outstanding_balance'
  const [reminderPreview, setReminderPreview] = useState(null);
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);
  const [revenuePanel, setRevenuePanel] = useState(false);

  const load = useCallback(async () => {
    try {
      const [reg, divs, wks, ch, par, codes, ledg, settingsRows, shirts] = await Promise.all([
        sb.query("registrations", { select: "*", filters: "&order=created_at.desc&limit=10000" }),
        sb.query("divisions", { filters: "&order=sort_order.asc" }),
        sb.query("division_weeks", { filters: "&order=sort_order.asc" }),
        sb.query("children", { filters: "&limit=5000" }),
        sb.query("parents", { filters: "&limit=5000" }),
        sb.query("discount_codes", { filters: "&order=created_at.desc" }).catch(() => []),
        sb.query("family_ledger").catch(() => []),
        sb.query("camp_settings").catch(() => []),
        sb.query("shirt_orders", { filters: "&order=created_at.desc" }).catch(() => []),
      ]);
      setRegistrations(reg || []); setDivisions(divs || []); setWeeks(wks || []); setChildren(ch || []); setParents(par || []); setDiscountCodes(codes || []); setLedgers(ledg || []); setShirtOrders(shirts || []);
      const st = {}; (settingsRows || []).forEach((row) => { try { st[row.key] = JSON.parse(row.value); } catch { st[row.key] = row.value; } }); setSettings(st);
      // Fetch admin role
      try { const roleRows = await sb.query("admin_users", { filters: `&id=eq.${user.id}`, select: "role" }); if (roleRows && roleRows[0]) setAdminRole(roleRows[0].role || "admin"); } catch { /* default to admin */ }
    } catch (e) { console.error("Admin load:", e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSignOut = async () => { await sb.signOut(); window.location.reload(); };

  const childMap = Object.fromEntries((children || []).map((c) => [c.id, c]));
  const parentMap = Object.fromEntries((parents || []).map((p) => [p.id, p]));
  const divisionMap = Object.fromEntries((divisions || []).map((d) => [d.id, d]));
  const weekMap = Object.fromEntries((weeks || []).map((w) => [w.id, w]));
  const ledgerMap = Object.fromEntries((ledgers || []).map((l) => [l.parent_id, l]));

  const deleteRegistration = async (reg) => {
    const child = childMap[reg.child_id];
    const wk = weekMap[reg.week_id];
    const label = `${child?.first_name || "?"} — ${wk?.name || "?"}`;
    const isWaitlisted = reg.status === "waitlisted";
    const confirmMsg = isWaitlisted
      ? `Remove ${label} from the waitlist?`
      : `Remove registration: ${label}? This will delete the row and adjust the family balance.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await sb.query("registrations", { method: "DELETE", filters: `&id=eq.${reg.id}` });
      // Only adjust family ledger for non-waitlisted registrations
      if (!isWaitlisted) {
        const parentId = child?.parent_id;
        if (parentId) {
          const ledger = ledgerMap[parentId];
          if (ledger) {
            const newDue = Math.max(0, (Number(ledger.total_due_cents) || 0) - (Number(reg.price_cents) || 0));
            await sb.query("family_ledger", {
              method: "PATCH",
              body: { total_due_cents: newDue, updated_at: new Date().toISOString() },
              filters: `&parent_id=eq.${parentId}`,
              headers: { Prefer: "return=minimal" },
            });
          }
        }
      }
      showToast(isWaitlisted ? `Removed from waitlist: ${label}.` : `Removed: ${label}. Ledger adjusted.`);
      load();
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleSaveDivision = async (data) => { setSaving(true); try { if (divisionModal && divisionModal !== "create") { await sb.query("divisions", { method: "PATCH", body: { ...data, updated_at: new Date().toISOString() }, filters: `&id=eq.${divisionModal.id}`, headers: { Prefer: "return=minimal" } }); showToast("Division updated!"); } else { await sb.query("divisions", { method: "POST", body: data, headers: { Prefer: "return=minimal" } }); showToast("Division created!"); } setDivisionModal(null); load(); } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); } };

  // ── Approve waitlisted registration(s) — opens modal if multiple ──
  const handleApproveWaitlist = async (reg) => {
    const child = childMap[reg.child_id];
    const allWaitlisted = registrations.filter(
      (r) => r.child_id === reg.child_id && r.status === "waitlisted"
    );

    if (allWaitlisted.length > 1) {
      // Multiple weeks — open selection modal
      setWaitlistApprovalRegs(allWaitlisted);
      setWaitlistApprovalSelected(new Set(allWaitlisted.map((r) => r.id)));
      return;
    }

    // Single week — direct approve with confirm
    const wk = weekMap[reg.week_id];
    const parentId = child?.parent_id;
    const parent = parentMap[parentId];
    if (!window.confirm(`Approve ${child?.first_name} — ${wk?.name} from the waitlist?\n\nThis will add $${(reg.price_cents / 100).toFixed(0)} to the family balance and notify the parent.`)) return;

    await processWaitlistApproval([reg]);
  };

  // ── Process selected waitlist approvals — shared by single + batch ──
  const processWaitlistApproval = async (regsToApprove) => {
    if (regsToApprove.length === 0) return;
    const child = childMap[regsToApprove[0].child_id];
    const div = divisionMap[regsToApprove[0].division_id];
    const parentId = child?.parent_id;
    const parent = parentMap[parentId];

    setSaving(true);
    try {
      let totalPriceCents = 0;
      const approvedWeekDetails = [];

      for (const r of regsToApprove) {
        await sb.query("registrations", {
          method: "PATCH",
          body: { status: "pending", waitlist_position: null, updated_at: new Date().toISOString() },
          filters: `&id=eq.${r.id}`,
          headers: { Prefer: "return=minimal" },
        });
        totalPriceCents += Number(r.price_cents) || 0;
        const wk = weekMap[r.week_id];
        approvedWeekDetails.push({ name: wk?.name || "Week", priceCents: r.price_cents });
      }

      // Add total price to family ledger — one operation
      if (parentId && totalPriceCents > 0) {
        const ledger = ledgerMap[parentId];
        if (ledger) {
          const newDue = (Number(ledger.total_due_cents) || 0) + totalPriceCents;
          await sb.query("family_ledger", {
            method: "PATCH",
            body: { total_due_cents: newDue, updated_at: new Date().toISOString() },
            filters: `&parent_id=eq.${parentId}`,
            headers: { Prefer: "return=minimal" },
          });
        } else {
          await sb.query("family_ledger", {
            method: "POST",
            body: { parent_id: parentId, total_due_cents: totalPriceCents, total_paid_cents: 0, discount_amount_cents: 0 },
            headers: { Prefer: "return=minimal" },
          });
        }
      }

      // Send ONE email with all approved weeks
      const PRESCHOOL_GRADES = { "-5": "Infants", "-4": "Toddler", "-3": "Pre Nursery", "-2": "Nursery", "-1": "Pre K" };
      const className = PRESCHOOL_GRADES[String(child?.grade)] || "";
      try {
        await fetch("/.netlify/functions/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "waitlist_approved",
            data: {
              parentId,
              parentEmail: parent?.email,
              parentName: parent?.full_name || "Camp Family",
              childName: `${child?.first_name} ${child?.last_name}`,
              className,
              divisionName: div?.name || "Preschool",
              weeks: approvedWeekDetails,
              totalCents: totalPriceCents,
            },
          }),
        });
      } catch (e) { console.warn("Approval email failed:", e.message); }

      const count = regsToApprove.length;
      showToast(`Approved ${count} week${count !== 1 ? "s" : ""} for ${child?.first_name}. Email sent to ${parent?.email || "parent"}.`);
      setWaitlistApprovalRegs(null);
      setWaitlistApprovalSelected(new Set());
      load();
    } catch (e) {
      alert("Error approving: " + e.message);
    } finally { setSaving(false); }
  };
  const handleDeleteDivision = async (div) => { const weekCount = weeks.filter((w) => w.division_id === div.id).length; if (!window.confirm(`Delete "${div.name}"${weekCount ? ` and its ${weekCount} weeks` : ""}? This cannot be undone.`)) return; try { await sb.query("divisions", { method: "DELETE", filters: `&id=eq.${div.id}` }); showToast("Division deleted."); load(); } catch (e) { alert("Error: " + e.message); } };
  const handleSaveWeek = async (data) => { setSaving(true); try { if (weekModal && weekModal !== "create") { await sb.query("division_weeks", { method: "PATCH", body: data, filters: `&id=eq.${weekModal.id}`, headers: { Prefer: "return=minimal" } }); showToast("Week updated!"); } else { await sb.query("division_weeks", { method: "POST", body: data, headers: { Prefer: "return=minimal" } }); showToast("Week added!"); } setWeekModal(null); setWeekModalDivision(null); load(); } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); } };
  const handleDeleteWeek = async (wk) => { if (!window.confirm(`Delete "${wk.name}"? This cannot be undone.`)) return; try { await sb.query("division_weeks", { method: "DELETE", filters: `&id=eq.${wk.id}` }); showToast("Week deleted."); load(); } catch (e) { alert("Error: " + e.message); } };
  const handleSaveSettings = async (data) => { setSaving(true); try { for (const [key, value] of Object.entries(data)) { const jsonVal = JSON.stringify(value); const existing = await sb.query("camp_settings", { filters: `&key=eq.${key}` }); if (existing && existing.length > 0) { await sb.query("camp_settings", { method: "PATCH", body: { value: jsonVal, updated_at: new Date().toISOString() }, filters: `&key=eq.${key}`, headers: { Prefer: "return=minimal" } }); } else { await sb.query("camp_settings", { method: "POST", body: { key, value: jsonVal }, headers: { Prefer: "return=minimal" } }); } } showToast("Settings saved!"); setSettingsModal(false); load(); } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); } };

  const openFamily = async (parent) => { try { const payments = await sb.query("payment_log", { filters: `&parent_id=eq.${parent.id}&order=created_at.desc` }); setLedgerPayments(payments || []); } catch { setLedgerPayments([]); } setFamilyModal(parent); };
  const handleRecordPayment = async (data) => { setSaving(true); try { const parentId = familyModal.id; await sb.query("payment_log", { method: "POST", body: { parent_id: parentId, amount_cents: data.amount_cents, method: data.method, notes: data.notes, recorded_by: user.id }, headers: { Prefer: "return=minimal" } }); const ledger = ledgerMap[parentId]; if (ledger) { await sb.query("family_ledger", { method: "PATCH", body: { total_paid_cents: (ledger.total_paid_cents || 0) + data.amount_cents, updated_at: new Date().toISOString() }, filters: `&parent_id=eq.${parentId}`, headers: { Prefer: "return=minimal" } }); } showToast("Payment recorded!"); load(); openFamily(familyModal); } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); } };
  const handleClearBalance = async ({ reason, amount_cents }) => { setSaving(true); try { const parentId = familyModal.id; const ledger = ledgerMap[parentId]; const currentForgiven = ledger?.forgiven_cents || 0; const newForgiven = currentForgiven + amount_cents; const remainingAfter = (ledger?.total_due_cents || 0) - (ledger?.total_paid_cents || 0) - newForgiven; const isFullForgiveness = remainingAfter <= 0; const patchBody = { forgiven_cents: newForgiven, balance_cleared_reason: reason, balance_cleared_by: user.id, balance_cleared_at: new Date().toISOString(), updated_at: new Date().toISOString() }; if (isFullForgiveness) patchBody.balance_cleared = true; await sb.query("family_ledger", { method: "PATCH", body: patchBody, filters: `&parent_id=eq.${parentId}`, headers: { Prefer: "return=minimal" } }); await sb.query("payment_log", { method: "POST", body: { parent_id: parentId, amount_cents, method: "forgiveness", notes: `Scholarship: ${reason}`, recorded_by: user.id }, headers: { Prefer: "return=minimal" } }); showToast(isFullForgiveness ? "Scholarship applied — balance cleared!" : `Scholarship of $${(amount_cents / 100).toFixed(0)} applied!`); load(); openFamily(familyModal); } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); } };

  const handleSaveFamily = async (data) => { setSaving(true); try { await sb.query("parents", { method: "PATCH", body: { ...data, updated_at: new Date().toISOString() }, filters: `&id=eq.${familyModal.id}`, headers: { Prefer: "return=minimal" } }); showToast("Family updated!"); load(); } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); } };
  const handleSaveAdminChild = async (data) => { setSaving(true); try { if (adminChildModal && adminChildModal !== "create") { const { parent_id, ...updateData } = data; await sb.query("children", { method: "PATCH", body: { ...updateData, updated_at: new Date().toISOString() }, filters: `&id=eq.${adminChildModal.id}`, headers: { Prefer: "return=minimal" } }); showToast("Child updated!"); } else { await sb.query("children", { method: "POST", body: data, headers: { Prefer: "return=minimal" } }); showToast("Child added!"); } setAdminChildModal(null); setAdminChildParentId(null); load(); } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); } };

  const handleAdminRegister = async (regData) => {
    setSaving(true);
    try {
      // Admin bypasses capacity — merge waitlist_weeks into regular weeks, all go as pending
      const allWeeks = [...(regData.weeks || []), ...(regData.waitlist_weeks || [])];
      const allTotalCents = allWeeks.reduce((sum, w) => sum + (w.price_cents || 0), 0);

      for (const week of allWeeks) {
        await sb.query("registrations", {
          method: "POST",
          body: { child_id: regData.child_id, division_id: week.division_id, week_id: week.week_id, price_cents: week.price_cents, status: "pending" },
          headers: { Prefer: "return=minimal" },
        });
      }
      const parentId = registerChild?.parent_id;
      if (parentId) {
        const ledger = ledgerMap[parentId];
        const currentDue = (ledger?.total_due_cents || 0) + allTotalCents;
        if (ledger) {
          await sb.query("family_ledger", {
            method: "PATCH",
            body: { total_due_cents: currentDue, discount_amount_cents: (ledger.discount_amount_cents || 0) + regData.discount_cents, updated_at: new Date().toISOString() },
            filters: `&parent_id=eq.${parentId}`,
            headers: { Prefer: "return=minimal" },
          });
        } else {
          await sb.query("family_ledger", {
            method: "POST",
            body: { parent_id: parentId, total_due_cents: allTotalCents, discount_amount_cents: regData.discount_cents },
            headers: { Prefer: "return=minimal" },
          });
        }
      }
      showToast(`Registered for ${allWeeks.length} week${allWeeks.length !== 1 ? "s" : ""}!`);
      setRegisterChild(null);
      load();
    } catch (e) {
      if (e.message?.includes("unique") || e.message?.includes("duplicate")) {
        alert("This child is already registered for one of the selected weeks.");
      } else { alert("Error: " + e.message); }
    } finally { setSaving(false); }
  };

  // ── Payment Plan Toggle ──
  const handleSavePaymentPlan = async (data) => {
    setSaving(true);
    try {
      const parentId = familyModal.id;
      await sb.query("family_ledger", {
        method: "PATCH",
        body: { payment_plan: data.payment_plan, payment_plan_note: data.payment_plan_note || null, updated_at: new Date().toISOString() },
        filters: `&parent_id=eq.${parentId}`,
        headers: { Prefer: "return=minimal" },
      });
      showToast(data.payment_plan ? "Payment plan enabled." : "Payment plan removed.");
      load();
    } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); }
  };

  // ── Bulk Reminder Handlers ──
  const handleReminderPreview = async (type) => {
    setReminderModal(type);
    setReminderPreview(null);
    setReminderResult(null);
    setReminderSending(true);
    try {
      const session = sb.supabase ? await sb.supabase.auth.getSession() : (sb.auth ? await sb.auth.getSession() : null);
      const token = session?.data?.session?.access_token || "";
      const res = await fetch("/.netlify/functions/send-bulk-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ type, dry_run: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load preview");
      setReminderPreview(data.recipients || []);
    } catch (e) {
      alert("Error loading preview: " + e.message);
      setReminderModal(null);
    } finally { setReminderSending(false); }
  };

  const handleReminderSend = async () => {
    if (!reminderModal || !reminderPreview?.length) return;
    if (!window.confirm(`Send ${reminderPreview.length} reminder email${reminderPreview.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setReminderSending(true);
    try {
      const session = sb.supabase ? await sb.supabase.auth.getSession() : (sb.auth ? await sb.auth.getSession() : null);
      const token = session?.data?.session?.access_token || "";
      const res = await fetch("/.netlify/functions/send-bulk-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ type: reminderModal, dry_run: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setReminderResult(data);
      showToast(`Sent ${data.sent || 0} reminder email${data.sent !== 1 ? "s" : ""}!`);
    } catch (e) {
      alert("Error sending: " + e.message);
    } finally { setReminderSending(false); }
  };

  const filtered = registrations.filter((r) => {
    if (filterDivision !== "all" && r.division_id !== filterDivision) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) { const child = childMap[r.child_id]; const par = child ? parentMap[child.parent_id] : null; const term = search.toLowerCase(); const haystack = `${child?.first_name || ""} ${child?.last_name || ""} ${par?.full_name || ""} ${par?.email || ""}`.toLowerCase(); if (!haystack.includes(term)) return false; }
    return true;
  });

  const exportCSV = () => {
    const headers = ["Child", "Age", "Parent", "Email", "Phone", "Parent 2", "Parent 2 Phone", "Address", "Division", "Week", "Status", ...(!isStaff ? ["Price"] : []), "Food Allergies", "Medical Condition", "Medications", "Services", "Services Detail", "Additional Notes", "Registered"];
    const rows = [headers];
    filtered.forEach((r) => { const c = childMap[r.child_id]; const p = c ? parentMap[c.parent_id] : {}; const div = divisionMap[r.division_id]; const wk = weekMap[r.week_id]; const age = c?.date_of_birth ? Math.floor((Date.now() - new Date(c.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : ""; const addr = [p?.street_address, p?.city, p?.state, p?.zip].filter(Boolean).join(", ") || p?.address || ""; const p2Name = [p?.parent2_first_name, p?.parent2_last_name].filter(Boolean).join(" "); rows.push([`${c?.first_name || ""} ${c?.last_name || ""}`, age, p?.full_name || "", p?.email || "", p?.phone || "", p2Name, p?.parent2_phone || "", addr, div?.name || "", wk?.name || "", r.status, ...(!isStaff ? [`$${(r.price_cents / 100).toFixed(0)}`] : []), c?.has_food_allergies ? `Yes: ${c.allergies}` : "No", c?.has_medical_condition ? `Yes: ${c.medical_notes || c.medical_info || ""}` : "No", c?.has_medications ? `Yes: ${c.medications}` : "No", c?.receives_services ? "Yes" : "No", c?.services_description || "", c?.additional_notes || "", new Date(r.created_at).toLocaleDateString()]); });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `cgi-registrations-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); showToast("Exported!");
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}><Spinner size={32} /></div>;

  const totalRegs = registrations.length;
  const totalWaitlisted = registrations.filter((r) => r.status === "waitlisted").length;
  const totalRevenue = ledgers.reduce((sum, l) => sum + (l.total_paid_cents || 0), 0);
  const totalForgiven = ledgers.reduce((sum, l) => sum + (l.forgiven_cents || 0), 0);
  const totalOutstanding = ledgers.reduce((sum, l) => { const b = (l.total_due_cents || 0) - (l.total_paid_cents || 0) - (l.forgiven_cents || 0); return sum + Math.max(0, b); }, 0);
  const campName = settings.camp_name || "CGI Wilkes Rebbe";
  const isStaff = adminRole === "staff" || adminRole === "counselor";

  return (
    <div style={{ minHeight: "100vh", background: colors.bg }}>
      <header style={{ background: colors.forest, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><img src="/logo.png" alt="CGI Wilkes Rebbe" style={{ width: 28, height: 28, objectFit: "contain", borderRadius: "50%" }} /><span style={{ fontFamily: font.display, color: "#fff", fontSize: 20 }}>{campName}</span><span style={s.badge("#fff")}>{isStaff ? "Staff" : "Admin"}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ color: "#fff", fontSize: 15, fontWeight: "bold", fontFamily: "serif" }}>בס״ד</span><button onClick={() => setView("parent")} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.8)", padding: "6px 14px", fontSize: 13 }}>{Icons.home({ size: 14, color: "rgba(255,255,255,.8)" })} Parent View</button><button onClick={handleSignOut} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.6)", padding: "6px 10px" }}>{Icons.logout({ size: 16, color: "rgba(255,255,255,.6)" })}</button></div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
          <div style={s.card}><div style={{ fontSize: 12, color: colors.textMid, fontWeight: 600, marginBottom: 4 }}>Total Registrations</div><div style={{ fontFamily: font.display, fontSize: 28 }}>{totalRegs}</div></div>
          {totalWaitlisted > 0 && <div style={{ ...s.card, border: `1px solid ${colors.amber}` }}><div style={{ fontSize: 12, color: colors.amber, fontWeight: 600, marginBottom: 4 }}>⏳ Waitlisted</div><div style={{ fontFamily: font.display, fontSize: 28, color: colors.amber }}>{totalWaitlisted}</div></div>}
          {!isStaff && <div style={{ ...s.card, cursor: "pointer" }} onClick={() => setRevenuePanel(true)}><div style={{ fontSize: 12, color: colors.textMid, fontWeight: 600, marginBottom: 4 }}>Revenue (Collected)</div><div style={{ fontFamily: font.display, fontSize: 28, color: colors.forest }}>${(totalRevenue / 100).toLocaleString()}</div></div>}
          {!isStaff && totalForgiven > 0 && <div style={{ ...s.card, cursor: "pointer" }} onClick={() => { setTab("families"); setFilterBalance("cleared"); }}><div style={{ fontSize: 12, color: colors.success, fontWeight: 600, marginBottom: 4 }}>Scholarships</div><div style={{ fontFamily: font.display, fontSize: 28, color: colors.success }}>${(totalForgiven / 100).toLocaleString()}</div></div>}
          {!isStaff && totalOutstanding > 0 && <div style={{ ...s.card, cursor: "pointer" }} onClick={() => { setTab("families"); setFilterBalance("has_balance"); }}><div style={{ fontSize: 12, color: colors.amber, fontWeight: 600, marginBottom: 4 }}>Outstanding</div><div style={{ fontFamily: font.display, fontSize: 28, color: colors.amber }}>${(totalOutstanding / 100).toLocaleString()}</div></div>}
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${colors.border}`, paddingBottom: 0, flexWrap: "wrap" }}>
          {[{ key: "registrations", label: "Registrations", icon: Icons.clipboard }, { key: "divisions", label: "Divisions & Weeks", icon: Icons.calendar }, { key: "families", label: "Families", icon: Icons.users }, { key: "discounts", label: "Discounts", icon: Icons.dollar }, { key: "shirts", label: "T-Shirts", icon: Icons.clipboard }, { key: "bunks", label: "Bunks", icon: Icons.users }, { key: "settings", label: "Settings", icon: Icons.shield }].filter((t) => !isStaff || !["discounts", "settings", "shirts"].includes(t.key)).map((t) => (
            <button key={t.key} onClick={() => t.key === "settings" ? setSettingsModal(true) : setTab(t.key)} style={{ ...s.btn("ghost"), borderBottom: `2px solid ${tab === t.key ? colors.forest : "transparent"}`, color: tab === t.key ? colors.forest : colors.textMid, borderRadius: 0, padding: "10px 16px", fontWeight: 600, fontSize: 14 }}>{t.icon({ size: 15, color: tab === t.key ? colors.forest : colors.textMid })} {t.label}</button>
          ))}
        </div>

        {/* ═══ REGISTRATIONS TAB ═══ */}
        {tab === "registrations" && (<div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>{Icons.search({ size: 16, color: colors.textLight })}</span><input style={{ ...s.input, paddingLeft: 36 }} placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select style={{ ...s.input, width: "auto", minWidth: 160 }} value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)}><option value="all">All Divisions</option>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <select style={{ ...s.input, width: "auto", minWidth: 130 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}><option value="all">All Status</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="waitlisted">Waitlisted</option><option value="cancelled">Cancelled</option></select>
            <button onClick={exportCSV} style={s.btn("secondary")}>{Icons.download({ size: 14 })} Export CSV</button>
          </div>
          <div style={{ ...s.card, padding: 0, overflow: "auto" }}>
            {filtered.length === 0 ? (<EmptyState icon={Icons.clipboard} title="No registrations found" sub="Adjust your filters or wait for parents to register." />) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead><tr style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg }}>{["Camper", "Parent", "Division", "Week", "Status", !isStaff && "Price", "Date", "Actions"].filter(Boolean).map((h) => (<th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: colors.textMid, whiteSpace: "nowrap" }}>{h}</th>))}</tr></thead>
                <tbody>{filtered.map((r) => { const c = childMap[r.child_id]; const p = c ? parentMap[c.parent_id] : {}; const div = divisionMap[r.division_id]; const wk = weekMap[r.week_id]; return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c?.first_name} {c?.last_name}</td>
                    <td style={{ padding: "10px 14px" }}>{p?.full_name}<div style={{ fontSize: 12, color: colors.textMid }}>{p?.email}</div>{p?.parent2_first_name && <div style={{ fontSize: 11, color: colors.textLight }}>P2: {p.parent2_first_name} {p.parent2_last_name}{p.parent2_phone ? ` · ${p.parent2_phone}` : ""}</div>}</td>
                    <td style={{ padding: "10px 14px" }}>{div?.name}</td>
                    <td style={{ padding: "10px 14px" }}>{wk?.name}<div style={{ fontSize: 12, color: colors.textMid }}>{fmtDate(wk?.start_date)}</div></td>
                    <td style={{ padding: "10px 14px" }}><StatusBadge status={r.status} /></td>
                    {!isStaff && <td style={{ padding: "10px 14px", fontSize: 13 }}>${(r.price_cents / 100).toFixed(0)}</td>}
                    <td style={{ padding: "10px 14px", fontSize: 13, color: colors.textMid }}>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: "10px 14px" }}>{!isStaff && <div style={{ display: "flex", gap: 4 }}>{r.status === "waitlisted" && (<button onClick={() => handleApproveWaitlist(r)} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.success }}>{Icons.check({ size: 13, color: colors.success })} Approve</button>)}<button onClick={() => deleteRegistration(r)} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.coral }}>{Icons.x({ size: 13, color: colors.coral })} Remove</button></div>}</td>
                  </tr>); })}</tbody>
              </table>
            )}
          </div>
        </div>)}

        {/* ═══ DIVISIONS & WEEKS TAB ═══ */}
        {tab === "divisions" && (<div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, color: colors.textMid }}>{divisions.length} division{divisions.length !== 1 ? "s" : ""}</div>
            {!isStaff && <button onClick={() => setDivisionModal("create")} style={s.btn("primary")}>{Icons.plus({ size: 16, color: "#fff" })} Add Division</button>}
          </div>
          {divisions.length === 0 ? (<div style={s.card}><EmptyState icon={Icons.calendar} title="No divisions yet" sub="Create your first division." /></div>) : (
            <div style={{ display: "grid", gap: 16 }}>{divisions.map((div) => {
              const divWeeks = weeks.filter((w) => w.division_id === div.id).sort((a, b) => a.sort_order - b.sort_order);
              const totalEnrolled = registrations.filter((r) => r.division_id === div.id && r.status !== "cancelled").length;
              return (
                <div key={div.id} style={{ ...s.card, opacity: div.active === false ? 0.55 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontFamily: font.display, fontSize: 18 }}>{div.name}</span>
                        {div.active === false && <span style={s.badge(colors.textMid)}>Inactive</span>}
                        {div.schedule_type && <span style={s.badge(colors.forest)}>{div.schedule_type === "half_day" ? "Half Day" : "Full Day"}</span>}
                      </div>
                      <div style={{ fontSize: 14, color: colors.textMid }}>
                        {!isStaff && `$${(div.per_week_price / 100).toFixed(0)}/week · `}{div.gender_filter === "any" ? "All" : div.gender_filter === "male" ? "Boys" : "Girls"} · {totalEnrolled} registrations
                      </div>
                    </div>
                    {!isStaff && <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setDivisionModal(div)} style={{ ...s.btn("secondary"), padding: "7px 12px", fontSize: 13 }}>{Icons.edit({ size: 14 })} Edit</button>
                      <button onClick={() => handleDeleteDivision(div)} style={{ ...s.btn("ghost"), padding: "7px 10px", color: colors.coral }}>{Icons.trash({ size: 14, color: colors.coral })}</button>
                    </div>}
                  </div>
                  <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.textMid }}>{divWeeks.length} Week{divWeeks.length !== 1 ? "s" : ""}</span>
                      {!isStaff && <button onClick={() => { setWeekModalDivision(div); setWeekModal("create"); }} style={{ ...s.btn("ghost"), padding: "4px 10px", fontSize: 12, color: colors.forest }}>{Icons.plus({ size: 13, color: colors.forest })} Add Week</button>}
                    </div>
                    {divWeeks.length === 0 ? (<div style={{ fontSize: 13, color: colors.textLight, padding: "8px 0" }}>No weeks added yet.</div>) : (
                      <div style={{ display: "grid", gap: 6 }}>{divWeeks.map((wk) => {
                        const enrolled = registrations.filter((r) => r.week_id === wk.id && r.status !== "cancelled").length;
                        const price = wk.price_override_cents ?? div.per_week_price;
                        return (
                          <div key={wk.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: colors.bg, borderRadius: 8, fontSize: 13 }}>
                            <div><span style={{ fontWeight: 600 }}>{wk.name}</span><span style={{ color: colors.textMid }}> · {fmtDate(wk.start_date)} – {fmtDate(wk.end_date)}</span>{!isStaff && <span style={{ color: colors.textMid }}> · ${(price / 100).toFixed(0)}</span>}<span style={{ color: colors.textLight }}> · {enrolled}/{wk.capacity}</span></div>
                            {!isStaff && <div style={{ display: "flex", gap: 4 }}><button onClick={() => { setWeekModalDivision(div); setWeekModal(wk); }} style={{ ...s.btn("ghost"), padding: "3px 6px", fontSize: 11 }}>{Icons.edit({ size: 12 })}</button><button onClick={() => handleDeleteWeek(wk)} style={{ ...s.btn("ghost"), padding: "3px 6px", color: colors.coral }}>{Icons.trash({ size: 12, color: colors.coral })}</button></div>}
                          </div>);
                      })}</div>
                    )}
                  </div>
                </div>);
            })}</div>
          )}
        </div>)}

        {/* ═══ FAMILIES TAB ═══ */}
        {tab === "families" && (() => {
          const filteredFamilies = parents.filter((p) => {
            if (familySearch) { const term = familySearch.toLowerCase(); const kids = children.filter((c) => c.parent_id === p.id); const haystack = `${p.full_name || ""} ${p.email || ""} ${kids.map((k) => `${k.first_name} ${k.last_name}`).join(" ")}`.toLowerCase(); if (!haystack.includes(term)) return false; }
            if (filterElrc !== "all") { if (filterElrc === "elrc" && !p.elrc_status) return false; if (filterElrc === "non-elrc" && p.elrc_status) return false; }
            if (filterBalance !== "all") { const ledger = ledgerMap[p.id]; const due = ledger?.total_due_cents || 0; const paid = ledger?.total_paid_cents || 0; const forg = ledger?.forgiven_cents || 0; const balance = due - paid - forg; const cleared = ledger?.balance_cleared || (forg > 0 && balance <= 0); if (filterBalance === "has_balance" && (balance <= 0 || cleared)) return false; if (filterBalance === "paid_up" && (balance > 0 || due === 0 || cleared)) return false; if (filterBalance === "cleared" && forg <= 0) return false; }
            return true;
          });
          const exportFamiliesCSV = () => { const headers = ["Parent", "Email", "Phone", "Address", "Parent 2", "Parent 2 Phone", "ELRC", "Children", ...(!isStaff ? ["Total Due", "Paid", "Scholarship", "Balance", "Status"] : [])]; const rows = [headers]; filteredFamilies.forEach((p) => { const kids = children.filter((c) => c.parent_id === p.id); const ledger = ledgerMap[p.id]; const due = ledger?.total_due_cents || 0; const paid = ledger?.total_paid_cents || 0; const forg = ledger?.forgiven_cents || 0; const balance = due - paid - forg; const cleared = ledger?.balance_cleared || (forg > 0 && balance <= 0); const status = cleared ? "Scholarship" : balance === 0 && due > 0 ? "Paid" : balance > 0 ? "Unpaid" : "—"; const addr = [p.street_address, p.city, p.state, p.zip].filter(Boolean).join(", ") || p.address || ""; const p2Name = [p.parent2_first_name, p.parent2_last_name].filter(Boolean).join(" "); rows.push([p.full_name || "", p.email || "", p.phone || "", addr, p2Name, p.parent2_phone || "", p.elrc_status ? "Yes" : "No", kids.map((k) => `${k.first_name} ${k.last_name}`).join("; ") || "—", ...(!isStaff ? [`$${(due / 100).toFixed(0)}`, `$${(paid / 100).toFixed(0)}`, forg > 0 ? `$${(forg / 100).toFixed(0)}` : "—", cleared ? "Scholarship" : `$${(balance / 100).toFixed(0)}`, status] : [])]); }); const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `cgi-families-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); showToast("Exported!"); };
          return (<div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 200 }}><span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>{Icons.search({ size: 16, color: colors.textLight })}</span><input style={{ ...s.input, paddingLeft: 36 }} placeholder="Search by name, email, or child…" value={familySearch} onChange={(e) => setFamilySearch(e.target.value)} /></div>
              {!isStaff && <select style={{ ...s.input, width: "auto", minWidth: 140 }} value={filterBalance} onChange={(e) => setFilterBalance(e.target.value)}><option value="all">All Balances</option><option value="has_balance">Has Balance</option><option value="paid_up">Paid Up</option><option value="cleared">Scholarship</option></select>}
              <select style={{ ...s.input, width: "auto", minWidth: 120 }} value={filterElrc} onChange={(e) => setFilterElrc(e.target.value)}><option value="all">All Families</option><option value="elrc">ELRC</option><option value="non-elrc">Non-ELRC</option></select>
              <button onClick={exportFamiliesCSV} style={s.btn("secondary")}>{Icons.download({ size: 14 })} Export CSV</button>
              {!isStaff && <button onClick={() => handleReminderPreview("no_weeks")} style={{ ...s.btn("secondary"), color: colors.amber, borderColor: colors.amber }}>📧 Remind: No Weeks</button>}
              {!isStaff && <button onClick={() => handleReminderPreview("outstanding_balance")} style={{ ...s.btn("secondary"), color: colors.coral, borderColor: colors.coral }}>📧 Remind: Balance Due</button>}
            </div>
            <div style={{ fontSize: 14, color: colors.textMid, marginBottom: 12 }}>{filteredFamilies.length} of {parents.length} families</div>
            <div style={{ ...s.card, padding: 0, overflow: "auto" }}>
              {filteredFamilies.length === 0 ? (<EmptyState icon={Icons.users} title="No families found" sub="Adjust your filters or wait for parents to register." />) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}><thead><tr style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg }}>{["Parent", "Email", "Children", "ELRC", ...(!isStaff ? ["Total Due", "Paid", "Scholarship", "Balance", "Status"] : []), "Actions"].map((h) => (<th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: colors.textMid, whiteSpace: "nowrap" }}>{h}</th>))}</tr></thead>
                <tbody>{filteredFamilies.map((p) => { const kids = children.filter((c) => c.parent_id === p.id); const ledger = ledgerMap[p.id]; const due = ledger?.total_due_cents || 0; const paid = ledger?.total_paid_cents || 0; const forg = ledger?.forgiven_cents || 0; const balance = due - paid - forg; const cleared = ledger?.balance_cleared || (forg > 0 && balance <= 0); return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{p.full_name || "—"}{p.parent2_first_name && <div style={{ fontSize: 11, color: colors.textLight, fontWeight: 400 }}>P2: {p.parent2_first_name} {p.parent2_last_name}</div>}</td>
                    <td style={{ padding: "10px 14px", color: colors.textMid }}>{p.email}</td>
                    <td style={{ padding: "10px 14px" }}>{kids.map((k) => k.first_name).join(", ") || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{p.elrc_status ? <span style={{ ...s.badge(colors.forest), fontSize: 11 }}>ELRC</span> : "—"}</td>
                    {!isStaff && <td style={{ padding: "10px 14px" }}>${(due / 100).toFixed(0)}</td>}
                    {!isStaff && <td style={{ padding: "10px 14px", color: colors.success }}>${(paid / 100).toFixed(0)}</td>}
                    {!isStaff && <td style={{ padding: "10px 14px", color: forg > 0 ? colors.success : colors.textLight }}>{forg > 0 ? `$${(forg / 100).toFixed(0)}` : "—"}</td>}
                    {!isStaff && <td style={{ padding: "10px 14px", fontWeight: 600, color: balance > 0 ? colors.amber : colors.success }}>{`$${(balance / 100).toFixed(0)}`}</td>}
                    {!isStaff && <td style={{ padding: "10px 14px" }}>{cleared ? <StatusBadge status="confirmed" /> : balance === 0 && due > 0 ? <StatusBadge status="paid" /> : balance > 0 ? <StatusBadge status="unpaid" /> : "—"}</td>}
                    <td style={{ padding: "10px 14px" }}><button onClick={() => openFamily(p)} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.forest }}>{Icons.users({ size: 13, color: colors.forest })} View</button></td>
                  </tr>); })}</tbody></table>
              )}
            </div>
          </div>);
        })()}

        {/* ═══ DISCOUNTS TAB ═══ */}
        {tab === "discounts" && (<div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><div style={{ fontSize: 14, color: colors.textMid }}>{discountCodes.length} discount code{discountCodes.length !== 1 ? "s" : ""}</div><button onClick={() => setDiscountModal("create")} style={s.btn("primary")}>{Icons.plus({ size: 16, color: "#fff" })} Create Code</button></div>
          {discountCodes.length === 0 ? (<div style={s.card}><EmptyState icon={Icons.dollar} title="No discount codes" sub="Create a code for early bird, sibling discounts, or promos." /></div>) : (
            <div style={{ ...s.card, padding: 0, overflow: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}><thead><tr style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg }}>{["Code", "Description", "Discount", "Uses", "Valid Until", "Status", "Actions"].map((h) => (<th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: colors.textMid }}>{h}</th>))}</tr></thead><tbody>{discountCodes.map((dc) => (
              <tr key={dc.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                <td style={{ padding: "10px 14px", fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{dc.code}</td>
                <td style={{ padding: "10px 14px", color: colors.textMid }}>{dc.description || "—"}</td>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{dc.discount_type === "percent" ? `${dc.discount_value}%` : `$${(dc.discount_value / 100).toFixed(0)}`}{dc.discount_type === "per_week" ? "/week" : ""} off</td>
                <td style={{ padding: "10px 14px" }}>{dc.times_used || 0}{dc.max_uses ? ` / ${dc.max_uses}` : ""}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, color: colors.textMid }}>{dc.valid_until ? new Date(dc.valid_until).toLocaleDateString() : "Never"}</td>
                <td style={{ padding: "10px 14px" }}><StatusBadge status={dc.active ? "confirmed" : "cancelled"} /></td>
                <td style={{ padding: "10px 14px" }}><div style={{ display: "flex", gap: 4 }}><button onClick={() => setDiscountModal(dc)} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12 }}>{Icons.edit({ size: 13 })} Edit</button><button onClick={async () => { if (!window.confirm(`Delete code "${dc.code}"?`)) return; try { await sb.query("discount_codes", { method: "DELETE", filters: `&id=eq.${dc.id}` }); showToast("Deleted!"); load(); } catch (e) { alert("Error: " + e.message); } }} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.coral }}>{Icons.trash({ size: 13, color: colors.coral })}</button></div></td>
              </tr>))}</tbody></table></div>
          )}
        </div>)}

        {/* ═══ T-SHIRTS TAB ═══ */}
        {tab === "shirts" && (<div>
          <div style={{ ...s.card, marginBottom: 20 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}><div><div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>T-Shirt Settings</div><div style={{ fontSize: 13, color: colors.textMid }}>Price: ${((settings.shirt_price_cents || 0) / 100).toFixed(0)} per shirt · Ordering: {settings.shirt_ordering_open ? "Open" : "Closed"}</div></div><div style={{ display: "flex", gap: 8, alignItems: "end" }}><div><label style={{ fontSize: 11, fontWeight: 600, color: colors.textMid, display: "block", marginBottom: 4 }}>Price (cents)</label><input type="number" style={{ ...s.input, width: 100 }} value={settings.shirt_price_cents ?? ""} onChange={async (e) => { const val = e.target.value; try { const existing = await sb.query("camp_settings", { filters: "&key=eq.shirt_price_cents" }); if (existing && existing.length > 0) { await sb.query("camp_settings", { method: "PATCH", body: { value: JSON.stringify(Number(val)), updated_at: new Date().toISOString() }, filters: "&key=eq.shirt_price_cents", headers: { Prefer: "return=minimal" } }); } else { await sb.query("camp_settings", { method: "POST", body: { key: "shirt_price_cents", value: JSON.stringify(Number(val)) }, headers: { Prefer: "return=minimal" } }); } load(); } catch (err) { console.error(err); } }} min={0} step={100} placeholder="e.g. 1500" /></div><button onClick={async () => { const newVal = !settings.shirt_ordering_open; try { const existing = await sb.query("camp_settings", { filters: "&key=eq.shirt_ordering_open" }); if (existing && existing.length > 0) { await sb.query("camp_settings", { method: "PATCH", body: { value: JSON.stringify(newVal), updated_at: new Date().toISOString() }, filters: "&key=eq.shirt_ordering_open", headers: { Prefer: "return=minimal" } }); } else { await sb.query("camp_settings", { method: "POST", body: { key: "shirt_ordering_open", value: JSON.stringify(newVal) }, headers: { Prefer: "return=minimal" } }); } showToast(newVal ? "Ordering opened!" : "Ordering closed."); load(); } catch (err) { alert("Error: " + err.message); } }} style={s.btn(settings.shirt_ordering_open ? "secondary" : "primary")}>{settings.shirt_ordering_open ? "Close Ordering" : "Open Ordering"}</button></div></div></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><div style={{ fontSize: 14, color: colors.textMid }}>{shirtOrders.length} order{shirtOrders.length !== 1 ? "s" : ""}</div><button onClick={() => { const rows = [["Child", "Parent", "Email", "Size", "Qty", "Price", "Status", "Date"]]; shirtOrders.forEach((o) => { const c = childMap[o.child_id]; const p = c ? parentMap[c.parent_id] : parentMap[o.parent_id] || {}; rows.push([`${c?.first_name || ""} ${c?.last_name || ""}`, p?.full_name || "", p?.email || "", o.size, o.quantity, `$${(o.price_cents / 100).toFixed(0)}`, o.status, new Date(o.created_at).toLocaleDateString()]); }); const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `cgi-shirt-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); showToast("Exported!"); }} style={s.btn("secondary")}>{Icons.download({ size: 14 })} Export CSV</button></div>
          {shirtOrders.length === 0 ? (<div style={s.card}><EmptyState icon={Icons.clipboard} title="No shirt orders yet" sub="Orders will appear here when parents order t-shirts." /></div>) : (
            <div style={{ ...s.card, padding: 0, overflow: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}><thead><tr style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg }}>{["Child", "Parent", "Size", "Qty", "Price", "Status", "Date", "Actions"].map((h) => (<th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: colors.textMid, whiteSpace: "nowrap" }}>{h}</th>))}</tr></thead><tbody>{shirtOrders.map((o) => { const c = childMap[o.child_id]; const p = c ? parentMap[c.parent_id] : parentMap[o.parent_id] || {}; return (
              <tr key={o.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c?.first_name} {c?.last_name}</td>
                <td style={{ padding: "10px 14px" }}>{p?.full_name}<div style={{ fontSize: 12, color: colors.textMid }}>{p?.email}</div></td>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{o.size}</td>
                <td style={{ padding: "10px 14px" }}>{o.quantity}</td>
                <td style={{ padding: "10px 14px" }}>${(o.price_cents / 100).toFixed(0)}</td>
                <td style={{ padding: "10px 14px" }}><StatusBadge status={o.status === "fulfilled" ? "confirmed" : o.status} /></td>
                <td style={{ padding: "10px 14px", fontSize: 13, color: colors.textMid }}>{new Date(o.created_at).toLocaleDateString()}</td>
                <td style={{ padding: "10px 14px" }}><div style={{ display: "flex", gap: 4 }}>{o.status === "paid" && (<button onClick={async () => { try { await sb.query("shirt_orders", { method: "PATCH", body: { status: "fulfilled", updated_at: new Date().toISOString() }, filters: `&id=eq.${o.id}`, headers: { Prefer: "return=minimal" } }); showToast("Marked as fulfilled!"); load(); } catch (e) { alert("Error: " + e.message); } }} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.success }}>{Icons.check({ size: 13, color: colors.success })} Fulfilled</button>)}{o.status === "pending" && (<button onClick={async () => { if (!window.confirm("Delete this unpaid order?")) return; try { await sb.query("shirt_orders", { method: "DELETE", filters: `&id=eq.${o.id}` }); showToast("Order deleted."); load(); } catch (e) { alert("Error: " + e.message); } }} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 12, color: colors.coral }}>{Icons.trash({ size: 13, color: colors.coral })}</button>)}</div></td>
              </tr>); })}</tbody></table></div>
          )}
        </div>)}

        {tab === "bunks" && (
          <BunkAssignments
            divisions={divisions}
            weeks={weeks}
            children={children}
            registrations={registrations}
            showToast={showToast}
          />
        )}
      </div>
      {divisionModal && <DivisionModal division={divisionModal === "create" ? null : divisionModal} onClose={() => setDivisionModal(null)} onSave={handleSaveDivision} saving={saving} />}
      {weekModal && <WeekModal week={weekModal === "create" ? null : weekModal} division={weekModalDivision} onClose={() => { setWeekModal(null); setWeekModalDivision(null); }} onSave={handleSaveWeek} saving={saving} />}
      {discountModal && <DiscountCodeModal code={discountModal === "create" ? null : discountModal} onClose={() => setDiscountModal(null)} onSave={async (data) => { setSaving(true); try { if (discountModal === "create") { await sb.query("discount_codes", { method: "POST", body: data, headers: { Prefer: "return=minimal" } }); showToast("Discount code created!"); } else { await sb.query("discount_codes", { method: "PATCH", body: data, filters: `&id=eq.${discountModal.id}`, headers: { Prefer: "return=minimal" } }); showToast("Discount code updated!"); } setDiscountModal(null); load(); } catch (e) { alert("Error: " + e.message); } finally { setSaving(false); } }} saving={saving} />}
      {settingsModal && <SettingsModal settings={settings} onClose={() => setSettingsModal(false)} onSave={handleSaveSettings} saving={saving} />}
      {familyModal && !adminChildModal && !registerChild && <FamilyModal parent={familyModal} familyChildren={children.filter((c) => c.parent_id === familyModal.id)} divisions={divisions} registrations={registrations} weeks={weeks} weekMap={weekMap} divisionMap={divisionMap} ledger={ledgerMap[familyModal.id]} payments={ledgerPayments} onClose={() => { setFamilyModal(null); setLedgerPayments([]); }} onSaveParent={(data) => handleSaveFamily(data)} onEditChild={(kid) => { setAdminChildParentId(familyModal.id); setAdminChildModal(kid); }} onAddChild={() => { setAdminChildParentId(familyModal.id); setAdminChildModal("create"); }} onRegisterChild={(kid) => setRegisterChild(kid)} onRecordPayment={handleRecordPayment} onClearBalance={handleClearBalance} onSavePaymentPlan={handleSavePaymentPlan} saving={saving} isStaff={isStaff} />}
      {adminChildModal && <AdminChildModal child={adminChildModal === "create" ? null : adminChildModal} parentId={adminChildParentId} divisions={divisions} onClose={() => { setAdminChildModal(null); setAdminChildParentId(null); }} onSave={handleSaveAdminChild} saving={saving} />}
      {registerChild && <RegisterModal child={registerChild} divisions={divisions} weeks={weeks} existingRegs={registrations.filter((r) => r.child_id === registerChild.id && r.status !== "cancelled")} settings={settings} siblingCount={children.filter((c) => c.parent_id === registerChild.parent_id).length} parent={parentMap[registerChild.parent_id]} onClose={() => setRegisterChild(null)} onRegister={handleAdminRegister} saving={saving} isAdmin={true} />}

      {/* Waitlist Approval Modal — select which weeks to approve */}
      {waitlistApprovalRegs && (() => {
        const child = childMap[waitlistApprovalRegs[0]?.child_id];
        const div = divisionMap[waitlistApprovalRegs[0]?.division_id];
        const parent = child ? parentMap[child.parent_id] : null;
        const selectedTotal = waitlistApprovalRegs
          .filter((r) => waitlistApprovalSelected.has(r.id))
          .reduce((sum, r) => sum + (Number(r.price_cents) || 0), 0);
        const toggleWaitlistWeek = (id) => {
          setWaitlistApprovalSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
        };
        return (
          <Modal title={`Approve Waitlist — ${child?.first_name} ${child?.last_name}`} onClose={() => { setWaitlistApprovalRegs(null); setWaitlistApprovalSelected(new Set()); }} width={500}>
            <div style={{ fontSize: 13, color: colors.textMid, marginBottom: 4 }}>
              {div?.name} · {parent?.full_name} ({parent?.email})
            </div>
            <div style={{ fontSize: 14, marginBottom: 16 }}>
              Select which weeks to approve. Unchecked weeks will remain on the waitlist.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
              <button onClick={() => setWaitlistApprovalSelected(new Set(waitlistApprovalRegs.map((r) => r.id)))} style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 8px", color: colors.forest }}>Select All</button>
              <button onClick={() => setWaitlistApprovalSelected(new Set())} style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 8px", color: colors.textMid }}>None</button>
            </div>

            <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
              {waitlistApprovalRegs.map((r) => {
                const wk = weekMap[r.week_id];
                const checked = waitlistApprovalSelected.has(r.id);
                return (
                  <div key={r.id} onClick={() => toggleWaitlistWeek(r.id)} style={{
                    ...s.card, padding: 12, cursor: "pointer",
                    border: `2px solid ${checked ? colors.forest : colors.border}`,
                    background: checked ? colors.forestPale : colors.card,
                    transition: "all .15s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? colors.forest : colors.border}`, background: checked ? colors.forest : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                          {checked && Icons.check({ size: 12, color: "#fff" })}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{wk?.name || "Week"}</div>
                          <div style={{ fontSize: 12, color: colors.textMid }}>{fmtDate(wk?.start_date)} – {fmtDate(wk?.end_date)}</div>
                        </div>
                      </div>
                      <div style={{ fontFamily: font.display, fontSize: 16, color: colors.forest }}>${((r.price_cents || 0) / 100).toFixed(0)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total */}
            <div style={{ ...s.card, background: colors.forestPale, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{waitlistApprovalSelected.size} week{waitlistApprovalSelected.size !== 1 ? "s" : ""} selected</span>
              <span style={{ fontFamily: font.display, fontSize: 20, color: colors.forest }}>${(selectedTotal / 100).toFixed(0)}</span>
            </div>

            <div style={{ fontSize: 12, color: colors.textMid, marginBottom: 16 }}>
              This will add ${(selectedTotal / 100).toFixed(0)} to the family balance and send one email to {parent?.email || "the parent"}.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => { setWaitlistApprovalRegs(null); setWaitlistApprovalSelected(new Set()); }} style={s.btn("secondary")}>Cancel</button>
              <button
                onClick={() => {
                  const selected = waitlistApprovalRegs.filter((r) => waitlistApprovalSelected.has(r.id));
                  if (selected.length === 0) return alert("Select at least one week to approve.");
                  processWaitlistApproval(selected);
                }}
                disabled={saving || waitlistApprovalSelected.size === 0}
                style={{ ...s.btn("primary"), opacity: waitlistApprovalSelected.size > 0 ? 1 : 0.5 }}
              >
                {saving ? <Spinner size={16} /> : `Approve ${waitlistApprovalSelected.size} Week${waitlistApprovalSelected.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* ── Reminder Preview Modal ── */}
      {reminderModal && (
        <Modal title={reminderModal === "no_weeks" ? "Remind: Complete Registration" : "Remind: Outstanding Balance"} onClose={() => { setReminderModal(null); setReminderPreview(null); setReminderResult(null); }} width={600}>
          {reminderSending && !reminderPreview && (
            <div style={{ textAlign: "center", padding: "24px 0" }}><Spinner size={24} /><div style={{ marginTop: 8, fontSize: 13, color: colors.textMid }}>Loading recipients…</div></div>
          )}
          {reminderPreview && !reminderResult && (
            <>
              <div style={{ fontSize: 13, color: colors.textMid, marginBottom: 12 }}>
                {reminderPreview.length === 0
                  ? "No parents match the criteria right now. Everyone's either up to date, within the cooldown window, or on a payment plan."
                  : `${reminderPreview.length} parent${reminderPreview.length !== 1 ? "s" : ""} will receive this reminder:`}
              </div>
              {reminderPreview.length > 0 && (
                <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 16 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: colors.textMid }}>Parent</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: colors.textMid }}>Email</th>
                      {reminderModal === "outstanding_balance" && <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, fontWeight: 600, color: colors.textMid }}>Balance</th>}
                    </tr></thead>
                    <tbody>{reminderPreview.map((r) => (
                      <tr key={r.parent_id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.full_name}</td>
                        <td style={{ padding: "8px 12px", color: colors.textMid }}>{r.emails?.join(", ") || r.email}</td>
                        {reminderModal === "outstanding_balance" && <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: colors.amber }}>${((r.balance_cents || 0) / 100).toFixed(0)}</td>}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button onClick={() => { setReminderModal(null); setReminderPreview(null); }} style={s.btn("secondary")}>Cancel</button>
                {reminderPreview.length > 0 && (
                  <button onClick={handleReminderSend} disabled={reminderSending} style={s.btn("primary")}>
                    {reminderSending ? <Spinner size={14} /> : `Send ${reminderPreview.length} Email${reminderPreview.length !== 1 ? "s" : ""}`}
                  </button>
                )}
              </div>
            </>
          )}
          {reminderResult && (
            <>
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Sent {reminderResult.sent} email{reminderResult.sent !== 1 ? "s" : ""}!</div>
                {reminderResult.failed > 0 && <div style={{ fontSize: 13, color: colors.coral }}>{reminderResult.failed} failed to send.</div>}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => { setReminderModal(null); setReminderPreview(null); setReminderResult(null); }} style={s.btn("primary")}>Done</button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ═══ REVENUE PANEL MODAL ═══ */}
      {revenuePanel && (() => {
        const campPayments = ledgers.reduce((sum, l) => sum + (l.total_paid_cents || 0), 0);
        const regFeePaid = ledgers.filter((l) => l.registration_fee_paid).length;
        const regFeeEach = Number(settings.registration_fee_cents) || 0;
        const regFeeTotal = regFeePaid * regFeeEach;
        const shirtRevenue = shirtOrders.filter((o) => o.status === "paid" || o.status === "fulfilled").reduce((sum, o) => sum + (o.price_cents || 0), 0);
        const grandTotal = regFeeTotal + campPayments + shirtRevenue;

        const totalDueAll = ledgers.reduce((sum, l) => sum + (l.total_due_cents || 0), 0);
        const totalForgivenAll = ledgers.reduce((sum, l) => sum + (l.forgiven_cents || 0), 0);
        const totalOutstandingAll = ledgers.reduce((sum, l) => { const b = (l.total_due_cents || 0) - (l.total_paid_cents || 0) - (l.forgiven_cents || 0); return sum + Math.max(0, b); }, 0);

        const collected = [
          { label: "Registration Fees", detail: `${regFeePaid} families × $${(regFeeEach / 100).toFixed(0)}`, value: regFeeTotal },
          { label: "Camp Payments", detail: "Stripe + offline", value: campPayments },
          { label: "T-Shirt Orders", detail: `${shirtOrders.filter((o) => o.status === "paid" || o.status === "fulfilled").length} orders`, value: shirtRevenue },
        ];

        return (
          <Modal title="Revenue Breakdown" onClose={() => setRevenuePanel(false)} width={540}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.textMid, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Collected</div>
            <div style={{ display: "grid", gap: 0, marginBottom: 8 }}>
              {collected.map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${colors.borderLight}` }}>
                  <div><div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div><div style={{ fontSize: 12, color: colors.textMid }}>{r.detail}</div></div>
                  <span style={{ fontFamily: font.display, fontSize: 20, color: colors.forest, fontWeight: 700 }}>${(r.value / 100).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: `2px solid ${colors.forest}` }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Total Collected</span>
              <span style={{ fontFamily: font.display, fontSize: 24, color: colors.forest, fontWeight: 700 }}>${(grandTotal / 100).toLocaleString()}</span>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: colors.textMid, marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Balances</div>
            <div style={{ display: "grid", gap: 0 }}>
              {[
                { label: "Total Billed (Camp Fees)", value: totalDueAll, color: colors.text },
                { label: "Scholarships Applied", value: totalForgivenAll, color: colors.success },
                { label: "Outstanding", value: totalOutstandingAll, color: colors.amber },
              ].map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${colors.borderLight}` }}>
                  <span style={{ fontSize: 14, color: colors.textMid }}>{r.label}</span>
                  <span style={{ fontFamily: font.display, fontSize: 18, color: r.color, fontWeight: 700 }}>${(r.value / 100).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setRevenuePanel(false)} style={s.btn("primary")}>Done</button>
            </div>
          </Modal>
        );
      })()}
    </div>    
  );
}