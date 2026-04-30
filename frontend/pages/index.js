import { useEffect, useState } from "react";

const API_BASE = "https://estimate-project-omega.vercel.app";
const mastersMenu = [
  { id: "regions", label: "SSR Regions", status: "active" },
  { id: "categories", label: "SSR Categories", status: "active" },
  { id: "units", label: "Units (Upcoming)", status: "upcoming" },
  { id: "materials", label: "Materials (Upcoming)", status: "upcoming" },
  { id: "rates", label: "Rates (Upcoming)", status: "upcoming" }
];

const initialRegionForm = {
  SSRRegionName: "",
  SSRRegionShortName: "",
  DOrder: "",
  DOrder1: "",
  Remarks: ""
};

const initialCategoryForm = {
  SSRRegionId: "",
  SSRCategoryName: "",
  SSRCategoryShortName: "",
  DOrder: "",
  DOrder1: "",
  Remarks: ""
};

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

  const sortByDOrderAsc = (items) =>
    [...items].sort((a, b) => {
      const aOrder = a.DOrder === null || a.DOrder === undefined || a.DOrder === "" ? Number.POSITIVE_INFINITY : Number(a.DOrder);
      const bOrder = b.DOrder === null || b.DOrder === undefined || b.DOrder === "" ? Number.POSITIVE_INFINITY : Number(b.DOrder);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.SSRRegionName || a.SSRCategoryName || "").localeCompare(String(b.SSRRegionName || b.SSRCategoryName || ""));
    });

  const loadRegions = async () => {
    setLoadingRegions(true);
    try {
      const res = await fetch(`${API_BASE}/api/ssr-regions`);
      const data = await res.json();
      const regionRows = Array.isArray(data) ? sortByDOrderAsc(data) : [];
      setRegions(regionRows);
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
      const categoryRows = Array.isArray(data) ? sortByDOrderAsc(data) : [];
      setCategories(categoryRows);
    } catch (error) {
      setMessage(`Category load failed: ${error.message}`);
    } finally {
      setLoadingCategories(false);
    }
  };

  useEffect(() => {
    loadRegions();
    loadCategories();
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
    const actionText = isEdit ? "update this region" : "save this new region";
    const confirmed = window.confirm(`Please review the details.\nDo you want to ${actionText}?`);
    if (!confirmed) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }

    setSavingRegion(true);
    setMessage("");
    try {
      const res = await fetch(
        isEdit ? `${API_BASE}/api/ssr-regions/${editingRegionId}` : `${API_BASE}/api/ssr-regions`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(regionForm)
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save.");

      setMessage(isEdit ? "Region updated successfully." : "Region saved successfully.");
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
    const actionText = isEdit ? "update this category" : "save this new category";
    const confirmed = window.confirm(`Please review the details.\nDo you want to ${actionText}?`);
    if (!confirmed) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }

    setSavingCategory(true);
    setMessage("");
    try {
      const res = await fetch(
        isEdit ? `${API_BASE}/api/ssr-categories/${editingCategoryId}` : `${API_BASE}/api/ssr-categories`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(categoryForm)
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save.");

      setMessage(isEdit ? "Category updated successfully." : "Category saved successfully.");
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
      Remarks: row.Remarks || ""
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
      Remarks: row.Remarks || ""
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
    const region = regions.find((item) => Number(item.SSRRegionId) === Number(regionId));
    return region?.SSRRegionShortName || "";
  };

  return (
    <main style={{ maxWidth: 1200, margin: "30px auto", fontFamily: "Arial, sans-serif", color: "#24323f" }}>
      <h1 style={{ marginBottom: 8 }}>Masters Management</h1>
      <p style={{ marginTop: 0, color: "#5d6c7a" }}>
        Use the main menu to manage current masters and keep room for upcoming masters.
      </p>

      {message && (
        <p style={{ padding: "10px 14px", background: "#eef5ff", border: "1px solid #d3e2ff", borderRadius: 6 }}>
          {message}
        </p>
      )}

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
                border: activeMaster === item.id ? "1px solid #216bcb" : "1px solid #d0dae3",
                background: activeMaster === item.id ? "#eaf2ff" : "#ffffff",
                color: item.status === "upcoming" ? "#9aa7b3" : "#24323f",
                cursor: item.status === "upcoming" ? "not-allowed" : "pointer",
                fontWeight: 600
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {activeMaster === "regions" && (
        <section style={{ marginBottom: 30 }}>
          <h2>MasterSSRRegion</h2>
          <div style={{ marginBottom: 8, fontSize: 13, color: "#637385" }}>
            Fields marked with <span style={{ color: "#cc2222", fontWeight: 700 }}>*</span> are mandatory.
          </div>
          <form
            onSubmit={onRegionSubmit}
            style={{ background: "#f9fbfd", border: "1px solid #dde5ec", borderRadius: 10, padding: 16, marginBottom: 20 }}
          >
            <h3 style={{ marginTop: 0 }}>{editingRegionId ? `Edit Region #${editingRegionId}` : "Add New Region"}</h3>
            <p style={{ marginTop: 0, marginBottom: 16, color: "#5d6c7a" }}>
              Please verify the details before saving.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Region Name")}
                <input name="SSRRegionName" value={regionForm.SSRRegionName} onChange={onRegionChange} required />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Region Short Name")}
                <input name="SSRRegionShortName" value={regionForm.SSRRegionShortName} onChange={onRegionChange} required />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                DOrder
                <input name="DOrder" value={regionForm.DOrder} onChange={onRegionChange} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                DOrder1
                <input name="DOrder1" value={regionForm.DOrder1} onChange={onRegionChange} />
              </label>
              <label style={{ display: "grid", gap: 6, gridColumn: "1 / span 2" }}>
                Remarks
                <input name="Remarks" value={regionForm.Remarks} onChange={onRegionChange} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit" disabled={savingRegion}>
                {savingRegion ? "Saving..." : editingRegionId ? "Update Region" : "Save Region"}
              </button>
              {editingRegionId && (
                <button type="button" onClick={resetRegionEdit}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}>
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

      {activeMaster === "categories" && (
        <section>
          <h2>MasterSSRCategory</h2>
          <div style={{ marginBottom: 8, fontSize: 13, color: "#637385" }}>
            Fields marked with <span style={{ color: "#cc2222", fontWeight: 700 }}>*</span> are mandatory.
          </div>
          <form
            onSubmit={onCategorySubmit}
            style={{ background: "#f9fbfd", border: "1px solid #dde5ec", borderRadius: 10, padding: 16, marginBottom: 20 }}
          >
            <h3 style={{ marginTop: 0 }}>{editingCategoryId ? `Edit Category #${editingCategoryId}` : "Add New Category"}</h3>
            <p style={{ marginTop: 0, marginBottom: 16, color: "#5d6c7a" }}>
              Please verify the details before saving.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Region")}
                <select name="SSRRegionId" value={categoryForm.SSRRegionId} onChange={onCategoryChange} required>
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
                <input name="SSRCategoryName" value={categoryForm.SSRCategoryName} onChange={onCategoryChange} required />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                {requiredLabel("SSR Category Short Name")}
                <input name="SSRCategoryShortName" value={categoryForm.SSRCategoryShortName} onChange={onCategoryChange} required />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                DOrder
                <input name="DOrder" value={categoryForm.DOrder} onChange={onCategoryChange} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                DOrder1
                <input name="DOrder1" value={categoryForm.DOrder1} onChange={onCategoryChange} />
              </label>
              <label style={{ display: "grid", gap: 6, gridColumn: "1 / span 2" }}>
                Remarks
                <input name="Remarks" value={categoryForm.Remarks} onChange={onCategoryChange} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit" disabled={savingCategory}>
                {savingCategory ? "Saving..." : editingCategoryId ? "Update Category" : "Save Category"}
              </button>
              {editingCategoryId && (
                <button type="button" onClick={resetCategoryEdit}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}>
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
                    <td>{getRegionShortNameById(c.SSRRegionId) || c.SSRRegionShortName || c.SSRRegionName}</td>
                    <td>{c.SSRCategoryName}</td>
                    <td>{c.SSRCategoryShortName}</td>
                    <td>{c.DOrder ?? ""}</td>
                    <td>{c.DOrder1 ?? ""}</td>
                    <td>{c.Remarks ?? ""}</td>
                    <td>
                      <button type="button" onClick={() => startCategoryEdit(c)}>
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
    </main>
  );
}
