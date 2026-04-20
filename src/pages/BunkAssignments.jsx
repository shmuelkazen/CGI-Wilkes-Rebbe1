// ============================================================
// BUNK ASSIGNMENTS — Drag-and-drop bunk management by division/week
// ============================================================
import { useState, useEffect, useCallback, useRef } from "react";
import sb from "../lib/supabase";
import { colors, s, font } from "../lib/styles";
import Icons from "../lib/icons";
import { Spinner, Modal } from "../components/UI";

// ── Tiny helpers ──
const fmt = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
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
  const [bunkModal, setBunkModal] = useState(null); // null | "new" | bunk object
  const [dragChild, setDragChild] = useState(null);
  const [dragOverBunk, setDragOverBunk] = useState(null);
  const dragRef = useRef(null);

  // ── Derived data ──
  const divWeeks = weeks.filter((w) => w.division_id === selDiv);
  const currentDiv = divisions.find((d) => d.id === selDiv);
  const isPreschool = currentDiv?.name?.toLowerCase().includes("preschool");

  // Kids registered for this division + week
  const registeredChildIds = registrations
    .filter((r) => r.division_id === selDiv && r.week_id === selWeek && r.status !== "cancelled")
    .map((r) => r.child_id);
  const divChildren = children
    .filter((c) => registeredChildIds.includes(c.id))
    .sort((a, b) => (a.date_of_birth || "").localeCompare(b.date_of_birth || "") || a.first_name.localeCompare(b.first_name));

  // Assigned child IDs for current week
  const assignedIds = new Set(assignments.map((a) => a.child_id));
  const unassigned = divChildren.filter((c) => !assignedIds.has(c.id));

  // ── Load bunks + assignments when division/week changes ──
  const loadBunks = useCallback(async () => {
    if (!selDiv) return;
    setLoading(true);
    try {
      const b = await sb.query("bunks", { filters: `&division_id=eq.${selDiv}&order=sort_order.asc,name.asc` });
      setBunks(b || []);
      if (selWeek) {
        const a = await sb.query("bunk_assignments", { filters: `&week_id=eq.${selWeek}` });
        setAssignments(a || []);
      } else {
        setAssignments([]);
      }
    } catch (e) {
      console.error("Load bunks error:", e);
    } finally {
      setLoading(false);
    }
  }, [selDiv, selWeek]);

  useEffect(() => { loadBunks(); }, [loadBunks]);

  // Auto-select first division + first week
  useEffect(() => {
    if (divisions.length && !selDiv) {
      setSelDiv(divisions[0].id);
    }
  }, [divisions, selDiv]);
  useEffect(() => {
    if (divWeeks.length && !divWeeks.find((w) => w.id === selWeek)) {
      setSelWeek(divWeeks[0]?.id || "");
    }
  }, [divWeeks, selWeek]);

  // ── Assign child to bunk ──
  const assignChild = async (childId, bunkId) => {
    // Capacity check for preschool
    if (isPreschool) {
      const bunk = bunks.find((b) => b.id === bunkId);
      if (bunk?.capacity) {
        const currentCount = assignments.filter((a) => a.bunk_id === bunkId).length;
        if (currentCount >= bunk.capacity) {
          showToast(`${bunk.name} is full (${bunk.capacity} max)`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      // Remove existing assignment for this child+week if any
      const existing = assignments.find((a) => a.child_id === childId);
      if (existing) {
        await sb.query("bunk_assignments", { method: "DELETE", filters: `&id=eq.${existing.id}` });
      }
      // Create new assignment
      await sb.query("bunk_assignments", {
        method: "POST",
        body: { bunk_id: bunkId, child_id: childId, week_id: selWeek },
        headers: { Prefer: "return=minimal" },
      });
      await loadBunks();
    } catch (e) {
      showToast("Error assigning: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Unassign child (drag back to pool) ──
  const unassignChild = async (childId) => {
    const existing = assignments.find((a) => a.child_id === childId);
    if (!existing) return;
    setSaving(true);
    try {
      await sb.query("bunk_assignments", { method: "DELETE", filters: `&id=eq.${existing.id}` });
      await loadBunks();
    } catch (e) {
      showToast("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Copy from previous week ──
  const copyFromPrev = async () => {
    const idx = divWeeks.findIndex((w) => w.id === selWeek);
    if (idx <= 0) { showToast("No previous week to copy from"); return; }
    const prevWeekId = divWeeks[idx - 1].id;
    setSaving(true);
    try {
      const prevAssignments = await sb.query("bunk_assignments", { filters: `&week_id=eq.${prevWeekId}` });
      if (!prevAssignments?.length) { showToast("No assignments in previous week"); setSaving(false); return; }

      // Only copy kids who are registered for current week
      const currentRegIds = new Set(registeredChildIds);
      const toCopy = prevAssignments.filter((a) => currentRegIds.has(a.child_id));

      // Clear existing assignments for this week first
      if (assignments.length) {
        await sb.query("bunk_assignments", { method: "DELETE", filters: `&week_id=eq.${selWeek}` });
      }

      // Bulk insert
      if (toCopy.length) {
        const rows = toCopy.map((a) => ({ bunk_id: a.bunk_id, child_id: a.child_id, week_id: selWeek }));
        await sb.query("bunk_assignments", {
          method: "POST",
          body: rows,
          headers: { Prefer: "return=minimal" },
        });
      }

      await loadBunks();
      const skipped = prevAssignments.length - toCopy.length;
      showToast(`Copied ${toCopy.length} assignments${skipped ? `, ${skipped} skipped (not registered)` : ""}`);
    } catch (e) {
      showToast("Error copying: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Bunk CRUD ──
  const saveBunk = async (data) => {
    setSaving(true);
    try {
      if (bunkModal && bunkModal !== "new") {
        await sb.query("bunks", {
          method: "PATCH",
          body: data,
          filters: `&id=eq.${bunkModal.id}`,
          headers: { Prefer: "return=minimal" },
        });
        showToast("Bunk updated!");
      } else {
        await sb.query("bunks", {
          method: "POST",
          body: { ...data, division_id: selDiv },
          headers: { Prefer: "return=minimal" },
        });
        showToast("Bunk created!");
      }
      setBunkModal(null);
      await loadBunks();
    } catch (e) {
      showToast("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteBunk = async (bunkId) => {
    if (!confirm("Delete this bunk? All assignments in it will be removed.")) return;
    setSaving(true);
    try {
      await sb.query("bunk_assignments", { method: "DELETE", filters: `&bunk_id=eq.${bunkId}` });
      await sb.query("bunks", { method: "DELETE", filters: `&id=eq.${bunkId}` });
      showToast("Bunk deleted");
      await loadBunks();
    } catch (e) {
      showToast("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── CSV Export ──
  const exportCSV = () => {
    const rows = [["Bunk", "Staff", "Child First Name", "Child Last Name", "Grade", "Age", "DOB"]];
    bunks.forEach((bunk) => {
      const bunkKids = assignments
        .filter((a) => a.bunk_id === bunk.id)
        .map((a) => children.find((c) => c.id === a.child_id))
        .filter(Boolean)
        .sort((a, b) => a.last_name.localeCompare(b.last_name));
      if (!bunkKids.length) {
        rows.push([bunk.name, bunk.staff_name || "", "", "", "", "", ""]);
      } else {
        bunkKids.forEach((kid) => {
          rows.push([bunk.name, bunk.staff_name || "", kid.first_name, kid.last_name, kid.grade || "", age(kid.date_of_birth), kid.date_of_birth || ""]);
        });
      }
    });
    // Add unassigned
    if (unassigned.length) {
      unassigned.forEach((kid) => {
        rows.push(["UNASSIGNED", "", kid.first_name, kid.last_name, kid.grade || "", age(kid.date_of_birth), kid.date_of_birth || ""]);
      });
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const weekName = divWeeks.find((w) => w.id === selWeek)?.name || "week";
    const divName = currentDiv?.name || "division";
    a.href = url;
    a.download = `bunks-${divName}-${weekName}.csv`.replace(/\s+/g, "-").toLowerCase();
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Drag handlers ──
  const handleDragStart = (e, childId) => {
    setDragChild(childId);
    dragRef.current = childId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", childId);
  };
  const handleDragOver = (e, bunkId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverBunk(bunkId);
  };
  const handleDragLeave = () => { setDragOverBunk(null); };
  const handleDrop = (e, bunkId) => {
    e.preventDefault();
    setDragOverBunk(null);
    const childId = dragRef.current || e.dataTransfer.getData("text/plain");
    if (childId && bunkId) assignChild(childId, bunkId);
    setDragChild(null);
    dragRef.current = null;
  };
  const handleDropUnassign = (e) => {
    e.preventDefault();
    setDragOverBunk(null);
    const childId = dragRef.current || e.dataTransfer.getData("text/plain");
    if (childId) unassignChild(childId);
    setDragChild(null);
    dragRef.current = null;
  };

  // ── Child pill component ──
  const ChildPill = ({ child, isDragging }) => (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, child.id)}
      onDragEnd={() => { setDragChild(null); setDragOverBunk(null); }}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 10px", borderRadius: 8,
        background: dragChild === child.id ? colors.forestPale : colors.white,
        border: `1px solid ${dragChild === child.id ? colors.forest : colors.border}`,
        cursor: "grab", fontSize: 13, fontWeight: 500,
        opacity: dragChild === child.id ? 0.5 : 1,
        transition: "all .15s",
        userSelect: "none",
      }}
    >
      <span style={{ color: colors.text }}>{child.first_name} {child.last_name}</span>
      {child.grade && <span style={{ fontSize: 11, color: colors.textLight, fontWeight: 400 }}>{child.grade}</span>}
      <span style={{ fontSize: 11, color: colors.textLight, fontWeight: 400, marginLeft: "auto" }}>
        {age(child.date_of_birth) ? `${age(child.date_of_birth)}y` : ""}
      </span>
    </div>
  );

  // ── No division selected ──
  if (!selDiv) {
    return <div style={{ padding: 40, textAlign: "center", color: colors.textMid }}>No divisions configured yet.</div>;
  }

  const currentWeek = divWeeks.find((w) => w.id === selWeek);

  return (
    <div>
      {/* ── Header bar: division picker, week picker, actions ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20 }}>
        {/* Division picker */}
        <div>
          <label style={{ ...s.label, marginBottom: 4 }}>Division</label>
          <select value={selDiv} onChange={(e) => { setSelDiv(e.target.value); setSelWeek(""); }}
            style={{ ...s.input, width: "auto", minWidth: 160 }}>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {/* Week picker */}
        <div>
          <label style={{ ...s.label, marginBottom: 4 }}>Week</label>
          <select value={selWeek} onChange={(e) => setSelWeek(e.target.value)}
            style={{ ...s.input, width: "auto", minWidth: 180 }}>
            {divWeeks.map((w) => <option key={w.id} value={w.id}>{w.name} ({fmt(w.start_date)})</option>)}
          </select>
        </div>
        {/* Spacer */}
        <div style={{ flex: 1 }} />
        {/* Actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingTop: 18 }}>
          <button onClick={copyFromPrev} disabled={saving || !selWeek}
            style={{ ...s.btn("secondary"), fontSize: 13, padding: "8px 14px" }}>
            {saving ? <Spinner size={14} /> : "Copy from Prev Week"}
          </button>
          <button onClick={exportCSV} disabled={!selWeek}
            style={{ ...s.btn("secondary"), fontSize: 13, padding: "8px 14px" }}>
            {Icons.download({ size: 14 })} Export CSV
          </button>
          <button onClick={() => setBunkModal("new")}
            style={{ ...s.btn("primary"), fontSize: 13, padding: "8px 14px" }}>
            {Icons.plus({ size: 14, color: "#fff" })} New Bunk
          </button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      {selWeek && (
        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ ...s.card, padding: "12px 20px", flex: "0 0 auto" }}>
            <span style={{ fontSize: 12, color: colors.textMid, fontWeight: 600 }}>Registered</span>
            <span style={{ fontFamily: font.display, fontSize: 22, color: colors.forest, marginLeft: 10 }}>{divChildren.length}</span>
          </div>
          <div style={{ ...s.card, padding: "12px 20px", flex: "0 0 auto" }}>
            <span style={{ fontSize: 12, color: colors.textMid, fontWeight: 600 }}>Assigned</span>
            <span style={{ fontFamily: font.display, fontSize: 22, color: colors.forest, marginLeft: 10 }}>{assignedIds.size}</span>
          </div>
          <div style={{ ...s.card, padding: "12px 20px", flex: "0 0 auto" }}>
            <span style={{ fontSize: 12, color: colors.textMid, fontWeight: 600 }}>Unassigned</span>
            <span style={{ fontFamily: font.display, fontSize: 22, color: unassigned.length ? colors.amber : colors.forest, marginLeft: 10 }}>{unassigned.length}</span>
          </div>
          <div style={{ ...s.card, padding: "12px 20px", flex: "0 0 auto" }}>
            <span style={{ fontSize: 12, color: colors.textMid, fontWeight: 600 }}>Bunks</span>
            <span style={{ fontFamily: font.display, fontSize: 22, color: colors.forest, marginLeft: 10 }}>{bunks.length}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}><Spinner size={28} /></div>
      ) : !selWeek ? (
        <div style={{ padding: 40, textAlign: "center", color: colors.textMid }}>Select a week to manage bunk assignments.</div>
      ) : (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* ── LEFT: Unassigned pool ── */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverBunk("pool"); }}
            onDragLeave={() => setDragOverBunk(null)}
            onDrop={handleDropUnassign}
            style={{
              width: 260, minWidth: 220, flexShrink: 0,
              background: dragOverBunk === "pool" ? colors.amberLight : colors.bg,
              border: `2px dashed ${dragOverBunk === "pool" ? colors.amber : colors.border}`,
              borderRadius: 12, padding: 16,
              transition: "all .15s",
              maxHeight: "calc(100vh - 280px)", overflowY: "auto",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.textMid, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Unassigned ({unassigned.length})
            </div>
            {unassigned.length === 0 ? (
              <div style={{ fontSize: 13, color: colors.textLight, padding: "20px 0", textAlign: "center" }}>
                All kids assigned!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {unassigned.map((c) => <ChildPill key={c.id} child={c} />)}
              </div>
            )}
          </div>

          {/* ── RIGHT: Bunks grid ── */}
          <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", alignContent: "flex-start" }}>
            {bunks.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: colors.textMid, width: "100%" }}>
                No bunks yet — create one to get started.
              </div>
            ) : (
              bunks.map((bunk) => {
                const bunkKids = assignments
                  .filter((a) => a.bunk_id === bunk.id)
                  .map((a) => children.find((c) => c.id === a.child_id))
                  .filter(Boolean)
                  .sort((a, b) => a.last_name.localeCompare(b.last_name));
                const atCapacity = isPreschool && bunk.capacity && bunkKids.length >= bunk.capacity;
                const isOver = dragOverBunk === bunk.id;

                return (
                  <div
                    key={bunk.id}
                    onDragOver={(e) => handleDragOver(e, bunk.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, bunk.id)}
                    style={{
                      ...s.card,
                      width: "calc(50% - 8px)", minWidth: 280,
                      padding: 0, overflow: "hidden",
                      border: `2px solid ${isOver ? (atCapacity ? colors.coral : colors.forest) : colors.border}`,
                      background: isOver ? (atCapacity ? colors.coralLight : colors.forestPale) : colors.white,
                      transition: "all .15s",
                    }}
                  >
                    {/* Bunk header */}
                    <div style={{
                      padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
                      borderBottom: `1px solid ${colors.borderLight}`,
                      background: colors.bg,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: font.display, fontSize: 17, color: colors.forest }}>{bunk.name}</div>
                        {bunk.staff_name && (
                          <div style={{ fontSize: 12, color: colors.textMid, marginTop: 2 }}>{bunk.staff_name}</div>
                        )}
                      </div>
                      {/* Capacity badge */}
                      {isPreschool && bunk.capacity ? (
                        <span style={{
                          ...s.badge(atCapacity ? colors.coral : colors.forest),
                          fontSize: 11,
                        }}>
                          {bunkKids.length}/{bunk.capacity}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: colors.textLight, fontWeight: 600 }}>{bunkKids.length}</span>
                      )}
                      {/* Edit / Delete */}
                      <button onClick={() => setBunkModal(bunk)}
                        style={{ ...s.btn("ghost"), padding: 4, minWidth: 0 }}>
                        {Icons.clipboard({ size: 14, color: colors.textMid })}
                      </button>
                      <button onClick={() => deleteBunk(bunk.id)}
                        style={{ ...s.btn("ghost"), padding: 4, minWidth: 0 }}>
                        {Icons.x({ size: 14, color: colors.coral })}
                      </button>
                    </div>
                    {/* Bunk kids */}
                    <div style={{ padding: 12, minHeight: 48, display: "flex", flexDirection: "column", gap: 6 }}>
                      {bunkKids.length === 0 ? (
                        <div style={{ fontSize: 13, color: colors.textLight, textAlign: "center", padding: "12px 0" }}>
                          Drag kids here
                        </div>
                      ) : (
                        bunkKids.map((c) => <ChildPill key={c.id} child={c} />)
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Bunk Modal (create/edit) ── */}
      {bunkModal && (
        <BunkModal
          bunk={bunkModal === "new" ? null : bunkModal}
          isPreschool={isPreschool}
          onClose={() => setBunkModal(null)}
          onSave={saveBunk}
          saving={saving}
        />
      )}
    </div>
  );
}

// ── Bunk Create/Edit Modal ──
function BunkModal({ bunk, isPreschool, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    name: bunk?.name || "",
    staff_name: bunk?.staff_name || "",
    capacity: bunk?.capacity || "",
    sort_order: bunk?.sort_order || 0,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal onClose={onClose} title={bunk ? `Edit ${bunk.name}` : "New Bunk"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={s.label}>Bunk Name *</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Bunk Aleph" style={s.input} />
        </div>
        <div>
          <label style={s.label}>Staff / Counselor</label>
          <input value={form.staff_name} onChange={(e) => set("staff_name", e.target.value)}
            placeholder="e.g. Moshe K." style={s.input} />
        </div>
        {isPreschool && (
          <div>
            <label style={s.label}>Capacity (max kids)</label>
            <input type="number" min="1" value={form.capacity} onChange={(e) => set("capacity", e.target.value)}
              placeholder="e.g. 12" style={s.input} />
          </div>
        )}
        <div>
          <label style={s.label}>Sort Order</label>
          <input type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)}
            style={s.input} />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={s.btn("secondary")}>Cancel</button>
          <button
            onClick={() => {
              if (!form.name.trim()) return alert("Bunk name is required");
              onSave({
                name: form.name.trim(),
                staff_name: form.staff_name.trim() || null,
                capacity: form.capacity ? parseInt(form.capacity, 10) : null,
                sort_order: parseInt(form.sort_order, 10) || 0,
              });
            }}
            disabled={saving}
            style={s.btn("primary")}
          >
            {saving ? <Spinner size={14} /> : bunk ? "Save Changes" : "Create Bunk"}
          </button>
        </div>
      </div>
    </Modal>
  );
}