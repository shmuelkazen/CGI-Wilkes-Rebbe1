import { useState, useEffect, useCallback } from "react";
import sb, { getActiveSeason } from "../lib/supabase";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner, EmptyState, StatusBadge, Modal, Field } from "../components/UI";
import { AddChildModal, RegisterModal, ProfileModal } from "../components/ParentModals";

// Helper: calculate age from DOB
function calcAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

// Payment status badge colors
function paymentBadgeStyle(status) {
  switch (status) {
    case "paid":
      return { bg: "#d4edda", text: "#155724" };
    case "partial":
      return { bg: "#fff3cd", text: "#856404" };
    case "unpaid":
    default:
      return { bg: "#f8d7da", text: "#721c24" };
  }
}

export default function ParentDashboard({ user, isAdmin, setView, showToast }) {
  const [children, setChildren] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [parent, setParent] = useState(null);
  const [activeSeason, setActiveSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selectedChild, setSelectedChild] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addressForm, setAddressForm] = useState({ address: "", phone: "" });
  const [needsAddress, setNeedsAddress] = useState(false);
  const [paying, setPaying] = useState(false);
  const [discountCode, setDiscountCode] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, ses, reg, p, season] = await Promise.all([
        sb.query("children", { filters: `&parent_id=eq.${user.id}&order=first_name.asc` }),
        sb.query("session_enrollment"),
        sb.query("registrations", { filters: `&parent_id=eq.${user.id}&order=created_at.desc` }),
        sb.query("parents", { filters: `&id=eq.${user.id}`, single: true }),
        getActiveSeason(),
      ]);
      setChildren(c || []);
      setActiveSeason(season);
      const seasonSessions = season ? (ses || []).filter((s) => s.season_id === season.id) : (ses || []);
      setSessions(seasonSessions);
      setRegistrations(reg || []);
      setParent(p);
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

  const handleRegister = async (childId, sessionIds) => {
    setSaving(true);
    try {
      const ids = Array.isArray(sessionIds) ? sessionIds : [sessionIds];
      for (const sessionId of ids) {
        const session = sessions.find((ses) => ses.id === sessionId);
        await sb.query("registrations", {
          method: "POST",
          body: {
            child_id: childId,
            session_id: sessionId,
            parent_id: user.id,
            status: "pending",
            payment_status: "unpaid",
            payment_amount_cents: session?.price_cents || 0,
          },
          headers: { Prefer: "return=minimal" },
        });
      }
      showToast(`Registered for ${ids.length} session${ids.length !== 1 ? "s" : ""}!`);
      setModal(null);
      load();
    } catch (e) {
      if (e.message?.includes("unique") || e.message?.includes("duplicate")) {
        alert("This child is already registered for one of the selected sessions.");
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

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}><Spinner size={32} /></div>;

  const childRegs = (childId) => registrations.filter((r) => r.child_id === childId);
  const sessionById = (id) => sessions.find((ses) => ses.id === id);

  // Billing data
  const activeRegs = registrations.filter((r) => r.status !== "cancelled");
  const paidRegs = activeRegs.filter((r) => r.payment_status === "paid");
  const unpaidRegs = activeRegs.filter((r) => r.payment_status !== "paid");
  const totalCharged = activeRegs.reduce((sum, r) => sum + (r.payment_amount_cents || 0), 0);
  const totalPaid = paidRegs.reduce((sum, r) => sum + (r.payment_amount_cents || 0), 0);
  const totalOutstanding = totalCharged - totalPaid;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg }}>
      {/* Header */}
      <header style={{ background: colors.forest, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {Icons.trees({ color: "#fff", size: 24 })}
          <span style={{ fontFamily: font.display, color: "#fff", fontSize: 20 }}>CGI Wilkes Rebbe</span>
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

        {/* Welcome */}
        <div style={{ marginBottom: 32, animation: "fadeIn .4s ease" }}>
          <h1 style={{ fontFamily: font.display, fontSize: 28, marginBottom: 4 }}>Welcome, {parent?.full_name || user.email?.split("@")[0]}</h1>
          <p style={{ color: colors.textMid }}>
            {activeSeason ? `${activeSeason.name} Registration` : "Register your kids for summer camp sessions below."}
          </p>
        </div>

        {/* Registration Summary — what they owe */}
        {registrations.length > 0 && (() => {
          const unpaid = registrations.filter((r) => r.payment_status !== "paid" && r.status !== "cancelled");
          const totalDue = unpaid.reduce((sum, r) => sum + (r.payment_amount_cents || 0), 0);
          if (unpaid.length === 0) return null;
          return (
            <div style={{ ...s.card, marginBottom: 24, border: `1px solid ${colors.amber}`, background: colors.amberLight }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{Icons.dollar({ size: 18, color: colors.amber })} Balance Due</div>
                <div style={{ fontFamily: font.display, fontSize: 24, color: colors.forest }}>${(totalDue / 100).toFixed(0)}</div>
              </div>
              <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
                {unpaid.map((r) => {
                  const c = children.find((ch) => ch.id === r.child_id);
                  const ses = sessionById(r.session_id);
                  return (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                      <span style={{ color: colors.textMid }}>{c?.first_name} {c?.last_name} — {ses?.name || "Session"}</span>
                      <span style={{ fontWeight: 600 }}>${((r.payment_amount_cents || 0) / 100).toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
              {/* Discount code + Pay Now */}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: colors.textMid, marginBottom: 4, display: "block" }}>Discount Code</label>
                  <input style={{ ...s.input, fontSize: 13 }} value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="Enter code" />
                </div>
                <button
                  onClick={async () => {
                    setPaying(true);
                    try {
                      const res = await fetch("/.netlify/functions/create-checkout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          registrationIds: unpaid.map((r) => r.id),
                          parentEmail: user.email,
                          discountCode: discountCode || undefined,
                          siteUrl: window.location.origin,
                        }),
                      });
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else {
                        alert(data.error || "Failed to create checkout session.");
                      }
                    } catch (e) {
                      alert("Payment error: " + e.message);
                    } finally { setPaying(false); }
                  }}
                  disabled={paying}
                  style={{ ...s.btn("primary"), padding: "10px 28px", fontSize: 15 }}
                >
                  {paying ? <Spinner size={16} /> : `Pay $${(totalDue / 100).toFixed(0)} Now`}
                </button>
              </div>
            </div>
          );
        })()}

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
                return (
                  <div key={child.id} style={{ ...s.card, animation: `slideIn .3s ease ${i * .05}s both`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{child.first_name} {child.last_name}</div>
                      <div style={{ fontSize: 13, color: colors.textMid }}>Age {age} {child.grade ? `· Grade ${child.grade}` : ""}</div>
                      {regs.length > 0 && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {regs.map((r) => {
                            const ses = sessionById(r.session_id);
                            const pStyle = paymentBadgeStyle(r.payment_status);
                            return (
                              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ ...s.badge(r.status === "confirmed" ? colors.success : r.status === "pending" ? colors.amber : colors.sky), fontSize: 11 }}>
                                  {ses?.name || "Session"} · <StatusBadge status={r.status} />
                                </span>
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: ".04em",
                                  padding: "2px 7px",
                                  borderRadius: 4,
                                  background: pStyle.bg,
                                  color: pStyle.text,
                                }}>
                                  {r.payment_status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setSelectedChild(child); setModal("register"); }} style={s.btn("secondary")}>{Icons.calendar({ size: 14 })} Register for Session</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Billing & Payment History */}
        {registrations.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: font.display, fontSize: 22, marginBottom: 16 }}>Billing & Payments</h2>

            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
              <div style={{ ...s.card, textAlign: "center", padding: "16px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: colors.textLight, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Total Charged</div>
                <div style={{ fontFamily: font.display, fontSize: 24, color: colors.text }}>${(totalCharged / 100).toFixed(0)}</div>
              </div>
              <div style={{ ...s.card, textAlign: "center", padding: "16px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#155724", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Paid</div>
                <div style={{ fontFamily: font.display, fontSize: 24, color: "#155724" }}>${(totalPaid / 100).toFixed(0)}</div>
              </div>
              <div style={{ ...s.card, textAlign: "center", padding: "16px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: totalOutstanding > 0 ? "#856404" : "#155724", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
                  {totalOutstanding > 0 ? "Outstanding" : "Outstanding"}
                </div>
                <div style={{ fontFamily: font.display, fontSize: 24, color: totalOutstanding > 0 ? "#856404" : "#155724" }}>${(totalOutstanding / 100).toFixed(0)}</div>
              </div>
            </div>

            {/* Line items table */}
            <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: colors.bg }}>
                    <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 600, color: colors.textLight, textTransform: "uppercase", letterSpacing: ".05em" }}>Child</th>
                    <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 600, color: colors.textLight, textTransform: "uppercase", letterSpacing: ".05em" }}>Session</th>
                    <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 600, color: colors.textLight, textTransform: "uppercase", letterSpacing: ".05em" }}>Amount</th>
                    <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 600, color: colors.textLight, textTransform: "uppercase", letterSpacing: ".05em" }}>Status</th>
                    <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 600, color: colors.textLight, textTransform: "uppercase", letterSpacing: ".05em" }}>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRegs.map((r) => {
                    const child = children.find((c) => c.id === r.child_id);
                    const ses = sessionById(r.session_id);
                    const pStyle = paymentBadgeStyle(r.payment_status);
                    return (
                      <tr key={r.id} style={{ borderTop: `1px solid ${colors.borderLight || "#eee"}` }}>
                        <td style={{ padding: "12px 16px", fontWeight: 500 }}>{child?.first_name} {child?.last_name}</td>
                        <td style={{ padding: "12px 16px", color: colors.textMid }}>{ses?.name || "—"}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 600 }}>${((r.payment_amount_cents || 0) / 100).toFixed(0)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: ".04em",
                            padding: "3px 10px",
                            borderRadius: 5,
                            background: pStyle.bg,
                            color: pStyle.text,
                          }}>
                            {r.payment_status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: colors.textLight, fontSize: 13 }}>
                          {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {activeRegs.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: colors.textLight }}>No registrations yet.</div>
              )}
            </div>

            {/* Cancelled registrations (collapsed) */}
            {registrations.some((r) => r.status === "cancelled") && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: colors.textLight, padding: "8px 0" }}>
                  Show cancelled registrations ({registrations.filter((r) => r.status === "cancelled").length})
                </summary>
                <div style={{ ...s.card, padding: 0, overflow: "hidden", marginTop: 8, opacity: 0.7 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <tbody>
                      {registrations.filter((r) => r.status === "cancelled").map((r) => {
                        const child = children.find((c) => c.id === r.child_id);
                        const ses = sessionById(r.session_id);
                        return (
                          <tr key={r.id} style={{ borderTop: `1px solid ${colors.borderLight || "#eee"}` }}>
                            <td style={{ padding: "10px 16px", textDecoration: "line-through", color: colors.textLight }}>{child?.first_name} {child?.last_name}</td>
                            <td style={{ padding: "10px 16px", textDecoration: "line-through", color: colors.textLight }}>{ses?.name || "—"}</td>
                            <td style={{ padding: "10px 16px", color: colors.textLight }}>${((r.payment_amount_cents || 0) / 100).toFixed(0)}</td>
                            <td style={{ padding: "10px 16px" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, background: "#e2e3e5", color: "#6c757d" }}>Cancelled</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}

        {/* Privacy Notice */}
        <div style={{ marginTop: 32, padding: "16px 20px", background: colors.card, borderRadius: 10, border: `1px solid ${colors.borderLight}`, fontSize: 13, color: colors.textLight, lineHeight: 1.6 }}>
          {Icons.shield({ size: 14, color: colors.textLight })} <strong style={{ color: colors.textMid }}>Privacy:</strong> Your family's information is stored securely and used only for camp administration. We do not share personal data with third parties. Medical and emergency contact information is accessible only to authorized camp staff.
        </div>
      </div>

      {/* Modals */}
      {modal === "add-child" && <AddChildModal onClose={() => setModal(null)} onSave={handleAddChild} onAddAnother={handleAddAnother} saving={saving} />}
      {modal === "register" && selectedChild && (
        <RegisterModal child={selectedChild} sessions={sessions} existingRegs={childRegs(selectedChild.id)} onClose={() => setModal(null)} onRegister={handleRegister} saving={saving} />
      )}
      {modal === "profile" && parent && <ProfileModal parent={parent} onClose={() => setModal(null)} onSave={handleUpdateProfile} saving={saving} />}
    </div>
  );
}