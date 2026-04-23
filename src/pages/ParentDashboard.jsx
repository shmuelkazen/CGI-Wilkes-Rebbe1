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
  // Grade restrictions per division
  let grades = [...ELEMENTARY_GRADES];
  if (name.includes("girls")) {
    grades = grades.filter((g) => !["7", "8"].includes(g.value));
  } else if (name.includes("boys")) {
    grades = grades.filter((g) => g.value !== "8");
  }
  return grades;
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
      alert("Please indicate whether your child receives any behavioral or support services.");
      return false;
    }
    if (form.receives_services === "yes" && !form.services_description.trim()) {
      alert("Please describe the services your child receives.");
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
      services_description: form.receives_services === "yes" ? (form.services_description || "").trim() : form.receives_services === "in_progress" ? "Currently setting up behavioral services — will update the camp." : null,
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

        {/* Behavioral Services / Support */}
        <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0 12px", paddingTop: 16 }}>
          <Field label="Does your child receive any behavioral or support services? *">
            <select style={s.input} value={form.receives_services} onChange={(e) => set("receives_services", e.target.value)}>
              <option value="">—</option>
              <option value="no">My child does NOT receive services and does not require behavioral accommodations</option>
              <option value="yes">My child receives services during the school year and will continue to receive them over the summer</option>
              <option value="in_progress">We are currently in the process of setting up behavioral services and will update the camp</option>
            </select>
          </Field>
          {form.receives_services === "yes" && (
            <Field label="Please describe the services your child receives *">
              <textarea style={{ ...s.input, minHeight: 60 }} value={form.services_description} onChange={(e) => set("services_description", e.target.value)} placeholder="Describe the support or services your child receives…" />
            </Field>
          )}
          {form.receives_services !== "" && form.receives_services !== "no" && (
            <div style={{ background: colors.amberLight, border: `1px solid ${colors.amber}`, borderRadius: 8, padding: 10, fontSize: 12, color: colors.textMid, marginTop: 8 }}>
              If your child receives services during the school year, you will be required to maintain those services over the summer program in order for your child to attend camp. Failure to disclose this information may affect your child's ability to attend.
            </div>
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
export const RegisterModal = ({ child, divisions, weeks, existingRegs, settings, siblingCount, parent, onClose, onRegister, saving, isAdmin }) => {
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
  const [step, setStep] = useState("select"); // "select" or "confirm"
  const [policies, setPolicies] = useState({ swimming: false, trips: false, medical: false, cancellation: false });
  const [savingPolicies, setSavingPolicies] = useState(false);
  const allPoliciesChecked = isAdmin || (policies.swimming && policies.trips && policies.medical && policies.cancellation);

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

  // ─── Totals (split confirmed vs waitlisted) ───
  const selectedWeeks = [...selected].map((wid) => divisionWeeks.find((w) => w.id === wid)).filter(Boolean);

  // Determine which selected weeks are waitlisted (preschool class full)
  const isWeekWaitlisted = (w) => {
    const cap = getWeekClassEnrollment(w.id);
    return cap && cap.remaining <= 0;
  };
  const confirmedWeeks = selectedWeeks.filter((w) => !isWeekWaitlisted(w));
  const waitlistedWeeks = selectedWeeks.filter((w) => isWeekWaitlisted(w));
  const waitlistedWeekIds = new Set(waitlistedWeeks.map((w) => w.id));

  // Only confirmed weeks contribute to pricing
  const subtotal = confirmedWeeks.reduce((sum, w) => sum + getBasePrice(w), 0);
  const totalEarlyBird = confirmedWeeks.reduce((sum, w) => sum + calcWeekPriceWithEarlyBird(w), 0);
  const totalRegular = confirmedWeeks.reduce((sum, w) => sum + calcWeekPriceRegular(w), 0);

  // Discount breakdowns for display
  const earlyBirdTotal = confirmedWeeks.reduce((sum, w) => sum + getEarlyBirdDiscount(w), 0);
  const siblingTotal = confirmedWeeks.reduce((sum, w) => sum + getSiblingDiscount(w), 0);

  // Code discount (applied on top — only to confirmed weeks)
  let codeDiscount = 0;
  if (appliedDiscount) {
    if (appliedDiscount.discount_type === "percent") codeDiscount = Math.round(totalRegular * appliedDiscount.discount_value / 100);
    else if (appliedDiscount.discount_type === "fixed") codeDiscount = appliedDiscount.discount_value;
    else if (appliedDiscount.discount_type === "per_week") codeDiscount = appliedDiscount.discount_value * confirmedWeeks.length;
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
    <Modal title={step === "confirm" ? `Confirm — ${child.first_name}` : `Register ${child.first_name} — ${division.name}`} onClose={onClose} width={560}>
      {step === "select" && (
        <>
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
              <button onClick={() => setSelected(new Set(availableWeeks.map((w) => w.id)))} style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 8px", color: colors.forest }}>All</button>
              <button onClick={() => setSelected(new Set())} style={{ ...s.btn("ghost"), fontSize: 12, padding: "4px 8px", color: colors.textMid }}>None</button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
            {availableWeeks.map((w) => {
              const checked = selected.has(w.id);
              const price = getBasePrice(w);
              const partial = isPartialWeek(w);
              const capInfo = getWeekClassEnrollment(w.id);
              const isWaitlisted = capInfo && capInfo.remaining <= 0;
              return (
                <div key={w.id} onClick={() => toggleWeek(w.id)} style={{
                  ...s.card, padding: 14, cursor: "pointer",
                  border: `2px solid ${checked ? (isWaitlisted ? colors.amber : colors.forest) : colors.border}`,
                  background: checked ? (isWaitlisted ? colors.amberLight : colors.forestPale) : colors.card,
                  transition: "all .15s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${checked ? (isWaitlisted ? colors.amber : colors.forest) : colors.border}`, background: checked ? (isWaitlisted ? colors.amber : colors.forest) : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, transition: "all .15s" }}>
                        {checked && Icons.check({ size: 14, color: "#fff" })}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>
                          {w.name}
                          {partial && <span style={{ fontSize: 11, color: colors.textLight, fontWeight: 400, marginLeft: 6 }}>(partial)</span>}
                          {isWaitlisted && <span style={{ fontSize: 11, color: colors.amber, fontWeight: 600, marginLeft: 6 }}>⏳ Waitlist</span>}
                        </div>
                        <div style={{ fontSize: 13, color: colors.textMid }}>
                          {fmtDate(w.start_date)} – {fmtDate(w.end_date)}
                        </div>
                        {capInfo && (
                          <div style={{ fontSize: 11, color: isWaitlisted ? colors.amber : colors.textLight, marginTop: 2 }}>
                            {isWaitlisted ? `${childClassName} class is full — selecting this will add you to the waitlist` : `${capInfo.remaining} of ${capInfo.capacity} ${childClassName} spots left`}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ fontFamily: font.display, fontSize: 18, color: isWaitlisted ? colors.textLight : colors.forest }}>
                      {isWaitlisted ? "—" : `$${(price / 100).toFixed(0)}`}
                    </div>
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
              {confirmedWeeks.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                  <span>{confirmedWeeks.length} week{confirmedWeeks.length !== 1 ? "s" : ""}</span>
                  <span>${(subtotal / 100).toFixed(2)}</span>
                </div>
              )}
              {waitlistedWeeks.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.amber, marginBottom: 6, padding: "6px 8px", background: colors.amberLight, borderRadius: 6 }}>
                  <span>⏳ {waitlistedWeeks.length} week{waitlistedWeeks.length !== 1 ? "s" : ""} waitlisted (no charge)</span>
                  <span>$0.00</span>
                </div>
              )}
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
                if (isAdmin) {
                  // Admin bypasses confirmation — register directly
                  const weekRegs = confirmedWeeks.map((w) => ({
                    week_id: w.id,
                    division_id: child.assigned_division_id,
                    price_cents: isBeforeEarlyBird ? calcWeekPriceWithEarlyBird(w) : calcWeekPriceRegular(w),
                  }));
                  const waitlistRegs = waitlistedWeeks.map((w) => ({
                    week_id: w.id,
                    division_id: child.assigned_division_id,
                    price_cents: isBeforeEarlyBird ? calcWeekPriceWithEarlyBird(w) : calcWeekPriceRegular(w),
                  }));
                  onRegister({
                    child_id: child.id,
                    weeks: weekRegs,
                    waitlist_weeks: waitlistRegs,
                    subtotal_cents: subtotal,
                    discount_cents: subtotal - (isBeforeEarlyBird ? finalEarlyBird : finalRegular),
                    total_cents: isBeforeEarlyBird ? finalEarlyBird : finalRegular,
                    discount_code_id: appliedDiscount?.id || null,
                  });
                } else {
                  setStep("confirm");
                }
              }}
              disabled={saving || selected.size === 0}
              style={{ ...s.btn("primary"), opacity: selected.size > 0 ? 1 : 0.5 }}
            >
              {saving ? <Spinner size={16} /> : (
                isAdmin
                  ? (waitlistedWeeks.length > 0 && confirmedWeeks.length === 0
                      ? `Waitlist ${waitlistedWeeks.length} Week${waitlistedWeeks.length !== 1 ? "s" : ""}`
                      : waitlistedWeeks.length > 0
                        ? `Register ${confirmedWeeks.length} + Waitlist ${waitlistedWeeks.length}`
                        : `Register for ${selected.size} Week${selected.size !== 1 ? "s" : ""}`)
                  : "Review & Confirm"
              )}
            </button>
          </div>
        </>
      )}
      </>
      )}

      {/* ═══ CONFIRMATION STEP (parent only) ═══ */}
      {step === "confirm" && !isAdmin && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setStep("select")} style={{ ...s.btn("ghost"), padding: "4px 8px", fontSize: 13, color: colors.textMid, marginBottom: 8 }}>
              ← Back to week selection
            </button>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Please review and confirm</div>

            {/* Summary */}
            <div style={{ ...s.card, background: colors.forestPale, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{child.first_name} — {division.name}</div>
              {confirmedWeeks.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {confirmedWeeks.map((w) => (
                    <div key={w.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                      <span>{w.name} ({fmtDate(w.start_date)} – {fmtDate(w.end_date)})</span>
                      <span>${((isBeforeEarlyBird ? calcWeekPriceWithEarlyBird(w) : calcWeekPriceRegular(w)) / 100).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}
              {waitlistedWeeks.length > 0 && (
                <div style={{ padding: "6px 8px", background: colors.amberLight, borderRadius: 6, marginBottom: 8 }}>
                  {waitlistedWeeks.map((w) => (
                    <div key={w.id} style={{ fontSize: 13, color: colors.amber, padding: "2px 0" }}>
                      ⏳ {w.name} — waitlisted (no charge until approved)
                    </div>
                  ))}
                </div>
              )}
              {(siblingTotal > 0 || (isBeforeEarlyBird && earlyBirdTotal > 0) || codeDiscount > 0) && (
                <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 6, marginBottom: 4 }}>
                  {siblingTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.success }}><span>Sibling discount</span><span>−${(siblingTotal / 100).toFixed(2)}</span></div>}
                  {isBeforeEarlyBird && earlyBirdTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.success }}><span>Early bird discount</span><span>−${(earlyBirdTotal / 100).toFixed(2)}</span></div>}
                  {codeDiscount > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.success }}><span>Code: {appliedDiscount.code}</span><span>−${(codeDiscount / 100).toFixed(2)}</span></div>}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${colors.border}`, paddingTop: 8, marginTop: 4, fontFamily: font.display, fontSize: 20 }}>
                <span>Total</span>
                <span style={{ color: colors.forest }}>${((isBeforeEarlyBird ? finalEarlyBird : finalRegular) / 100).toFixed(2)}</span>
              </div>
            </div>

            {/* Important notice */}
            <div style={{ background: colors.amberLight, border: `1px solid ${colors.amber}`, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              {Icons.alertCircle({ size: 14, color: colors.amber })} <strong>Important:</strong> Once confirmed, weeks cannot be removed. You can add more weeks later. To remove a week after confirmation, please contact the camp office.
            </div>

            {/* Policy checkboxes */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Terms & Conditions</div>
              <div style={{ fontSize: 13, color: colors.textMid, marginBottom: 10 }}>
                Please review and accept each policy. <a href="https://cgikingston.com/terms-%26-conditions" target="_blank" rel="noopener noreferrer" style={{ color: colors.forest, textDecoration: "underline" }}>Read full terms</a>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { key: "swimming", label: "I agree to the Swimming & Water Activity Waiver" },
                  { key: "trips", label: "I agree to the Trips & Off-Site Activity Waiver" },
                  { key: "medical", label: "I agree to the Medical Authorization & Sunscreen Permission" },
                  { key: "cancellation", label: "I acknowledge the Cancellation & Refund Policy" },
                ].map((p) => (
                  <label key={p.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "8px 10px", background: policies[p.key] ? colors.forestPale : colors.bg, borderRadius: 8, border: `1px solid ${policies[p.key] ? colors.success : colors.borderLight}`, transition: "all .15s" }}>
                    <input type="checkbox" checked={policies[p.key]} onChange={(e) => setPolicies({ ...policies, [p.key]: e.target.checked })} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }} />
                    <span style={{ fontSize: 13 }}>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => setStep("select")} style={s.btn("secondary")}>Back</button>
            <button
              onClick={async () => {
                if (!allPoliciesChecked) return alert("Please accept all terms and conditions to continue.");
                setSavingPolicies(true);
                try {
                  // Save policy acceptances
                  const policyTypes = ["swimming_waiver", "trips_waiver", "medical_authorization", "cancellation_policy"];
                  for (const pType of policyTypes) {
                    await sb.query("policy_acceptances", {
                      method: "POST",
                      body: { parent_id: parent?.id, child_id: child.id, policy_type: pType },
                      headers: { Prefer: "return=minimal" },
                    });
                  }
                } catch (e) {
                  console.warn("Policy acceptance save error:", e.message);
                }
                setSavingPolicies(false);

                // Now register
                const weekRegs = confirmedWeeks.map((w) => ({
                  week_id: w.id,
                  division_id: child.assigned_division_id,
                  price_cents: isBeforeEarlyBird ? calcWeekPriceWithEarlyBird(w) : calcWeekPriceRegular(w),
                }));
                const waitlistRegs = waitlistedWeeks.map((w) => ({
                  week_id: w.id,
                  division_id: child.assigned_division_id,
                  price_cents: isBeforeEarlyBird ? calcWeekPriceWithEarlyBird(w) : calcWeekPriceRegular(w),
                }));
                onRegister({
                  child_id: child.id,
                  weeks: weekRegs,
                  waitlist_weeks: waitlistRegs,
                  subtotal_cents: subtotal,
                  discount_cents: subtotal - (isBeforeEarlyBird ? finalEarlyBird : finalRegular),
                  total_cents: isBeforeEarlyBird ? finalEarlyBird : finalRegular,
                  discount_code_id: appliedDiscount?.id || null,
                });
              }}
              disabled={saving || savingPolicies || !allPoliciesChecked}
              style={{ ...s.btn("primary"), opacity: allPoliciesChecked ? 1 : 0.5 }}
            >
              {saving || savingPolicies ? <Spinner size={16} /> : (
                waitlistedWeeks.length > 0 && confirmedWeeks.length === 0
                  ? `Confirm Waitlist — ${waitlistedWeeks.length} Week${waitlistedWeeks.length !== 1 ? "s" : ""}`
                  : waitlistedWeeks.length > 0
                    ? `Confirm ${confirmedWeeks.length} + Waitlist ${waitlistedWeeks.length}`
                    : `Confirm Registration — ${confirmedWeeks.length} Week${confirmedWeeks.length !== 1 ? "s" : ""}`
              )}
            </button>
          </div>
        </div>
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
    street_address: parent.street_address || "",
    city: parent.city || "Kingston",
    state: parent.state || "PA",
    zip: parent.zip || "18704",
    parent2_first_name: parent.parent2_first_name || "",
    parent2_last_name: parent.parent2_last_name || "",
    parent2_phone: parent.parent2_phone || "",
    elrc_status: parent.elrc_status ?? false,
    elrc_acknowledged: parent.elrc_acknowledged ?? false,
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: null })); };

  // Format phone as user types: (555) 123-4567
  const formatPhone = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    let formatted = digits;
    if (digits.length > 6) formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    else if (digits.length > 3) formatted = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
    else if (digits.length > 0) formatted = `(${digits}`;
    return formatted;
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

    // Address fields
    if (!form.street_address.trim()) errs.street_address = "Street address is required.";
    else if (form.street_address.trim().length < 5) errs.street_address = "Please enter your full street address.";
    if (!form.city.trim()) errs.city = "City is required.";
    if (!form.state.trim() || form.state.trim().length < 2) errs.state = "2-letter state required.";
    if (!form.zip.trim() || form.zip.trim().length < 5) errs.zip = "5-digit ZIP required.";

    // Parent 2 phone validation (only if they entered a name)
    if (form.parent2_first_name.trim() || form.parent2_last_name.trim()) {
      const p2Digits = (form.parent2_phone || "").replace(/\D/g, "");
      if (p2Digits && p2Digits.length < 10) errs.parent2_phone = "Enter a full 10-digit phone number.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const errStyle = { fontSize: 12, color: colors.coral || "#e53e3e", marginTop: 2 };
  const inputErr = (field) => errors[field] ? { ...s.input, borderColor: colors.coral || "#e53e3e" } : s.input;

  return (
    <Modal title="My Profile" onClose={onClose}>
      {/* Parent/Guardian 1 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.textMid, marginBottom: 6 }}>Parent / Guardian 1</div>
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
        <input style={inputErr("phone")} value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} placeholder="(555) 123-4567" inputMode="tel" />
        {errors.phone && <div style={errStyle}>{errors.phone}</div>}
      </Field>

      {/* Address */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textMid, marginBottom: 6 }}>Address</div>
        <Field label="Street Address *">
          <input style={inputErr("street_address")} value={form.street_address} onChange={(e) => set("street_address", e.target.value)} placeholder="123 Main St" />
          {errors.street_address && <div style={errStyle}>{errors.street_address}</div>}
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0 10px" }}>
          <Field label="City *">
            <input style={inputErr("city")} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Kingston" />
            {errors.city && <div style={errStyle}>{errors.city}</div>}
          </Field>
          <Field label="State *">
            <input style={inputErr("state")} value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} placeholder="PA" maxLength={2} />
            {errors.state && <div style={errStyle}>{errors.state}</div>}
          </Field>
          <Field label="ZIP *">
            <input style={inputErr("zip")} value={form.zip} onChange={(e) => set("zip", e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="18704" inputMode="numeric" maxLength={5} />
            {errors.zip && <div style={errStyle}>{errors.zip}</div>}
          </Field>
        </div>
      </div>

      {/* Parent/Guardian 2 (optional) */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textMid, marginBottom: 2 }}>Parent / Guardian 2</div>
        <div style={{ fontSize: 12, color: colors.textLight, marginBottom: 8 }}>Optional — add a second parent or guardian's contact info.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="First Name"><input style={s.input} value={form.parent2_first_name} onChange={(e) => set("parent2_first_name", e.target.value)} /></Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Last Name"><input style={s.input} value={form.parent2_last_name} onChange={(e) => set("parent2_last_name", e.target.value)} /></Field>
          </div>
        </div>
        <Field label="Phone">
          <input style={inputErr("parent2_phone")} value={form.parent2_phone} onChange={(e) => set("parent2_phone", formatPhone(e.target.value))} placeholder="(555) 123-4567" inputMode="tel" />
          {errors.parent2_phone && <div style={errStyle}>{errors.parent2_phone}</div>}
        </Field>
      </div>

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
            street_address: form.street_address.trim(),
            city: form.city.trim(),
            state: form.state.trim(),
            zip: form.zip.trim(),
            parent2_first_name: form.parent2_first_name.trim() || null,
            parent2_last_name: form.parent2_last_name.trim() || null,
            parent2_phone: form.parent2_phone.trim() || null,
            elrc_status: form.elrc_status,
            elrc_acknowledged: form.elrc_acknowledged,
            updated_at: new Date().toISOString(),
          });
        }} disabled={saving} style={s.btn("primary")}>{saving ? <Spinner size={16} /> : "Save"}</button>
      </div>
    </Modal>
  );
};