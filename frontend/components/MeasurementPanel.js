import { useEffect, useState } from "react";
import axios from "axios";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

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

function parseMultiplier(v) {
  if (v === undefined || v === null || String(v).trim() === "") return 1;
  const n = parseFloat(v);
  if (isNaN(n)) return NaN;
  return n === 0 ? 1 : n;
}

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
  id: null,
  localId: "",
  sequence: null,
  desc: "",
  meas: "",
  num: "",
  len: "",
  brd: "",
  hgt: "",
  qty: null,
  measErr: false,
  dirty: false,
};

const QTY_FIELDS = ["meas", "num", "len", "brd", "hgt"];

function mapDbRows(dbRows) {
  const ordered = [...dbRows].sort((a, b) => {
    const seqA = Number(a.Sequence ?? 999999);
    const seqB = Number(b.Sequence ?? 999999);
    if (seqA !== seqB) return seqA - seqB;
    return Number(a.MeasurementId) - Number(b.MeasurementId);
  });
  return ordered.map((r, idx) => {
    const base = {
      ...measurementRowBase,
      id: r.MeasurementId,
      localId: uid(),
      sequence: r.Sequence != null ? Number(r.Sequence) : idx + 1,
      desc: r.Description ?? "",
      meas: r.Expression ?? "",
      num: r.Number != null ? String(r.Number) : "",
      len: r.Length != null ? String(r.Length) : "",
      brd: r.Breadth != null ? String(r.Breadth) : "",
      hgt: r.Height != null ? String(r.Height) : "",
      dirty: false,
    };
    const result = computeQty(base);
    return {
      ...base,
      qty: r.Quantity != null ? Number(r.Quantity) : result.val,
      measErr: result.err,
    };
  });
}

function MeasurementPanel({ item, projectId, subWorkId }) {
  const [rows, setRows] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState({});
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState("");
  const [dragLocalId, setDragLocalId] = useState(null);

  const reloadRows = async () => {
    const res = await axios.get(`${API_BASE}/api/measurements`, {
      params: { workAbstractId: item.WorkAbstractId },
    });
    const dbRows = Array.isArray(res.data?.data) ? res.data.data : [];
    setRows([...mapDbRows(dbRows), { ...measurementRowBase, localId: uid() }]);
  };

  useEffect(() => {
    if (!projectId || !subWorkId || !item?.WorkAbstractId) {
      setRows([{ ...measurementRowBase, localId: uid() }]);
      return;
    }
    axios
      .get(`${API_BASE}/api/measurements`, {
        params: { workAbstractId: item.WorkAbstractId },
      })
      .then((res) => {
        const dbRows = Array.isArray(res.data?.data) ? res.data.data : [];
        setRows([...mapDbRows(dbRows), { ...measurementRowBase, localId: uid() }]);
      })
      .catch((err) => {
        console.error("Failed to load measurements:", err);
        setRows([{ ...measurementRowBase, localId: uid() }]);
      });
  }, [item?.WorkAbstractId, projectId, subWorkId]);

  const updateField = (localId, field, value) => {
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.localId !== localId) return r;
        const next = { ...r, [field]: value, dirty: true };
        if (QTY_FIELDS.includes(field)) {
          const result = computeQty(next);
          next.qty = result.val;
          next.measErr = result.err;
        }
        return next;
      });

      const lastRow = updated[updated.length - 1];
      const lastRowHasContent =
        lastRow.desc.trim() ||
        lastRow.meas.trim() ||
        lastRow.num.trim() ||
        lastRow.len.trim() ||
        lastRow.brd.trim() ||
        lastRow.hgt.trim();
      if (lastRow.localId === localId && lastRowHasContent) {
        return [...updated, { ...measurementRowBase, localId: uid() }];
      }
      return updated;
    });
  };

  const persistOrder = async (nextRows) => {
    const saved = nextRows.filter((r) => r.id !== null);
    if (!saved.length) return;
    setReordering(true);
    setError("");
    try {
      await axios.put(`${API_BASE}/api/measurements/reorder`, {
        workAbstractId: item.WorkAbstractId,
        orderedIds: saved.map((r) => r.id),
      });
      const blank = nextRows.filter((r) => r.id === null);
      const reSeq = saved.map((r, idx) => ({
        ...r,
        sequence: idx + 1,
        dirty: r.dirty,
      }));
      setRows([
        ...reSeq,
        ...(blank.length
          ? blank
          : [{ ...measurementRowBase, localId: uid() }]),
      ]);
    } catch (err) {
      setError(
        `Reorder failed: ${err.response?.data?.message || err.message}`,
      );
      try {
        await reloadRows();
      } catch {
        /* ignore */
      }
    } finally {
      setReordering(false);
    }
  };

  const moveRow = (fromLocalId, toLocalId) => {
    if (!fromLocalId || !toLocalId || fromLocalId === toLocalId) return;
    setRows((prev) => {
      const blankRows = prev.filter((r) => r.id === null);
      const savedRows = prev.filter((r) => r.id !== null);
      const fromIdx = savedRows.findIndex((r) => r.localId === fromLocalId);
      const toIdx = savedRows.findIndex((r) => r.localId === toLocalId);
      if (fromIdx < 0 || toIdx < 0) return prev;

      const nextSaved = [...savedRows];
      const [moved] = nextSaved.splice(fromIdx, 1);
      nextSaved.splice(toIdx, 0, moved);
      const next = [
        ...nextSaved,
        ...(blankRows.length
          ? blankRows
          : [{ ...measurementRowBase, localId: uid() }]),
      ];

      // Persist after state update
      queueMicrotask(() => persistOrder(next));
      return next;
    });
  };

  const deleteRow = async (localId) => {
    const row = rows.find((r) => r.localId === localId);
    if (!row) return;
    if (row.id === null) {
      setRows((prev) => {
        const next = prev.filter((r) => r.localId !== localId);
        return next.length
          ? next
          : [{ ...measurementRowBase, localId: uid() }];
      });
      return;
    }
    if (!window.confirm("Delete this measurement permanently?")) return;
    setDeleting((d) => ({ ...d, [localId]: true }));
    try {
      await axios.delete(`${API_BASE}/api/measurements/${row.id}`);
      await reloadRows();
    } catch (err) {
      setError(`Delete failed: ${err.response?.data?.message || err.message}`);
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

  const saveAll = async () => {
    const toSave = rows.filter((r) => r.dirty && rowHasContent(r));
    if (!toSave.length) {
      setError("Nothing new to save.");
      return;
    }
    setError("");
    setSaving(true);

    let savedCount = 0;
    let failed = 0;
    let firstError = "";

    // Save sequentially so Sequence becomes 1, 2, 3… (not all 1)
    for (const row of toSave) {
      const payload = {
        workAbstractId: item.WorkAbstractId,
        description: row.desc || "",
        expression: row.meas,
        number: row.num.trim() === "" ? null : parseFloat(row.num),
        length: row.len.trim() === "" ? null : parseFloat(row.len),
        breadth: row.brd.trim() === "" ? null : parseFloat(row.brd),
        height: row.hgt.trim() === "" ? null : parseFloat(row.hgt),
        quantity: row.qty,
      };
      try {
        if (row.id === null) {
          await axios.post(`${API_BASE}/api/insert-work-measurements`, payload);
        } else {
          await axios.put(
            `${API_BASE}/api/update-work-measurements/${row.id}`,
            payload,
          );
        }
        savedCount += 1;
      } catch (err) {
        failed += 1;
        if (!firstError) {
          firstError =
            err.response?.data?.message || err.message || "Save failed.";
        }
      }
    }

    if (savedCount > 0) {
      alert(`${savedCount} measurement(s) saved successfully.`);
      try {
        await reloadRows();
      } catch (reloadErr) {
        console.error("Failed to reload measurements:", reloadErr);
      }
    }
    if (failed) {
      setError(`${failed} row(s) failed to save: ${firstError}`);
    }

    setSaving(false);
  };

  const total = (rows ?? []).reduce((sum, r) => {
    if (!rowHasContent(r)) return sum;
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
    // Seq | drag | Description | Measurements | No | L | B | H | = | Qty | delete
    rowGrid:
      "36px 28px minmax(0,1.2fr) minmax(0,1.3fr) 52px 52px 52px 52px 22px 90px 30px",
    row: {
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
    rowDragging: {
      opacity: 0.55,
      borderLeft: "3px solid #EF9F27",
      background: "#fffdf5",
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
    dragHandle: {
      cursor: "grab",
      color: "#8fa0b5",
      fontSize: 16,
      textAlign: "center",
      userSelect: "none",
      lineHeight: 1,
    },
    seqBadge: {
      fontSize: 12,
      fontWeight: 700,
      color: "#185FA5",
      textAlign: "center",
      fontFamily: "monospace",
    },
  };

  if (rows === null) {
    return (
      <tr>
        <td colSpan={8} style={{ ...s.cell, color: "#8fa0b5", fontSize: 13 }}>
          Loading measurements…
        </td>
      </tr>
    );
  }

  const dirtyCount = rows.filter((r) => r.dirty && rowHasContent(r)).length;

  return (
    <tr>
      <td colSpan={8} style={s.cell}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#3a6fbf",
            marginBottom: 6,
            letterSpacing: "0.03em",
          }}
        >
          📐 MEASUREMENTS — Item #{item.ItemId} · {item.ItemNumber}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#5d6c7a",
            marginBottom: 10,
          }}
        >
          Drag ⠿ to change sequence. Sequence starts at 1 for this item.
          Empty No./L/B/H are treated as 1 when calculating quantity.
          {reordering ? " Updating sequence…" : ""}
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

        <div style={{ overflowX: "auto", minWidth: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: s.rowGrid,
            gap: 6,
            padding: "0 10px 4px",
            minWidth: 820,
          }}
        >
          <span style={{ ...s.colHdr, textAlign: "center" }}>Seq</span>
          <span />
          <span style={s.colHdr}>Description</span>
          <span style={s.colHdr}>Measurements</span>
          <span style={{ ...s.colHdr, textAlign: "right" }}>No.</span>
          <span style={{ ...s.colHdr, textAlign: "right" }}>L</span>
          <span style={{ ...s.colHdr, textAlign: "right" }}>B</span>
          <span style={{ ...s.colHdr, textAlign: "right" }}>H</span>
          <span />
          <span style={{ ...s.colHdr, textAlign: "right" }}>Quantity</span>
          <span />
        </div>

        {rows.map((r) => {
          const isSaved = r.id !== null;
          const displaySeq = isSaved ? r.sequence ?? "" : "";
          return (
            <div
              key={r.localId}
              onDragOver={(e) => {
                if (!isSaved || !dragLocalId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromId =
                  e.dataTransfer.getData("text/plain") || dragLocalId;
                moveRow(fromId, r.localId);
                setDragLocalId(null);
              }}
              style={{
                ...s.row,
                gridTemplateColumns: s.rowGrid,
                minWidth: 820,
                ...(dragLocalId === r.localId ? s.rowDragging : null),
              }}
            >
              <span style={s.seqBadge}>{displaySeq || "—"}</span>
              <span
                draggable={isSaved && !reordering}
                onDragStart={(e) => {
                  if (!isSaved) return;
                  setDragLocalId(r.localId);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", r.localId);
                }}
                onDragEnd={() => setDragLocalId(null)}
                style={{
                  ...s.dragHandle,
                  cursor: isSaved ? "grab" : "default",
                  opacity: isSaved ? 1 : 0.25,
                }}
                title={
                  isSaved
                    ? "Drag to reorder"
                    : "Save row before reordering"
                }
              >
                ⠿
              </span>
              <input
                type="text"
                placeholder="Description (Optional)"
                value={r.desc}
                style={s.inputBase}
                onChange={(e) => updateField(r.localId, "desc", e.target.value)}
              />
              <input
                type="text"
                placeholder="Can Enter Expression Here"
                value={r.meas}
                title="Measurements expression — multiplied with No./L/B/H"
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
                placeholder=""
                value={r.num}
                title="Number (empty = 1)"
                style={s.smallInput}
                onChange={(e) => updateField(r.localId, "num", e.target.value)}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder=""
                value={r.len}
                title="Length (empty = 1)"
                style={s.smallInput}
                onChange={(e) => updateField(r.localId, "len", e.target.value)}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder=""
                value={r.brd}
                title="Breadth (empty = 1)"
                style={s.smallInput}
                onChange={(e) => updateField(r.localId, "brd", e.target.value)}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder=""
                value={r.hgt}
                title="Height (empty = 1)"
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
                title={r.id !== null ? "Delete" : "Remove row"}
                disabled={deleting[r.localId]}
                style={s.iconBtn("#cc2222")}
                onClick={() => deleteRow(r.localId)}
              >
                🗑
              </button>
            </div>
          );
        })}
        </div>

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
