import { useEffect } from "react";
import { colors, font, s } from "../lib/styles";
import Icons from "../lib/icons";

export const Spinner = ({ size = 20 }) => (
  <div style={{ width: size, height: size, border: `2px solid ${colors.border}`, borderTopColor: colors.forest, borderRadius: "50%", animation: "spin .6s linear infinite" }} />
);

export const Toast = ({ message, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: colors.forest, color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 500, boxShadow: "0 8px 30px rgba(0,0,0,.15)", animation: "fadeIn .2s ease", display: "flex", alignItems: "center", gap: 10 }}>
      {Icons.check({ color: "#fff", size: 16 })} {message}
    </div>
  );
};

export const Modal = ({ title, onClose, children, width = 520 }) => (
  <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
    <div style={{ background: colors.card, borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)", animation: "fadeIn .2s ease" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${colors.border}` }}>
        <h3 style={{ fontSize: 18, fontFamily: font.display }}>{title}</h3>
        <span onClick={onClose} style={{ cursor: "pointer", padding: 4 }}>{Icons.x({ color: colors.textMid })}</span>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  </div>
);

export const Field = ({ label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={s.label}>{label}</label>
    {children}
  </div>
);

export const EmptyState = ({ icon: IconFn, title, sub }) => (
  <div style={{ textAlign: "center", padding: "48px 24px", color: colors.textMid }}>
    <div style={{ marginBottom: 12 }}>{IconFn({ size: 36, color: colors.border })}</div>
    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 14 }}>{sub}</div>
  </div>
);

export const StatusBadge = ({ status }) => {
  const map = {
    confirmed: { color: colors.success, label: "Confirmed" },
    pending: { color: colors.amber, label: "Pending" },
    waitlisted: { color: colors.sky, label: "Waitlisted" },
    cancelled: { color: colors.coral, label: "Cancelled" },
    paid: { color: colors.success, label: "Paid" },
    unpaid: { color: colors.coral, label: "Unpaid" },
    partial: { color: colors.amber, label: "Partial" },
    refunded: { color: colors.textMid, label: "Refunded" },
  };
  const m = map[status] || { color: colors.textMid, label: status };
  return <span style={s.badge(m.color)}>{m.label}</span>;
};
