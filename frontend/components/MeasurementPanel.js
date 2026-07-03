import { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = "http://localhost:4000" || "https://estimate-project-omega.vercel.app";

/** Evaluate a math string like "3.5+2.1*1.8" safely. */
function calcExpr(expr) {
  try {
    const clean = String(expr).replace(/[^0-9+\-*/.() ]/g, "");
    if (!clean.trim()) return { val: null, err: false };
    // eslint-disable-next-line no-new-func
    const v = Function('"use strict"; return (' + clean + ")")();
    if (!isFinite(v) || isNaN(v)) return { val: null, err: true };
    return { val: parseFloat(v.toFixed(4)), err: false };
  } catch {
    return { val: null, err: true };
  }
}

function uid() {
  return "r" + Math.random().toString(36).slice(2, 9);
}

/**
 * Turn a Number/Length/Breadth/Height field value into a multiplier.
 * Blank  -> 1 (so leaving it empty doesn't zero out the quantity)
 * 0      -> 1 (treated the same as blank, per user's request)
 * Non-numeric text -> NaN (treated as an error upstream)
 */
function parseMultiplier(v) {
  if (v === undefined || v === null || String(v).trim() === "") return 1;
  const n = parseFloat(v);
  if (isNaN(n)) return NaN;
  return n === 0 ? 1 : n;
}

/**
 * Quantity = expression(me) * Number * Length * Breadth * Height
 * - If the expression box is empty, "me" is treated as 1 (so N*L*B*H alone still works).
 * - If the expression box has content but doesn't evaluate, that's an error.
 * - Any non-numeric N/L/B/H is an error.
 */
function computeQty(row) {
  const exprResult = calcExpr(row.meas);
  if (row.meas.trim() && exprResult.err) return { val: null, err: true };
  const meVal = row.meas.trim() ? exprResult.val : 1;

  const n = parseMultiplier(row.num);
  const l = parseMultiplier(row.len);
  const b = parseMultiplier(row.brd);
  const h = parseMultiplier(row.hgt);

  if ([n, l, b, h].some((x) => isNaN(x))) return { val: null, err: true };

  const total = meVal * n * l * b * h;
  if (!isFinite(total)) return { val: null, err: true };
  return { val: parseFloat(total.toFixed(4)), err: false };
}

const measurementRowBase = {
  id: null, // DB primary key — null means not yet saved
  localId: "", // stable React key
  desc: "",
  meas: "", // expression, raw math string e.g. "3.5+2.1+1.8"
  num: "", // Number (No.)
  len: "", // Length
  brd: "", // Breadth
  hgt: "", // Height
  qty: null, // computed result
  measErr: false,
  saved: false, // true = persisted in DB and currently read-only
  editing: false, // true = was saved but user clicked edit pencil
};

const EDITABLE_FIELDS = ["meas", "num", "len", "brd", "hgt"];

// ─────────────────────────────────────────────────────────────────────────────
// MeasurementPanel
// Renders as a <tr> directly inside the parent <tbody>.
// Loads existing DB rows on mount, lets user add / edit / delete rows.
// Each row: Description | Expression | No. | L | B | H | = Computed qty | Save | Delete
// Quantity = Expression * No. * L * B * H  (blank multiplier fields count as 1)
// ─────────────────────────────────────────────────────────────────────────────

function MeasurementPanel({ item, projectId, subWorkId }) {
  const [rows, setRows] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId || !subWorkId || !item?.ItemId) {
      setRows([]);
      return;
    }
    axios
      .get(`${API_BASE}/api/measurements`, {
        params: { workAbstractId: item.WorkAbstractId },
      })
      .then((res) => {
        const dbRows = Array.isArray(res.data?.data) ? res.data.data : [];
        const loaded = dbRows.map((r) => {
          const base = {
            ...measurementRowBase,
            id: r.MeasurementId,
            localId: uid(),
            desc: r.Description ?? "",
            meas: r.Measurements ?? "",
            // NOTE: adjust these field names to match whatever your
            // backend actually returns for Number/Length/Breadth/Height.
            num: r.Number != null ? String(r.Number) : "",
            len: r.Length != null ? String(r.Length) : "",
            brd: r.Breadth != null ? String(r.Breadth) : "",
            hgt: r.Height != null ? String(r.Height) : "",
            saved: true,
          };
          const result = computeQty(base);
          return { ...base, qty: r.quantity ?? result.val, measErr: result.err };
        });
        // Always end with one blank input row
        setRows([...loaded, { ...measurementRowBase, localId: uid() }]);
      })
      .catch((err) => {
        console.error("Failed to load measurements:", err);
        setRows([{ ...measurementRowBase, localId: uid() }]);
      });
  }, [item?.ItemId, projectId, subWorkId]);

  // Auto-add a new blank row when user types in the last row
  const updateField = (localId, field, value) => {
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.localId !== localId) return r;
        const next = { ...r, [field]: value };
        if (EDITABLE_FIELDS.includes(field)) {
          const result = computeQty(next);
          next.qty = result.val;
          next.measErr = result.err;
        }
        return next;
      });

      // If the user just typed in the last row, append a new blank row
      const lastRow = updated[updated.length - 1];
      const lastRowHasContent =
        lastRow.desc.trim() ||
        lastRow.meas.trim() ||
        lastRow.num.trim() ||
        lastRow.len.trim() ||
        lastRow.brd.trim() ||
        lastRow.hgt.trim();
      if (lastRow.localId === localId && !lastRow.saved && lastRowHasContent) {
        return [...updated, { ...measurementRowBase, localId: uid() }];
      }
      return updated;
    });
  };

  const startEdit = (localId) =>
    setRows((prev) =>
      prev.map((r) =>
        r.localId === localId ? { ...r, editing: true, saved: false } : r,
      ),
    );

  const cancelEdit = (localId) =>
    setRows((prev) =>
      prev
        .map((r) => {
          if (r.localId !== localId) return r;
          return r.id !== null ? { ...r, editing: false, saved: true } : null;
        })
        .filter(Boolean),
    );

  const deleteRow = async (localId) => {
    const row = rows.find((r) => r.localId === localId);
    if (!row) return;
    if (row.id === null) {
      setRows((prev) => prev.filter((r) => r.localId !== localId));
      return;
    }
    if (!window.confirm("Delete this measurement permanently?")) return;
    setDeleting((d) => ({ ...d, [localId]: true }));
    try {
      await axios.delete(`${API_BASE}/api/measurements/${row.id}`);
      setRows((prev) => prev.filter((r) => r.localId !== localId));
    } catch (err) {
      setError(`Delete failed: ${err.message}`);
    } finally {
      setDeleting((d) => ({ ...d, [localId]: false }));
    }
  };

  const rowHasContent = (r) =>
    r.desc.trim() ||
    r.meas.trim() ||
    r.num.trim() ||
    r.len.trim() ||
    r.brd.trim() ||
    r.hgt.trim();

  // Save ALL unsaved/editing rows in one go
  const saveAll = async () => {
    const toSave = rows.filter((r) => (!r.saved || r.editing) && rowHasContent(r));
    if (!toSave.length) {
      setError("Nothing new to save.");
      return;
    }
    setError("");
    setSaving(true);

    const results = await Promise.allSettled(
      toSave.map(async (row) => {
        const payload = {
          workAbstractId: item.WorkAbstractId,
          description: row.desc,
          expression: row.meas, // expression text, evaluated server-side too if needed
          number: row.num.trim() === "" ? null : parseFloat(row.num),
          length: row.len.trim() === "" ? null : parseFloat(row.len),
          breadth: row.brd.trim() === "" ? null : parseFloat(row.brd),
          height: row.hgt.trim() === "" ? null : parseFloat(row.hgt),
          quantity: row.qty,
        };

        if (row.id === null) {
          const res = await axios.post(
            `${API_BASE}/api/insert-work-measurements`,
            payload,
          );
          return {
            localId: row.localId,
            newId: res.data?.data?.WorkMeasurementId ?? null,
          };
        } else {
          await axios.put(
            `${API_BASE}/api/update-work-measurements/${row.id}`,
            payload,
          );
          return { localId: row.localId, newId: row.id };
        }
      }),
    );

    const errors = [];
    setRows((prev) =>
      prev.map((r) => {
        const match = results.find(
          (res) =>
            res.status === "fulfilled" && res.value.localId === r.localId,
        );
        if (match) {
          return { ...r, id: match.value.newId, saved: true, editing: false };
        }
        const failed = results.find(
          (res) =>
            res.status === "rejected" && res.reason?.localId === r.localId,
        );
        if (failed) errors.push(r.localId);
        return r;
      }),
    );

    const savedCount = results.filter((r) => r.status === "fulfilled").length;
    if (savedCount > 0)
      alert(`${savedCount} measurement(s) saved successfully.`);
    if (errors.length) setError(`${errors.length} row(s) failed to save.`);

    setSaving(false);
  };

  const total = (rows ?? []).reduce((sum, r) => {
    const res = computeQty(r);
    return sum + (res.val ?? 0);
  }, 0);

  const s = {
    cell: {
      background: "#f4f8ff",
      padding: "14px 18px",
      borderBottom: "2px solid #c5d5ee",
      verticalAlign: "top",
    },
    colHdr: {
      fontSize: 10,
      color: "#8fa0b5",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      paddingBottom: 5,
    },
    inputBase: {
      fontSize: 13,
      padding: "5px 8px",
      height: 32,
      borderRadius: 6,
      border: "1px solid #c5d5ee",
      background: "#fff",
      color: "#24323f",
      width: "100%",
      boxSizing: "border-box",
    },
    smallInput: {
      fontSize: 13,
      padding: "5px 6px",
      height: 32,
      borderRadius: 6,
      border: "1px solid #c5d5ee",
      background: "#fff",
      color: "#24323f",
      width: "100%",
      boxSizing: "border-box",
      textAlign: "right",
    },
    // Description | Expression | No | L | B | H | = | Qty | edit | delete
    savedRowGrid:
      "minmax(0,1.1fr) minmax(0,1.3fr) 52px 52px 52px 52px 22px 90px 30px 30px",
    // Description | Expression | No | L | B | H | = | Qty | cancel
    editRowGrid:
      "minmax(0,1.1fr) minmax(0,1.3fr) 52px 52px 52px 52px 22px 90px 30px",
    savedRow: {
      display: "grid",
      gap: 6,
      alignItems: "center",
      marginBottom: 6,
      padding: "7px 10px",
      background: "#fff",
      border: "0.5px solid #b8d0f0",
      borderLeft: "3px solid #378ADD",
      borderRadius: "0 8px 8px 0",
    },
    editRow: {
      display: "grid",
      gap: 6,
      alignItems: "center",
      marginBottom: 6,
      padding: "7px 10px",
      background: "#fffdf5",
      border: "0.5px solid #e8c87a",
      borderLeft: "3px solid #EF9F27",
      borderRadius: "0 8px 8px 0",
    },
    iconBtn: (color) => ({
      background: "none",
      border: "none",
      cursor: "pointer",
      color,
      fontSize: 15,
      padding: "3px 5px",
      borderRadius: 4,
      lineHeight: 1,
    }),
    saveAllBtn: {
      fontSize: 13,
      padding: "7px 18px",
      borderRadius: 7,
      border: "1px solid #2a7d4f",
      background: "#e6f4ea",
      color: "#2a7d4f",
      cursor: "pointer",
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
    },
    equalsSign: {
      fontSize: 14,
      color: "#9aafbf",
      textAlign: "center",
      userSelect: "none",
    },
    qtyDisplay: {
      fontSize: 13,
      fontWeight: 600,
      textAlign: "right",
      paddingRight: 4,
      color: "#24323f",
    },
  };

  if (rows === null) {
    return (
      <tr>
        <td colSpan="5" style={{ ...s.cell, color: "#8fa0b5", fontSize: 13 }}>
          Loading measurements…
        </td>
      </tr>
    );
  }

  const savedRows = rows.filter((r) => r.saved && !r.editing);
  const activeRows = rows.filter((r) => !r.saved || r.editing);
  const dirtyCount = activeRows.filter(rowHasContent).length;

  return (
    <tr>
      <td colSpan="5" style={s.cell}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#3a6fbf",
            marginBottom: 10,
            letterSpacing: "0.03em",
          }}
        >
          📐 MEASUREMENTS — Item #{item.ItemId} · {item.ItemNumber}
        </div>

        {error && (
          <div
            style={{
              color: "#cc2222",
              fontSize: 12,
              marginBottom: 10,
              padding: "5px 10px",
              background: "#fff0f0",
              borderRadius: 6,
              border: "1px solid #f5c0c0",
            }}
          >
            {error}
          </div>
        )}

        {/* Column headers */}
        {rows.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: s.savedRowGrid,
              gap: 6,
              padding: "0 10px 4px",
            }}
          >
            <span style={s.colHdr}>Description</span>
            <span style={s.colHdr}>Expression</span>
            <span style={{ ...s.colHdr, textAlign: "right" }}>No.</span>
            <span style={{ ...s.colHdr, textAlign: "right" }}>L</span>
            <span style={{ ...s.colHdr, textAlign: "right" }}>B</span>
            <span style={{ ...s.colHdr, textAlign: "right" }}>H</span>
            <span />
            <span style={{ ...s.colHdr, textAlign: "right" }}>Quantity</span>
            <span />
            <span />
          </div>
        )}

        {/* Saved (locked) rows */}
        {savedRows.map((r) => {
          const res = computeQty(r);
          return (
            <div
              key={r.localId}
              style={{ ...s.savedRow, gridTemplateColumns: s.savedRowGrid }}
            >
              <span style={{ fontSize: 13, color: "#24323f" }}>
                {r.desc || <em style={{ color: "#b0c0cf" }}>No description</em>}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "#5d6c7a",
                  fontFamily: "monospace",
                }}
              >
                {r.meas || <em style={{ color: "#b0c0cf" }}>—</em>}
              </span>
              <span style={{ fontSize: 13, textAlign: "right" }}>
                {r.num || "1"}
              </span>
              <span style={{ fontSize: 13, textAlign: "right" }}>
                {r.len || "1"}
              </span>
              <span style={{ fontSize: 13, textAlign: "right" }}>
                {r.brd || "1"}
              </span>
              <span style={{ fontSize: 13, textAlign: "right" }}>
                {r.hgt || "1"}
              </span>
              <span style={s.equalsSign}>=</span>
              <span style={s.qtyDisplay}>
                {res.val !== null ? res.val.toFixed(3) : "—"}
              </span>
              <button
                type="button"
                title="Edit"
                style={s.iconBtn("#5d6c7a")}
                onClick={() => startEdit(r.localId)}
              >
                ✏
              </button>
              <button
                type="button"
                title="Delete"
                disabled={deleting[r.localId]}
                style={s.iconBtn("#cc2222")}
                onClick={() => deleteRow(r.localId)}
              >
                🗑
              </button>
            </div>
          );
        })}

        {/* Divider */}
        {savedRows.length > 0 && activeRows.length > 0 && (
          <div
            style={{
              fontSize: 10,
              color: "#b0c0cf",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "6px 4px 4px",
            }}
          >
            New / editing entries
          </div>
        )}

        {/* Active / editable rows — no per-row Save button */}
        {activeRows.map((r) => (
          <div
            key={r.localId}
            style={{ ...s.editRow, gridTemplateColumns: s.editRowGrid }}
          >
            <input
              type="text"
              placeholder="Description…"
              value={r.desc}
              style={s.inputBase}
              onChange={(e) => updateField(r.localId, "desc", e.target.value)}
            />
            <input
              type="text"
              placeholder="e.g. 3.5+2.1+1.8  or  4*(2.5+1.2)"
              value={r.meas}
              title="Mathematical expression — multiplied with No./L/B/H below"
              style={{
                ...s.inputBase,
                fontFamily: "monospace",
                borderColor: r.measErr ? "#cc2222" : "#c5d5ee",
              }}
              onChange={(e) => updateField(r.localId, "meas", e.target.value)}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="1"
              value={r.num}
              title="Number"
              style={s.smallInput}
              onChange={(e) => updateField(r.localId, "num", e.target.value)}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="1"
              value={r.len}
              title="Length"
              style={s.smallInput}
              onChange={(e) => updateField(r.localId, "len", e.target.value)}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="1"
              value={r.brd}
              title="Breadth"
              style={s.smallInput}
              onChange={(e) => updateField(r.localId, "brd", e.target.value)}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="1"
              value={r.hgt}
              title="Height"
              style={s.smallInput}
              onChange={(e) => updateField(r.localId, "hgt", e.target.value)}
            />
            <span style={s.equalsSign}>=</span>
            <div
              style={{
                ...s.qtyDisplay,
                color: r.measErr ? "#cc2222" : "#24323f",
              }}
            >
              {r.measErr ? "Invalid" : r.qty !== null ? r.qty.toFixed(3) : "—"}
            </div>
            <button
              type="button"
              title={r.id !== null ? "Cancel edit" : "Remove row"}
              style={s.iconBtn("#cc2222")}
              onClick={() => cancelEdit(r.localId)}
            >
              ✕
            </button>
          </div>
        ))}

        {/* Footer: single Save All + Total */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <button
            type="button"
            style={{
              ...s.saveAllBtn,
              opacity: dirtyCount === 0 ? 0.5 : 1,
              cursor: dirtyCount === 0 ? "default" : "pointer",
            }}
            disabled={saving || dirtyCount === 0}
            onClick={saveAll}
          >
            {saving
              ? "Saving…"
              : `✓ Save measurements${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
          </button>

          {rows.filter(rowHasContent).length > 0 && (
            <div
              style={{
                padding: "6px 14px",
                background: "#ddeeff",
                borderRadius: 8,
                display: "flex",
                gap: 16,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#185FA5" }}>Σ Total quantity</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#185FA5" }}>
                {total > 0 ? total.toFixed(3) : "—"}
              </span>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export default MeasurementPanel;