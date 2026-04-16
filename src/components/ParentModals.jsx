import { useState } from "react";
import { s, colors, font } from "../lib/styles";
import Icons from "../lib/icons";
import { Modal, Field, Spinner, StatusBadge } from "./UI";

// ============================================================
// ADD CHILD MODAL
// ============================================================
export const AddChildModal = ({ onClose, onSave, onAddAnother, saving }) => {
  const [form, setForm] = useState({
    first_name: "", last_name: "", date_of_birth: "", gender: "", grade: "",
    tshirt_size: "", allergies: "", medications: "", dietary_restrictions: "",
    medical_notes: "", swim_level: "", photo_release: false,
    emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relation: "",
  });
  const [done, setDone] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validate = () => {
    if (!form.first_name || !form.last_name || !form.date_of_birth) {
      alert("Please fill in first name, last name, and date of birth.");
      return false;
    }
    if (!form.gender) {
      alert("Please select gender.");
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
    const success = await onSave(form);
    if (success !== false) {
      if (addAnother) {
        // Reset form for next child, keep emergency contact info
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
        <Field label="Date of Birth *"><input type="date" style={s.input} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
        <Field label="Gender *">
          <select style={s.input} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">—</option><option>Male</option><option>Female</option>
          </select>
        </Field>
        <Field label="Grade (Fall 2026)"><input style={s.input} value={form.grade} onChange={(e) => set("grade", e.target.value)} placeholder="e.g. 3rd" /></Field>
        <Field label="T-Shirt Size">
          <select style={s.input} value={form.tshirt_size} onChange={(e) => set("tshirt_size", e.target.value)}>
            <option value="">—</option><option>YS</option><option>YM</option><option>YL</option><option>AS</option><option>AM</option><option>AL</option>
          </select>
        </Field>
        <Field label="Swim Level">
          <select style={s.input} value={form.swim_level} onChange={(e) => set("swim_level", e.target.value)}>
            <option value="">—</option><option value="none">None</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
          </select>
        </Field>
      </div>

      {/* Emergency Contact — required */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "20px 0 16px", paddingTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Emergency Contact *</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <Field label="Contact Name *"><input style={s.input} value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} placeholder="Full name" /></Field>
          <Field label="Contact Phone *"><input style={s.input} value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} placeholder="(555) 123-4567" /></Field>
        </div>
        <Field label="Relationship"><input style={s.input} value={form.emergency_contact_relation} onChange={(e) => set("emergency_contact_relation", e.target.value)} placeholder="e.g. Grandparent, Aunt, Neighbor" /></Field>
      </div>

      {/* Medical */}
      <div style={{ borderTop: `1px solid ${colors.border}`, margin: "16px 0", paddingTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Medical Information</div>
        <Field label="Allergies"><textarea style={{ ...s.input, minHeight: 60 }} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="List any allergies…" /></Field>
        <Field label="Medications"><textarea style={{ ...s.input, minHeight: 60 }} value={form.medications} onChange={(e) => set("medications", e.target.value)} placeholder="Current medications…" /></Field>
        <Field label="Dietary Restrictions"><input style={s.input} value={form.dietary_restrictions} onChange={(e) => set("dietary_restrictions", e.target.value)} placeholder="e.g. vegetarian, nut-free, kosher" /></Field>
        <Field label="Medical Notes"><textarea style={{ ...s.input, minHeight: 60 }} value={form.medical_notes} onChange={(e) => set("medical_notes", e.target.value)} placeholder="Anything staff should know…" /></Field>
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
// REGISTER FOR SESSION MODAL
// ============================================================
export const RegisterModal = ({ child, sessions, existingRegs, onClose, onRegister, saving }) => {
  const [selected, setSelected] = useState(new Set());
  const alreadyRegistered = new Set(existingRegs.map((r) => r.session_id));

  const childAge = child.date_of_birth
    ? Math.floor((Date.now() - new Date(child.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const toggleSession = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPrice = sessions
    .filter((ses) => selected.has(ses.id))
    .reduce((sum, ses) => sum + (ses.price_cents || 0), 0);

  return (
    <Modal title={`Register ${child.first_name} for Sessions`} onClose={onClose} width={560}>
      <p style={{ fontSize: 13, color: colors.textMid, marginBottom: 14 }}>Select one or more sessions:</p>
      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {sessions.map((ses) => {
          const done = alreadyRegistered.has(ses.id);
          const ageOk = childAge === null || (childAge >= ses.age_min && childAge <= ses.age_max);
          const disabled = done;
          const checked = selected.has(ses.id);
          return (
            <div key={ses.id} onClick={() => !disabled && toggleSession(ses.id)} style={{
              ...s.card, padding: 16, cursor: disabled ? "default" : "pointer",
              border: `2px solid ${checked ? colors.forest : colors.border}`,
              background: checked ? colors.forestPale : colors.card,
              opacity: disabled ? 0.5 : 1, transition: "all .15s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${checked ? colors.forest : colors.border}`, background: checked ? colors.forest : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, transition: "all .15s" }}>
                    {checked && Icons.check({ size: 14, color: "#fff" })}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{ses.name}</div>
                    <div style={{ fontSize: 13, color: colors.textMid }}>{ses.dates} · Ages {ses.age_min}–{ses.age_max}</div>
                    {!ageOk && !done && <div style={{ fontSize: 12, color: colors.coral, marginTop: 4 }}>Age {childAge} outside range</div>}
                    {done && <div style={{ fontSize: 12, color: colors.success, marginTop: 4 }}>Already registered</div>}
                  </div>
                </div>
                <div style={{ fontFamily: font.display, fontSize: 18, color: colors.forest }}>${(ses.price_cents / 100).toFixed(0)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {selected.size > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: colors.forestPale, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          <span>{selected.size} session{selected.size !== 1 ? "s" : ""} selected</span>
          <span style={{ fontWeight: 700, color: colors.forest }}>Total: ${(totalPrice / 100).toFixed(0)}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => { if (selected.size === 0) return alert("Select at least one session."); onRegister(child.id, [...selected]); }} disabled={saving || selected.size === 0} style={{ ...s.btn("primary"), opacity: selected.size > 0 ? 1 : 0.5 }}>
          {saving ? <Spinner size={16} /> : `Register for ${selected.size} Session${selected.size !== 1 ? "s" : ""}`}
        </button>
      </div>
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
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title="My Profile" onClose={onClose}>
      <Field label="Full Name"><input style={s.input} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
      <Field label="Phone"><input style={s.input} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" /></Field>
      <Field label="Address"><input style={s.input} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
        <button onClick={() => onSave(form)} disabled={saving} style={s.btn("primary")}>{saving ? <Spinner size={16} /> : "Save"}</button>
      </div>
    </Modal>
  );
};