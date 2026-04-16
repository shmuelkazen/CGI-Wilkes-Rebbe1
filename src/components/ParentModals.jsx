import { useState, useMemo } from "react";
import sb from "../lib/supabase";
import { s, colors, font } from "../lib/styles";
import Icons from "../lib/icons";
import { Modal, Field, Spinner, StatusBadge } from "./UI";

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
    tshirt_size: "", allergies: "", medications: "", dietary_restrictions: "",
    medical_notes: "", swim_level: "", photo_release: false,
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

  const GRADES = [
    { value: "-1", label: "Pre-K" }, { value: "0", label: "Kindergarten" },
    ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Grade ${i + 1}` })),
  ];

  const validate = () => {
    if (!form.first_name || !form.last_name || !form.date_of_birth) {
      alert("Please fill in first name, last name, and date of birth.");
      return false;
    }
    if (!form.gender) {
      alert("Please select gender.");
      return false;
    }
    if (!form.tshirt_size) {
      alert("Please select a T-shirt size.");
      return false;
    }
    if (!form.allergies.trim()) {
      alert("Please fill in allergies. Write N/A BH if your child has none.");
      return false;
    }
    if (!form.medical_notes.trim()) {
      alert("Please fill in medical conditions. Write N/A BH if your child has none.");
      return false;
    }
    if (!form.emergency_contact_name || !form.emergency_contact_phone) {
      alert("Emergency contact name and phone are required.");
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
    };
    const success = await onSave(childData);
    if (success !== false) {
      if (addAnother) {
        setForm((prev) => ({
          first_name: "", last_name: "", date_of_birth: "", gender: "", grade: "",
          tshirt_size: "", allergies: "", medications: "", dietary_restrictions: "",
          medical_notes: "", swim_level: "", photo_release: false,
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
        <Field label="Grade (Fall 2026)">
          <select style={s.input} value={form.grade} onChange={(e) => set("grade", e.target.value)}>
            <option value="">—</option>
            {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </Field>
        <Field label="T-Shirt Size *">
          <select style={s.input} value={form.tshirt_size} onChange={(e) => set("tshirt_size", e.target.value)}>
            <option value="">—</option>
            <option value="YXS">Youth XS</option><option value="YS">Youth S</option><option value="YM">Youth M</option>
            <option value="YL">Youth L</option><option value="YXL">Youth XL</option>
            <option value="AS">Adult S</option><option value="AM">Adult M</option><option value="AL">Adult L</option><option value="AXL">Adult XL</option>
          </select>
        </Field>
        <Field label="Swim Level">
          <select style={s.input} value={form.swim_level} onChange={(e) => set("swim_level", e.target.value)}>
            <option value="">—</option><option value="none">None</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
          </select>
        </Field>
      </div>

      {/* Auto-division display */}
      {matchedDivision && (
        <div style={{ ...s.card, border: `2px solid ${colors.success}`, background: colors.forestPale, marginTop: 16, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
          {Icons.check({ size: 18, color: colors.success })}
          <div>
            <div style={{ fontWeight: 700, color: colors.forest, fontSize: 14 }}>{matchedDivision.name}</div>
            <div style={{ fontSize: 12, color: colors.textMid }}>{matchedDivision.schedule_type === "half_day" ? "Half Day" : "Full Day"} · ${(matchedDivision.per_week_price / 100).toFixed(0)}/week</div>
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

      {/* Medical — now mandatory */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Medical Information</div>
        <div style={{ fontSize: 12, color: colors.textMid, marginBottom: 12 }}>All fields marked * are required. Write <strong>N/A BH</strong> if not applicable.</div>
        <Field label="Allergies *"><textarea style={{ ...s.input, minHeight: 60 }} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="N/A BH" /></Field>
        <Field label="Medical Conditions *"><textarea style={{ ...s.input, minHeight: 60 }} value={form.medical_notes} onChange={(e) => set("medical_notes", e.target.value)} placeholder="N/A BH" /></Field>
        <Field label="Medications"><textarea style={{ ...s.input, minHeight: 60 }} value={form.medications} onChange={(e) => set("medications", e.target.value)} placeholder="Current medications…" /></Field>
        <Field label="Dietary Restrictions"><input style={s.input} value={form.dietary_restrictions} onChange={(e) => set("dietary_restrictions", e.target.value)} placeholder="e.g. vegetarian, nut-free, kosher" /></Field>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={form.photo_release} onChange={(e) => set("photo_release", e.target.checked)} />
        I authorize CGI Wilkes Rebbe to photograph/video my child for promotional use.
      </label>
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

  const isElrc = parent?.elrc_status === true;

  const toggleWeek = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Base price per week — ELRC or regular
  const getBasePrice = (week) => {
    if (isElrc && division?.elrc_weekly_price != null) return division.elrc_weekly_price;
    return week.price_override_cents ?? division?.per_week_price ?? 0;
  };

  // Minimum floor from settings
  const minFloor = settings?.minimum_weekly_price_cents ?? 0;

  // Early bird: per-division fixed cents, only if NOT yet past deadline
  // Early bird shows as "potential" — it applies at payment time if paid in full by deadline
  const earlyBirdDeadline = settings?.early_bird_deadline ? new Date(settings.early_bird_deadline) : null;
  const earlyBirdPerWeek = division?.early_bird_discount_cents || 0;
  const showEarlyBird = earlyBirdDeadline && earlyBirdPerWeek > 0;

  // Full summer discount: auto if ALL division weeks are selected (already registered + newly selected)
  const allDivisionWeekIds = new Set(divisionWeeks.map((w) => w.id));
  const allRegisteredOrSelected = new Set([...alreadyRegisteredWeekIds, ...selected]);
  const isFullSummer = allDivisionWeekIds.size > 0 && [...allDivisionWeekIds].every((id) => allRegisteredOrSelected.has(id));
  const fullSummerPerWeek = division?.full_summer_discount_cents || 0;

  // Sibling discount: fixed cents/week, elementary only check, starts at child #N
  const siblingStartsAt = settings?.sibling_discount_starts_at ?? 2;
  const siblingCentsPerWeek = settings?.sibling_discount_cents ?? 0;
  const siblingElementaryOnly = settings?.sibling_discount_elementary_only ?? false;
  const isSiblingEligible = siblingCount >= siblingStartsAt && siblingCentsPerWeek > 0
    && (!siblingElementaryOnly || (division?.schedule_type === "full_day"));

  // Calculate per-week price with all discounts, respecting floor
  const calcWeekPrice = (week) => {
    let price = getBasePrice(week);
    // Note: early bird is shown but not subtracted from ledger — it applies when paid in full by deadline
    // So we show two totals: "if paid by deadline" and "regular"
    return price;
  };

  const calcWeekPriceWithEarlyBird = (week) => {
    let price = getBasePrice(week);
    let discount = earlyBirdPerWeek;
    if (isFullSummer && fullSummerPerWeek > 0) discount += fullSummerPerWeek;
    if (isSiblingEligible) discount += siblingCentsPerWeek;
    price = Math.max(minFloor, price - discount);
    return price;
  };

  const calcWeekPriceRegular = (week) => {
    let price = getBasePrice(week);
    let discount = 0;
    if (isFullSummer && fullSummerPerWeek > 0) discount += fullSummerPerWeek;
    if (isSiblingEligible) discount += siblingCentsPerWeek;
    price = Math.max(minFloor, price - discount);
    return price;
  };

  // Subtotals
  const selectedWeeks = [...selected].map((wid) => divisionWeeks.find((w) => w.id === wid)).filter(Boolean);
  const subtotal = selectedWeeks.reduce((sum, w) => sum + getBasePrice(w), 0);
  const totalEarlyBird = selectedWeeks.reduce((sum, w) => sum + calcWeekPriceWithEarlyBird(w), 0);
  const totalRegular = selectedWeeks.reduce((sum, w) => sum + calcWeekPriceRegular(w), 0);

  // Discount breakdowns for display
  const earlyBirdTotal = showEarlyBird ? selectedWeeks.length * earlyBirdPerWeek : 0;
  const fullSummerTotal = (isFullSummer && fullSummerPerWeek > 0) ? selectedWeeks.length * fullSummerPerWeek : 0;
  const siblingTotal = isSiblingEligible ? selectedWeeks.length * siblingCentsPerWeek : 0;

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

  // What goes on the ledger is the regular price (not early bird)
  // Early bird is the discount they get IF they pay in full by deadline
  const ledgerTotal = finalRegular;
  const ledgerDiscount = subtotal - finalRegular;

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
    <Modal title={`Register ${child.first_name} — ${division.name}`} onClose={onClose} width={560}>
      <div style={{ fontSize: 13, color: colors.textMid, marginBottom: 6 }}>
        {division.schedule_type === "half_day" ? "Half Day" : "Full Day"} Program · ${(displayPrice / 100).toFixed(0)}/week
        {isElrc && <span style={{ color: colors.success, fontWeight: 600 }}> (ELRC Rate)</span>}
      </div>

      {/* Early bird notice */}
      {showEarlyBird && earlyBirdDeadline && (
        <div style={{ background: colors.forestPale, border: `1px solid ${colors.success}`, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>
          {Icons.dollar({ size: 14, color: colors.success })} <strong>Early Bird:</strong> Save ${(earlyBirdPerWeek / 100).toFixed(0)}/week when paid in full by {earlyBirdDeadline.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
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
              return (
                <div key={w.id} onClick={() => toggleWeek(w.id)} style={{
                  ...s.card, padding: 14, cursor: "pointer",
                  border: `2px solid ${checked ? colors.forest : colors.border}`,
                  background: checked ? colors.forestPale : colors.card,
                  transition: "all .15s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${checked ? colors.forest : colors.border}`, background: checked ? colors.forest : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, transition: "all .15s" }}>
                        {checked && Icons.check({ size: 14, color: "#fff" })}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{w.name}</div>
                        <div style={{ fontSize: 13, color: colors.textMid }}>
                          {new Date(w.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(w.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </div>
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
                <span>{selected.size} week{selected.size !== 1 ? "s" : ""} × ${(getBasePrice(selectedWeeks[0]) / 100).toFixed(0)}</span>
                <span>${(subtotal / 100).toFixed(2)}</span>
              </div>
              {fullSummerTotal > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.success, marginBottom: 4 }}>
                  <span>Full summer (${(fullSummerPerWeek / 100).toFixed(0)}/wk off)</span>
                  <span>−${(fullSummerTotal / 100).toFixed(2)}</span>
                </div>
              )}
              {siblingTotal > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.success, marginBottom: 4 }}>
                  <span>Sibling discount (${(siblingCentsPerWeek / 100).toFixed(0)}/wk off)</span>
                  <span>−${(siblingTotal / 100).toFixed(2)}</span>
                </div>
              )}
              {codeDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.success, marginBottom: 4 }}>
                  <span>Code: {appliedDiscount.code}</span>
                  <span>−${(codeDiscount / 100).toFixed(2)}</span>
                </div>
              )}

              {/* Show early bird as potential savings */}
              {showEarlyBird && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${colors.border}`, paddingTop: 8, marginTop: 6, fontFamily: font.display, fontSize: 18 }}>
                    <span>If paid by {earlyBirdDeadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <span style={{ color: colors.success }}>${(finalEarlyBird / 100).toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.textMid, marginTop: 2 }}>
                    <span>Early bird saves ${(earlyBirdTotal / 100).toFixed(0)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: font.display, fontSize: 20 }}>
                    <span>Regular price</span>
                    <span style={{ color: colors.forest }}>${(finalRegular / 100).toFixed(2)}</span>
                  </div>
                </>
              )}
              {!showEarlyBird && (
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${colors.border}`, paddingTop: 8, marginTop: 6, fontFamily: font.display, fontSize: 20 }}>
                  <span>Total</span>
                  <span style={{ color: colors.forest }}>${(finalRegular / 100).toFixed(2)}</span>
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
                  price_cents: calcWeekPriceRegular(w),
                }));
                onRegister({
                  child_id: child.id,
                  weeks: weekRegs,
                  subtotal_cents: subtotal,
                  discount_cents: subtotal - finalRegular,
                  total_cents: finalRegular,
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
    full_name: parent.full_name || "",
    phone: parent.phone || "",
    address: parent.address || "",
    elrc_status: parent.elrc_status ?? false,
    elrc_acknowledged: parent.elrc_acknowledged ?? false,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleElrcToggle = (checked) => {
    if (checked && !form.elrc_acknowledged) {
      set("elrc_status", true);
    } else {
      set("elrc_status", checked);
    }
  };

  return (
    <Modal title="My Profile" onClose={onClose}>
      <Field label="Full Name"><input style={s.input} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
      <Field label="Phone"><input style={s.input} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" /></Field>
      <Field label="Address"><input style={s.input} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>

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
          if (form.elrc_status && !form.elrc_acknowledged) return alert("Please acknowledge the ELRC disclaimer before saving.");
          onSave(form);
        }} disabled={saving} style={s.btn("primary")}>{saving ? <Spinner size={16} /> : "Save"}</button>
      </div>
    </Modal>
  );
};