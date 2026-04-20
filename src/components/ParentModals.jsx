import { useState, useMemo, useEffect } from "react";
import sb from "../lib/supabase";
import { s, colors, font } from "../lib/styles";
import Icons from "../lib/icons";
import { Modal, Field, Spinner, StatusBadge } from "./UI";

// ============================================================
// SHARED HELPERS
// ============================================================

// Format date string without timezone shift
function fmtDate(dateStr, opts) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", opts || { month: "short", day: "numeric" });
}

// Grade/class options by division type
const PRESCHOOL_CLASSES = [
  { value: "-4", label: "Toddler" },
  { value: "-3", label: "Pre Nursery" },
  { value: "-2", label: "Nursery" },
  { value: "-1", label: "Pre K" },
];

const ELEMENTARY_GRADES = [
  { value: "0", label: "Kindergarten" },
  ...Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `Grade ${i + 1}` })),
];

// Map grade number to class name (for preschool capacity)
function gradeToClassName(grade) {
  const cls = PRESCHOOL_CLASSES.find((c) => c.value === String(grade));
  return cls ? cls.label : null;
}

// Determine which grade options to show based on division
function getGradeOptions(division) {
  if (!division) return [...PRESCHOOL_CLASSES, ...ELEMENTARY_GRADES];
  const name = (division.name || "").toLowerCase();
  if (name.includes("preschool") || name.includes("pre-school") || name.includes("half day")) {
    return PRESCHOOL_CLASSES;
  }
  return ELEMENTARY_GRADES;
}

// ============================================================
// AUTO-ASSIGN DIVISION
// ============================================================
function findDivision(child, divisions) {
  if (!child.date_of_birth || !child.gender) return null;
  const dob = new Date(child.date_of_birth);
  const gender = child.gender.toLowerCase();
  for (const div of [...divisions].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!div.active) continue;
    if (div.gender_filter !== "any" && div.gender_filter !== gender) continue;
    if (div.min_dob && dob < new Date(div.min_dob)) continue;
    if (div.max_dob && dob > new Date(div.max_dob)) continue;
    if (div.min_grade != null && child.grade != null && child.grade < div.min_grade) continue;
    if (div.max_grade != null && child.grade != null && child.grade > div.max_grade) continue;
    return div;
  }
  return null;
}

// ============================================================
// ADD CHILD MODAL
// ============================================================
export const AddChildModal = ({ onClose, onSave, onAddAnother, saving, divisions }) => {
  const [form, setForm] = useState({
    first_name: "", last_name: "", date_of_birth: "", gender: "", grade: "",
    tshirt_size: "",
    has_food_allergies: "", allergies: "",
    has_medical_condition: "", medical_notes: "",
    has_medications: "", medications: "",
    receives_services: "", services_description: "", additional_notes: "",
    emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relation: "",
  });
  const [done, setDone] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const matchedDivision = useMemo(() => {
    if (!form.date_of_birth || !form.gender) return null;
    return findDivision(
      { ...form, gender: form.gender.toLowerCase(), grade: form.grade === "" ? null : parseInt(form.grade) },
      divisions || []
    );
  }, [form.date_of_birth, form.gender, form.grade, divisions]);

  const gradeOptions = useMemo(() => getGradeOptions(matchedDivision), [matchedDivision]);

  // Reset grade when division changes and current grade is invalid for new options
  useEffect(() => {
    if (form.grade && matchedDivision) {
      const validValues = gradeOptions.map((g) => g.value);
      if (!validValues.includes(form.grade)) {
        set("grade", "");
      }
    }
  }, [matchedDivision]);

  const validate = () => {
    if (!form.first_name || !form.last_name || !form.date_of_birth) {
      alert("Please fill in first name, last name, and date of birth.");
      return false;
    }
    if (!form.gender) {
      alert("Please select gender.");
      return false;
    }
    if (form.grade === "") {
      alert("Please select a class/grade.");
      return false;
    }
    if (!form.has_food_allergies) {
      alert("Please indicate whether your child has any food allergies or dietary restrictions.");
      return false;
    }
    if (form.has_food_allergies === "yes" && !form.allergies.trim()) {
      alert("Please describe your child's food allergies or dietary restrictions.");
      return false;
    }
    if (!form.has_medical_condition) {
      alert("Please indicate whether your child has any medical conditions.");
      return false;
    }
    if (form.has_medical_condition === "yes" && !form.medical_notes.trim()) {
      alert("Please describe your child's medical condition.");
      return false;
    }
    if (!form.has_medications) {
      alert("Please indicate whether your child takes any medication.");
      return false;
    }
    if (form.has_medications === "yes" && !form.medications.trim()) {
      alert("Please describe your child's medication.");
      return false;
    }
    if (!form.emergency_contact_name || !form.emergency_contact_phone) {
      alert("Emergency contact name and phone are required.");
      return false;
    }
    if (form.receives_services === "") {
      alert("Please indicate whether your child receives any support or services.");
      return false;
    }
    if (form.receives_services === "yes" && !form.services_description.trim()) {
      alert("Please describe the support or services your child receives.");
      return false;
    }
    return true;
  };

  const handleSave = async (addAnother) => {
    if (!validate()) return;
    const childData = {
      ...form,
      gender: form.gender.toLowerCase(),
      grade: form.grade === "" ? null : parseInt(form.grade),
      assigned_division_id: matchedDivision?.id || null,
      division_override: false,
      has_food_allergies: form.has_food_allergies === "yes",
      allergies: form.has_food_allergies === "yes" ? form.allergies.trim() : "",
      has_medical_condition: form.has_medical_condition === "yes",
      medical_notes: form.has_medical_condition === "yes" ? form.medical_notes.trim() : "",
      has_medications: form.has_medications === "yes",
      medications: form.has_medications === "yes" ? form.medications.trim() : "",
      receives_services: form.receives_services === "yes" ? true : form.receives_services === "no" ? false : null,
      services_description: form.receives_services === "yes" ? (form.services_description || "").trim() : null,
      additional_notes: (form.additional_notes || "").trim() || null,
      photo_release: true,
    };
    const success = await onSave(childData);
    if (success !== false) {
      if (addAnother) {
        setForm((prev) => ({
          first_name: "", last_name: "", date_of_birth: "", gender: "", grade: "",
          tshirt_size: "",
          has_food_allergies: "", allergies: "",
          has_medical_condition: "", medical_notes: "",
          has_medications: "", medications: "",
          receives_services: "", services_description: "", additional_notes: "",
          emergency_contact_name: prev.emergency_contact_name,
          emergency_contact_phone: prev.emergency_contact_phone,
          emergency_contact_relation: prev.emergency_contact_relation,
        }));
      } else {
        setDone(true);
      }
    }
  };

  if (done) {
    return (
      <Modal title="Child Added!" onClose={onClose} width={440}>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: colors.forestPale, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            {Icons.check({ size: 28, color: colors.success })}
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{form.first_name} has been added!</p>
          {matchedDivision && <p style={{ fontSize: 13, color: colors.textMid, marginBottom: 4 }}>Assigned to: {matchedDivision.name}</p>}
          <p style={{ fontSize: 14, color: colors.textMid, marginBottom: 24 }}>Would you like to add another child or continue to registration?</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
            <button onClick={() => { if (onAddAnother) onAddAnother(); }} style={s.btn("secondary")}>
              {Icons.plus({ size: 14 })} Add Another Child
            </button>
            <button onClick={onClose} style={s.btn("primary")}>Done</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add Child" onClose={onClose} width={560}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="First Name *"><input style={s.input} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} /></Field>
        <Field label="Last Name *"><input style={s.input} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
        <Field label="Date of Birth *"><input type="date" style={s.input} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} max={new Date().toISOString().split("T")[0]} /></Field>
        <Field label="Gender *">
          <select style={s.input} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">—</option><option value="Male">Boy</option><option value="Female">Girl</option>
          </select>
        </Field>
        <Field label="Class/Grade finishing this year *">
          <select style={s.input} value={form.grade} onChange={(e) => set("grade", e.target.value)}>
            <option value="">—</option>
            {gradeOptions.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </Field>
      </div>

      {/* Auto-division display */}
      {matchedDivision && (
        <div style={{ ...s.card, border: `2px solid ${colors.success}`, background: colors.forestPale, marginTop: 16, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
          {Icons.check({ size: 18, color: colors.success })}
          <div>
            <div style={{ fontWeight: 700, color: colors.forest, fontSize: 14 }}>{matchedDivision.name}</div>
            <div style={{ fontSize: 12, color: colors.textMid }}>${(matchedDivision.per_week_price / 100).toFixed(0)}/week</div>
          </div>
        </div>
      )}
      {form.date_of_birth && form.gender && !matchedDivision && (
        <div style={{ ...s.card, border: `1px solid ${colors.amber}`, background: colors.amberLight, marginTop: 16, marginBottom: 4, fontSize: 13, color: colors.textMid }}>
          {Icons.alertCircle({ size: 14, color: colors.amber })} No matching division found — the director will assign one.
        </div>
      )}

      {/* Emergency Contact */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "20px 0 16px", paddingTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Emergency Contact *</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field label="Contact Name *"><input style={s.input} value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} placeholder="Full name" /></Field>
          <Field label="Contact Phone *"><input style={s.input} value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} placeholder="(555) 123-4567" /></Field>
        </div>
        <Field label="Relationship"><input style={s.input} value={form.emergency_contact_relation} onChange={(e) => set("emergency_contact_relation", e.target.value)} placeholder="e.g. Grandparent, Aunt, Neighbor" /></Field>
      </div>

      {/* Medical Information */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Medical Information</div>

        <Field label="Does your child have any food allergies or dietary restrictions? *">
          <select style={s.input} value={form.has_food_allergies} onChange={(e) => set("has_food_allergies", e.target.value)}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {form.has_food_allergies === "yes" && (
          <Field label="Please describe *">
            <textarea style={{ ...s.input, minHeight: 60 }} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="Describe food allergies or dietary restrictions…" />
          </Field>
        )}

        <Field label="Does your child have any medical conditions? *">
          <select style={s.input} value={form.has_medical_condition} onChange={(e) => set("has_medical_condition", e.target.value)}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {form.has_medical_condition === "yes" && (
          <Field label="Please describe *">
            <textarea style={{ ...s.input, minHeight: 60 }} value={form.medical_notes} onChange={(e) => set("medical_notes", e.target.value)} placeholder="Describe the medical condition…" />
          </Field>
        )}

        <Field label="Does your child take any medication? *">
          <select style={s.input} value={form.has_medications} onChange={(e) => set("has_medications", e.target.value)}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {form.has_medications === "yes" && (
          <Field label="Please describe *">
            <textarea style={{ ...s.input, minHeight: 60 }} value={form.medications} onChange={(e) => set("medications", e.target.value)} placeholder="Describe the medication…" />
          </Field>
        )}

        {/* Services / Support */}
        <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0 12px", paddingTop: 16 }}>
          <Field label="Does your child receive any support or services? *">
            <select style={s.input} value={form.receives_services} onChange={(e) => set("receives_services", e.target.value)}>
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          {form.receives_services === "yes" && (
            <Field label="Please describe *">
              <textarea style={{ ...s.input, minHeight: 60 }} value={form.services_description} onChange={(e) => set("services_description", e.target.value)} placeholder="Describe the support or services your child receives…" />
            </Field>
          )}
        </div>

        <Field label="Please add anything else you'd like us to know about your child">
          <textarea style={{ ...s.input, minHeight: 60 }} value={form.additional_notes} onChange={(e) => set("additional_notes", e.target.value)} placeholder="Optional" />
        </Field>
      </div>

      <div style={{ fontSize: 13, color: colors.textMid, marginBottom: 20, fontStyle: "italic" }}>
        Registration implies consent to post photos and videos of your child on WhatsApp and the camp website. Email us if you need to opt out.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => handleSave(true)} disabled={saving} style={s.btn("secondary")}>
          {saving ? <Spinner size={16} /> : <>{Icons.plus({ size: 14 })} Save & Add Another</>}
        </button>
        <button onClick={() => handleSave(false)} disabled={saving} style={s.btn("primary")}>
          {saving ? <Spinner size={16} /> : "Save Child"}
        </button>
      </div>
    </Modal>
  );
};

// ============================================================
// REGISTER FOR DIVISION WEEKS MODAL
// ============================================================
export const RegisterModal = ({ child, divisions, weeks, existingRegs, settings, siblingCount, parent, onClose, onRegister, saving }) => {
  const division = divisions.find((d) => d.id === child.assigned_division_id);
  const divisionWeeks = (weeks || [])
    .filter((w) => w.division_id === child.assigned_division_id && w.active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const alreadyRegisteredWeekIds = new Set((existingRegs || []).map((r) => r.week_id));
  const availableWeeks = divisionWeeks.filter((w) => !alreadyRegisteredWeekIds.has(w.id));

  const [selected, setSelected] = useState(new Set(availableWeeks.map((w) => w.id)));
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [enrollment, setEnrollment] = useState([]); // week enrollment counts

  const isElrc = parent?.elrc_status === true;

  // Load enrollment counts for capacity display
  useEffect(() => {
    async function loadEnrollment() {
      try {
        const data = await sb.query("rpc/get_week_enrollment");
        setEnrollment(data || []);
      } catch { setEnrollment([]); }
    }
    loadEnrollment();
  }, []);

  const toggleWeek = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Pricing helpers ───

  const basePrice = division?.per_week_price ?? 0;

  // Is this a partial week? (price differs from division base)
  const isPartialWeek = (week) => {
    const weekPrice = week.price_override_cents ?? basePrice;
    return weekPrice !== basePrice;
  };

  // Proration ratio for partial weeks
  const prorationRatio = (week) => {
    if (basePrice === 0) return 1;
    return (week.price_override_cents ?? basePrice) / basePrice;
  };

  // Base price per week — ELRC prorated for partial weeks
  const getBasePrice = (week) => {
    const weekPrice = week.price_override_cents ?? basePrice;
    if (isElrc && division?.elrc_weekly_price != null) {
      if (isPartialWeek(week)) {
        return Math.round(division.elrc_weekly_price * prorationRatio(week));
      }
      return division.elrc_weekly_price;
    }
    return weekPrice;
  };

  // Minimum floor from settings
  const minFloor = settings?.minimum_weekly_price_cents ?? 0;

  // Early bird: per-division fixed cents, only on FULL weeks
  const earlyBirdDeadline = settings?.early_bird_deadline ? new Date(settings.early_bird_deadline) : null;
  const earlyBirdPerWeek = division?.early_bird_discount_cents || 0;
  const showEarlyBird = earlyBirdDeadline && earlyBirdPerWeek > 0;
  const isBeforeEarlyBird = showEarlyBird && new Date() < earlyBirdDeadline;

  // Sibling discount
  const siblingStartsAt = settings?.sibling_discount_starts_at ?? 2;
  const siblingCentsPerWeek = settings?.sibling_discount_cents ?? 0;
  const siblingElementaryOnly = settings?.sibling_discount_elementary_only ?? false;
  const isSiblingEligible = siblingCount >= siblingStartsAt && siblingCentsPerWeek > 0
    && (!siblingElementaryOnly || !(division?.name || "").toLowerCase().includes("preschool"));

  // Get sibling discount for a specific week (prorated for partial)
  const getSiblingDiscount = (week) => {
    if (!isSiblingEligible) return 0;
    if (isPartialWeek(week)) return Math.round(siblingCentsPerWeek * prorationRatio(week));
    return siblingCentsPerWeek;
  };

  // Get early bird discount for a specific week (0 for partial weeks)
  const getEarlyBirdDiscount = (week) => {
    if (!showEarlyBird) return 0;
    if (isPartialWeek(week)) return 0;
    return earlyBirdPerWeek;
  };

  // Calculate week price with early bird
  const calcWeekPriceWithEarlyBird = (week) => {
    let price = getBasePrice(week);
    let discount = getEarlyBirdDiscount(week) + getSiblingDiscount(week);
    const floor = isPartialWeek(week) ? Math.round(minFloor * prorationRatio(week)) : minFloor;
    return Math.max(floor, price - discount);
  };

  // Calculate week price without early bird (regular / ledger price)
  const calcWeekPriceRegular = (week) => {
    let price = getBasePrice(week);
    let discount = getSiblingDiscount(week);
    const floor = isPartialWeek(week) ? Math.round(minFloor * prorationRatio(week)) : minFloor;
    return Math.max(floor, price - discount);
  };

  // ─── Totals ───
  const selectedWeeks = [...selected].map((wid) => divisionWeeks.find((w) => w.id === wid)).filter(Boolean);
  const subtotal = selectedWeeks.reduce((sum, w) => sum + getBasePrice(w), 0);
  const totalEarlyBird = selectedWeeks.reduce((sum, w) => sum + calcWeekPriceWithEarlyBird(w), 0);
  const totalRegular = selectedWeeks.reduce((sum, w) => sum + calcWeekPriceRegular(w), 0);

  // Discount breakdowns for display
  const earlyBirdTotal = selectedWeeks.reduce((sum, w) => sum + getEarlyBirdDiscount(w), 0);
  const siblingTotal = selectedWeeks.reduce((sum, w) => sum + getSiblingDiscount(w), 0);

  // Code discount (applied on top)
  let codeDiscount = 0;
  if (appliedDiscount) {
    if (appliedDiscount.discount_type === "percent") codeDiscount = Math.round(totalRegular * appliedDiscount.discount_value / 100);
    else if (appliedDiscount.discount_type === "fixed") codeDiscount = appliedDiscount.discount_value;
    else if (appliedDiscount.discount_type === "per_week") codeDiscount = appliedDiscount.discount_value * selected.size;
  }

  // Final totals after code discount
  const finalEarlyBird = Math.max(0, totalEarlyBird - codeDiscount);
  const finalRegular = Math.max(0, totalRegular - codeDiscount);

  // What goes on the ledger — early bird if before deadline, otherwise regular
  const ledgerTotal = isBeforeEarlyBird ? finalEarlyBird : finalRegular;

  const applyCode = async () => {
    if (!discountCode.trim()) return;
    setCheckingCode(true);
    setDiscountError("");
    try {
      const resp = await sb.query("discount_codes", {
        filters: `&code=eq.${discountCode.trim().toUpperCase()}&active=eq.true`,
      });
      if (!resp || resp.length === 0) {
        setDiscountError("Invalid or expired code");
        setAppliedDiscount(null);
      } else {
        const code = resp[0];
        if (code.valid_until && new Date(code.valid_until) < new Date()) {
          setDiscountError("This code has expired");
          setAppliedDiscount(null);
        } else if (code.max_uses && code.times_used >= code.max_uses) {
          setDiscountError("This code has been fully redeemed");
          setAppliedDiscount(null);
        } else {
          setAppliedDiscount(code);
          setDiscountError("");
        }
      }
    } catch { setDiscountError("Error checking code"); }
    setCheckingCode(false);
  };

  // ─── Capacity check (preschool class-level) ───
  const classCapacities = division?.class_capacities || null;
  const childClassName = gradeToClassName(child.grade);

  const getWeekClassEnrollment = (weekId) => {
    if (!classCapacities || !childClassName) return null;
    const cap = classCapacities[childClassName];
    if (cap == null) return null;
    const enrolled = enrollment.filter(
      (e) => e.week_id === weekId && e.division_id === division.id && e.grade === child.grade
    ).reduce((sum, e) => sum + (e.enrolled || 0), 0);
    return { enrolled, capacity: cap, remaining: cap - enrolled };
  };

  // No division assigned
  if (!division) {
    return (
      <Modal title={`Register ${child.first_name}`} onClose={onClose} width={440}>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          {Icons.alertCircle({ size: 40, color: colors.amber })}
          <p style={{ fontWeight: 600, marginTop: 12 }}>No Division Assigned</p>
          <p style={{ fontSize: 14, color: colors.textMid }}>{child.first_name} hasn't been assigned to a division yet. Please contact the camp director.</p>
          <button onClick={onClose} style={{ ...s.btn("primary"), marginTop: 16 }}>OK</button>
        </div>
      </Modal>
    );
  }

  const displayPrice = isElrc && division.elrc_weekly_price != null
    ? division.elrc_weekly_price : division.per_week_price;

  return (
    <Modal title={`Register ${child.first_name} — ${division.name}`} onClose={onClose} width={560}>
      <div style={{ fontSize: 13, color: colors.textMid, marginBottom: 6 }}>
        ${(displayPrice / 100).toFixed(0)}/week
        {isElrc && <span style={{ color: colors.success, fontWeight: 600 }}> (ELRC Rate)</span>}
      </div>

      {/* Early bird notice */}
      {isBeforeEarlyBird && earlyBirdDeadline && (
        <div style={{ background: colors.forestPale, border: `1px solid ${colors.success}`, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>
          {Icons.dollar({ size: 14, color: colors.success })} <strong>Early Bird:</strong> Save ${(earlyBirdPerWeek / 100).toFixed(0)}/week on full weeks when paid in full by {earlyBirdDeadline.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </div>
      )}

      {availableWeeks.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: colors.textMid }}>{child.first_name} is already registered for all available weeks!</p>
          <button onClick={onClose} style={{ ...s.btn("primary"), marginTop: 12 }}>Done</button>
        </div>
      ) : (
        <>
          {/* Select All / None */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Select Weeks</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSelected(new Set(availableWeeks.filter((w) => {
                const cap = getWeekClassEnrollment(w.id);
                return !cap || cap.remaining > 0;
              }).map((w) => w.id)))} style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 8px", color: colors.forest }}>All</button>
              <button onClick={() => setSelected(new Set())} style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 8px", color: colors.textMid }}>None</button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
            {availableWeeks.map((w) => {
              const checked = selected.has(w.id);
              const price = getBasePrice(w);
              const partial = isPartialWeek(w);
              const capInfo = getWeekClassEnrollment(w.id);
              const isFull = capInfo && capInfo.remaining <= 0;
              return (
                <div key={w.id} onClick={() => { if (!isFull) toggleWeek(w.id); }} style={{
                  ...s.card, padding: 14, cursor: isFull ? "not-allowed" : "pointer",
                  border: `2px solid ${isFull ? colors.textLight : checked ? colors.forest : colors.border}`,
                  background: isFull ? colors.bg : checked ? colors.forestPale : colors.card,
                  opacity: isFull ? 0.6 : 1,
                  transition: "all .15s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${isFull ? colors.textLight : checked ? colors.forest : colors.border}`, background: checked && !isFull ? colors.forest : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, transition: "all .15s" }}>
                        {checked && !isFull && Icons.check({ size: 14, color: "#fff" })}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>
                          {w.name}
                          {partial && <span style={{ fontSize: 11, color: colors.textLight, fontWeight: 400, marginLeft: 6 }}>(partial)</span>}
                        </div>
                        <div style={{ fontSize: 13, color: colors.textMid }}>
                          {fmtDate(w.start_date)} – {fmtDate(w.end_date)}
                        </div>
                        {capInfo && (
                          <div style={{ fontSize: 11, color: isFull ? colors.coral : colors.textLight, marginTop: 2 }}>
                            {isFull ? `${childClassName} class is full` : `${capInfo.remaining} of ${capInfo.capacity} ${childClassName} spots left`}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ fontFamily: font.display, fontSize: 18, color: colors.forest }}>${(price / 100).toFixed(0)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Discount Code */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: colors.textMid, marginBottom: 4, display: "block" }}>Discount Code</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...s.input, flex: 1, textTransform: "uppercase" }} value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="Enter code" />
              <button onClick={applyCode} disabled={checkingCode} style={{ ...s.btn("secondary"), padding: "8px 16px" }}>
                {checkingCode ? <Spinner size={14} /> : "Apply"}
              </button>
            </div>
            {discountError && <div style={{ color: colors.coral || "#e53e3e", fontSize: 12, marginTop: 4 }}>{discountError}</div>}
            {appliedDiscount && <div style={{ color: colors.success, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{Icons.check({ size: 12, color: colors.success })} {appliedDiscount.description || "Discount applied"}</div>}
          </div>

          {/* Price Breakdown */}
          {selected.size > 0 && (
            <div style={{ ...s.card, background: colors.forestPale, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                <span>{selected.size} week{selected.size !== 1 ? "s" : ""}</span>
                <span>${(subtotal / 100).toFixed(2)}</span>
              </div>
              {siblingTotal > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.success, marginBottom: 4 }}>
                  <span>Sibling discount</span>
                  <span>−${(siblingTotal / 100).toFixed(2)}</span>
                </div>
              )}
              {/* Show early bird as applied discount */}
              {isBeforeEarlyBird && earlyBirdTotal > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.success, marginBottom: 4 }}>
                  <span>Early bird discount (full weeks)</span>
                  <span>−${(earlyBirdTotal / 100).toFixed(2)}</span>
                </div>
              )}
              {codeDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.success, marginBottom: 4 }}>
                  <span>Code: {appliedDiscount.code}</span>
                  <span>−${(codeDiscount / 100).toFixed(2)}</span>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${colors.border}`, paddingTop: 8, marginTop: 6, fontFamily: font.display, fontSize: 20 }}>
                <span>Total</span>
                <span style={{ color: colors.forest }}>${((isBeforeEarlyBird ? finalEarlyBird : finalRegular) / 100).toFixed(2)}</span>
              </div>
              {isBeforeEarlyBird && (
                <div style={{ fontSize: 12, color: colors.textMid, marginTop: 4 }}>
                  Early bird rate applied — must pay in full by {earlyBirdDeadline.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
            <button
              onClick={() => {
                if (selected.size === 0) return alert("Select at least one week.");
                const weekRegs = selectedWeeks.map((w) => ({
                  week_id: w.id,
                  division_id: child.assigned_division_id,
                  price_cents: isBeforeEarlyBird ? calcWeekPriceWithEarlyBird(w) : calcWeekPriceRegular(w),
                }));
                onRegister({
                  child_id: child.id,
                  weeks: weekRegs,
                  subtotal_cents: subtotal,
                  discount_cents: subtotal - (isBeforeEarlyBird ? finalEarlyBird : finalRegular),
                  total_cents: isBeforeEarlyBird ? finalEarlyBird : finalRegular,
                  discount_code_id: appliedDiscount?.id || null,
                });
              }}
              disabled={saving || selected.size === 0}
              style={{ ...s.btn("primary"), opacity: selected.size > 0 ? 1 : 0.5 }}
            >
              {saving ? <Spinner size={16} /> : `Register for ${selected.size} Week${selected.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
};

// ============================================================
// PROFILE MODAL
// ============================================================
export const ProfileModal = ({ parent, onClose, onSave, saving }) => {
  const [form, setForm] = useState({
    first_name: parent.first_name || "",
    last_name: parent.last_name || "",
    phone: parent.phone || "",
    address: parent.address || "",
    elrc_status: parent.elrc_status ?? false,
    elrc_acknowledged: parent.elrc_acknowledged ?? false,
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: null })); };

  // Format phone as user types: (555) 123-4567
  const handlePhone = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    let formatted = digits;
    if (digits.length > 6) formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    else if (digits.length > 3) formatted = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
    else if (digits.length > 0) formatted = `(${digits}`;
    set("phone", formatted);
  };

  const handleElrcToggle = (checked) => {
    if (checked && !form.elrc_acknowledged) {
      set("elrc_status", true);
    } else {
      set("elrc_status", checked);
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.first_name.trim()) errs.first_name = "First name is required.";
    if (!form.last_name.trim()) errs.last_name = "Last name is required.";

    // Phone: must have 10 digits
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (!phoneDigits) errs.phone = "Phone number is required.";
    else if (phoneDigits.length < 10) errs.phone = "Enter a full 10-digit phone number.";

    // Address: must look like a real address (has a number and text, reasonable length)
    const addr = form.address.trim();
    if (!addr) errs.address = "Address is required.";
    else if (addr.length < 8) errs.address = "Please enter your full street address.";
    else if (!/\d/.test(addr)) errs.address = "Address should include a street number.";
    else if (!/[a-zA-Z]/.test(addr)) errs.address = "Address should include a street name.";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const errStyle = { fontSize: 12, color: colors.coral || "#e53e3e", marginTop: 2 };
  const inputErr = (field) => errors[field] ? { ...s.input, borderColor: colors.coral || "#e53e3e" } : s.input;

  return (
    <Modal title="My Profile" onClose={onClose}>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="First Name *">
            <input style={inputErr("first_name")} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            {errors.first_name && <div style={errStyle}>{errors.first_name}</div>}
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Last Name *">
            <input style={inputErr("last_name")} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            {errors.last_name && <div style={errStyle}>{errors.last_name}</div>}
          </Field>
        </div>
      </div>
      <Field label="Phone *">
        <input style={inputErr("phone")} value={form.phone} onChange={(e) => handlePhone(e.target.value)} placeholder="(555) 123-4567" inputMode="tel" />
        {errors.phone && <div style={errStyle}>{errors.phone}</div>}
      </Field>
      <Field label="Address *">
        <input style={inputErr("address")} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St, City, State ZIP" />
        {errors.address && <div style={errStyle}>{errors.address}</div>}
      </Field>

      {/* ELRC Self-Identification */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginBottom: 4 }}>
          <input type="checkbox" checked={form.elrc_status} onChange={(e) => handleElrcToggle(e.target.checked)} />
          <strong>My family receives ELRC / childcare subsidies</strong>
        </label>
        {form.elrc_status && (
          <div style={{ marginLeft: 26, marginTop: 8 }}>
            <div style={{ background: colors.amberLight, border: `1px solid ${colors.amber}`, borderRadius: 8, padding: 10, fontSize: 13, color: colors.textMid, marginBottom: 8 }}>
              By checking this box, I acknowledge that if ELRC funds do not come through for any reason, I am responsible for paying the full camp rate.
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.elrc_acknowledged} onChange={(e) => set("elrc_acknowledged", e.target.checked)} />
              I understand and agree
            </label>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => {
          if (!validate()) return;
          if (form.elrc_status && !form.elrc_acknowledged) return alert("Please acknowledge the ELRC disclaimer before saving.");
          onSave({
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
            phone: form.phone.trim(),
            address: form.address.trim(),
            elrc_status: form.elrc_status,
            elrc_acknowledged: form.elrc_acknowledged,
            updated_at: new Date().toISOString(),
          });
        }} disabled={saving} style={s.btn("primary")}>{saving ? <Spinner size={16} /> : "Save"}</button>
      </div>
    </Modal>
  );
};