// ============================================================
// DESIGN SYSTEM — colors, fonts, reusable styles
// ============================================================

export const font = {
  display: "'DM Serif Display', Georgia, serif",
  body: "'DM Sans', -apple-system, sans-serif",
};

export const colors = {
  forest: "#1a4a3a",
  forestLight: "#2d6b54",
  forestPale: "#e8f5ee",
  amber: "#d4890a",
  amberLight: "#fef3db",
  sky: "#2563eb",
  skyLight: "#eff6ff",
  coral: "#dc4a3a",
  coralLight: "#fef2f2",
  white: "#ffffff",
  bg: "#f7f5f0",
  card: "#ffffff",
  border: "#e2ddd5",
  borderLight: "#f0ece6",
  text: "#1a1a18",
  textMid: "#6b6560",
  textLight: "#9c958e",
  success: "#16a34a",
  successBg: "#dcfce7",
  warning: "#ea580c",
  warningBg: "#fff7ed",
};

export const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=DM+Serif+Display&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${font.body}; color: ${colors.text}; background: ${colors.bg}; -webkit-font-smoothing: antialiased; }
  input, select, textarea, button { font-family: inherit; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

export const s = {
  btn: (variant = "primary") => ({
    display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px",
    borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14,
    transition: "all .15s ease",
    ...(variant === "primary" && { background: colors.forest, color: "#fff" }),
    ...(variant === "secondary" && { background: colors.white, color: colors.text, border: `1px solid ${colors.border}` }),
    ...(variant === "danger" && { background: colors.coral, color: "#fff" }),
    ...(variant === "ghost" && { background: "transparent", color: colors.textMid }),
    ...(variant === "amber" && { background: colors.amber, color: "#fff" }),
  }),
  input: {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: `1px solid ${colors.border}`, fontSize: 14,
    outline: "none", transition: "border-color .15s",
    background: colors.white,
  },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: colors.textMid, marginBottom: 6 },
  card: {
    background: colors.card, borderRadius: 12,
    border: `1px solid ${colors.border}`, padding: 24,
  },
  badge: (color = colors.forest) => ({
    display: "inline-flex", padding: "3px 10px", borderRadius: 20,
    fontSize: 12, fontWeight: 600, background: `${color}14`, color: color,
  }),
};
