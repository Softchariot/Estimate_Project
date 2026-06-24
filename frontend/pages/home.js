import { useEffect, useState } from "react";
import axios from "axios";
import { TabList, Tabs, Tab, TabPanel } from "@mui/joy";

const API_BASE = "https://estimate-project-omega.vercel.app";

const mastersMenu = [
  { id: "regions", label: "SSR Regions", status: "active" },
  { id: "categories", label: "SSR Categories", status: "active" },
  { id: "units", label: "Units (Upcoming)", status: "upcoming" },
  { id: "materials", label: "Materials (Upcoming)", status: "upcoming" },
  { id: "rates", label: "Rates (Upcoming)", status: "upcoming" },
  { id: "items", label: "SSR Items", status: "active" },
  { id: "projects", label: "Projects Master", status: "active" },
  { id: "sub-work", label: "Sub Work Master", status: "active" },
];

const initialRegionForm = {
  SSRRegionName: "",
  SSRRegionShortName: "",
  DOrder: "",
  DOrder1: "",
  Remarks: "",
};

const initialCategoryForm = {
  SSRRegionId: "",
  SSRCategoryName: "",
  SSRCategoryShortName: "",
  DOrder: "",
  DOrder1: "",
  Remarks: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

const measurementRowBase = {
  id: null, // DB primary key — null means not yet saved
  localId: "", // stable React key
  desc: "",
  meas: "", // raw math string e.g. "3.5+2.1+1.8"
  qty: null, // computed result
  measErr: false,
  saved: false, // true = persisted in DB and currently read-only
  editing: false, // true = was saved but user clicked edit pencil
};

// ─────────────────────────────────────────────────────────────────────────────
// MeasurementPanel
// Renders as a <tr> directly inside the parent <tbody>.
// Loads existing DB rows on mount, lets user add / edit / delete rows.
// Each measurement row has: Description | Math string | = Computed qty | Save | Delete
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
          const result = calcExpr(r.Measurement);
          return {
            ...measurementRowBase,
            id: r.MeasurementId,
            localId: uid(),
            desc: r.Description ?? "",
            meas: r.Measurements ?? "",
            qty: r.quantity,
            saved: true,
          };
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
        if (field === "meas") {
          const result = calcExpr(value);
          next.qty = result.val;
          next.measErr = result.err && value.trim().length > 0;
        }
        return next;
      });

      // If the user just typed in the last row, append a new blank row
      const lastRow = updated[updated.length - 1];
      if (
        lastRow.localId === localId &&
        !lastRow.saved &&
        (lastRow.desc.trim() || lastRow.meas.trim())
      ) {
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

  // Save ALL unsaved/editing rows in one go
  const saveAll = async () => {
    const toSave = rows.filter(
      (r) => (!r.saved || r.editing) && (r.desc.trim() || r.meas.trim()),
    );
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
          measurements: row.meas, // ← was "measurement", backend expects "measurements"
          quantity: row.qty,
        };

        if (row.id === null) {
          const res = await axios.post(
            `${API_BASE}/api/insert-work-measurements`,
            payload,
          );
          return {
            localId: row.localId,
            newId: res.data?.data?.WorkMeasurementId ?? null, // ← matches RETURNING field
          };
        } else {
          await axios.put(
            `${API_BASE}/api/update-work-measurements/${row.id}`, // ← correct PUT route with ID
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

    // ← single alert after all rows are done, not inside the loop
    const savedCount = results.filter((r) => r.status === "fulfilled").length;
    if (savedCount > 0)
      alert(`${savedCount} measurement(s) saved successfully.`);
    if (errors.length) setError(`${errors.length} row(s) failed to save.`);

    setSaving(false);
  };

  const total = (rows ?? []).reduce((sum, r) => {
    const res = calcExpr(r.meas);
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
    savedRow: {
      display: "grid",
      gridTemplateColumns:
        "minmax(0,1.4fr) minmax(0,1.6fr) 30px 100px 36px 36px",
      gap: 8,
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
      gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1.6fr) 30px 100px 36px",
      gap: 8,
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
  // Dirty = has content but not yet saved
  const dirtyCount = activeRows.filter(
    (r) => r.desc.trim() || r.meas.trim(),
  ).length;

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
              gridTemplateColumns:
                "minmax(0,1.4fr) minmax(0,1.6fr) 30px 100px 36px 36px",
              gap: 8,
              padding: "0 10px 4px",
            }}
          >
            <span style={s.colHdr}>Description</span>
            <span style={s.colHdr}>Measurement (math string)</span>
            <span />
            <span style={{ ...s.colHdr, textAlign: "right" }}>Quantity</span>
            <span />
            <span />
          </div>
        )}

        {/* Saved (locked) rows */}
        {savedRows.map((r) => {
          const res = calcExpr(r.meas);
          return (
            <div key={r.localId} style={s.savedRow}>
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
                {r.meas}
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
          <div key={r.localId} style={s.editRow}>
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
              title="Enter a math expression — evaluated as quantity"
              style={{
                ...s.inputBase,
                fontFamily: "monospace",
                borderColor: r.measErr ? "#cc2222" : "#c5d5ee",
              }}
              onChange={(e) => updateField(r.localId, "meas", e.target.value)}
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
            {/* Cancel only for rows that were previously saved (edit mode) */}
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

          {rows.filter((r) => r.meas.trim()).length > 0 && (
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

// ─────────────────────────────────────────────────────────────────────────────
// HomePage
// ─────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [activeMaster, setActiveMaster] = useState("regions");
  const [regionForm, setRegionForm] = useState(initialRegionForm);
  const [categoryForm, setCategoryForm] = useState(initialCategoryForm);
  const [regions, setRegions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [savingRegion, setSavingRegion] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingRegionId, setEditingRegionId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [message, setMessage] = useState("");

  const [itemRegion, setItemRegion] = useState("");
  const [itemCategories, setItemCategories] = useState([]);
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [subCategories, setSubCategories] = useState([]);
  const [subCategoryItemId, setSubCategoryItemId] = useState("");
  const [itemList, setItemList] = useState([]);
  const [projects, setProjects] = useState([]);
  const [subWorks, setSubWorks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(0);
  const [selectedSubWorkId, setSelectedSubWorkId] = useState(0);
  const [selectedItems, setSelectedItems] = useState([]);
  const [checkedItemIds, setCheckedItemIds] = useState([]);
  const [checkedItemsList, setCheckedItemsList] = useState([]);
  const [updateSelectedItems, setUpdateSelectedItems] = useState([]);

  // Which items in the Checked Items tab have their panel open (tied to checkbox)
  const [checkedForMeasurement, setCheckedForMeasurement] = useState(new Set());
  const initialProjectForm = {
    ProjectName: "",
  };

  const [projectForm, setProjectForm] = useState(initialProjectForm);

  const initialSubWorkForm = {
    ProjectId: "",
    SubWorkName: "",
  };

  const [subWorkForm, setSubWorkForm] = useState(initialSubWorkForm);
  const [subWorksMaster, setSubWorksMaster] = useState([]);

  const sortByDOrderAsc = (items) =>
    [...items].sort((a, b) => {
      const aOrder =
        a.DOrder === null || a.DOrder === undefined || a.DOrder === ""
          ? Number.POSITIVE_INFINITY
          : Number(a.DOrder);
      const bOrder =
        b.DOrder === null || b.DOrder === undefined || b.DOrder === ""
          ? Number.POSITIVE_INFINITY
          : Number(b.DOrder);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.SSRRegionName || a.SSRCategoryName || "").localeCompare(
        String(b.SSRRegionName || b.SSRCategoryName || ""),
      );
    });

  const loadRegions = async () => {
    setLoadingRegions(true);
    try {
      const res = await fetch(`${API_BASE}/api/ssr-regions`);
      const data = await res.json();
      setRegions(Array.isArray(data) ? sortByDOrderAsc(data) : []);
    } catch (error) {
      setMessage(`Region load failed: ${error.message}`);
    } finally {
      setLoadingRegions(false);
    }
  };

  const loadCategories = async () => {
    setLoadingCategories(true);
    try {
      const res = await fetch(`${API_BASE}/api/ssr-categories`);
      const data = await res.json();
      setCategories(Array.isArray(data) ? sortByDOrderAsc(data) : []);
    } catch (error) {
      setMessage(`Category load failed: ${error.message}`);
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadRegionBasedCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ssr-categories/${itemRegion}`);
      const data = await res.json();
      setItemCategories(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadCategoryBasedSubCategories = (categoryId) => {
    axios
      .get(`${API_BASE}/api/ssr-sub-categories/${categoryId}`)
      .then((res) => {
        if (res.status === 200) setSubCategories(res.data.data);
      });
  };

  const loadItems = (e) => {
    e.preventDefault();
    getCheckedItemsList();
    axios
      .get(`${API_BASE}/api/ssr-items-load`, {
        params: {
          regionId: itemRegion,
          categoryId: itemCategoryId,
          subCategoryId: subCategoryItemId,
        },
      })
      .then((res) => {
        if (res.status === 200) {
          alert("Item List Loaded.");
          setItemList(res.data.data);
        }
      });
  };

  const insertProject = () => {
    const user = JSON.parse(sessionStorage.getItem("werms_user"));
    axios
      .post(`${API_BASE}/api/insert-project`, {
        projectName: projectForm.ProjectName,
        userId: user.UserId,
      })
      .then((res) => {
        if (res.status === 201) {
          const data = res.data;
          alert(data.message);
        }
      })
      .catch(console.error);
  };

  const insertSubWork = () => {
    axios
      .post(`${API_BASE}/api/insert-subwork`, {
        projectId: subWorkForm.ProjectId,
        subWorkName: subWorkForm.SubWorkName,
      })
      .then((res) => {
        if (res.status === 201) {
          const data = res.data;
          alert(data.message);
        }
      })
      .catch(console.error);
  };

  const loadProjects = () => {
    const user = JSON.parse(sessionStorage.getItem("werms_user"));
    console.log("User Is: ", user);
    console.log("User Id: ", user.UserId);
    axios
      .get(`${API_BASE}/api/load-projects/${user.UserId}`)
      .then((res) => {
        if (res.status === 200) setProjects(res.data.data);
      })
      .catch(console.error);
  };

  const loadSubWorks = (project) => {
    console.log("Project: ", project);
    axios
      .get(`${API_BASE}/api/load-sub-works/`, {
        params: {
          projectId: project,
        },
      })
      .then((res) => {
        if (res.status === 200) setSubWorks(res.data.data);
      });
  };

  const listInsert = (e) => {
    e.preventDefault();
    const payload = {
      projectId: selectedProjectId,
      subWorkId: selectedSubWorkId,
      items: selectedItems,
      alreadyCheckedItems: checkedItemIds,
    };
    axios
      .post(`${API_BASE}/api/insert-work-abstract`, payload)
      .then((res) => {
        if (res.status === 200) {
          alert(`Status Code: ${res.status}. Message: ${res.data.message}.`);
        }
      })
      .catch(console.error);
  };

  const listUpdate = () => {
    axios
      .delete(`${API_BASE}/api/delete-selected-items`, {
        params: { deleteItems: updateSelectedItems },
      })
      .then((res) => {
        if (res.status === 200) alert(res.data.message);
      })
      .catch(console.error);
  };

  const getCheckedItems = () => {
    axios
      .get(`${API_BASE}/api/work-abstract-get`)
      .then((res) => {
        if (res.status === 200) setCheckedItemIds(res.data.data);
      })
      .catch(console.error);
  };

  const getCheckedItemsList = () => {
    axios
      .get(`${API_BASE}/api/get-items-checked-list`, {
        params: { projectId: selectedProjectId, subWorkId: selectedSubWorkId },
      })
      .then((res) => {
        if (res.status === 200) {
          setCheckedItemsList(res.data.data);
          setCheckedForMeasurement(new Set()); // reset panels on fresh load
          setUpdateSelectedItems([]);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadRegions();
    loadCategories();
    loadProjects();
    getCheckedItems();
  }, []);

  const onRegionChange = (e) => {
    const { name, value } = e.target;
    setRegionForm((prev) => ({ ...prev, [name]: value }));
  };

  const onCategoryChange = (e) => {
    const { name, value } = e.target;
    setCategoryForm((prev) => ({ ...prev, [name]: value }));
  };

  const onRegionSubmit = async (e) => {
    e.preventDefault();
    const isEdit = Boolean(editingRegionId);
    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this region" : "save this new region"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }
    setSavingRegion(true);
    setMessage("");
    try {
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/ssr-regions/${editingRegionId}`
          : `${API_BASE}/api/ssr-regions`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(regionForm),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save.");
      setMessage(
        isEdit ? "Region updated successfully." : "Region saved successfully.",
      );
      setRegionForm(initialRegionForm);
      setEditingRegionId(null);
      await loadRegions();
      await loadCategories();
    } catch (error) {
      setMessage(`Region save failed: ${error.message}`);
    } finally {
      setSavingRegion(false);
    }
  };

  const onCategorySubmit = async (e) => {
    e.preventDefault();
    const isEdit = Boolean(editingCategoryId);
    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this category" : "save this new category"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }
    setSavingCategory(true);
    setMessage("");
    try {
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/ssr-categories/${editingCategoryId}`
          : `${API_BASE}/api/ssr-categories`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(categoryForm),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save.");
      setMessage(
        isEdit
          ? "Category updated successfully."
          : "Category saved successfully.",
      );
      setCategoryForm(initialCategoryForm);
      setEditingCategoryId(null);
      await loadCategories();
    } catch (error) {
      setMessage(`Category save failed: ${error.message}`);
    } finally {
      setSavingCategory(false);
    }
  };

  const startRegionEdit = (row) => {
    setActiveMaster("regions");
    setEditingRegionId(row.SSRRegionId);
    setRegionForm({
      SSRRegionName: row.SSRRegionName || "",
      SSRRegionShortName: row.SSRRegionShortName || "",
      DOrder: row.DOrder ?? "",
      DOrder1: row.DOrder1 ?? "",
      Remarks: row.Remarks || "",
    });
  };

  const startCategoryEdit = (row) => {
    setActiveMaster("categories");
    setEditingCategoryId(row.SSRCategoryId);
    setCategoryForm({
      SSRRegionId: row.SSRRegionId ? String(row.SSRRegionId) : "",
      SSRCategoryName: row.SSRCategoryName || "",
      SSRCategoryShortName: row.SSRCategoryShortName || "",
      DOrder: row.DOrder ?? "",
      DOrder1: row.DOrder1 ?? "",
      Remarks: row.Remarks || "",
    });
  };

  const resetRegionEdit = () => {
    setEditingRegionId(null);
    setRegionForm(initialRegionForm);
  };

  const resetCategoryEdit = () => {
    setEditingCategoryId(null);
    setCategoryForm(initialCategoryForm);
  };

  const requiredLabel = (label) => (
    <span>
      {label} <span style={{ color: "#cc2222", fontWeight: 700 }}>*</span>
    </span>
  );

  const getRegionShortNameById = (regionId) => {
    const region = regions.find(
      (item) => Number(item.SSRRegionId) === Number(regionId),
    );
    return region?.SSRRegionShortName || "";
  };

  // Toggle measurement panel when the checkbox in Checked Items tab changes
  const onCheckedItemToggle = (itemId, checked) => {
    // keep updateSelectedItems in sync (original behaviour)
    if (checked) {
      setUpdateSelectedItems((prev) => [...prev, itemId].sort());
    } else {
      setUpdateSelectedItems((prev) => prev.filter((id) => id !== itemId));
    }
    // show / hide measurement panel
    setCheckedForMeasurement((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "30px auto",
        fontFamily: "Arial, sans-serif",
        color: "#24323f",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Masters Management</h1>
      <p style={{ marginTop: 0, color: "#5d6c7a" }}>
        Use the main menu to manage current masters and keep room for upcoming
        masters.
      </p>

      {message && (
        <p
          style={{
            padding: "10px 14px",
            background: "#eef5ff",
            border: "1px solid #d3e2ff",
            borderRadius: 6,
          }}
        >
          {message}
        </p>
      )}

      {/* ── Masters Menu ── */}
      <section style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 10 }}>Main Masters Menu</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {mastersMenu.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.status === "upcoming"}
              onClick={() => setActiveMaster(item.id)}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border:
                  activeMaster === item.id
                    ? "1px solid #216bcb"
                    : "1px solid #d0dae3",
                background: activeMaster === item.id ? "#eaf2ff" : "#ffffff",
                color: item.status === "upcoming" ? "#9aa7b3" : "#24323f",
                cursor: item.status === "upcoming" ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Regions ── */}
      {activeMaster === "regions" && (
        <section style={{ marginBottom: 30 }}>
          <h2>MasterSSRRegion</h2>
          <div style={{ marginBottom: 8, fontSize: 13, color: "#637385" }}>
            Fields marked with{" "}
            <span style={{ color: "#cc2222", fontWeight: 700 }}>*</span> are
            mandatory.
          </div>
          <form
            onSubmit={onRegionSubmit}
            style={{
              background: "#f9fbfd",
              border: "1px solid #dde5ec",
              borderRadius: 10,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              {editingRegionId
                ? `Edit Region #${editingRegionId}`
                : "Add New Region"}
            </h3>
            <p style={{ marginTop: 0, marginBottom: 16, color: "#5d6c7a" }}>
              Please verify the details before saving.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Region Name")}
                <input
                  name="SSRRegionName"
                  value={regionForm.SSRRegionName}
                  onChange={onRegionChange}
                  required
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Region Short Name")}
                <input
                  name="SSRRegionShortName"
                  value={regionForm.SSRRegionShortName}
                  onChange={onRegionChange}
                  required
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                DOrder
                <input
                  name="DOrder"
                  value={regionForm.DOrder}
                  onChange={onRegionChange}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                DOrder1
                <input
                  name="DOrder1"
                  value={regionForm.DOrder1}
                  onChange={onRegionChange}
                />
              </label>
              <label
                style={{ display: "grid", gap: 6, gridColumn: "1 / span 2" }}
              >
                Remarks
                <input
                  name="Remarks"
                  value={regionForm.Remarks}
                  onChange={onRegionChange}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit" disabled={savingRegion}>
                {savingRegion
                  ? "Saving..."
                  : editingRegionId
                    ? "Update Region"
                    : "Save Region"}
              </button>
              {editingRegionId && (
                <button type="button" onClick={resetRegionEdit}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <table
            border="1"
            cellPadding="8"
            style={{
              borderCollapse: "collapse",
              width: "100%",
              background: "#fff",
            }}
          >
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Short Name</th>
                <th>DOrder</th>
                <th>DOrder1</th>
                <th>Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingRegions ? (
                <tr>
                  <td colSpan="7">Loading...</td>
                </tr>
              ) : (
                regions.map((r) => (
                  <tr key={r.SSRRegionId}>
                    <td>{r.SSRRegionId}</td>
                    <td>{r.SSRRegionName}</td>
                    <td>{r.SSRRegionShortName}</td>
                    <td>{r.DOrder ?? ""}</td>
                    <td>{r.DOrder1 ?? ""}</td>
                    <td>{r.Remarks ?? ""}</td>
                    <td>
                      <button type="button" onClick={() => startRegionEdit(r)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
              {!loadingRegions && !regions.length && (
                <tr>
                  <td colSpan="7">No region rows yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Categories ── */}
      {activeMaster === "categories" && (
        <section>
          <h2>MasterSSRCategory</h2>
          <div style={{ marginBottom: 8, fontSize: 13, color: "#637385" }}>
            Fields marked with{" "}
            <span style={{ color: "#cc2222", fontWeight: 700 }}>*</span> are
            mandatory.
          </div>
          <form
            onSubmit={onCategorySubmit}
            style={{
              background: "#f9fbfd",
              border: "1px solid #dde5ec",
              borderRadius: 10,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              {editingCategoryId
                ? `Edit Category #${editingCategoryId}`
                : "Add New Category"}
            </h3>
            <p style={{ marginTop: 0, marginBottom: 16, color: "#5d6c7a" }}>
              Please verify the details before saving.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Region")}
                <select
                  name="SSRRegionId"
                  value={categoryForm.SSRRegionId}
                  onChange={onCategoryChange}
                  required
                >
                  <option value="">Select SSR Region</option>
                  {regions.map((r) => (
                    <option key={r.SSRRegionId} value={r.SSRRegionId}>
                      {r.SSRRegionShortName || r.SSRRegionName}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Category Name")}
                <input
                  name="SSRCategoryName"
                  value={categoryForm.SSRCategoryName}
                  onChange={onCategoryChange}
                  required
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Category Short Name")}
                <input
                  name="SSRCategoryShortName"
                  value={categoryForm.SSRCategoryShortName}
                  onChange={onCategoryChange}
                  required
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                DOrder
                <input
                  name="DOrder"
                  value={categoryForm.DOrder}
                  onChange={onCategoryChange}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                DOrder1
                <input
                  name="DOrder1"
                  value={categoryForm.DOrder1}
                  onChange={onCategoryChange}
                />
              </label>
              <label
                style={{ display: "grid", gap: 6, gridColumn: "1 / span 2" }}
              >
                Remarks
                <input
                  name="Remarks"
                  value={categoryForm.Remarks}
                  onChange={onCategoryChange}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit" disabled={savingCategory}>
                {savingCategory
                  ? "Saving..."
                  : editingCategoryId
                    ? "Update Category"
                    : "Save Category"}
              </button>
              {editingCategoryId && (
                <button type="button" onClick={resetCategoryEdit}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <table
            border="1"
            cellPadding="8"
            style={{
              borderCollapse: "collapse",
              width: "100%",
              background: "#fff",
            }}
          >
            <thead>
              <tr>
                <th>ID</th>
                <th>Region (Short Name)</th>
                <th>Name</th>
                <th>Short Name</th>
                <th>DOrder</th>
                <th>DOrder1</th>
                <th>Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingCategories ? (
                <tr>
                  <td colSpan="8">Loading...</td>
                </tr>
              ) : (
                categories.map((c) => (
                  <tr key={c.SSRCategoryId}>
                    <td>{c.SSRCategoryId}</td>
                    <td>
                      {getRegionShortNameById(c.SSRRegionId) ||
                        c.SSRRegionShortName ||
                        c.SSRRegionName}
                    </td>
                    <td>{c.SSRCategoryName}</td>
                    <td>{c.SSRCategoryShortName}</td>
                    <td>{c.DOrder ?? ""}</td>
                    <td>{c.DOrder1 ?? ""}</td>
                    <td>{c.Remarks ?? ""}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => startCategoryEdit(c)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
              {!loadingCategories && !categories.length && (
                <tr>
                  <td colSpan="8">No category rows yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Items ── */}
      {activeMaster === "items" && (
        <>
          <form
            onSubmit={loadItems}
            style={{
              background: "#f9fbfd",
              border: "1px solid #dde5ec",
              borderRadius: 10,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <p style={{ marginTop: 0, marginBottom: 16, color: "#5d6c7a" }}>
              Please verify the details before saving.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("Select Project")}
                <select
                  name="Projects"
                  value={selectedProjectId}
                  onChange={(e) => {
                    const project = e.target.value;
                    setSelectedProjectId(project);
                    loadSubWorks(project);
                  }}
                >
                  <option>Select Project Name</option>
                  {projects.map((project) => (
                    <option key={project.ProjectId} value={project.ProjectId}>
                      {project.ProjectName}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("Select Sub Work")}
                <select
                  name="SubWork"
                  value={selectedSubWorkId}
                  onChange={(e) => setSelectedSubWorkId(e.target.value)}
                  disabled={!selectedProjectId}
                >
                  <option>Select Sub Work</option>
                  {subWorks.map((subWork) => (
                    <option key={subWork.SubWorkId} value={subWork.SubWorkId}>
                      {subWork.SubWorkName}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Region")}
                <select
                  name="SSRRegionId"
                  value={itemRegion}
                  onChange={(e) => {
                    setItemRegion(e.target.value);
                    loadRegionBasedCategories();
                  }}
                  required
                >
                  <option value="">Select SSR Region</option>
                  {regions.map((r) => (
                    <option key={r.SSRRegionId} value={r.SSRRegionId}>
                      {r.SSRRegionShortName || r.SSRRegionName}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Category")}
                <select
                  name="SSRCategoryId"
                  value={itemCategoryId}
                  onChange={(e) => {
                    const categoryId = e.target.value;
                    setItemCategoryId(categoryId);
                    loadCategoryBasedSubCategories(categoryId);
                  }}
                  required
                  disabled={!itemRegion}
                >
                  <option value="">Select SSR Category</option>
                  {itemCategories
                    .filter((c) => String(c.SSRRegionId) === String(itemRegion))
                    .map((c) => (
                      <option key={c.SSRCategoryId} value={c.SSRCategoryId}>
                        {c.SSRCategoryShortName || c.SSRCategoryName}
                      </option>
                    ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Sub Category")}
                <select
                  name="SSRSubCategoryId"
                  value={subCategoryItemId}
                  onChange={(e) => setSubCategoryItemId(e.target.value)}
                  required
                  disabled={!itemCategoryId}
                >
                  <option value="">Select SSR Sub Category</option>
                  {subCategories.map((s) => (
                    <option key={s.SSRSubCategoryId} value={s.SSRSubCategoryId}>
                      {s.SSRCategoryName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit">View</button>
            </div>
          </form>

          <Tabs>
            <TabList>
              <Tab value={0}>SSR Items List</Tab>
              <Tab value={1}>Checked Items List</Tab>
            </TabList>

            {/* ── Tab 0: SSR Items List (unchanged) ── */}
            <TabPanel value={0}>
              {itemList.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3>SSR Items List</h3>
                  <table
                    border="1"
                    cellPadding="8"
                    style={{
                      borderCollapse: "collapse",
                      width: "100%",
                      background: "#fff",
                    }}
                  >
                    <thead>
                      <tr>
                        <th>Select</th>
                        <th>ID</th>
                        <th>Number</th>
                        <th>Item Name</th>
                        <th>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemList.map((item) => (
                        <tr key={item.ItemId}>
                          <td>
                            {item.CompletedRate && (
                              <input
                                type="checkbox"
                                value={item.ItemId}
                                checked={
                                  checkedItemIds.includes(
                                    Number(item.ItemId),
                                  ) ||
                                  selectedItems.includes(Number(item.ItemId))
                                }
                                onChange={(e) => {
                                  const itemId = Number(item.ItemId);
                                  if (e.target.checked) {
                                    setSelectedItems((prev) => [
                                      ...new Set([...prev, itemId]),
                                    ]);
                                  } else {
                                    setSelectedItems((prev) =>
                                      prev.filter((id) => id !== itemId),
                                    );
                                  }
                                }}
                              />
                            )}
                          </td>
                          <td>{item.ItemId}</td>
                          <td>{item.ItemNumber}</td>
                          <td>{item.ItemDescription}</td>
                          <td>{item.CompletedRate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={listInsert}>Insert</button>
                </div>
              )}
            </TabPanel>

            {/* ── Tab 1: Checked Items List — measurement panel auto-shows on checkbox ── */}
            <TabPanel value={1}>
              {checkedItemsList.length > 0 ? (
                <div style={{ marginTop: 20 }}>
                  <h3>Checked Items List</h3>
                  <p style={{ marginTop: 0, fontSize: 13, color: "#637385" }}>
                    Check a row to open its measurement panel. Enter math
                    expressions like <code>3.5+2.1+1.8</code> — the quantity is
                    computed automatically.
                  </p>
                  <table
                    border="1"
                    cellPadding="8"
                    style={{
                      borderCollapse: "collapse",
                      width: "100%",
                      background: "#fff",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>Select</th>
                        <th style={{ width: 50 }}>ID</th>
                        <th style={{ width: 80 }}>Number</th>
                        <th>Item Name</th>
                        <th style={{ width: 90 }}>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkedItemsList.map((item) => {
                        const isOpen = checkedForMeasurement.has(
                          item.WorkAbstractId,
                        );
                        return (
                          <>
                            {/* ── Item row ── */}
                            <tr
                              key={item.ItemId}
                              style={
                                isOpen ? { background: "#f0f6ff" } : undefined
                              }
                            >
                              <td>
                                {item.CompletedRate && (
                                  <input
                                    type="checkbox"
                                    checked={isOpen}
                                    value={item.WorkAbstractId}
                                    onChange={(e) =>
                                      onCheckedItemToggle(
                                        item.WorkAbstractId,
                                        e.target.checked,
                                      )
                                    }
                                  />
                                )}
                              </td>
                              <td>{item.ItemId}</td>
                              <td>{item.ItemNumber}</td>
                              <td>{item.ItemDescription}</td>
                              <td>{item.CompletedRate}</td>
                            </tr>

                            {/* ── Inline measurement panel — mounts when checked ── */}
                            {isOpen && (
                              <MeasurementPanel
                                key={`mp-${item.WorkAbstractId}`}
                                item={item}
                                projectId={selectedProjectId}
                                subWorkId={selectedSubWorkId}
                              />
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                  <button style={{ marginTop: 10 }} onClick={listUpdate}>
                    Update
                  </button>
                </div>
              ) : (
                <p style={{ color: "#9aafbf", fontSize: 13, marginTop: 20 }}>
                  Click "View" above to load checked items for the selected
                  project and sub-work.
                </p>
              )}
            </TabPanel>
          </Tabs>
        </>
      )}
      {activeMaster === "projects" && (
        <>
          <section style={{ marginBottom: 30 }}>
            <h2>Master Project</h2>

            <form
              onSubmit={insertProject}
              style={{
                background: "#f9fbfd",
                border: "1px solid #dde5ec",
                borderRadius: 10,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <h3>Add New Project</h3>

              <label style={{ display: "grid", gap: 6 }}>
                Project Name *
                <input
                  type="text"
                  value={projectForm.ProjectName}
                  onChange={(e) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      ProjectName: e.target.value,
                    }))
                  }
                  required
                />
              </label>

              <div style={{ marginTop: 16 }}>
                <button type="submit">Save Project</button>
              </div>
            </form>

            {/* Projects Table */}

            <table
              border="1"
              cellPadding="8"
              style={{
                borderCollapse: "collapse",
                width: "100%",
                background: "#fff",
              }}
            >
              <thead>
                <tr>
                  <th>Project Id</th>
                  <th>Project Name</th>
                  <th>Mark For Deletion</th>
                </tr>
              </thead>

              <tbody>
                {projects.length > 0 ? (
                  <>
                    {projects.map((project) => (
                      <tr key={project.ProjectId}>
                        <td>{project.ProjectId}</td>
                        <td>{project.ProjectName}</td>
                        <td>{project.MarkForDeletion ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </>
                ) : (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center" }}>
                      No Projects Found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
      {activeMaster === "sub-work" && (
        <section style={{ marginBottom: 30 }}>
          <h2>Master Sub Work</h2>

          <div style={{ marginBottom: 8, fontSize: 13, color: "#637385" }}>
            Fields marked with{" "}
            <span style={{ color: "#cc2222", fontWeight: 700 }}>*</span> are
            mandatory.
          </div>

          <form
            onSubmit={insertSubWork}
            style={{
              background: "#f9fbfd",
              border: "1px solid #dde5ec",
              borderRadius: 10,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <h3>Add New Sub Work</h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                Project <span style={{ color: "#cc2222" }}>*</span>
                <select
                  value={subWorkForm.ProjectId}
                  onChange={(e) => {
                    const projectId = e.target.value;
                    setSubWorkForm((prev) => ({
                      ...prev,
                      ProjectId: projectId,
                    }));
                    loadSubWorks(projectId);
                  }}
                  required
                >
                  <option value="">Select Project</option>

                  {projects.map((project) => (
                    <option key={project.ProjectId} value={project.ProjectId}>
                      {project.ProjectName}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                Sub Work Name <span style={{ color: "#cc2222" }}>*</span>
                <input
                  type="text"
                  value={subWorkForm.SubWorkName}
                  onChange={(e) =>
                    setSubWorkForm((prev) => ({
                      ...prev,
                      SubWorkName: e.target.value,
                    }))
                  }
                  required
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit">Save Sub Work</button>
            </div>
          </form>

          <table
            border="1"
            cellPadding="8"
            style={{
              borderCollapse: "collapse",
              width: "100%",
              background: "#fff",
            }}
          >
            <thead>
              <tr>
                <th>Sub Work Id</th>
                <th>Sub Work Name</th>
                <th>Mark For Deletion</th>
              </tr>
            </thead>

            <tbody>
              {subWorks.length > 0 ? (
                subWorks.map((subWork) => (
                  <tr key={subWork.SubWorkId}>
                    <td>{subWork.SubWorkId}</td>
                    <td>{subWork.SubWorkName}</td>
                    <td>{subWork.MarkForDeletion ? "Yes" : "No"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="5"
                    style={{
                      textAlign: "center",
                      color: "#637385",
                    }}
                  >
                    No Sub Works Found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
