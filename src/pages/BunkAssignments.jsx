// ============================================================
// BUNK ASSIGNMENTS — Multi-select drag-and-drop bunk management
// ============================================================
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import sb from "../lib/supabase";
import { colors, s, font } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner, Modal } from "../components/UI";

const fmt = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const fmtDob = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "";
const age = (dob) => {
  if (!dob) return "";
  const b = new Date(dob + "T00:00:00"), now = new Date();
  let y = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) y--;
  return y;
};

export default function BunkAssignments({ divisions, weeks, children, registrations, showToast }) {
  const [selDiv, setSelDiv] = useState("");
  const [selWeek, setSelWeek] = useState("");
  const [bunks, setBunks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bunkModal, setBunkModal] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [dragOverBunk, setDragOverBunk] = useState(null);
  const dragIdsRef = useRef([]);
  const dragEnterCount = useRef({});

  // ── Derived data ──
  const divWeeks = weeks.filter((w) => w.division_id === selDiv);
  const currentDiv = divisions.find((d) => d.id === selDiv);
  const isPreschool = currentDiv?.name?.toLowerCase().includes("preschool");

  const registeredChildIds = registrations
    .filter((r) => r.division_id === selDiv && r.week_id === selWeek && r.status !== "cancelled")
    .map((r) => r.child_id);
  const divChildren = children
    .filter((c) => registeredChildIds.includes(c.id))
    .sort((a, b) => (a.date_of_birth || "").localeCompare(b.date_of_birth || "") || a.first_name.localeCompare(b.first_name));

  const statusMap = useMemo(() => {
    const m = new Map();
    registrations.filter((r) => r.division_id === selDiv && r.week_id === selWeek && r.status !== "cancelled")
      .forEach((r) => m.set(r.child_id, r.status));
    return m;
  }, [registrations, selDiv, selWeek]);

  const assignedIds = new Set(assignments.map((a) => a.child_id));
  const unassigned = divChildren.filter((c) => !assignedIds.has(c.id));

  // Track whether any selected kids are currently assigned (for "Unassign" button)
  const hasAssignedSelected = useMemo(
    () => [...selected].some((id) => assignedIds.has(id)),
    [selected, assignedIds]
  );

  // ── Load bunks + assignments ──
  const loadBunks = useCallback(async () => {
    if (!selDiv) return;
    setLoading(true);
    try {
      const b = await sb.query("bunks", { filters: `&division_id=eq.${selDiv}&order=sort_order.asc,name.asc` });
      setBunks(b || []);
      if (selWeek) {
        const a = await sb.query("bunk_assignments", { filters: `&week_id=eq.${selWeek}&limit=5000` });
        setAssignments(a || []);
      } else {
        setAssignments([]);
      }
    } catch (e) { console.error("Load bunks error:", e); }
    finally { setLoading(false); }
  }, [selDiv, selWeek]);

  useEffect(() => { loadBunks(); }, [loadBunks]);
  useEffect(() => { if (divisions.length && !selDiv) setSelDiv(divisions[0].id); }, [divisions, selDiv]);
  useEffect(() => {
    if (divWeeks.length && !divWeeks.find((w) => w.id === selWeek)) setSelWeek(divWeeks[0]?.id || "");
  }, [divWeeks, selWeek]);
  useEffect(() => { setSelected(new Set()); }, [selDiv, selWeek]);

  // ── Selection ──
  const toggleSelect = (childId, e) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e?.shiftKey && prev.size > 0) {
        const list = assignedIds.has(childId)
          ? divChildren.filter((c) => assignedIds.has(c.id))
          : unassigned;
        const ids = list.map((c) => c.id);
        const lastSelected = [...prev].pop();
        const fromIdx = ids.indexOf(lastSelected);
        const toIdx = ids.indexOf(childId);
        if (fromIdx >= 0 && toIdx >= 0) {
          const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
          for (let i = start; i <= end; i++) next.add(ids[i]);
          return next;
        }
      }
      if (next.has(childId)) next.delete(childId); else next.add(childId);
      return next;
    });
  };
  const selectAllUnassigned = () => setSelected(new Set(unassigned.map((c) => c.id)));
  const clearSelection = () => setSelected(new Set());

  // ── Bulk assign ──
  const bulkAssign = async (childIds, bunkId) => {
    if (!childIds.length) return;
    if (isPreschool) {
      const bunk = bunks.find((b) => b.id === bunkId);
      if (bunk?.capacity) {
        const currentCount = assignments.filter((a) => a.bunk_id === bunkId).length;
        const newKids = childIds.filter((id) => !assignments.find((a) => a.child_id === id && a.bunk_id === bunkId));
        if (currentCount + newKids.length > bunk.capacity) {
          showToast(`${bunk.name} can only hold ${bunk.capacity} kids (${currentCount} already assigned)`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      const existingIds = assignments.filter((a) => childIds.includes(a.child_id)).map((a) => a.id);
      if (existingIds.length) {
        await sb.query("bunk_assignments", { method: "DELETE", filters: `&id=in.(${existingIds.join(",")})` });
      }
      const rows = childIds.map((cid) => ({ bunk_id: bunkId, child_id: cid, week_id: selWeek }));
      await sb.query("bunk_assignments", { method: "POST", body: rows, headers: { Prefer: "return=minimal" } });
      setSelected(new Set());
      await loadBunks();
      showToast(`Assigned ${childIds.length} kid${childIds.length > 1 ? "s" : ""}`);
    } catch (e) { showToast("Error assigning: " + e.message); }
    finally { setSaving(false); }
  };

  // ── Bulk unassign ──
  const bulkUnassign = async (childIds) => {
    if (!childIds.length) return;
    setSaving(true);
    try {
      const toDelete = assignments.filter((a) => childIds.includes(a.child_id)).map((a) => a.id);
      if (toDelete.length) {
        await sb.query("bunk_assignments", { method: "DELETE", filters: `&id=in.(${toDelete.join(",")})` });
      }
      setSelected(new Set());
      await loadBunks();
      showToast(`Unassigned ${childIds.length} kid${childIds.length > 1 ? "s" : ""}`);
    } catch (e) { showToast("Error: " + e.message); }
    finally { setSaving(false); }
  };

  // ── Copy from previous week ──
  const copyFromPrev = async () => {
    const idx = divWeeks.findIndex((w) => w.id === selWeek);
    if (idx <= 0) { showToast("No previous week to copy from"); return; }
    setSaving(true);
    try {
      const prevAssignments = await sb.query("bunk_assignments", { filters: `&week_id=eq.${divWeeks[idx - 1].id}&limit=5000` });
      if (!prevAssignments?.length) { showToast("No assignments in previous week"); setSaving(false); return; }
      const currentRegIds = new Set(registeredChildIds);
      const toCopy = prevAssignments.filter((a) => currentRegIds.has(a.child_id));
      if (assignments.length) await sb.query("bunk_assignments", { method: "DELETE", filters: `&week_id=eq.${selWeek}` });
      if (toCopy.length) {
        await sb.query("bunk_assignments", { method: "POST", body: toCopy.map((a) => ({ bunk_id: a.bunk_id, child_id: a.child_id, week_id: selWeek })), headers: { Prefer: "return=minimal" } });
      }
      await loadBunks();
      const skipped = prevAssignments.length - toCopy.length;
      showToast(`Copied ${toCopy.length} assignments${skipped ? `, ${skipped} skipped (not registered)` : ""}`);
    } catch (e) { showToast("Error copying: " + e.message); }
    finally { setSaving(false); }
  };

  // ── Bunk CRUD ──
  const saveBunk = async (data) => {
    setSaving(true);
    try {
      if (bunkModal && bunkModal !== "new") {
        await sb.query("bunks", { method: "PATCH", body: data, filters: `&id=eq.${bunkModal.id}`, headers: { Prefer: "return=minimal" } });
        showToast("Bunk updated!");
      } else {
        await sb.query("bunks", { method: "POST", body: { ...data, division_id: selDiv }, headers: { Prefer: "return=minimal" } });
        showToast("Bunk created!");
      }
      setBunkModal(null); await loadBunks();
    } catch (e) { showToast("Error: " + e.message); }
    finally { setSaving(false); }
  };

  const deleteBunk = async (bunkId) => {
    if (!confirm("Delete this bunk? All assignments in it will be removed.")) return;
    setSaving(true);
    try {
      await sb.query("bunk_assignments", { method: "DELETE", filters: `&bunk_id=eq.${bunkId}` });
      await sb.query("bunks", { method: "DELETE", filters: `&id=eq.${bunkId}` });
      showToast("Bunk deleted"); await loadBunks();
    } catch (e) { showToast("Error: " + e.message); }
    finally { setSaving(false); }
  };

  // ── CSV Export ──
  const exportCSV = () => {
    const rows = [["Bunk", "Staff", "Child First Name", "Child Last Name", "Grade", "Age", "DOB"]];
    bunks.forEach((bunk) => {
      const bunkKids = assignments.filter((a) => a.bunk_id === bunk.id).map((a) => children.find((c) => c.id === a.child_id)).filter(Boolean).sort((a, b) => a.last_name.localeCompare(b.last_name));
      if (!bunkKids.length) rows.push([bunk.name, bunk.staff_name || "", "", "", "", "", ""]);
      else bunkKids.forEach((kid) => rows.push([bunk.name, bunk.staff_name || "", kid.first_name, kid.last_name, kid.grade ?? "", age(kid.date_of_birth), kid.date_of_birth || ""]));
    });
    unassigned.forEach((kid) => rows.push(["UNASSIGNED", "", kid.first_name, kid.last_name, kid.grade ?? "", age(kid.date_of_birth), kid.date_of_birth || ""]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bunks-${currentDiv?.name || "div"}-${divWeeks.find((w) => w.id === selWeek)?.name || "week"}.csv`.replace(/\s+/g, "-").toLowerCase();
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Drag handlers (desktop — flicker-fixed with enter/leave counter) ──
  const handleDragStart = (e, childId) => {
    let ids;
    if (selected.has(childId) && selected.size > 1) {
      ids = [...selected];
    } else {
      ids = [childId];
      setSelected(new Set([childId]));
    }
    dragIdsRef.current = ids;
    dragEnterCount.current = {};
    setDragActive(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(ids));
    if (ids.length > 1) {
      const badge = document.createElement("div");
      badge.textContent = `${ids.length} kids`;
      badge.style.cssText = "position:fixed;top:-100px;background:#1a4a3a;color:#fff;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:600;";
      document.body.appendChild(badge);
      e.dataTransfer.setDragImage(badge, 40, 16);
      setTimeout(() => document.body.removeChild(badge), 0);
    }
  };

  const handleDragEnter = (e, zoneId) => {
    e.preventDefault();
    dragEnterCount.current[zoneId] = (dragEnterCount.current[zoneId] || 0) + 1;
    setDragOverBunk(zoneId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragLeave = (e, zoneId) => {
    dragEnterCount.current[zoneId] = (dragEnterCount.current[zoneId] || 0) - 1;
    if (dragEnterCount.current[zoneId] <= 0) {
      dragEnterCount.current[zoneId] = 0;
      // Only clear if we're leaving the zone that's currently highlighted
      setDragOverBunk((prev) => (prev === zoneId ? null : prev));
    }
  };

  const handleDrop = (e, bunkId) => {
    e.preventDefault();
    dragEnterCount.current = {};
    setDragOverBunk(null);
    setDragActive(false);
    const ids = dragIdsRef.current;
    if (ids?.length && bunkId) bulkAssign(ids, bunkId);
    dragIdsRef.current = [];
  };

  const handleDropUnassign = (e) => {
    e.preventDefault();
    dragEnterCount.current = {};
    setDragOverBunk(null);
    setDragActive(false);
    const ids = dragIdsRef.current;
    if (ids?.length) bulkUnassign(ids);
    dragIdsRef.current = [];
  };

  const handleDragEnd = () => {
    setDragActive(false);
    setDragOverBunk(null);
    dragEnterCount.current = {};
  };

  // ── Child pill ──
  const ChildPill = ({ child }) => {
    const isSel = selected.has(child.id);
    const isDragging = dragActive && isSel;
    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, child.id)}
        onDragEnd={handleDragEnd}
        onClick={(e) => { e.stopPropagation(); toggleSelect(child.id, e); }}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8,
          background: isSel ? colors.forestPale : colors.white,
          border: `2px solid ${isSel ? colors.forest : colors.border}`,
          cursor: "grab", fontSize: 13, fontWeight: 500,
          opacity: isDragging ? 0.4 : 1, transition: "all .1s", userSelect: "none",
          WebkitUserSelect: "none", WebkitTouchCallout: "none",
        }}
      >
        <div style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          border: `2px solid ${isSel ? colors.forest : colors.border}`,
          background: isSel ? colors.forest : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", transition: "all .1s",
        }}>
          {isSel && Icons.check({ size: 10, color: "#fff" })}
        </div>
        <span style={{ color: colors.text }}>{child.first_name} {child.last_name}</span>
        {child.grade != null && <span style={{ fontSize: 11, color: colors.textLight, fontWeight: 400 }}>G{child.grade}</span>}
        {statusMap.get(child.id) === "waitlisted" && (
          <span style={{ fontSize: 10, fontWeight: 700, color: colors.amber, background: colors.amberLight, padding: "1px 6px", borderRadius: 4, letterSpacing: ".03em", textTransform: "uppercase", flexShrink: 0 }}>Waitlisted</span>
        )}
        <span style={{ fontSize: 11, color: colors.textLight, fontWeight: 400, marginLeft: "auto", whiteSpace: "nowrap" }}>
          {child.date_of_birth ? `${fmtDob(child.date_of_birth)} (${age(child.date_of_birth)}y)` : ""}
        </span>
      </div>
    );
  };

  if (!selDiv) return <div style={{ padding: 40, textAlign: "center", color: colors.textMid }}>No divisions configured yet.</div>;

  const selectedArr = [...selected];

  return (
    <div style={{ paddingBottom: selected.size > 0 ? 80 : 0, transition: "padding .2s" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <div>
          <label style={{ ...s.label, marginBottom: 4 }}>Division</label>
          <select value={selDiv} onChange={(e) => { setSelDiv(e.target.value); setSelWeek(""); }} style={{ ...s.input, width: "auto", minWidth: 160 }}>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ ...s.label, marginBottom: 4 }}>Week</label>
          <select value={selWeek} onChange={(e) => setSelWeek(e.target.value)} style={{ ...s.input, width: "auto", minWidth: 180 }}>
            {divWeeks.map((w) => <option key={w.id} value={w.id}>{w.name} ({fmt(w.start_date)})</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingTop: 18 }}>
          <button onClick={copyFromPrev} disabled={saving || !selWeek} style={{ ...s.btn("secondary"), fontSize: 13, padding: "8px 14px" }}>
            {saving ? <Spinner size={14} /> : "Copy from Prev Week"}
          </button>
          <button onClick={exportCSV} disabled={!selWeek} style={{ ...s.btn("secondary"), fontSize: 13, padding: "8px 14px" }}>
            {Icons.download({ size: 14 })} Export CSV
          </button>
          <button onClick={() => setBunkModal("new")} style={{ ...s.btn("primary"), fontSize: 13, padding: "8px 14px" }}>
            {Icons.plus({ size: 14, color: "#fff" })} New Bunk
          </button>
        </div>
      </div>

      {/* ── Summary ── */}
      {selWeek && (
        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            ["Registered", divChildren.length, colors.forest],
            ["Assigned", assignedIds.size, colors.forest],
            ["Unassigned", unassigned.length, unassigned.length ? colors.amber : colors.forest],
            ["Bunks", bunks.length, colors.forest],
          ].map(([label, val, col]) => (
            <div key={label} style={{ ...s.card, padding: "12px 20px", flex: "0 0 auto" }}>
              <span style={{ fontSize: 12, color: colors.textMid, fontWeight: 600 }}>{label}</span>
              <span style={{ fontFamily: font.display, fontSize: 22, color: col, marginLeft: 10 }}>{val}</span>
            </div>
          ))}
          {selected.size > 0 && (
            <div style={{ ...s.card, padding: "12px 20px", flex: "0 0 auto", background: colors.forestPale, border: `2px solid ${colors.forest}` }}>
              <span style={{ fontSize: 13, color: colors.forest, fontWeight: 700 }}>{selected.size} Selected</span>
              <button onClick={clearSelection} style={{ ...s.btn("ghost"), padding: "2px 8px", fontSize: 11, color: colors.coral, marginLeft: 8 }}>Clear</button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Spinner size={28} /></div>
      ) : !selWeek ? (
        <div style={{ padding: 40, textAlign: "center", color: colors.textMid }}>Select a week to manage bunk assignments.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          {/* ── LEFT: Unassigned ── */}
          <div
            onDragEnter={(e) => handleDragEnter(e, "pool")}
            onDragOver={handleDragOver}
            onDragLeave={(e) => handleDragLeave(e, "pool")}
            onDrop={handleDropUnassign}
            style={{
              flex: "1 1 260px", maxWidth: 340,
              background: dragOverBunk === "pool" ? colors.amberLight : colors.bg,
              border: `2px dashed ${dragOverBunk === "pool" ? colors.amber : colors.border}`,
              borderRadius: 12, padding: 16, transition: "all .15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.textMid, textTransform: "uppercase", letterSpacing: ".04em" }}>
                Unassigned ({unassigned.length})
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={selectAllUnassigned} style={{ ...s.btn("ghost"), padding: "2px 6px", fontSize: 11, color: colors.forest }}>All</button>
                {selected.size > 0 && <button onClick={clearSelection} style={{ ...s.btn("ghost"), padding: "2px 6px", fontSize: 11, color: colors.coral }}>Clear</button>}
              </div>
            </div>
            {unassigned.length === 0 ? (
              <div style={{ fontSize: 13, color: colors.textLight, padding: "20px 0", textAlign: "center" }}>All kids assigned!</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {unassigned.map((c) => <ChildPill key={c.id} child={c} />)}
              </div>
            )}
          </div>

          {/* ── RIGHT: Bunks ── */}
          <div style={{ flex: "1 1 400px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", alignContent: "flex-start" }}>
            {bunks.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: colors.textMid, width: "100%" }}>No bunks yet — create one to get started.</div>
            ) : bunks.map((bunk) => {
              const bunkKids = assignments.filter((a) => a.bunk_id === bunk.id).map((a) => children.find((c) => c.id === a.child_id)).filter(Boolean).sort((a, b) => a.last_name.localeCompare(b.last_name));
              const atCapacity = isPreschool && bunk.capacity && bunkKids.length >= bunk.capacity;
              const isOver = dragOverBunk === bunk.id;
              const showAssignHere = selected.size > 0 && !saving;
              return (
                <div
                  key={bunk.id}
                  onDragEnter={(e) => handleDragEnter(e, bunk.id)}
                  onDragOver={handleDragOver}
                  onDragLeave={(e) => handleDragLeave(e, bunk.id)}
                  onDrop={(e) => handleDrop(e, bunk.id)}
                  style={{
                    ...s.card, width: "calc(50% - 8px)", minWidth: 280, padding: 0, overflow: "hidden",
                    border: `2px solid ${isOver ? (atCapacity ? colors.coral : colors.forest) : colors.border}`,
                    background: isOver ? (atCapacity ? colors.coralLight : colors.forestPale) : colors.white,
                    transition: "all .15s",
                  }}
                >
                  <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${colors.borderLight}`, background: colors.bg }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: font.display, fontSize: 17, color: colors.forest }}>{bunk.name}</div>
                      {bunk.staff_name && <div style={{ fontSize: 12, color: colors.textMid, marginTop: 2 }}>{bunk.staff_name}</div>}
                    </div>
                    {isPreschool && bunk.capacity ? (
                      <span style={{ ...s.badge(atCapacity ? colors.coral : colors.forest), fontSize: 11 }}>{bunkKids.length}/{bunk.capacity}</span>
                    ) : (
                      <span style={{ fontSize: 12, color: colors.textLight, fontWeight: 600 }}>{bunkKids.length}</span>
                    )}
                    <button onClick={() => setBunkModal(bunk)} style={{ ...s.btn("ghost"), padding: 4, minWidth: 0 }}>{Icons.clipboard({ size: 14, color: colors.textMid })}</button>
                    <button onClick={() => deleteBunk(bunk.id)} style={{ ...s.btn("ghost"), padding: 4, minWidth: 0 }}>{Icons.x({ size: 14, color: colors.coral })}</button>
                  </div>
                  <div style={{ padding: 12, minHeight: 48, display: "flex", flexDirection: "column", gap: 4 }}>
                    {bunkKids.length === 0 ? (
                      <div style={{ fontSize: 13, color: colors.textLight, textAlign: "center", padding: "12px 0" }}>
                        {showAssignHere ? "Tap below to assign here" : "Drag kids here"}
                      </div>
                    ) : bunkKids.map((c) => <ChildPill key={c.id} child={c} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Sticky Action Bar (appears when kids are selected) ── */}
      {selected.size > 0 && selWeek && !loading && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: colors.white, borderTop: `2px solid ${colors.forest}`,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.12)",
          padding: "10px 16px",
          animation: "slideUp .2s ease-out",
        }}>
          <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            {/* Top row: selection info + clear/unassign */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.forest }}>
                {selected.size} selected
              </span>
              <span style={{ fontSize: 12, color: colors.textLight }}>— tap a bunk to assign</span>
              <div style={{ flex: 1 }} />
              {hasAssignedSelected && (
                <button
                  onClick={() => bulkUnassign(selectedArr.filter((id) => assignedIds.has(id)))}
                  disabled={saving}
                  style={{ ...s.btn("secondary"), fontSize: 12, padding: "5px 12px", color: colors.coral, borderColor: colors.coral }}
                >
                  Unassign
                </button>
              )}
              <button onClick={clearSelection} style={{ ...s.btn("ghost"), fontSize: 12, padding: "5px 10px", color: colors.textMid }}>
                Clear
              </button>
            </div>
            {/* Bunk buttons row — horizontally scrollable */}
            <div style={{
              display: "flex", gap: 8, flexWrap: "wrap",
            }}>
              {bunks.map((bunk) => {
                const bunkCount = assignments.filter((a) => a.bunk_id === bunk.id).length;
                const atCap = isPreschool && bunk.capacity && bunkCount >= bunk.capacity;
                return (
                  <button
                    key={bunk.id}
                    onClick={() => bulkAssign(selectedArr, bunk.id)}
                    disabled={saving || atCap}
                    style={{
                      flexShrink: 0, padding: "8px 16px", borderRadius: 8,
                      fontSize: 13, fontWeight: 600, cursor: atCap ? "not-allowed" : "pointer",
                      border: `2px solid ${atCap ? colors.border : colors.forest}`,
                      background: atCap ? colors.bg : colors.forestPale,
                      color: atCap ? colors.textLight : colors.forest,
                      opacity: saving ? 0.6 : 1, transition: "all .15s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {bunk.name}
                    {isPreschool && bunk.capacity
                      ? ` (${bunkCount}/${bunk.capacity})`
                      : ` (${bunkCount})`
                    }
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {bunkModal && <BunkModal bunk={bunkModal === "new" ? null : bunkModal} isPreschool={isPreschool} onClose={() => setBunkModal(null)} onSave={saveBunk} saving={saving} />}
    </div>
  );
}

function BunkModal({ bunk, isPreschool, onClose, onSave, saving }) {
  const [form, setForm] = useState({ name: bunk?.name || "", staff_name: bunk?.staff_name || "", capacity: bunk?.capacity || "", sort_order: bunk?.sort_order || 0 });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal onClose={onClose} title={bunk ? `Edit ${bunk.name}` : "New Bunk"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div><label style={s.label}>Bunk Name *</label><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Bunk Aleph" style={s.input} /></div>
        <div><label style={s.label}>Staff / Counselor</label><input value={form.staff_name} onChange={(e) => set("staff_name", e.target.value)} placeholder="e.g. Moshe K." style={s.input} /></div>
        {isPreschool && <div><label style={s.label}>Capacity (max kids)</label><input type="number" min="1" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="e.g. 12" style={s.input} /></div>}
        <div><label style={s.label}>Sort Order</label><input type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} style={s.input} /></div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
          <button onClick={() => { if (!form.name.trim()) return alert("Bunk name is required"); onSave({ name: form.name.trim(), staff_name: form.staff_name.trim() || null, capacity: form.capacity ? parseInt(form.capacity, 10) : null, sort_order: parseInt(form.sort_order, 10) || 0 }); }} disabled={saving} style={s.btn("primary")}>
            {saving ? <Spinner size={14} /> : bunk ? "Save Changes" : "Create Bunk"}
          </button>
        </div>
      </div>
    </Modal>
  );
}