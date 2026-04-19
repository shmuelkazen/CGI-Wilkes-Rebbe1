import { useState, useEffect, useCallback } from "react";
import sb from "../lib/supabase";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner, EmptyState, StatusBadge, Modal, Field } from "../components/UI";
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
  const [enrollment, setEnrollment] = useState([]);
  const [discountCode, setDiscountCode] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [applyingDiscount, setApplyingDiscount] = useState(false);

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

      // Load registrations for all children
      if (c && c.length > 0) {
        const childIds = c.map((k) => k.id);
        const regs = await sb.query("registrations", {
          filters: `&child_id=in.(${childIds.join(",")})&order=created_at.asc`,
        });
        setRegistrations(regs || []);
      } else {
        setRegistrations([]);
      }

      // Load family ledger
      try {
        const led = await sb.query("family_ledger", { filters: `&parent_id=eq.${user.id}`, single: true });
        setLedger(led);
      } catch { setLedger(null); }

      // Load shirt orders
      try {
        const shirts = await sb.query("shirt_orders", { filters: `&parent_id=eq.${user.id}&order=created_at.desc` });
        setShirtOrders(shirts || []);
      } catch { setShirtOrders([]); }

      // Load enrollment counts for capacity display
      try {
        const enr = await sb.query("rpc/get_week_enrollment");
        setEnrollment(enr || []);
      } catch { setEnrollment([]); }

      // Check if address is missing
      if (p && (!p.address || !p.address.trim())) {
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

      showToast(`Registered for ${regData.weeks.length} week${regData.weeks.length !== 1 ? "s" : ""}!`);
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
      // Look up the code
      const codes = await sb.query("discount_codes", {
        filters: `&code=eq.${discountCode.trim().toUpperCase()}&active=eq.true`,
      });
      const code = codes && codes[0];
      if (!code) { setDiscountError("Invalid or inactive code."); return; }

      // Check expiration
      if (code.expires_at && new Date(code.expires_at) < new Date()) {
        setDiscountError("This code has expired.");
        return;
      }
      // Check max uses
      if (code.max_uses && (code.times_used || 0) >= code.max_uses) {
        setDiscountError("This code has reached its usage limit.");
        return;
      }

      // Calculate discount
      const currentBalance = ledger ? (ledger.total_due_cents - ledger.total_paid_cents) : 0;
      if (currentBalance <= 0) { setDiscountError("No balance to apply discount to."); return; }

      let discountCents = 0;
      if (code.type === "percent") {
        discountCents = Math.round((currentBalance * code.amount) / 100);
      } else {
        // flat amount — code.amount is in cents
        discountCents = Math.min(code.amount, currentBalance);
      }

      if (discountCents <= 0) { setDiscountError("Discount results in $0 — no change."); return; }

      // Update ledger: reduce total_due_cents, increase discount_amount_cents
      await sb.query("family_ledger", {
        method: "PATCH",
        body: {
          total_due_cents: (ledger.total_due_cents || 0) - discountCents,
          discount_amount_cents: (ledger.discount_amount_cents || 0) + discountCents,
          updated_at: new Date().toISOString(),
        },
        filters: `&parent_id=eq.${user.id}`,
        headers: { Prefer: "return=minimal" },
      });

      // Log it
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

      // Increment usage on the code
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

  // ── Remove a pending week registration ──
  const handleRemoveWeek = async (reg) => {
    const week = weeks.find((w) => w.id === reg.week_id);
    const child = children.find((c) => c.id === reg.child_id);
    const weekLabel = week?.name || "this week";
    const childLabel = child ? `${child.first_name}` : "this child";
    if (!window.confirm(`Remove ${childLabel} from ${weekLabel}? This will reduce your balance by $${(reg.price_cents / 100).toFixed(0)}.`)) return;

    try {
      // Delete the registration
      await sb.query("registrations", {
        method: "DELETE",
        filters: `&id=eq.${reg.id}`,
      });

      // Update ledger: subtract this week's price
      if (ledger) {
        const newDue = Math.max(0, ledger.total_due_cents - (reg.price_cents || 0));
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

      showToast(`Removed ${childLabel} from ${weekLabel}.`);
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
    // Mark fee as paid via override
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
    
    // Build list of items from cart where quantity > 0
    const registeredChildren = children.filter((c) => registrations.some((r) => r.child_id === c.id && r.status !== "cancelled"));
    const items = registeredChildren.map((child) => {
      const cart = shirtCart[child.id] || { size: child.tshirt_size || "YM", quantity: 0 };
      if (!cart.quantity || cart.quantity <= 0) return null;
      return { childId: child.id, childName: `${child.first_name} ${child.last_name}`, size: cart.size, quantity: cart.quantity };
    }).filter(Boolean);

    if (items.length === 0) return alert("Please select a quantity for at least one child.");

    const totalCents = items.reduce((sum, item) => sum + (shirtPriceCents * item.quantity), 0);
    const description = items.map((i) => `${i.childName} — ${i.size} × ${i.quantity}`).join(", ");

    try {
      // Create pending orders for each child
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

      // One Stripe checkout for the total
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
                <p style={{ fontSize: 14, color: colors.textMid, marginBottom: 16 }}>We need your mailing address on file before you can register.</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px", maxWidth: 500 }}>
                  <Field label="Address *"><input style={s.input} value={addressForm.address} onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })} placeholder="123 Main St, City, State ZIP" /></Field>
                  <Field label="Phone"><input style={s.input} value={addressForm.phone} onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })} placeholder="(555) 123-4567" /></Field>
                </div>
                <button onClick={async () => {
                  if (!addressForm.address.trim()) return alert("Address is required.");
                  try {
                    await sb.query("parents", { method: "PATCH", body: { address: addressForm.address.trim(), phone: addressForm.phone.trim() }, filters: `&id=eq.${user.id}`, headers: { Prefer: "return=minimal" } });
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
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                <span style={{ color: colors.textMid }}>Total charges</span>
                <span style={{ fontWeight: 600 }}>${(ledger.total_due_cents / 100).toFixed(2)}</span>
              </div>
              {ledger.total_paid_cents > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                  <span style={{ color: colors.textMid }}>Paid</span>
                  <span style={{ fontWeight: 600, color: colors.success }}>-${(ledger.total_paid_cents / 100).toFixed(2)}</span>
                </div>
              )}
              {ledger.discount_amount_cents > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                  <span style={{ color: colors.textMid }}>Discounts</span>
                  <span style={{ fontWeight: 600, color: colors.success }}>-${(ledger.discount_amount_cents / 100).toFixed(2)}</span>
                </div>
              )}
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

            {/* Partial Payment — always visible */}
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
                return (
                  <div key={child.id} style={{ ...s.card, animation: `slideIn .3s ease ${i * .05}s both`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{child.first_name} {child.last_name}</div>
                      <div style={{ fontSize: 13, color: colors.textMid }}>
                        {age !== null ? `Age ${age}` : ""}
                        {child.grade != null ? ` · ${child.grade === 0 ? "K" : child.grade === -1 ? "Pre-K" : child.grade < -1 ? ["","","","Pre Nursery","Toddler","Infants"][Math.abs(child.grade)] || "" : `Grade ${child.grade}`}` : ""}
                        {div ? ` · ${div.name}` : ""}
                        {child.tshirt_size ? ` · ${child.tshirt_size}` : ""}
                      </div>
                      {(() => {
                        const caps = div?.class_capacities;
                        if (!caps || child.grade == null) return null;
                        const classNames = { "-5": "Infants", "-4": "Toddler", "-3": "Pre Nursery", "-2": "Nursery", "-1": "Pre K" };
                        const clsName = classNames[String(child.grade)];
                        if (!clsName || caps[clsName] == null) return null;
                        const cap = caps[clsName];
                        const divWeeks = weeks.filter((w) => w.division_id === div.id);
                        const minRemaining = divWeeks.length > 0 ? Math.min(...divWeeks.map((w) => {
                          const enrolled = enrollment.filter((e) => e.week_id === w.id && e.grade === child.grade).reduce((sum, e) => sum + (e.enrolled || 0), 0);
                          return cap - enrolled;
                        })) : cap;
                        return (
                          <div style={{ fontSize: 12, marginTop: 4, color: minRemaining <= 3 ? (colors.coral || "#e53e3e") : colors.success, fontWeight: 600 }}>
                            {clsName} — {minRemaining <= 0 ? "class is full" : `${minRemaining} spot${minRemaining !== 1 ? "s" : ""} available`}
                          </div>
                        );
                      })()}
                      {regs.length > 0 && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {regs.filter((r) => r.status !== "cancelled").map((r) => {
                            const week = weekById(r.week_id);
                            const isPending = r.status === "pending";
                            return (
                              <span key={r.id} style={{ ...s.badge(r.status === "confirmed" ? colors.success : r.status === "pending" ? colors.amber : colors.sky), fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                {r.status === "confirmed" ? "✓" : "○"} {week?.name || "Week"}
                                {isPending && (
                                  <span
                                    onClick={(e) => { e.stopPropagation(); handleRemoveWeek(r); }}
                                    style={{ cursor: "pointer", marginLeft: 2, fontSize: 13, lineHeight: 1, color: "inherit", opacity: 0.7, fontWeight: 700 }}
                                    title="Remove this week"
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

        {/* T-Shirts */}
        {shirtOrderingOpen && children.length > 0 && registrations.some((r) => r.status !== "cancelled") && (() => {
          const registeredChildren = children.filter((c) => registrations.some((r) => r.child_id === c.id && r.status !== "cancelled"));
          const cartTotal = registeredChildren.reduce((sum, child) => {
            const cart = shirtCart[child.id] || { size: child.tshirt_size || "YM", quantity: 0 };
            return sum + (shirtPriceCents * (cart.quantity || 0));
          }, 0);
          const cartCount = registeredChildren.reduce((sum, child) => {
            const cart = shirtCart[child.id] || { quantity: 0 };
            return sum + (cart.quantity || 0);
          }, 0);

          return (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: font.display, fontSize: 22, marginBottom: 16 }}>T-Shirts</h2>
              <div style={s.card}>
                <div style={{ display: "grid", gap: 16 }}>
                  {registeredChildren.map((child) => {
                    const childShirtOrders = shirtOrders.filter((o) => o.child_id === child.id && o.status !== "cancelled");
                    const cart = shirtCart[child.id] || { size: child.tshirt_size || "YM", quantity: 0 };
                    const setCart = (updates) => setShirtCart((prev) => ({ ...prev, [child.id]: { ...cart, ...updates } }));

                    return (
                      <div key={child.id} style={{ paddingBottom: 16, borderBottom: `1px solid ${colors.borderLight}` }}>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{child.first_name} {child.last_name}</div>

                        {/* Existing orders */}
                        {childShirtOrders.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                            {childShirtOrders.map((o) => (
                              <span key={o.id} style={{ ...s.badge(o.status === "paid" || o.status === "fulfilled" ? colors.success : colors.amber), fontSize: 11 }}>
                                {o.status === "paid" || o.status === "fulfilled" ? "✓" : "○"} {o.size} × {o.quantity} — ${(o.price_cents / 100).toFixed(0)}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Size & Qty pickers */}
                        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: colors.textMid, display: "block", marginBottom: 4 }}>Size</label>
                            <select style={{ ...s.input, width: 100 }} value={cart.size} onChange={(e) => setCart({ size: e.target.value })}>
                              {shirtSizes.map((sz) => <option key={sz} value={sz}>{sz}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: colors.textMid, display: "block", marginBottom: 4 }}>Qty</label>
                            <select style={{ ...s.input, width: 60 }} value={cart.quantity} onChange={(e) => setCart({ quantity: parseInt(e.target.value) })}>
                              {[0,1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </div>
                          {cart.quantity > 0 && (
                            <span style={{ fontSize: 13, color: colors.textMid, paddingBottom: 10 }}>${((shirtPriceCents * cart.quantity) / 100).toFixed(0)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Cart total and single checkout button */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 13, color: colors.textLight }}>
                    ${(shirtPriceCents / 100).toFixed(0)} per shirt · Payment required at time of order
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {cartCount > 0 && (
                      <span style={{ fontSize: 14, color: colors.textMid }}>{cartCount} shirt{cartCount !== 1 ? "s" : ""}</span>
                    )}
                    <button
                      onClick={handleOrderShirts}
                      disabled={cartCount === 0}
                      style={{ ...s.btn("primary"), padding: "10px 20px", fontSize: 14, opacity: cartCount > 0 ? 1 : 0.5 }}
                    >
                      {cartCount > 0 ? `Order & Pay $${(cartTotal / 100).toFixed(0)}` : "Select shirts to order"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ELRC / Childcare Subsidy */}
        <div style={{ ...s.card, marginBottom: 24, border: parent?.elrc_status ? `2px solid ${colors.success}` : `1px solid ${colors.border}` }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={parent?.elrc_status === true}
              onChange={async (e) => {
                const checked = e.target.checked;
                if (checked) {
                  // Show acknowledgment first
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
                      {div.class_capacities && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                          {Object.entries(div.class_capacities).map(([cls, cap]) => {
                            const gradeVal = { "Infants": -5, "Toddler": -4, "Pre Nursery": -3, "Nursery": -2, "Pre K": -1 }[cls];
                            const divWks = weeks.filter((w) => w.division_id === div.id);
                            const totalSlots = cap * divWks.length;
                            const totalEnrolled = divWks.reduce((sum, w) => {
                              return sum + enrollment.filter((e) => e.week_id === w.id && e.division_id === div.id && e.grade === gradeVal).reduce((s2, e) => s2 + (e.enrolled || 0), 0);
                            }, 0);
                            const avgRemaining = divWks.length > 0 ? Math.round((totalSlots - totalEnrolled) / divWks.length) : cap;
                            return (
                              <span key={cls} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: avgRemaining <= 3 ? (colors.amberLight || "#fef3c7") : (colors.forestPale || "#f0fdf4"), color: avgRemaining <= 0 ? (colors.coral || "#e53e3e") : avgRemaining <= 3 ? (colors.amber || "#d97706") : colors.success }}>
                                {cls}: {avgRemaining <= 0 ? "full" : `${avgRemaining} spots`}
                              </span>
                            );
                          })}
                        </div>
                      )}
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