import { useEffect, useState } from "react";
import axios from "axios";

const REMARKS_MAX = 200;

function uid() {
  return `wmg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function WorkMeasurementGroupsPanel({
  apiBase,
  userId,
  workId,
  subWorkId,
  reloadToken = 0,
  onClose,
}) {
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragId, setDragId] = useState(null);

  const canUse = Boolean(userId && workId && subWorkId);

  const loadAll = async () => {
    if (!canUse) return;
    setLoading(true);
    setError("");
    try {
      const catalogRes = await axios.get(
        `${apiBase}/api/work-measurement-groups/catalog`,
        { params: { userId } },
      );
      const catalogRows = Array.isArray(catalogRes.data?.data)
        ? catalogRes.data.data
        : [];

      let assignedList = [];
      try {
        const assignedRes = await axios.get(
          `${apiBase}/api/work-measurement-groups`,
          { params: { userId, workId, subWorkId } },
        );
        assignedList = Array.isArray(assignedRes.data?.data)
          ? assignedRes.data.data
          : [];
      } catch {
        assignedList = [];
      }

      const assignedByGroupId = new Map(
        assignedList.map((row) => [Number(row.GroupId), row]),
      );
      const orderedMaster = [...catalogRows].sort((a, b) => {
        const savedA = assignedByGroupId.get(Number(a.GroupId));
        const savedB = assignedByGroupId.get(Number(b.GroupId));
        if (savedA && savedB) {
          return (
            Number(savedA.Sequence ?? 999999) - Number(savedB.Sequence ?? 999999)
          );
        }
        if (savedA) return -1;
        if (savedB) return 1;
        return (
          Number(a.Sequence ?? 999999) - Number(b.Sequence ?? 999999) ||
          Number(a.GroupId) - Number(b.GroupId)
        );
      });

      setCatalog(catalogRows);
      setRows(
        orderedMaster.map((group) => {
          const saved = assignedByGroupId.get(Number(group.GroupId));
          const percentageSource = saved
            ? saved.Percentage
            : group.Percentage;
          return {
            localId: uid(),
            workGroupId: saved?.WorkGroupId || null,
            groupId: String(group.GroupId),
            groupName: group.GroupName || "",
            selected: Boolean(saved),
            percentage:
              percentageSource === null || percentageSource === undefined
                ? "0"
                : String(percentageSource),
            remarks: saved?.Remarks ?? group.Remarks ?? "",
          };
        }),
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to load measurement groups.",
      );
      setCatalog([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canUse) return;
    loadAll();
  }, [canUse, userId, workId, subWorkId, apiBase, reloadToken]);

  const updateRow = (localId, field, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.localId !== localId) return row;
        return { ...row, [field]: value };
      }),
    );
    setMessage("");
  };

  const toggleSelected = (localId, checked) => {
    updateRow(localId, "selected", checked);
  };

  const moveRow = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    setRows((prev) => {
      const fromIdx = prev.findIndex((r) => r.localId === fromId);
      const toIdx = prev.findIndex((r) => r.localId === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const shiftRow = (localId, direction) => {
    const fromIdx = rows.findIndex((r) => r.localId === localId);
    const toIdx = fromIdx + direction;
    if (fromIdx < 0 || toIdx < 0 || toIdx >= rows.length) return;
    moveRow(localId, rows[toIdx].localId);
  };

  const onSave = async () => {
    if (!canUse) return;
    const selectedRows = rows.filter((r) => r.selected);
    for (const row of selectedRows) {
      if (!row.groupId) {
        setError("Please select a Group Name for every checked row.");
        return;
      }
      if (!Number.isFinite(Number(row.percentage))) {
        setError("Percentage must be a number.");
        return;
      }
      if (String(row.remarks || "").length > REMARKS_MAX) {
        setError(`Remarks must be at most ${REMARKS_MAX} characters.`);
        return;
      }
    }
    if (
      !window.confirm(
        `Please review the measurement groups.\nDo you want to save ${selectedRows.length} selected group${selectedRows.length === 1 ? "" : "s"} for this Work and Sub Work?`,
      )
    ) {
      setMessage("Save canceled.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await axios.put(`${apiBase}/api/work-measurement-groups`, {
        userId,
        workId,
        subWorkId,
        groups: selectedRows.map((row, idx) => ({
          groupId: Number(row.groupId),
          percentage: Number(row.percentage),
          remarks: row.remarks,
          sequence: idx + 1,
        })),
      });
      setMessage(res.data?.message || "Measurement groups saved.");
      await loadAll();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to save measurement groups.",
      );
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    fontSize: 13,
    padding: "7px 9px",
    borderRadius: 6,
    border: "1px solid #d5dde4",
    background: "#fff",
    width: "100%",
    boxSizing: "border-box",
  };

  if (!canUse) return null;

  return (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            background: "#fff",
            border: "1px solid #d5dde4",
            borderRadius: 10,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              color: "#5B6B7C",
              marginBottom: 10,
            }}
          >
            Check a group to include it for this Work and Sub Work. Previously
            saved groups stay checked. Check more to add, or uncheck to remove.
            You can edit Percentage, Remarks, and sequence, then Save.
          </div>

          {error && (
            <div
              style={{
                color: "#C6362C",
                fontSize: 13,
                marginBottom: 10,
                padding: "8px 12px",
                background: "#FBEAE9",
                borderRadius: 6,
                border: "1px solid #F0C6C2",
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ fontSize: 13, color: "#5B6B7C", fontStyle: "italic" }}>
              Loading groups…
            </div>
          ) : !catalog.length && !rows.length ? (
            <div style={{ fontSize: 13, color: "#5B6B7C", fontStyle: "italic" }}>
              No measurement groups are available for your organization. Add
              them under Add Measurement Groups in the menu first.
            </div>
          ) : (
            <>
              {message && !error && (
                <div
                  style={{
                    color: "#2A7D4F",
                    fontSize: 13,
                    marginBottom: 10,
                    padding: "8px 12px",
                    background: "#E7F5EC",
                    borderRadius: 6,
                    border: "1px solid #C9E6D3",
                  }}
                >
                  {message}
                </div>
              )}

              {rows.length > 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#5B6B7C",
                    marginBottom: 8,
                  }}
                >
                  Sequence applies to checked groups. Drag ⠿ or use ▲ ▼ to
                  change order, then Save.
                </div>
              )}

              <div
                style={{
                  overflowX: "auto",
                  border: "1px solid #E1DCCC",
                  borderRadius: 8,
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#F6F4EC" }}>
                      <th style={{ ...thStyle, width: 44, textAlign: "center" }}>
                        Select
                      </th>
                      <th style={thStyle}>Seq</th>
                      <th style={{ ...thStyle, width: 28 }} />
                      <th style={thStyle}>Group Name</th>
                      <th style={{ ...thStyle, width: 110 }}>Percentage</th>
                      <th style={thStyle}>Remarks</th>
                      <th style={{ ...thStyle, width: 72 }}>Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? (
                      rows.map((row, idx) => {
                        const selectedSeq = row.selected
                          ? rows
                              .filter((r) => r.selected)
                              .findIndex((r) => r.localId === row.localId) + 1
                          : null;
                        return (
                        <tr
                          key={row.localId}
                          onDragOver={(e) => {
                            if (!dragId) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fromId =
                              e.dataTransfer.getData("text/plain") || dragId;
                            moveRow(fromId, row.localId);
                            setDragId(null);
                          }}
                          style={{
                            ...(dragId === row.localId
                              ? { opacity: 0.55 }
                              : null),
                            ...(row.selected
                              ? { background: "#EAF2FF" }
                              : null),
                          }}
                        >
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(row.selected)}
                              onChange={(e) =>
                                toggleSelected(row.localId, e.target.checked)
                              }
                              title={
                                row.selected
                                  ? "Uncheck to remove this group"
                                  : "Check to add this group"
                              }
                            />
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              textAlign: "center",
                              fontWeight: 700,
                              color: row.selected ? "#2F7DE1" : "#9AA8B5",
                            }}
                          >
                            {selectedSeq ?? "—"}
                          </td>
                          <td
                            draggable
                            onDragStart={(e) => {
                              setDragId(row.localId);
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", row.localId);
                            }}
                            onDragEnd={() => setDragId(null)}
                            title="Drag to reorder"
                            style={{
                              ...tdStyle,
                              cursor: "grab",
                              textAlign: "center",
                              color: "#5B6B7C",
                              userSelect: "none",
                            }}
                          >
                            ⠿
                          </td>
                          <td style={tdStyle}>{row.groupName}</td>
                          <td style={tdStyle}>
                            <input
                              type="number"
                              step="any"
                              value={row.percentage}
                              onChange={(e) =>
                                updateRow(
                                  row.localId,
                                  "percentage",
                                  e.target.value,
                                )
                              }
                              style={inputStyle}
                            />
                          </td>
                          <td style={tdStyle}>
                            <input
                              value={row.remarks}
                              maxLength={REMARKS_MAX}
                              onChange={(e) =>
                                updateRow(row.localId, "remarks", e.target.value)
                              }
                              style={inputStyle}
                            />
                          </td>
                          <td style={tdStyle}>
                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                                alignItems: "center",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => shiftRow(row.localId, -1)}
                                disabled={idx === 0}
                                title="Move up"
                                style={iconBtnStyle}
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => shiftRow(row.localId, 1)}
                                disabled={idx === rows.length - 1}
                                title="Move down"
                                style={iconBtnStyle}
                              >
                                ▼
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={7}
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                            fontStyle: "italic",
                            color: "#5B6B7C",
                          }}
                        >
                          No measurement groups found for this user /
                          organization.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 12,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #2F7DE1",
                    background: saving ? "#9FC0EE" : "#2F7DE1",
                    color: "#fff",
                    cursor: saving ? "default" : "pointer",
                  }}
                >
                  {saving
                    ? "Saving…"
                    : `Save groups (${rows.filter((r) => r.selected).length})`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setMessage("");
                    if (typeof onClose === "function") onClose();
                  }}
                  disabled={saving}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #c8d4df",
                    background: "#fff",
                    color: "#132339",
                    cursor: saving ? "default" : "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#5B6B7C",
  borderBottom: "1px solid #E1DCCC",
};

const tdStyle = {
  padding: "8px 10px",
  borderBottom: "1px solid #F0EEE6",
  verticalAlign: "middle",
};

const iconBtnStyle = {
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 7px",
  borderRadius: 6,
  border: "1px solid #d5dde4",
  background: "#fff",
  cursor: "pointer",
};
