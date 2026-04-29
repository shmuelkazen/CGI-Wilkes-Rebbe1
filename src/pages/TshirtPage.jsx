import { useState, useEffect, useCallback } from "react";
import sb from "../lib/supabase";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner } from "../components/UI";

const SIZES = ["YXS", "YS", "YM", "YL", "YXL", "AS", "AM", "AL", "AXL", "A2XL"];

const SIZE_LABELS = {
  YXS: "Youth XS", YS: "Youth S", YM: "Youth M", YL: "Youth L", YXL: "Youth XL",
  AS: "Adult S", AM: "Adult M", AL: "Adult L", AXL: "Adult XL", "A2XL": "Adult 2XL",
};

export default function TshirtPage({ user, setView, showToast }) {
  const [settings, setSettings] = useState({});
  const [cart, setCart] = useState({});
  const [pastOrders, setPastOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);

  const load = useCallback(async () => {
    try {
      const [settingsRows, orders] = await Promise.all([
        sb.query("camp_settings"),
        sb.query("shirt_orders", { filters: `&parent_id=eq.${user.id}&order=created_at.desc` }),
      ]);
      const st = {};
      (settingsRows || []).forEach((row) => {
        try { st[row.key] = JSON.parse(row.value); } catch { st[row.key] = row.value; }
      });
      setSettings(st);
      setPastOrders(orders || []);
    } catch (e) {
      console.error("Load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const shirtPriceCents = settings?.shirt_price_cents ?? 0;
  const shirtOrderingOpen = settings?.shirt_ordering_open === true;
  const campName = settings?.camp_name || "CGI Wilkes Rebbe";

  const updateQty = (type, size, delta) => {
    const key = `${type}-${size}`;
    setCart((prev) => {
      const val = Math.max(0, (prev[key] || 0) + delta);
      if (val === 0) { const { [key]: _, ...rest } = prev; return rest; }
      return { ...prev, [key]: val };
    });
  };

  const cartEntries = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartCount = cartEntries.reduce((sum, [, qty]) => sum + qty, 0);
  const cartTotal = cartCount * shirtPriceCents;

  const handleOrder = async () => {
    if (cartCount === 0) return;
    if (!shirtPriceCents || shirtPriceCents <= 0) return alert("Shirt pricing not configured yet.");
    setOrdering(true);
    try {
      const orderIds = [];
      const descParts = [];
      for (const [key, qty] of cartEntries) {
        const [type, size] = key.split("-");
        const resp = await sb.query("shirt_orders", {
          method: "POST",
          body: { parent_id: user.id, shirt_type: type, size, quantity: qty, price_cents: shirtPriceCents * qty, status: "pending" },
          headers: { Prefer: "return=representation" },
        });
        const order = Array.isArray(resp) ? resp[0] : resp;
        if (order?.id) orderIds.push(order.id);
        descParts.push(`${type} ${size} × ${qty}`);
      }

      const res = await fetch("/.netlify/functions/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: user.id,
          parentEmail: user.email,
          amountCents: cartTotal,
          siteUrl: window.location.origin,
          isShirtOrder: true,
          shirtOrderId: orderIds.join(","),
          shirtDescription: descParts.join(", "),
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Failed to create checkout.");
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setOrdering(false);
    }
  };

  const handleSignOut = async () => { await sb.signOut(); window.location.reload(); };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}><Spinner size={32} /></div>;

  const paidOrders = pastOrders.filter((o) => o.status === "paid");

  const renderSizeGrid = (type) => (
    <div style={{ ...s.card, flex: 1, minWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {type === "Boys" ? Icons.users({ size: 20, color: colors.forest }) : Icons.users({ size: 20, color: "#e91e63" })}
        <h3 style={{ margin: 0, fontSize: 18, fontFamily: font.display, color: colors.text }}>{type} Shirts</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SIZES.map((size) => {
          const key = `${type}-${size}`;
          const qty = cart[key] || 0;
          return (
            <div key={size} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: qty > 0 ? `${colors.forest}08` : colors.bg, borderRadius: 8, border: `1px solid ${qty > 0 ? colors.forest + "30" : colors.border}` }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{size}</span>
                <span style={{ fontSize: 12, color: colors.textMid, marginLeft: 8 }}>{SIZE_LABELS[size]}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                <button
                  onClick={() => updateQty(type, size, -1)}
                  disabled={qty === 0}
                  style={{ width: 32, height: 32, border: `1px solid ${colors.border}`, borderRadius: "8px 0 0 8px", background: "#fff", cursor: qty > 0 ? "pointer" : "default", opacity: qty > 0 ? 1 : 0.4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: colors.text }}
                >−</button>
                <div style={{ width: 36, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, background: "#fff", fontSize: 14, fontWeight: 600, color: colors.text }}>{qty}</div>
                <button
                  onClick={() => updateQty(type, size, 1)}
                  style={{ width: 32, height: 32, border: `1px solid ${colors.border}`, borderRadius: "0 8px 8px 0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: colors.forest }}
                >+</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: colors.bg }}>
      {/* Header */}
      <header style={{ background: colors.forest, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.png" alt={campName} style={{ width: 28, height: 28, objectFit: "contain", borderRadius: "50%" }} />
          <span style={{ fontFamily: font.display, color: "#fff", fontSize: 20 }}>{campName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#fff", fontSize: 15, fontWeight: "bold", fontFamily: "serif" }}>בס״ד</span>
          <button onClick={() => setView("parent")} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.8)", padding: "6px 14px", fontSize: 13 }}>← Dashboard</button>
          <button onClick={handleSignOut} style={{ ...s.btn("ghost"), color: "rgba(255,255,255,.6)", padding: "6px 10px" }}>{Icons.logout({ size: 16, color: "rgba(255,255,255,.6)" })}</button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <h2 style={{ fontFamily: font.display, fontSize: 24, color: colors.text, marginBottom: 4 }}>T-Shirt Orders</h2>
        {shirtPriceCents > 0 && (
          <p style={{ fontSize: 14, color: colors.textMid, marginBottom: 24 }}>${(shirtPriceCents / 100).toFixed(2)} per shirt</p>
        )}

        {!shirtOrderingOpen ? (
          <div style={{ ...s.card, textAlign: "center", padding: 40 }}>
            {Icons.alertCircle({ size: 24, color: colors.textMid })}
            <p style={{ fontSize: 16, color: colors.textMid, marginTop: 12 }}>T-shirt ordering is not open yet. Check back soon!</p>
          </div>
        ) : (
          <>
            {/* Size grids */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
              {renderSizeGrid("Boys")}
              {renderSizeGrid("Girls")}
            </div>

            {/* Cart summary & checkout */}
            <div style={{ ...s.card, background: cartCount > 0 ? `${colors.forest}06` : undefined, border: cartCount > 0 ? `2px solid ${colors.forest}30` : undefined }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>
                    {cartCount > 0 ? `${cartCount} shirt${cartCount !== 1 ? "s" : ""}` : "No shirts selected"}
                  </span>
                  {cartCount > 0 && (
                    <span style={{ fontSize: 15, fontWeight: 700, color: colors.forest, marginLeft: 12 }}>
                      ${(cartTotal / 100).toFixed(2)}
                    </span>
                  )}
                  {cartCount > 0 && (
                    <div style={{ fontSize: 12, color: colors.textMid, marginTop: 4 }}>
                      {cartEntries.map(([key, qty]) => { const [type, size] = key.split("-"); return `${type} ${size} × ${qty}`; }).join("  •  ")}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleOrder}
                  disabled={cartCount === 0 || ordering}
                  style={{ ...s.btn("primary"), padding: "10px 24px", fontSize: 14, opacity: cartCount > 0 ? 1 : 0.5 }}
                >
                  {ordering ? "Processing..." : cartCount > 0 ? `Order & Pay $${(cartTotal / 100).toFixed(2)}` : "Select shirts to order"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Past Orders */}
        {paidOrders.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h3 style={{ fontFamily: font.display, fontSize: 18, color: colors.text, marginBottom: 12 }}>Past Orders</h3>
            <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: colors.textMid }}>Date</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: colors.textMid }}>Type</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: colors.textMid }}>Size</th>
                    <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 600, color: colors.textMid }}>Qty</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: colors.textMid }}>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {paidOrders.map((o) => (
                    <tr key={o.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: "10px 16px", color: colors.textMid }}>{new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                      <td style={{ padding: "10px 16px", color: colors.text }}>{o.shirt_type || "—"}</td>
                      <td style={{ padding: "10px 16px", color: colors.text }}>{o.size}</td>
                      <td style={{ padding: "10px 16px", textAlign: "center", color: colors.text }}>{o.quantity}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: colors.forest }}>${((o.price_cents || 0) / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}