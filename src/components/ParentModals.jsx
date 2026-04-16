import { useState, useEffect, useMemo } from "react";
import sb from "../lib/supabase";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner } from "../components/UI";

// ============================================================
// TOOLTIP COMPONENT
// ============================================================
function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {children}
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        style={{ marginLeft: 6, cursor: "pointer", color: colors.primary, fontWeight: 700, fontSize: 14, width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${colors.primary}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >?</span>
      {show && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
          background: "#333", color: "#fff", padding: "8px 12px", borderRadius: 8, fontSize: 13,
          whiteSpace: "nowrap", zIndex: 999, boxShadow: "0 2px 8px rgba(0,0,0,.2)"
        }}>{text}</span>
      )}
    </span>
  );
}

// ============================================================
// FIELD WRAPPER
// ============================================================
function FormField({ label, required, tooltip, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 6, color: colors.text }}>
        {label}{required && <span style={{ color: "#e53e3e", marginLeft: 2 }}>*</span>}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      {children}
      {error && <div style={{ color: "#e53e3e", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${colors.border}`,
  fontSize: 15, fontFamily: font.body, outline: "none", boxSizing: "border-box",
  transition: "border-color .2s",
};

const selectStyle = { ...inputStyle, appearance: "none", background: `#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23666' fill='none' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 12px center` };

// ============================================================
// AUTO-ASSIGN DIVISION
// ============================================================
function findDivision(child, divisions) {
  if (!child.date_of_birth || !child.gender) return null;
  const dob = new Date(child.date_of_birth);

  // Score each division by how well the child matches
  for (const div of [...divisions].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!div.active) continue;
    // Gender check
    if (div.gender_filter !== "any" && div.gender_filter !== child.gender) continue;
    // DOB checks
    if (div.min_dob && dob < new Date(div.min_dob)) continue;
    if (div.max_dob && dob > new Date(div.max_dob)) continue;
    // Grade checks (if division has them)
    if (div.min_grade != null && child.grade != null && child.grade < div.min_grade) continue;
    if (div.max_grade != null && child.grade != null && child.grade > div.max_grade) continue;
    return div;
  }
  return null;
}

// ============================================================
// ADD CHILD MODAL
// ============================================================
export function AddChildModal({ onClose, onSave, saving, divisions }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", date_of_birth: "", gender: "",
    grade: "", tshirt_size: "", medical_info: "", allergies: "",
    medications: "", dietary_restrictions: "", swim_level: "", notes: "",
  });
  const [errors, setErrors] = useState({});

  const set = (field, val) => {
    setForm((f) => ({ ...f, [field]: val }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: null }));
  };

  const matchedDivision = useMemo(() => {
    if (!form.date_of_birth || !form.gender) return null;
    return findDivision({ ...form, grade: form.grade === "" ? null : parseInt(form.grade) }, divisions || []);
  }, [form.date_of_birth, form.gender, form.grade, divisions]);

  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = "Required";
    if (!form.last_name.trim()) e.last_name = "Required";
    if (!form.date_of_birth) e.date_of_birth = "Required";
    if (!form.gender) e.gender = "Required";
    if (!form.tshirt_size) e.tshirt_size = "Required";
    if (!form.medical_info.trim()) e.medical_info = "Required — write N/A BH if none";
    if (!form.allergies.trim()) e.allergies = "Required — write N/A BH if none";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      ...form,
      grade: form.grade === "" ? null : parseInt(form.grade),
      assigned_division_id: matchedDivision?.id || null,
      division_override: false,
    });
  };

  const GRADES = [
    { value: "-1", label: "Pre-K" },
    { value: "0", label: "Kindergarten" },
    ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Grade ${i + 1}` })),
  ];

  const TSHIRT_SIZES = [
    { value: "YXS", label: "Youth XS" }, { value: "YS", label: "Youth S" },
    { value: "YM", label: "Youth M" }, { value: "YL", label: "Youth L" },
    { value: "YXL", label: "Youth XL" }, { value: "AS", label: "Adult S" },
    { value: "AM", label: "Adult M" }, { value: "AL", label: "Adult L" },
    { value: "AXL", label: "Adult XL" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 22, color: colors.text }}>Add Child</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#999" }}>×</button>
        </div>

        {/* Name row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FormField label="First Name" required error={errors.first_name}>
            <input style={inputStyle} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} placeholder="First name" />
          </FormField>
          <FormField label="Last Name" required error={errors.last_name}>
            <input style={inputStyle} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="Last name" />
          </FormField>
        </div>

        {/* DOB + Gender row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FormField label="Date of Birth" required error={errors.date_of_birth}>
            <input type="date" style={inputStyle} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} max={new Date().toISOString().split("T")[0]} />
          </FormField>
          <FormField label="Gender" required error={errors.gender}>
            <select style={selectStyle} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Select...</option>
              <option value="male">Boy</option>
              <option value="female">Girl</option>
            </select>
          </FormField>
        </div>

        {/* Grade + T-Shirt row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FormField label="Grade (entering Fall 2026)" error={errors.grade}>
            <select style={selectStyle} value={form.grade} onChange={(e) => set("grade", e.target.value)}>
              <option value="">Select...</option>
              {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </FormField>
          <FormField label="T-Shirt Size" required error={errors.tshirt_size}>
            <select style={selectStyle} value={form.tshirt_size} onChange={(e) => set("tshirt_size", e.target.value)}>
              <option value="">Select...</option>
              {TSHIRT_SIZES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FormField>
        </div>

        {/* Auto-division display */}
        {matchedDivision && (
          <div style={{
            background: colors.primaryLight || "#f0fdf4", border: `1.5px solid ${colors.primary}`,
            borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10
          }}>
            <span style={{ fontSize: 18 }}>✓</span>
            <div>
              <div style={{ fontWeight: 700, color: colors.primary, fontSize: 15 }}>{matchedDivision.name}</div>
              <div style={{ fontSize: 12, color: colors.textLight }}>{matchedDivision.schedule_type === "half_day" ? "Half Day" : "Full Day"} · ${(matchedDivision.per_week_price / 100).toFixed(0)}/week</div>
            </div>
          </div>
        )}
        {form.date_of_birth && form.gender && !matchedDivision && (
          <div style={{
            background: "#fffbeb", border: "1.5px solid #f59e0b", borderRadius: 10,
            padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#92400e"
          }}>
            No matching division found for this age/gender. The director will assign one manually.
          </div>
        )}

        {/* Medical */}
        <FormField label="Medical Conditions" required tooltip="Write N/A BH if your child has no medical conditions" error={errors.medical_info}>
          <input style={inputStyle} value={form.medical_info} onChange={(e) => set("medical_info", e.target.value)} placeholder="N/A BH" />
        </FormField>

        <FormField label="Allergies" required tooltip="Write N/A BH if your child has no allergies" error={errors.allergies}>
          <input style={inputStyle} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="N/A BH" />
        </FormField>

        <FormField label="Medications">
          <input style={inputStyle} value={form.medications} onChange={(e) => set("medications", e.target.value)} placeholder="List any medications, or leave blank" />
        </FormField>

        <FormField label="Dietary Restrictions">
          <input style={inputStyle} value={form.dietary_restrictions} onChange={(e) => set("dietary_restrictions", e.target.value)} placeholder="e.g. Kosher only, nut-free, etc." />
        </FormField>

        <FormField label="Swim Level">
          <select style={selectStyle} value={form.swim_level} onChange={(e) => set("swim_level", e.target.value)}>
            <option value="">Select...</option>
            <option value="none">None</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </FormField>

        <FormField label="Notes">
          <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything else we should know?" />
        </FormField>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{ ...s.button, background: "#eee", color: colors.text }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ ...s.button, background: colors.primary, color: "#fff", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving..." : "Add Child"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REGISTER MODAL (division-based, all weeks pre-selected)
// ============================================================
export function RegisterModal({ child, divisions, weeks, existingRegistrations, settings, siblingCount, onClose, onSave, saving }) {
  const division = divisions.find((d) => d.id === child.assigned_division_id);
  const divisionWeeks = (weeks || [])
    .filter((w) => w.division_id === child.assigned_division_id && w.active)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Pre-select all weeks that aren't already registered
  const alreadyRegisteredWeekIds = new Set((existingRegistrations || []).map((r) => r.week_id));
  const availableWeeks = divisionWeeks.filter((w) => !alreadyRegisteredWeekIds.has(w.id));

  const [selectedWeekIds, setSelectedWeekIds] = useState(new Set(availableWeeks.map((w) => w.id)));
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);

  const toggleWeek = (weekId) => {
    setSelectedWeekIds((prev) => {
      const next = new Set(prev);
      if (next.has(weekId)) next.delete(weekId);
      else next.add(weekId);
      return next;
    });
  };

  const selectAll = () => setSelectedWeekIds(new Set(availableWeeks.map((w) => w.id)));
  const selectNone = () => setSelectedWeekIds(new Set());

  // Calculate price
  const getWeekPrice = (week) => week.price_override_cents ?? division?.per_week_price ?? 0;

  const subtotal = [...selectedWeekIds].reduce((sum, wid) => {
    const w = divisionWeeks.find((wk) => wk.id === wid);
    return sum + (w ? getWeekPrice(w) : 0);
  }, 0);

  // Early bird
  const earlyBirdDeadline = settings?.early_bird_deadline ? new Date(settings.early_bird_deadline) : null;
  const isEarlyBird = earlyBirdDeadline && new Date() < earlyBirdDeadline;
  const earlyBirdPercent = isEarlyBird ? (settings?.early_bird_discount_percent || 0) : 0;
  const earlyBirdDiscount = Math.round(subtotal * earlyBirdPercent / 100);

  // Sibling discount
  const siblingDiscountPercent = (siblingCount >= (settings?.sibling_discount_starts_at || 2))
    ? (settings?.sibling_discount_value || 0) : 0;
  const siblingDiscount = Math.round(subtotal * siblingDiscountPercent / 100);

  // Code discount
  let codeDiscount = 0;
  if (appliedDiscount) {
    if (appliedDiscount.discount_type === "percent") codeDiscount = Math.round(subtotal * appliedDiscount.discount_value / 100);
    else if (appliedDiscount.discount_type === "fixed") codeDiscount = appliedDiscount.discount_value;
    else if (appliedDiscount.discount_type === "per_week") codeDiscount = appliedDiscount.discount_value * selectedWeekIds.size;
  }

  const totalDiscount = earlyBirdDiscount + siblingDiscount + codeDiscount;
  const total = Math.max(0, subtotal - totalDiscount);

  const applyCode = async () => {
    if (!discountCode.trim()) return;
    setCheckingCode(true);
    setDiscountError("");
    try {
      const codes = await sb.query("discount_codes", {
        filters: `&code=eq.${discountCode.trim().toUpperCase()}&active=eq.true`,
      });
      if (!codes || codes.length === 0) {
        setDiscountError("Invalid or expired code");
        setAppliedDiscount(null);
      } else {
        const code = codes[0];
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
    } catch (e) {
      setDiscountError("Error checking code");
    }
    setCheckingCode(false);
  };

  const handleRegister = () => {
    const weekRegs = [...selectedWeekIds].map((wid) => {
      const w = divisionWeeks.find((wk) => wk.id === wid);
      return {
        week_id: wid,
        division_id: child.assigned_division_id,
        price_cents: getWeekPrice(w),
      };
    });
    onSave({
      child_id: child.id,
      weeks: weekRegs,
      subtotal_cents: subtotal,
      discount_cents: totalDiscount,
      total_cents: total,
      discount_code_id: appliedDiscount?.id || null,
    });
  };

  if (!division) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, maxWidth: 440, textAlign: "center" }}>
          <h3 style={{ margin: "0 0 12px" }}>No Division Assigned</h3>
          <p style={{ color: colors.textLight, fontSize: 14 }}>
            {child.first_name} hasn't been assigned to a division yet. Please contact the camp director.
          </p>
          <button onClick={onClose} style={{ ...s.button, background: colors.primary, color: "#fff", marginTop: 16 }}>OK</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 540, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, color: colors.text }}>Register {child.first_name}</h2>
            <div style={{ fontSize: 14, color: colors.textLight, marginTop: 4 }}>{division.name} · {division.schedule_type === "half_day" ? "Half Day" : "Full Day"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#999" }}>×</button>
        </div>

        {availableWeeks.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: colors.textLight }}>
            {child.first_name} is already registered for all available weeks!
          </div>
        ) : (
          <>
            {/* Week selection */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 15 }}>Select Weeks</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={selectAll} style={{ background: "none", border: "none", color: colors.primary, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>All</button>
                  <span style={{ color: "#ccc" }}>|</span>
                  <button onClick={selectNone} style={{ background: "none", border: "none", color: colors.primary, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>None</button>
                </div>
              </div>
              {availableWeeks.map((w) => {
                const selected = selectedWeekIds.has(w.id);
                const price = getWeekPrice(w);
                return (
                  <label key={w.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                    borderRadius: 10, marginBottom: 6, cursor: "pointer",
                    background: selected ? (colors.primaryLight || "#f0fdf4") : "#fafafa",
                    border: `1.5px solid ${selected ? colors.primary : colors.border}`,
                    transition: "all .15s",
                  }}>
                    <input type="checkbox" checked={selected} onChange={() => toggleWeek(w.id)}
                      style={{ width: 18, height: 18, accentColor: colors.primary }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{w.name}</div>
                      <div style={{ fontSize: 12, color: colors.textLight }}>
                        {new Date(w.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(w.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: colors.text }}>${(price / 100).toFixed(0)}</div>
                  </label>
                );
              })}
            </div>

            {/* Discount code */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>Discount Code</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inputStyle, flex: 1, textTransform: "uppercase" }} value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="Enter code" />
                <button onClick={applyCode} disabled={checkingCode}
                  style={{ ...s.button, background: colors.primary, color: "#fff", padding: "8px 20px", opacity: checkingCode ? 0.6 : 1 }}>
                  {checkingCode ? "..." : "Apply"}
                </button>
              </div>
              {discountError && <div style={{ color: "#e53e3e", fontSize: 12, marginTop: 4 }}>{discountError}</div>}
              {appliedDiscount && <div style={{ color: colors.primary, fontSize: 12, marginTop: 4, fontWeight: 600 }}>✓ {appliedDiscount.description || "Discount applied"}</div>}
            </div>

            {/* Price breakdown */}
            <div style={{ background: "#fafafa", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
                <span>{selectedWeekIds.size} week{selectedWeekIds.size !== 1 ? "s" : ""}</span>
                <span>${(subtotal / 100).toFixed(2)}</span>
              </div>
              {earlyBirdDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: colors.primary }}>
                  <span>Early bird ({earlyBirdPercent}% off)</span>
                  <span>−${(earlyBirdDiscount / 100).toFixed(2)}</span>
                </div>
              )}
              {siblingDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: colors.primary }}>
                  <span>Sibling discount ({siblingDiscountPercent}% off)</span>
                  <span>−${(siblingDiscount / 100).toFixed(2)}</span>
                </div>
              )}
              {codeDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: colors.primary }}>
                  <span>Code: {appliedDiscount.code}</span>
                  <span>−${(codeDiscount / 100).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: 10, marginTop: 6, fontWeight: 700, fontSize: 18 }}>
                <span>Total</span>
                <span>${(total / 100).toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ ...s.button, background: "#eee", color: colors.text }}>Cancel</button>
              <button onClick={handleRegister} disabled={saving || selectedWeekIds.size === 0}
                style={{ ...s.button, background: colors.primary, color: "#fff", opacity: (saving || selectedWeekIds.size === 0) ? 0.6 : 1 }}>
                {saving ? "Registering..." : "Register & Continue to Payment"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// PROFILE MODAL (unchanged from v1, just passed through)
// ============================================================
export function ProfileModal({ parent, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    full_name: parent.full_name || "",
    phone: parent.phone || "",
    address: parent.address || "",
    emergency_contact_name: parent.emergency_contact_name || "",
    emergency_contact_phone: parent.emergency_contact_phone || "",
    emergency_contact_relation: parent.emergency_contact_relation || "",
  });

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>Edit Profile</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#999" }}>×</button>
        </div>

        <FormField label="Full Name"><input style={inputStyle} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></FormField>
        <FormField label="Phone"><input style={inputStyle} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></FormField>
        <FormField label="Address"><input style={inputStyle} value={form.address} onChange={(e) => set("address", e.target.value)} /></FormField>

        <h3 style={{ fontSize: 16, margin: "20px 0 12px", color: colors.text }}>Emergency Contact</h3>
        <FormField label="Name"><input style={inputStyle} value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></FormField>
        <FormField label="Phone"><input style={inputStyle} type="tel" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></FormField>
        <FormField label="Relationship"><input style={inputStyle} value={form.emergency_contact_relation} onChange={(e) => set("emergency_contact_relation", e.target.value)} placeholder="e.g. Spouse, Grandparent" /></FormField>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ ...s.button, background: "#eee", color: colors.text }}>Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving} style={{ ...s.button, background: colors.primary, color: "#fff" }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}