import { useEffect, useState } from "react";

const API_BASE = "https://estimate-project-omega.vercel.app";

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

  const loadRegions = async () => {
    setLoadingRegions(true);
    try {
      const res = await fetch(`${API_BASE}/api/ssr-regions`);
      const data = await res.json();
      setRegions(Array.isArray(data) ? data : []);
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
      setCategories(Array.isArray(data) ? data : []);
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
    setSavingRegion(true);
    setMessage("");
    try {
      const isEdit = Boolean(editingRegionId);
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
    setSavingCategory(true);
    setMessage("");
    try {
      const isEdit = Boolean(editingCategoryId);
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

  return (
    <main style={{ maxWidth: 1100, margin: "30px auto", fontFamily: "Arial, sans-serif" }}>
      <h1>Master Screens: Region and Category</h1>
      {message && <p>{message}</p>}

      <section style={{ marginBottom: 30 }}>
        <h2>MasterSSRRegion Data Entry</h2>
        <form onSubmit={onRegionSubmit} style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          <input name="SSRRegionName" placeholder="SSR Region Name" value={regionForm.SSRRegionName} onChange={onRegionChange} required />
          <input name="SSRRegionShortName" placeholder="SSR Region Short Name" value={regionForm.SSRRegionShortName} onChange={onRegionChange} required />
          <input name="DOrder" placeholder="DOrder (optional)" value={regionForm.DOrder} onChange={onRegionChange} />
          <input name="DOrder1" placeholder="DOrder1 (optional)" value={regionForm.DOrder1} onChange={onRegionChange} />
          <input name="Remarks" placeholder="Remarks (optional)" value={regionForm.Remarks} onChange={onRegionChange} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={savingRegion}>
              {savingRegion ? "Saving..." : editingRegionId ? "Update Region" : "Save Region"}
            </button>
            {editingRegionId && (
              <button type="button" onClick={() => { setEditingRegionId(null); setRegionForm(initialRegionForm); }}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
        <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th>ID</th><th>Name</th><th>Short Name</th><th>DOrder</th><th>DOrder1</th><th>Remarks</th><th>Action</th></tr></thead>
          <tbody>
            {loadingRegions ? <tr><td colSpan="7">Loading...</td></tr> : regions.map((r) => (
              <tr key={r.SSRRegionId}>
                <td>{r.SSRRegionId}</td><td>{r.SSRRegionName}</td><td>{r.SSRRegionShortName}</td><td>{r.DOrder ?? ""}</td><td>{r.DOrder1 ?? ""}</td><td>{r.Remarks ?? ""}</td>
                <td><button type="button" onClick={() => startRegionEdit(r)}>Inline Edit</button></td>
              </tr>
            ))}
            {!loadingRegions && !regions.length && <tr><td colSpan="7">No region rows yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h2>MasterSSRCategory Data Entry</h2>
        <form onSubmit={onCategorySubmit} style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          <select name="SSRRegionId" value={categoryForm.SSRRegionId} onChange={onCategoryChange} required>
            <option value="">Select SSR Region</option>
            {regions.map((r) => <option key={r.SSRRegionId} value={r.SSRRegionId}>{r.SSRRegionName}</option>)}
          </select>
          <input name="SSRCategoryName" placeholder="SSR Category Name" value={categoryForm.SSRCategoryName} onChange={onCategoryChange} required />
          <input name="SSRCategoryShortName" placeholder="SSR Category Short Name" value={categoryForm.SSRCategoryShortName} onChange={onCategoryChange} required />
          <input name="DOrder" placeholder="DOrder (optional)" value={categoryForm.DOrder} onChange={onCategoryChange} />
          <input name="DOrder1" placeholder="DOrder1 (optional)" value={categoryForm.DOrder1} onChange={onCategoryChange} />
          <input name="Remarks" placeholder="Remarks (optional)" value={categoryForm.Remarks} onChange={onCategoryChange} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={savingCategory}>
              {savingCategory ? "Saving..." : editingCategoryId ? "Update Category" : "Save Category"}
            </button>
            {editingCategoryId && (
              <button type="button" onClick={() => { setEditingCategoryId(null); setCategoryForm(initialCategoryForm); }}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
        <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th>ID</th><th>Region</th><th>Name</th><th>Short Name</th><th>DOrder</th><th>DOrder1</th><th>Remarks</th><th>Action</th></tr></thead>
          <tbody>
            {loadingCategories ? <tr><td colSpan="8">Loading...</td></tr> : categories.map((c) => (
              <tr key={c.SSRCategoryId}>
                <td>{c.SSRCategoryId}</td><td>{c.SSRRegionName}</td><td>{c.SSRCategoryName}</td><td>{c.SSRCategoryShortName}</td><td>{c.DOrder ?? ""}</td><td>{c.DOrder1 ?? ""}</td><td>{c.Remarks ?? ""}</td>
                <td><button type="button" onClick={() => startCategoryEdit(c)}>Inline Edit</button></td>
              </tr>
            ))}
            {!loadingCategories && !categories.length && <tr><td colSpan="8">No category rows yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}
