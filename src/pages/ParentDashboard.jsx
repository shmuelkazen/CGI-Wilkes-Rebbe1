import { useState, useEffect, useCallback } from "react";
import sb from "../lib/supabase";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner, EmptyState, StatusBadge } from "../components/UI";
import { AddChildModal, RegisterModal, ProfileModal } from "../components/ParentModals";

// ============================================================
// HELPER: compute child age from DOB
// ============================================================
function computeAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ============================================================
// CHILD CARD — clean status display
// ============================================================
function ChildCard({ child, registrations, weeks, divisions, onRegister }) {
  const age = computeAge(child.date_of_birth);
  const division = divisions.find((d) => d.id === child.assigned_division_id);

  // Group registrations by status
  const childRegs = (registrations || []).filter((r) => r.child_id === child.id);
  const confirmedCount = childRegs.filter((r) => r.status === "confirmed").length;
  const pendingCount = childRegs.filter((r) => r.status === "pending").length;

  // Map week IDs to names
  const weekMap = Object.fromEntries((weeks || []).map((w) => [w.id, w]));

  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: 20, marginBottom: 14,
      border: `1px solid ${colors.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.04)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, color: colors.text }}>{child.first_name} {child.last_name}</h3>
          <div style={{ fontSize: 13, color: colors.textLight, marginTop: 2 }}>
            {age !== null ? `Age ${age}` : ""}
            {child.grade != null ? ` · ${child.grade === 0 ? "K" : child.grade === -1 ? "Pre-K" : `Grade ${child.grade}`}` : ""}
            {division ? ` · ${division.name}` : ""}
            {child.tshirt_size ? ` · ${child.tshirt_size}` : ""}
          </div>
        </div>
        {(child.medical_info && child.medical_info !== "N/A BH" && child.medical_info !== "N/A") && (
          <span style={{
            background: "#fef2f2", color: "#dc2626", fontSize: 11, fontWeight: 700,
            padding: "3px 8px", borderRadius: 6,
          }}>Medical Note</span>
        )}
      </div>

      {/* Registered weeks — clean display */}
      {childRegs.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {childRegs.map((reg) => {
              const week = weekMap[reg.week_id];
              const weekName = week?.name || "Week";
              const isGood = reg.status === "confirmed";
              const isPending = reg.status === "pending";
              const isCancelled = reg.status === "cancelled";
              return (
                <span key={reg.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: isCancelled ? "#f5f5f5" : isGood ? "#f0fdf4" : "#fffbeb",
                  color: isCancelled ? "#999" : isGood ? "#16a34a" : "#d97706",
                  textDecoration: isCancelled ? "line-through" : "none",
                }}>
                  {isGood && "✓"}{isPending && "○"}{isCancelled && "×"} {weekName}
                </span>
              );
            })}
          </div>
          {/* Summary line */}
          <div style={{ fontSize: 12, color: colors.textLight, marginTop: 8 }}>
            {confirmedCount > 0 && `${confirmedCount} confirmed`}
            {confirmedCount > 0 && pendingCount > 0 && " · "}
            {pendingCount > 0 && <span style={{ color: "#d97706" }}>{pendingCount} pending</span>}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: colors.textLight, marginBottom: 14 }}>
          Not registered for any weeks yet
        </div>
      )}

      <button onClick={() => onRegister(child)} style={{
        ...s.button, background: "#fff", color: colors.primary,
        border: `1.5px solid ${colors.primary}`, fontSize: 13, padding: "8px 16px",
      }}>
        Register for {division ? division.name : "Sessions"}
      </button>
    </div>
  );
}

// ============================================================
// PARENT DASHBOARD
// ============================================================
export default function ParentDashboard({ user, isAdmin, setView, showToast }) {
  const [parent, setParent] = useState(null);
  const [children, setChildren] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);     // "addChild" | "register" | "profile" | "payment"
  const [activeChild, setActiveChild] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [par, kids, divs, wks, settingsRows] = await Promise.all([
        sb.query("parents", { filters: `&id=eq.${user.id}`, single: true }),
        sb.query("children", { filters: `&parent_id=eq.${user.id}&order=created_at.asc` }),
        sb.query("divisions", { filters: `&active=eq.true&order=sort_order.asc` }),
        sb.query("division_weeks", { filters: `&active=eq.true&order=sort_order.asc` }),
        sb.query("camp_settings"),
      ]);
      setParent(par);
      setChildren(kids || []);
      setDivisions(divs || []);
      setWeeks(wks || []);

      // Parse settings into a flat object
      const s = {};
      (settingsRows || []).forEach((row) => {
        try { s[row.key] = JSON.parse(row.value); } catch { s[row.key] = row.value; }
      });
      setSettings(s);

      // Load registrations for all children
      if (kids && kids.length > 0) {
        const childIds = kids.map((k) => k.id);
        const regs = await sb.query("registrations", {
          filters: `&child_id=in.(${childIds.join(",")})&order=created_at.asc`,
        });
        setRegistrations(regs || []);
      }

      // Load family ledger
      try {
        const led = await sb.query("family_ledger", { filters: `&parent_id=eq.${user.id}`, single: true });
        setLedger(led);
      } catch { setLedger(null); }

    } catch (e) {
      console.error("Parent load:", e);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const handleSignOut = async () => { await sb.signOut(); window.location.reload(); };

  // ---- Add Child ----
  const handleAddChild = async (childData) => {
    setSaving(true);
    try {
      await sb.query("children", {
        method: "POST",
        body: { ...childData, parent_id: user.id },
        headers: { Prefer: "return=minimal" },
      });
      showToast("Child added!");
      setModal(null);
      await load();
    } catch (e) {
      showToast("Error: " + e.message);
    }
    setSaving(false);
  };

  // ---- Register child for weeks ----
  const handleRegister = async (regData) => {
    setSaving(true);
    try {
      // Insert registrations for each selected week
      for (const week of regData.weeks) {
        await sb.query("registrations", {
          method: "POST",
          body: {
            child_id: regData.child_id,
            division_id: week.division_id,
            week_id: week.week_id,
            price_cents: week.price_cents,
            status: "pending",
          },
          headers: { Prefer: "return=minimal" },
        });
      }

      // Upsert family ledger
      const currentDue = (ledger?.total_due_cents || 0) + regData.total_cents;
      if (ledger) {
        await sb.query("family_ledger", {
          method: "PATCH",
          body: {
            total_due_cents: currentDue,
            discount_amount_cents: (ledger.discount_amount_cents || 0) + regData.discount_cents,
            updated_at: new Date().toISOString(),
          },
          filters: `&parent_id=eq.${user.id}`,
          headers: { Prefer: "return=minimal" },
        });
      } else {
        await sb.query("family_ledger", {
          method: "POST",
          body: {
            parent_id: user.id,
            total_due_cents: regData.total_cents,
            discount_amount_cents: regData.discount_cents,
          },
          headers: { Prefer: "return=minimal" },
        });
      }

      // Log discount if applied
      if (regData.discount_cents > 0) {
        await sb.query("payment_log", {
          method: "POST",
          body: {
            parent_id: user.id,
            amount_cents: regData.discount_cents,
            method: "discount",
            discount_code_id: regData.discount_code_id,
            notes: `Discount applied: early bird / sibling / code`,
          },
          headers: { Prefer: "return=minimal" },
        });
      }

      showToast("Registration submitted!");
      setModal(null);
      setActiveChild(null);
      await load();

      // TODO: redirect to Stripe checkout here if paying now

    } catch (e) {
      showToast("Error: " + e.message);
    }
    setSaving(false);
  };

  // ---- Update Profile ----
  const handleUpdateProfile = async (profileData) => {
    setSaving(true);
    try {
      await sb.query("parents", {
        method: "PATCH",
        body: { ...profileData, updated_at: new Date().toISOString() },
        filters: `&id=eq.${user.id}`,
        headers: { Prefer: "return=minimal" },
      });
      showToast("Profile updated!");
      setModal(null);
      await load();
    } catch (e) {
      showToast("Error: " + e.message);
    }
    setSaving(false);
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: colors.bg }}>
      <Spinner size={32} />
    </div>
  );

  const campName = settings.camp_name || "CGI Wilkes Rebbe";
  const campSeason = settings.camp_season || "Summer 2026";
  const parentName = parent?.full_name || user.user_metadata?.full_name || user.email;

  // Balance info
  const balanceDue = ledger ? (ledger.total_due_cents - ledger.total_paid_cents) : 0;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg }}>
      {/* Header */}
      <header style={{
        background: "#fff", borderBottom: `1px solid ${colors.border}`,
        padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: colors.primary, fontFamily: font.heading }}>{campName}</h1>
          <div style={{ fontSize: 12, color: colors.textLight }}>{campSeason}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {isAdmin && (
            <button onClick={() => setView("admin")} style={{ ...s.button, background: "#eee", color: colors.text, fontSize: 13 }}>
              Admin
            </button>
          )}
          <button onClick={() => setModal("profile")} style={{ ...s.button, background: "#eee", color: colors.text, fontSize: 13 }}>Profile</button>
          <button onClick={handleSignOut} style={{ ...s.button, background: "#eee", color: colors.text, fontSize: 13 }}>Sign Out</button>
        </div>
      </header>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px" }}>
        {/* Welcome */}
        <h2 style={{ margin: "0 0 4px", fontSize: 26, fontFamily: font.heading, color: colors.text }}>Welcome, {parentName}</h2>
        <p style={{ margin: "0 0 28px", color: colors.textLight, fontSize: 15 }}>{campSeason} Registration</p>

        {/* Balance banner */}
        {ledger && balanceDue > 0 && !ledger.balance_cleared && (
          <div style={{
            background: "#fffbeb", border: "1.5px solid #f59e0b", borderRadius: 12,
            padding: "14px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 700, color: "#92400e", fontSize: 15 }}>Balance Due: ${(balanceDue / 100).toFixed(2)}</div>
              <div style={{ fontSize: 12, color: "#a16207" }}>Total: ${(ledger.total_due_cents / 100).toFixed(2)} · Paid: ${(ledger.total_paid_cents / 100).toFixed(2)}</div>
            </div>
            <button style={{ ...s.button, background: "#f59e0b", color: "#fff", fontSize: 13 }}
              onClick={() => {/* TODO: Stripe payment flow */}}>
              Make Payment
            </button>
          </div>
        )}
        {ledger && ledger.balance_cleared && (
          <div style={{
            background: "#f0fdf4", border: `1.5px solid ${colors.primary}`, borderRadius: 12,
            padding: "14px 18px", marginBottom: 20,
          }}>
            <div style={{ fontWeight: 700, color: colors.primary, fontSize: 15 }}>✓ Balance Cleared</div>
          </div>
        )}

        {/* My Children */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontFamily: font.heading }}>My Children</h3>
          <button onClick={() => setModal("addChild")} style={{
            ...s.button, background: colors.primary, color: "#fff", fontSize: 14,
          }}>+ Add Child</button>
        </div>

        {children.length === 0 ? (
          <div style={{
            background: "#fff", borderRadius: 14, padding: 40, textAlign: "center",
            border: `1px solid ${colors.border}`,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👶</div>
            <h3 style={{ margin: "0 0 8px" }}>No children added yet</h3>
            <p style={{ color: colors.textLight, fontSize: 14, margin: "0 0 16px" }}>
              Add your child to get started with registration
            </p>
            <button onClick={() => setModal("addChild")} style={{ ...s.button, background: colors.primary, color: "#fff" }}>
              + Add Child
            </button>
          </div>
        ) : (
          children.map((child) => (
            <ChildCard
              key={child.id}
              child={child}
              registrations={registrations}
              weeks={weeks}
              divisions={divisions}
              onRegister={(c) => { setActiveChild(c); setModal("register"); }}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {modal === "addChild" && (
        <AddChildModal
          onClose={() => setModal(null)}
          onSave={handleAddChild}
          saving={saving}
          divisions={divisions}
        />
      )}
      {modal === "register" && activeChild && (
        <RegisterModal
          child={activeChild}
          divisions={divisions}
          weeks={weeks}
          existingRegistrations={registrations.filter((r) => r.child_id === activeChild.id)}
          settings={settings}
          siblingCount={children.length}
          onClose={() => { setModal(null); setActiveChild(null); }}
          onSave={handleRegister}
          saving={saving}
        />
      )}
      {modal === "profile" && parent && (
        <ProfileModal
          parent={parent}
          onClose={() => setModal(null)}
          onSave={handleUpdateProfile}
          saving={saving}
        />
      )}
    </div>
  );
}