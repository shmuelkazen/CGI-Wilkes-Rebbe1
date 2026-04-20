import { useState, useEffect, useCallback } from "react";
import sb from "../lib/supabase";
import { calculateBalance } from "../lib/calculateBalance";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner, EmptyState, Modal, Field } from "../components/UI";
import { AddChildModal, RegisterModal, ProfileModal } from "../components/ParentModals";

// Helper: calculate age from DOB (fixed — validates date properly)
function calcAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Helper: format a date string (YYYY-MM-DD) without timezone shift
function fmtDate(dateStr, opts) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", opts || { month: "short", day: "numeric" });
}

export default function ParentDashboard({ user, isAdmin, setView, showToast }) {
  const [children, setChildren] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [parent, setParent] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selectedChild, setSelectedChild] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addressForm, setAddressForm] = useState({ address: "", phone: "" });
  const [needsAddress, setNeedsAddress] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentMode, setPaymentMode] = useState("full");
  const [customAmount, setCustomAmount] = useState("");
  const [feeOverrideCode, setFeeOverrideCode] = useState("");
  const [feeOverrideError, setFeeOverrideError] = useState("");
  const [payingFee, setPayingFee] = useState(false);
  const [shirtOrders, setShirtOrders] = useState([]);
  const [shirtCart, setShirtCart] = useState({});
  const [discountCode, setDiscountCode] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [balanceCalc, setBalanceCalc] = useState(null);
  const [discountCredits, setDiscountCredits] = useState([]);

  const load = useCallback(async () => {
    try {
      const [c, divs, wks, p, settingsRows] = await Promise.all([
        sb.query("children", { filters: `&parent_id=eq.${user.id}&order=first_name.asc` }),
        sb.query("divisions", { filters: `&active=eq.true&order=sort_order.asc` }),
        sb.query("division_weeks", { filters: `&active=eq.true&order=sort_order.asc` }),
        sb.query("parents", { filters: `&id=eq.${user.id}`, single: true }),
        sb.query("camp_settings"),
      ]);
      setChildren(c || []);
      setDivisions(divs || []);
      setWeeks(wks || []);
      setParent(p);

      // Parse settings into flat object
      const st = {};
      (settingsRows || []).forEach((row) => {
        try { st[row.key] = JSON.parse(row.value); } catch { st[row.key] = row.value; }
      });
      setSettings(st);

      // Recalculate balance on the fly — exclude waitlisted
      const regs = (c && c.length > 0)
        ? (await sb.query("registrations", {
            filters: `&child_id=in.(${(c || []).map((k) => k.id).join(",")})&status=in.(pending,confirmed)&order=created_at.asc`,
          }) || [])
        : [];
      // Also load waitlisted regs for display only
      const waitlistedRegs = (c && c.length > 0)
        ? (await sb.query("registrations", {
            filters: `&child_id=in.(${(c || []).map((k) => k.id).join(",")})&status=eq.waitlisted&order=created_at.asc`,
          }) || [])
        : [];
      setRegistrations([...regs, ...waitlistedRegs]);

      const calc = calculateBalance({
        children: c || [],
        registrations: regs, // only pending+confirmed, not waitlisted
        divisions: divs || [],
        weeks: wks || [],
        parent: p,
        settings: st,
      });
      setBalanceCalc(calc);

      // Load discount code credits from payment_log
      let credits = [];
      try {
        credits = await sb.query("payment_log", {
          filters: `&parent_id=eq.${user.id}&method=eq.discount&discount_code_id=not.is.null&order=created_at.asc`,
        }) || [];
      } catch { credits = []; }
      setDiscountCredits(credits);

      // Sync ledger with recalculated totals
      const totalCodeCredits = credits.reduce((sum, d) => sum + (Number(d.amount_cents) || 0), 0);
      const newTotalDue = Math.max(0, calc.totalDue - totalCodeCredits);
      try {
        const led = await sb.query("family_ledger", { filters: `&parent_id=eq.${user.id}`, single: true });
        if (led && led.total_due_cents !== newTotalDue) {
          await sb.query("family_ledger", {
            method: "PATCH",
            body: {
              total_due_cents: newTotalDue,
              discount_amount_cents: calc.discounts.total + totalCodeCredits,
              updated_at: new Date().toISOString(),
            },
            filters: `&parent_id=eq.${user.id}`,
            headers: { Prefer: "return=minimal" },
          });
        }
        const freshLedger = await sb.query("family_ledger", { filters: `&parent_id=eq.${user.id}`, single: true });
        setLedger(freshLedger);
      } catch (e) {
        console.warn("Ledger sync:", e.message);
      }

      // Load shirt orders
      try {
        const shirts = await sb.query("shirt_orders", { filters: `&parent_id=eq.${user.id}&order=created_at.desc` });
        setShirtOrders(shirts || []);
      } catch { setShirtOrders([]); }

      // Check if address or phone is missing
      if (p && (!p.address || !p.address.trim() || !p.phone || !p.phone.trim())) {
        setNeedsAddress(true);
        setAddressForm({ address: p.address || "", phone: p.phone || "" });
      }
    } catch (e) {
      console.error("Load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  // Handle Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      showToast("Payment successful! Thank you.");
      window.history.replaceState(null, "", window.location.pathname);
      load();
    } else if (params.get("payment") === "cancelled") {
      showToast("Payment was cancelled.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const handleSignOut = async () => { await sb.signOut(); window.location.reload(); };

  const handleAddChild = async (data) => {
    setSaving(true);
    try {
      await sb.query("children", {
        method: "POST",
        body: { ...data, parent_id: user.id },
        headers: { Prefer: "return=minimal" },
      });
      showToast("Child added!");
      load();
      return true;
    } catch (e) {
      alert("Error: " + e.message);
      return false;
    } finally { setSaving(false); }
  };

  const handleAddAnother = () => {
    setModal(null);
    setTimeout(() => setModal("add-child"), 50);
  };

  const handleRegister = async (regData) => {
    setSaving(true);
    try {
      // Create confirmed (pending) registrations
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

      // Create waitlisted registrations (no ledger impact)
      const waitlistWeeks = regData.waitlist_weeks || [];
      for (let i = 0; i < waitlistWeeks.length; i++) {
        const week = waitlistWeeks[i];
        await sb.query("registrations", {
          method: "POST",
          body: {
            child_id: regData.child_id,
            division_id: week.division_id,
            week_id: week.week_id,
            price_cents: week.price_cents,
            status: "waitlisted",
            waitlist_position: i + 1,
          },
          headers: { Prefer: "return=minimal" },
        });
      }

      // Only add confirmed weeks to the ledger
      if (regData.weeks.length > 0) {
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
      }

      if (regData.discount_cents > 0) {
        await sb.query("payment_log", {
          method: "POST",
          body: {
            parent_id: user.id,
            amount_cents: regData.discount_cents,
            method: "discount",
            discount_code_id: regData.discount_code_id,
            notes: "Discount applied",
          },
          headers: { Prefer: "return=minimal" },
        });
      }

      // Send waitlist confirmation email if any weeks were waitlisted
      if (waitlistWeeks.length > 0) {
        const child = children.find((c) => c.id === regData.child_id);
        const div = divisions.find((d) => d.id === child?.assigned_division_id);
        const PRESCHOOL_GRADES = { "-5": "Infants", "-4": "Toddler", "-3": "Pre Nursery", "-2": "Nursery", "-1": "Pre K" };
        const className = PRESCHOOL_GRADES[String(child?.grade)] || "";
        const waitlistWeekNames = waitlistWeeks.map((ww) => {
          const wk = weeks.find((w) => w.id === ww.week_id);
          return wk?.name || "Week";
        });
        try {
          await fetch("/.netlify/functions/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "waitlist_confirmation",
              data: {
                parentId: user.id,
                parentEmail: user.email,
                parentName: parent?.full_name || user.email?.split("@")[0],
                childName: `${child?.first_name} ${child?.last_name}`,
                className,
                divisionName: div?.name || "Preschool",
                weeks: waitlistWeekNames,
              },
            }),
          });
        } catch (e) { console.warn("Waitlist email failed:", e.message); }
      }

      const confirmedCount = regData.weeks.length;
      const waitlistCount = waitlistWeeks.length;
      const msg = waitlistCount > 0 && confirmedCount > 0
        ? `Registered for ${confirmedCount} week${confirmedCount !== 1 ? "s" : ""}, ${waitlistCount} waitlisted!`
        : waitlistCount > 0
          ? `Added to waitlist for ${waitlistCount} week${waitlistCount !== 1 ? "s" : ""}!`
          : `Registered for ${confirmedCount} week${confirmedCount !== 1 ? "s" : ""}!`;
      showToast(msg);
      setModal(null);
      load();
    } catch (e) {
      if (e.message?.includes("unique") || e.message?.includes("duplicate")) {
        alert("This child is already registered for one of the selected weeks.");
      } else {
        alert("Error: " + e.message);
      }
    } finally { setSaving(false); }
  };

  const handleUpdateProfile = async (data) => {
    setSaving(true);
    try {
      await sb.query("parents", {
        method: "PATCH",
        body: data,
        filters: `&id=eq.${user.id}`,
        headers: { Prefer: "return=minimal" },
      });
      showToast("Profile updated!");
      setModal(null);
      load();
    } catch (e) {
      alert("Error: " + e.message);
    } finally { setSaving(false); }
  };

  // ── Apply discount code at payment time ──
  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    setApplyingDiscount(true);
    setDiscountError("");
    try {
      const codes = await sb.query("discount_codes", {
        filters: `&code=eq.${discountCode.trim().toUpperCase()}&active=eq.true`,
      });
      const code = codes && codes[0];
      if (!code) { setDiscountError("Invalid or inactive code."); return; }

      if (code.valid_until && new Date(code.valid_until) < new Date()) {
        setDiscountError("This code has expired.");
        return;
      }
      if (code.max_uses && (code.times_used || 0) >= code.max_uses) {
        setDiscountError("This code has reached its usage limit.");
        return;
      }

      const totalDue = Number(ledger?.total_due_cents) || 0;
      const totalPaid = Number(ledger?.total_paid_cents) || 0;
      const existingDiscounts = Number(ledger?.discount_amount_cents) || 0;
      const currentBalance = totalDue - totalPaid;
      if (currentBalance <= 0) { setDiscountError("No balance to apply discount to."); return; }

      let discountCents = 0;
      if (code.discount_type === "percent") {
        discountCents = Math.round((currentBalance * (Number(code.discount_value) || 0)) / 100);
      } else {
        discountCents = Math.min(Number(code.discount_value) || 0, currentBalance);
      }

      if (discountCents <= 0) { setDiscountError("Discount results in $0 — no change."); return; }

      const newTotalDue = totalDue - discountCents;
      const newDiscounts = existingDiscounts + discountCents;

      if (ledger) {
        await sb.query("family_ledger", {
          method: "PATCH",
          body: {
            total_due_cents: newTotalDue,
            discount_amount_cents: newDiscounts,
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
            total_due_cents: 0,
            total_paid_cents: 0,
            discount_amount_cents: discountCents,
          },
          headers: { Prefer: "return=minimal" },
        });
      }

      await sb.query("payment_log", {
        method: "POST",
        body: {
          parent_id: user.id,
          amount_cents: discountCents,
          method: "discount",
          discount_code_id: code.id,
          notes: `Code ${code.code} applied at payment`,
        },
        headers: { Prefer: "return=minimal" },
      });

      await sb.query("discount_codes", {
        method: "PATCH",
        body: { times_used: (code.times_used || 0) + 1 },
        filters: `&id=eq.${code.id}`,
        headers: { Prefer: "return=minimal" },
      });

      showToast(`Discount applied: -$${(discountCents / 100).toFixed(0)}`);
      setDiscountCode("");
      setDiscountError("");
      load();
    } catch (e) {
      setDiscountError("Error applying code: " + e.message);
    } finally {
      setApplyingDiscount(false);
    }
  };

  // ── Remove a discount code credit ──
  const handleRemoveDiscount = async (credit) => {
    const amt = ((Number(credit.amount_cents) || 0) / 100).toFixed(2);
    if (!window.confirm(`Remove this discount (-$${amt})? Your balance will increase by $${amt}.`)) return;
    try {
      // Delete the payment_log entry
      await sb.query("payment_log", {
        method: "DELETE",
        filters: `&id=eq.${credit.id}`,
      });

      // Decrement times_used on the discount code (if it exists)
      if (credit.discount_code_id) {
        try {
          const codes = await sb.query("discount_codes", { filters: `&id=eq.${credit.discount_code_id}` });
          const code = codes && codes[0];
          if (code) {
            await sb.query("discount_codes", {
              method: "PATCH",
              body: { times_used: Math.max(0, (code.times_used || 0) - 1) },
              filters: `&id=eq.${code.id}`,
              headers: { Prefer: "return=minimal" },
            });
          }
        } catch (e) { console.warn("Could not decrement code usage:", e.message); }
      }

      showToast(`Discount removed. Balance increased by $${amt}.`);
      load(); // Recalculates ledger from scratch
    } catch (e) {
      alert("Error removing discount: " + e.message);
    }
  };

  // ── Remove a week registration ──
  const handleRemoveWeek = async (reg) => {
    const week = weeks.find((w) => w.id === reg.week_id);
    const child = children.find((c) => c.id === reg.child_id);
    const weekLabel = week?.name || "this week";
    const childLabel = child ? `${child.first_name}` : "this child";
    const isWaitlisted = reg.status === "waitlisted";
    const confirmMsg = isWaitlisted
      ? `Remove ${childLabel} from the ${weekLabel} waitlist?`
      : `Remove ${childLabel} from ${weekLabel}? This will reduce your balance by $${(reg.price_cents / 100).toFixed(0)}.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await sb.query("registrations", {
        method: "DELETE",
        filters: `&id=eq.${reg.id}`,
      });

      // Only adjust ledger for non-waitlisted registrations
      if (!isWaitlisted && ledger) {
        const newDue = Math.max(0, (Number(ledger.total_due_cents) || 0) - (Number(reg.price_cents) || 0));
        await sb.query("family_ledger", {
          method: "PATCH",
          body: {
            total_due_cents: newDue,
            updated_at: new Date().toISOString(),
          },
          filters: `&parent_id=eq.${user.id}`,
          headers: { Prefer: "return=minimal" },
        });
      }

      showToast(isWaitlisted ? `Removed ${childLabel} from ${weekLabel} waitlist.` : `Removed ${childLabel} from ${weekLabel}.`);
      load();
    } catch (e) {
      alert("Error removing week: " + e.message);
    }
  };

  // Registration fee handlers
  const regFeeRequired = settings?.registration_fee_required === true;
  const regFeeCents = settings?.registration_fee_cents ?? 4500;
  const regFeePaid = ledger?.registration_fee_paid === true;
  const regFeeOverrideCode = settings?.registration_fee_override_code || "";
  const showRegFeeGate = regFeeRequired && !regFeePaid && regFeeCents > 0;

  const handlePayRegFee = async () => {
    setPayingFee(true);
    try {
      const res = await fetch("/.netlify/functions/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: user.id,
          parentEmail: user.email,
          amountCents: regFeeCents,
          siteUrl: window.location.origin,
          isRegistrationFee: true,
        }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { alert(data.error || "Failed to create checkout session."); }
    } catch (e) { alert("Payment error: " + e.message); }
    finally { setPayingFee(false); }
  };

  const handleFeeOverride = async () => {
    if (!feeOverrideCode.trim()) return;
    if (feeOverrideCode.trim().toUpperCase() !== regFeeOverrideCode.toUpperCase()) {
      setFeeOverrideError("Invalid code");
      return;
    }
    try {
      if (ledger) {
        await sb.query("family_ledger", {
          method: "PATCH",
          body: { registration_fee_paid: true, updated_at: new Date().toISOString() },
          filters: `&parent_id=eq.${user.id}`,
          headers: { Prefer: "return=minimal" },
        });
      } else {
        await sb.query("family_ledger", {
          method: "POST",
          body: { parent_id: user.id, registration_fee_paid: true, total_due_cents: 0, total_paid_cents: 0 },
          headers: { Prefer: "return=minimal" },
        });
      }
      showToast("Registration fee waived!");
      setFeeOverrideCode("");
      setFeeOverrideError("");
      load();
    } catch (e) { alert("Error: " + e.message); }
  };

  // Shirt config from settings
  const shirtOrderingOpen = settings?.shirt_ordering_open === true;
  const shirtPriceCents = settings?.shirt_price_cents ?? 0;
  const shirtSizes = ["YXS","YS","YM","YL","YXL","AS","AM","AL","AXL","A2XL"];

  const handleOrderShirts = async () => {
    if (!shirtPriceCents || shirtPriceCents <= 0) return alert("Shirt pricing not configured yet.");
    
    const registeredChildren = children.filter((c) => registrations.some((r) => r.child_id === c.id));
    const items = registeredChildren.map((child) => {
      const cart = shirtCart[child.id] || { size: child.tshirt_size || "YM", quantity: 0 };
      if (!cart.quantity || cart.quantity <= 0) return null;
      return { childId: child.id, childName: `${child.first_name} ${child.last_name}`, size: cart.size, quantity: cart.quantity };
    }).filter(Boolean);

    if (items.length === 0) return alert("Please select a quantity for at least one child.");

    const totalCents = items.reduce((sum, item) => sum + (shirtPriceCents * item.quantity), 0);
    const description = items.map((i) => `${i.childName} — ${i.size} × ${i.quantity}`).join(", ");

    try {
      const orderIds = [];
      for (const item of items) {
        const orderResp = await sb.query("shirt_orders", {
          method: "POST",
          body: { parent_id: user.id, child_id: item.childId, size: item.size, quantity: item.quantity, price_cents: shirtPriceCents * item.quantity, status: "pending" },
          headers: { Prefer: "return=representation" },
        });
        const order = Array.isArray(orderResp) ? orderResp[0] : orderResp;
        if (order?.id) orderIds.push(order.id);
      }

      const res = await fetch("/.netlify/functions/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: user.id,
          parentEmail: user.email,
          amountCents: totalCents,
          siteUrl: window.location.origin,
          isShirtOrder: true,
          shirtOrderId: orderIds.join(","),
          shirtDescription: description,
        }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { alert(data.error || "Failed to create checkout."); }
    } catch (e) { alert("Error: " + e.message); }
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}><Spinner size={32} /></div>;

  const childRegs = (childId) => registrations.filter((r) => r.child_id === childId);
  const weekById = (id) => weeks.find((w) => w.id === id);
  const divisionById = (id) => divisions.find((d) => d.id === id);

  const campName = settings.camp_name || "CGI Wilkes Rebbe";
  const campSeason = settings.camp_season || "Summer 2026 Registration";
  const balanceDue = ledger ? (ledger.total_due_cents - ledger.total_paid_cents) : 0;
  const canRegister = !needsAddress && (!showRegFeeGate);

  return (
    <div style={{ minHeight: "100vh", background: colors.bg }}>
      {/* Header */}
      <header style={{ background: colors.forest, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {Icons.trees({ color: "#fff", size: 24 })}
          <span style={{ fontFamily: font.display, color: "#fff", fontSize: 20 }}>{campName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isAdmin && <button onClick={() => setView("admin")} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.8)", padding: "6px 14px", fontSize: 13 }}>{Icons.shield({ size: 14, color: "rgba(255,255,255,.8)" })} Admin</button>}
          <button onClick={() => setModal("profile")} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.8)", padding: "6px 14px", fontSize: 13 }}>{Icons.user({ size: 14, color: "rgba(255,255,255,.8)" })} Profile</button>
          <button onClick={handleSignOut} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.6)", padding: "6px 10px" }}>{Icons.logout({ size: 16, color: "rgba(255,255,255,.6)" })}</button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        {/* Address Required Prompt */}
        {needsAddress && (
          <div style={{ ...s.card, border: `2px solid ${colors.amber}`, marginBottom: 24, animation: "fadeIn .3s ease" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              {Icons.alertCircle({ size: 20, color: colors.amber })}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Please complete your profile</div>
                <p style={{ fontSize: 14, color: colors.textMid, marginBottom: 16 }}>We need your mailing address and phone number on file before you can register.</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px", maxWidth: 500 }}>
                  <Field label="Address *"><input style={s.input} value={addressForm.address} onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })} placeholder="123 Main St, City, State ZIP" /></Field>
                  <Field label="Phone *"><input style={s.input} value={addressForm.phone} onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                    let fmt = digits;
                    if (digits.length > 6) fmt = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
                    else if (digits.length > 3) fmt = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
                    else if (digits.length > 0) fmt = `(${digits}`;
                    setAddressForm({ ...addressForm, phone: fmt });
                  }} placeholder="(555) 123-4567" inputMode="tel" /></Field>
                </div>
                <button onClick={async () => {
                  const addr = addressForm.address.trim();
                  const phoneDigits = addressForm.phone.replace(/\D/g, "");
                  if (!addr) return alert("Address is required.");
                  if (addr.length < 8) return alert("Please enter your full street address.");
                  if (!/\d/.test(addr) || !/[a-zA-Z]/.test(addr)) return alert("Please enter a valid street address with number and street name.");
                  if (!phoneDigits) return alert("Phone number is required.");
                  if (phoneDigits.length < 10) return alert("Please enter a full 10-digit phone number.");
                  try {
                    await sb.query("parents", { method: "PATCH", body: { address: addr, phone: addressForm.phone.trim(), updated_at: new Date().toISOString() }, filters: `&id=eq.${user.id}`, headers: { Prefer: "return=minimal" } });
                    setNeedsAddress(false);
                    showToast("Profile updated!");
                    load();
                  } catch (e) { alert("Error: " + e.message); }
                }} style={s.btn("primary")}>Save & Continue</button>
              </div>
            </div>
          </div>
        )}

        {/* Registration Fee Gate */}
        {!needsAddress && showRegFeeGate && (
          <div style={{ ...s.card, border: `2px solid ${colors.forest}`, marginBottom: 24, animation: "fadeIn .3s ease" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              {Icons.dollar({ size: 20, color: colors.forest })}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 16 }}>Registration Fee Required</div>
                <p style={{ fontSize: 14, color: colors.textMid, marginBottom: 16 }}>A one-time registration fee of <strong>${(regFeeCents / 100).toFixed(0)}</strong> per family is required before you can register for camp weeks.</p>
                <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
                  <button onClick={handlePayRegFee} disabled={payingFee} style={{ ...s.btn("primary"), padding: "10px 24px", fontSize: 15 }}>
                    {payingFee ? <Spinner size={16} /> : `Pay $${(regFeeCents / 100).toFixed(0)} Registration Fee`}
                  </button>
                  {regFeeOverrideCode && (
                    <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: colors.textMid, display: "block", marginBottom: 4 }}>Override Code</label>
                        <input style={{ ...s.input, width: 140, textTransform: "uppercase" }} value={feeOverrideCode}
                          onChange={(e) => { setFeeOverrideCode(e.target.value.toUpperCase().replace(/\s/g, "")); setFeeOverrideError(""); }}
                          placeholder="Enter code" />
                      </div>
                      <button onClick={handleFeeOverride} style={{ ...s.btn("secondary"), padding: "9px 14px" }}>Apply</button>
                    </div>
                  )}
                </div>
                {feeOverrideError && <div style={{ color: colors.coral || "#e53e3e", fontSize: 12, marginTop: 6 }}>{feeOverrideError}</div>}
              </div>
            </div>
          </div>
        )}

        {/* Welcome */}
        <div style={{ marginBottom: 32, animation: "fadeIn .4s ease" }}>
          <h1 style={{ fontFamily: font.display, fontSize: 28, marginBottom: 4 }}>Welcome, {parent?.full_name || user.email?.split("@")[0]}</h1>
          <p style={{ color: colors.textMid }}>{campSeason}</p>
        </div>

        {/* Balance Due */}
        {ledger && balanceDue > 0 && !ledger.balance_cleared && (
          <div style={{ ...s.card, marginBottom: 24, border: `1px solid ${colors.amber}`, background: colors.amberLight }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{Icons.dollar({ size: 18, color: colors.amber })} Balance Due</div>
              <div style={{ fontFamily: font.display, fontSize: 24, color: colors.forest }}>${(balanceDue / 100).toFixed(0)}</div>
            </div>
            <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
              {/* Per-child breakdown from recalculation */}
              {balanceCalc && balanceCalc.children.map((cb) => (
                <div key={cb.childId} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, padding: "4px 0" }}>
                    <span>{cb.childName} — {cb.division}{cb.isElrc ? " (ELRC)" : ""}</span>
                    <span>${(cb.charges / 100).toFixed(2)}</span>
                  </div>
                  {cb.weeks.map((w) => (
                    <div key={w.registrationId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: colors.textLight, padding: "1px 0 1px 12px" }}>
                      <span>{w.weekName}{w.isPartial ? " (partial)" : ""}</span>
                      <span>${(w.basePrice / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}

              {/* Totals */}
              <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 6 }}>
                {balanceCalc && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                    <span style={{ color: colors.textMid }}>Subtotal</span>
                    <span style={{ fontWeight: 600 }}>${(balanceCalc.totalCharges / 100).toFixed(2)}</span>
                  </div>
                )}
                {balanceCalc && balanceCalc.discounts.sibling > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <span style={{ color: colors.success }}>Sibling discount</span>
                    <span style={{ fontWeight: 600, color: colors.success }}>-${(balanceCalc.discounts.sibling / 100).toFixed(2)}</span>
                  </div>
                )}
                {balanceCalc && balanceCalc.discounts.earlyBird > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <span style={{ color: colors.success }}>Early bird discount</span>
                    <span style={{ fontWeight: 600, color: colors.success }}>-${(balanceCalc.discounts.earlyBird / 100).toFixed(2)}</span>
                  </div>
                )}
                {discountCredits.length > 0 && discountCredits.map((dc, i) => (
                  <div key={dc.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "4px 0" }}>
                    <span style={{ color: colors.success, display: "flex", alignItems: "center", gap: 6 }}>
                      {dc.notes || "Discount code"}
                      <span
                        onClick={() => handleRemoveDiscount(dc)}
                        style={{ cursor: "pointer", fontSize: 11, color: colors.coral || "#e53e3e", fontWeight: 700, opacity: 0.7, marginLeft: 2 }}
                        title="Remove this discount"
                      >✕</span>
                    </span>
                    <span style={{ fontWeight: 600, color: colors.success }}>-${((Number(dc.amount_cents) || 0) / 100).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0 0", borderTop: `1px solid ${colors.border}`, marginTop: 4 }}>
                  <span style={{ color: colors.textMid, fontWeight: 600 }}>Total due</span>
                  <span style={{ fontWeight: 700 }}>${(ledger.total_due_cents / 100).toFixed(2)}</span>
                </div>
                {ledger.total_paid_cents > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                    <span style={{ color: colors.textMid }}>Paid</span>
                    <span style={{ fontWeight: 600, color: colors.success }}>-${(ledger.total_paid_cents / 100).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Discount Code at Payment */}
            <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.textMid, marginBottom: 8 }}>Have a discount code?</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <input
                  style={{ ...s.input, width: 180, textTransform: "uppercase", fontSize: 14 }}
                  value={discountCode}
                  onChange={(e) => { setDiscountCode(e.target.value.toUpperCase().replace(/\s/g, "")); setDiscountError(""); }}
                  placeholder="Enter code"
                />
                <button
                  onClick={handleApplyDiscount}
                  disabled={applyingDiscount || !discountCode.trim()}
                  style={{ ...s.btn("secondary"), padding: "8px 16px", fontSize: 14, opacity: discountCode.trim() ? 1 : 0.5 }}
                >
                  {applyingDiscount ? <Spinner size={14} /> : "Apply"}
                </button>
              </div>
              {discountError && <div style={{ color: colors.coral || "#e53e3e", fontSize: 12, marginTop: 6 }}>{discountError}</div>}
            </div>

            {/* Pay in Full */}
            <button
              onClick={async () => {
                setPaying(true);
                try {
                  const res = await fetch("/.netlify/functions/create-checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      parentId: user.id,
                      parentEmail: user.email,
                      amountCents: balanceDue,
                      siteUrl: window.location.origin,
                    }),
                  });
                  const data = await res.json();
                  if (data.url) { window.location.href = data.url; }
                  else { alert(data.error || "Failed to create checkout session."); }
                } catch (e) { alert("Payment error: " + e.message); }
                finally { setPaying(false); }
              }}
              disabled={paying}
              style={{ ...s.btn("primary"), padding: "10px 28px", fontSize: 15, marginBottom: 12 }}
            >
              {paying && paymentMode === "full" ? <Spinner size={16} /> : `Pay $${(balanceDue / 100).toFixed(0)} in Full`}
            </button>

            {/* Partial Payment */}
            <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.textMid, marginBottom: 8 }}>Or make a partial payment (min $50)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: colors.forest }}>$</span>
                  <input
                    type="number"
                    min="50"
                    max={balanceDue / 100}
                    step="1"
                    style={{ ...s.input, width: 120, fontSize: 16, fontWeight: 700 }}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <button
                  onClick={async () => {
                    const dollars = parseFloat(customAmount);
                    if (!dollars || dollars < 50) return alert("Minimum payment is $50.");
                    if (dollars * 100 > balanceDue) return alert("Amount exceeds your balance.");
                    const amountCents = Math.round(dollars * 100);
                    setPaying(true);
                    setPaymentMode("custom");
                    try {
                      const res = await fetch("/.netlify/functions/create-checkout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          parentId: user.id,
                          parentEmail: user.email,
                          amountCents,
                          siteUrl: window.location.origin,
                        }),
                      });
                      const data = await res.json();
                      if (data.url) { window.location.href = data.url; }
                      else { alert(data.error || "Failed to create checkout session."); }
                    } catch (e) { alert("Payment error: " + e.message); }
                    finally { setPaying(false); }
                  }}
                  disabled={paying || !customAmount}
                  style={{ ...s.btn("secondary"), padding: "8px 20px", fontSize: 14, opacity: customAmount ? 1 : 0.5 }}
                >
                  {paying && paymentMode === "custom" ? <Spinner size={16} /> : customAmount ? `Pay $${parseFloat(customAmount).toFixed(0)}` : "Enter amount"}
                </button>
              </div>
            </div>
          </div>
        )}
        {ledger && ledger.balance_cleared && (
          <div style={{ ...s.card, marginBottom: 24, border: `1px solid ${colors.success}`, background: colors.forestPale }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {Icons.check({ size: 18, color: colors.success })}
              <span style={{ fontWeight: 700, fontSize: 16, color: colors.success }}>Balance Cleared</span>
            </div>
            {ledger.balance_cleared_reason && <div style={{ fontSize: 13, color: colors.textMid, marginTop: 4, marginLeft: 26 }}>{ledger.balance_cleared_reason}</div>}
          </div>
        )}

        {/* My Children */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontFamily: font.display, fontSize: 22 }}>My Children</h2>
            <button onClick={() => { if (needsAddress) return alert("Please complete your address first."); setModal("add-child"); }} style={{ ...s.btn("primary"), opacity: needsAddress ? 0.5 : 1 }}>{Icons.plus({ size: 16, color: "#fff" })} Add Child</button>
          </div>

          {children.length === 0 ? (
            <div style={s.card}>
              <EmptyState icon={Icons.users} title="No children added yet" sub="Add your child's info to get started with registration." />
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {children.map((child, i) => {
                const regs = childRegs(child.id);
                const age = calcAge(child.date_of_birth);
                const div = divisionById(child.assigned_division_id);
                const canRemoveWeeks = true;
                return (
                  <div key={child.id} style={{ ...s.card, animation: `slideIn .3s ease ${i * .05}s both`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{child.first_name} {child.last_name}</div>
                      <div style={{ fontSize: 13, color: colors.textMid }}>
                        {age !== null ? `Age ${age}` : ""}
                        {child.grade != null ? ` · ${child.grade === 0 ? "K" : child.grade === -1 ? "Pre-K" : child.grade < -1 ? ["","","","Pre Nursery","Toddler"][Math.abs(child.grade)] || "" : `Grade ${child.grade}`}` : ""}
                        {div ? ` · ${div.name}` : ""}
                      </div>
                      {regs.length > 0 && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {regs.map((r) => {
                            const week = weekById(r.week_id);
                            const isWaitlisted = r.status === "waitlisted";
                            return (
                              <span key={r.id} style={{ ...s.badge(isWaitlisted ? colors.amber : colors.forest), fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                {isWaitlisted && "⏳ "}{week?.name || "Week"}{isWaitlisted && " (waitlist)"}
                                {canRemoveWeeks && (
                                  <span
                                    onClick={(e) => { e.stopPropagation(); handleRemoveWeek(r); }}
                                    style={{ cursor: "pointer", marginLeft: 2, fontSize: 13, lineHeight: 1, color: "inherit", opacity: 0.7, fontWeight: 700 }}
                                    title={isWaitlisted ? "Remove from waitlist" : "Remove this week"}
                                  >✕</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => { if (!canRegister) return alert(showRegFeeGate ? "Please pay the registration fee first." : "Please complete your address first."); setSelectedChild(child); setModal("register"); }}
                      style={{ ...s.btn("secondary"), opacity: canRegister ? 1 : 0.5 }}
                    >
                      {Icons.calendar({ size: 14 })} Register for {div ? div.name : "Camp"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ELRC / Childcare Subsidy */}
        <div style={{ ...s.card, marginBottom: 24, border: parent?.elrc_status ? `2px solid ${colors.success}` : `1px solid ${colors.border}` }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={parent?.elrc_status === true}
              onChange={async (e) => {
                const checked = e.target.checked;
                if (checked) {
                  if (!window.confirm("By checking this box, you acknowledge that if ELRC funds do not come through for any reason, you are responsible for paying the full camp rate.\n\nDo you understand and agree?")) return;
                }
                try {
                  await sb.query("parents", {
                    method: "PATCH",
                    body: { elrc_status: checked, elrc_acknowledged: checked, updated_at: new Date().toISOString() },
                    filters: `&id=eq.${user.id}`,
                    headers: { Prefer: "return=minimal" },
                  });
                  showToast(checked ? "ELRC status updated — you'll see the reduced rate below." : "ELRC status removed.");
                  load();
                } catch (err) { alert("Error: " + err.message); }
              }}
              style={{ width: 18, height: 18 }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>My family receives ELRC / childcare subsidies</div>
              <div style={{ fontSize: 13, color: colors.textMid, marginTop: 2 }}>Check this box to see your reduced rate. If ELRC funds do not come through, you are responsible for the full amount.</div>
            </div>
          </label>
          {parent?.elrc_status && (
            <div style={{ marginTop: 8, marginLeft: 28, fontSize: 13, color: colors.success, fontWeight: 600 }}>
              {Icons.check({ size: 13, color: colors.success })} ELRC rate applied — see updated prices below
            </div>
          )}
        </div>

        {/* Divisions & Pricing */}
        <div>
          <h2 style={{ fontFamily: font.display, fontSize: 22, marginBottom: 16 }}>Divisions & Pricing</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {divisions.map((div, i) => {
              const divWeeks = weeks.filter((w) => w.division_id === div.id);
              const isElrc = parent?.elrc_status === true;
              const displayPrice = isElrc && div.elrc_weekly_price != null ? div.elrc_weekly_price : div.per_week_price;
              return (
                <div key={div.id} style={{ ...s.card, animation: `slideIn .3s ease ${i * .05}s both` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{ fontFamily: font.display, fontSize: 17, marginBottom: 4, display: "block" }}>{div.name}</span>
                      <div style={{ fontSize: 12, color: colors.textLight }}>
                        {divWeeks.length} week{divWeeks.length !== 1 ? "s" : ""}: {divWeeks.map((w) =>
                          `${w.name} (${fmtDate(w.start_date)})`
                        ).join(", ")}
                      </div>
                      {div.early_bird_discount_cents > 0 && settings?.early_bird_deadline && (
                        <div style={{ fontSize: 12, color: colors.success, marginTop: 4 }}>
                          Early bird: ${((displayPrice - div.early_bird_discount_cents) / 100).toFixed(0)}/week if paid by {fmtDate(settings.early_bird_deadline, { month: "short", day: "numeric" })}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: font.display, fontSize: 22, color: colors.forest }}>${(displayPrice / 100).toFixed(0)}</div>
                      <div style={{ fontSize: 12, color: colors.textMid }}>per week{isElrc ? " (ELRC)" : ""}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Privacy Notice */}
        <div style={{ marginTop: 32, padding: "16px 20px", background: colors.card, borderRadius: 10, border: `1px solid ${colors.borderLight}`, fontSize: 13, color: colors.textLight, lineHeight: 1.6 }}>
          {Icons.shield({ size: 14, color: colors.textLight })} <strong style={{ color: colors.textMid }}>Privacy:</strong> Your family's information is stored securely and used only for camp administration. We do not share personal data with third parties. Medical and emergency contact information is accessible only to authorized camp staff.
        </div>
      </div>

      {/* Modals */}
      {modal === "add-child" && <AddChildModal onClose={() => setModal(null)} onSave={handleAddChild} onAddAnother={handleAddAnother} saving={saving} divisions={divisions} />}
      {modal === "register" && selectedChild && (
        <RegisterModal
          child={selectedChild}
          divisions={divisions}
          weeks={weeks}
          existingRegs={childRegs(selectedChild.id)}
          settings={settings}
          siblingCount={children.length}
          parent={parent}
          onClose={() => setModal(null)}
          onRegister={handleRegister}
          saving={saving}
        />
      )}
      {modal === "profile" && parent && <ProfileModal parent={parent} onClose={() => setModal(null)} onSave={handleUpdateProfile} saving={saving} />}
    </div>
  );
}