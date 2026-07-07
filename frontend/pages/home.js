import { useEffect, useState } from "react";
import Head from "next/head";
import axios from "axios";
import { TabList, Tabs, Tab, TabPanel, Button } from "@mui/joy";
import MeasurementPanel from "../components/MeasurementPanel";
import GenerateReportModal from "../components/GenerateReportModal";

const API_BASE = "https://estimate-project-omega.vercel.app";
// const API_BASE = "http://localhost:4000";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — drafting-paper / blueprint palette, tuned to an
// estimate & quantity-measurement workspace.
// ─────────────────────────────────────────────────────────────────────────────

const theme = {
  colors: {
    ink: "#132339",
    inkSoft: "#5B6B7C",
    paper: "#F6F4EC",
    surface: "#FFFFFF",
    line: "#E1DCCC",
    navy: "#0F2A44",
    navySoft: "#1C3E60",
    navyLine: "rgba(255,255,255,0.12)",
    accent: "#2F7DE1",
    accentSoft: "#EAF2FF",
    amber: "#C97A1E",
    amberSoft: "#FDF3E3",
    green: "#2A7D4F",
    greenSoft: "#E7F5EC",
    red: "#C6362C",
    redSoft: "#FBEAE9",
  },
  font: {
    display: "'IBM Plex Sans', 'Segoe UI', Arial, sans-serif",
    mono: "'IBM Plex Mono', 'SFMono-Regular', Menlo, monospace",
  },
};

const mastersMenu = [
  { id: "regions", label: "SSR Regions", status: "active", icon: "🗺" },
  { id: "categories", label: "SSR Categories", status: "active", icon: "🗂" },
  { id: "units", label: "Units", status: "upcoming", icon: "📏" },
  { id: "materials", label: "Materials", status: "upcoming", icon: "🧱" },
  { id: "rates", label: "Rates", status: "upcoming", icon: "💰" },
  { id: "items", label: "SSR Items", status: "active", icon: "📋" },
  { id: "works", label: "Works Master", status: "active", icon: "🏗" },
  { id: "sub-work", label: "Sub Work Master", status: "active", icon: "🧩" },
  {
    id: "master-projects",
    label: "Master Projects",
    status: "active",
    icon: "📁",
  },
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
// Small presentational helpers (pure UI, no logic)
// ─────────────────────────────────────────────────────────────────────────────

function RequiredLabel({ children }) {
  return (
    <span>
      {children}{" "}
      <span style={{ color: theme.colors.red, fontWeight: 700 }}>*</span>
    </span>
  );
}

function Card({ eyebrow, title, subtitle, children, style }) {
  return (
    <section
      style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.line}`,
        borderRadius: 12,
        padding: "22px 24px",
        marginBottom: 24,
        boxShadow: "0 1px 2px rgba(15,42,68,0.04)",
        ...style,
      }}
    >
      {eyebrow && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: theme.colors.accent,
            marginBottom: 6,
          }}
        >
          {eyebrow}
        </div>
      )}
      {title && (
        <h2 style={{ margin: 0, fontSize: 20, color: theme.colors.ink }}>
          {title}
        </h2>
      )}
      {subtitle && (
        <p
          style={{
            marginTop: 6,
            marginBottom: 18,
            color: theme.colors.inkSoft,
            fontSize: 13.5,
          }}
        >
          {subtitle}
        </p>
      )}
      {children}
    </section>
  );
}

function FormShell({ children, onSubmit }) {
  return (
    <form
      onSubmit={onSubmit}
      style={{
        background: theme.colors.paper,
        border: `1px solid ${theme.colors.line}`,
        borderRadius: 10,
        padding: 18,
        marginBottom: 22,
      }}
    >
      {children}
    </form>
  );
}

function Field({ label, required, children, span }) {
  return (
    <label
      style={{
        display: "grid",
        gap: 6,
        gridColumn: span ? "1 / -1" : undefined,
      }}
    >
      <span
        style={{ fontSize: 12.5, fontWeight: 600, color: theme.colors.inkSoft }}
      >
        {required ? <RequiredLabel>{label}</RequiredLabel> : label}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  fontSize: 13.5,
  padding: "9px 11px",
  borderRadius: 7,
  border: `1px solid ${theme.colors.line}`,
  background: theme.colors.surface,
  color: theme.colors.ink,
  fontFamily: theme.font.display,
  width: "70%",
};

function PrimaryButton({ children, style, ...props }) {
  return (
    <button
      type="submit"
      {...props}
      style={{
        fontSize: 13.5,
        fontWeight: 600,
        padding: "10px 18px",
        borderRadius: 8,
        border: `1px solid ${theme.colors.accent}`,
        background: props.disabled ? "#9FC0EE" : theme.colors.accent,
        color: "#fff",
        cursor: props.disabled ? "default" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, style, ...props }) {
  return (
    <button
      type="button"
      {...props}
      style={{
        fontSize: 13.5,
        fontWeight: 600,
        padding: "10px 18px",
        borderRadius: 8,
        border: `1px solid ${theme.colors.line}`,
        background: "#fff",
        color: theme.colors.ink,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function GhostIconButton({ children, tone = theme.colors.inkSoft, ...props }) {
  return (
    <button
      type="button"
      {...props}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: tone,
        fontSize: 14,
        padding: "5px 7px",
        borderRadius: 6,
      }}
    >
      {children}
    </button>
  );
}

function Badge({ children, tone = "neutral" }) {
  const map = {
    neutral: { bg: "#EEF1F4", fg: theme.colors.inkSoft },
    green: { bg: theme.colors.greenSoft, fg: theme.colors.green },
    red: { bg: theme.colors.redSoft, fg: theme.colors.red },
    amber: { bg: theme.colors.amberSoft, fg: theme.colors.amber },
    accent: { bg: theme.colors.accentSoft, fg: theme.colors.accent },
  }[tone];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        padding: "3px 9px",
        borderRadius: 999,
        background: map.bg,
        color: map.fg,
      }}
    >
      {children}
    </span>
  );
}

function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          textAlign: "center",
          color: theme.colors.inkSoft,
          fontStyle: "italic",
          padding: "22px 10px",
        }}
      >
        {children}
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
  const [selectedWorkId, setSelectedWorkId] = useState(0);
  const [selectedItems, setSelectedItems] = useState([]);
  const [checkedItemIds, setCheckedItemIds] = useState([]);
  const [checkedItemsList, setCheckedItemsList] = useState([]);
  const [updateSelectedItems, setUpdateSelectedItems] = useState([]);
  const [generateReportModalOpen, setGenerateReportModalOpen] = useState(false);

  // Which items in the Checked Items tab have their panel open (tied to checkbox)
  const [checkedForMeasurement, setCheckedForMeasurement] = useState(new Set());
  const initialWorkForm = {
    WorkName: "",
    ProjectId: "",
  };

  const [workForm, setWorkForm] = useState(initialWorkForm);

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

  const insertWork = (e) => {
    e.preventDefault();
    const user = JSON.parse(sessionStorage.getItem("werms_user"));
    axios
      .post(`${API_BASE}/api/insert-work`, {
        workName: workForm.WorkName,
        projectId: selectedProjectId,
        userId: user.UserId,
        remarks: "",
      })
      .then((res) => {
        if (res.status === 201) {
          const data = res.data;
          alert(data.message);
        }
      })
      .catch(console.error);
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
    getCheckedItems();
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
    // const user = JSON.parse(sessionStorage.getItem("werms_user"));
    // axios
    //   .post(`${API_BASE}/api/insert-project`, {
    //     projectName: projectForm.ProjectName,
    //     userId: user.UserId,
    //   })
    //   .then((res) => {
    //     if (res.status === 201) {
    //       const data = res.data;
    //       alert(data.message);
    //     }
    //   })
    //   .catch(console.error);
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
    const orgId = user.OrganizationId;
    axios
      .get(`${API_BASE}/api/load-projects`, {
        params: {
          org_id: orgId,
        },
      })
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
      .get(`${API_BASE}/api/work-abstract-get`, {
        params: {
          workId: selectedProjectId,
          subWorkId: selectedSubWorkId,
        },
      })
      .then((res) => {
        if (res.status === 200) {
          console.log(res.data);
          const ids = res.data.data.map((row) => Number(row.ItemId));
          console.log("Checked Item Ids (from frontend): ", ids);
          setCheckedItemIds(ids);
        }
      })
      .catch(console.error);
  };

  const getCheckedItemsList = () => {
    console.log("Get checked Items List Called..//");
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

  const handleGenerateRecapReport = async () => {
    if (!selectedProjectId) {
      alert("Please select a Work first.");
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/api/generate-recap-report`, {
        params: { projectId: selectedProjectId },
        responseType: "blob", // ← required: tells axios to keep raw binary data, not try to parse as JSON/text
      });

      // Pull the filename the server sent, if present, otherwise fall back
      const disposition = res.headers["content-disposition"];
      let filename = "Recapitulation.pdf";
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate recap report:", err);
      alert("Failed to generate the recapitulation report. Please try again.");
    }
  };

  const handleGenerateMeasurementReport = async () => {
    try {
      const res = await axios.get(
        `${API_BASE}/api/generate-measurement-report`,
        {
          params: {
            projectId: selectedProjectId,
            subWorkId: selectedSubWorkId,
          },
          responseType: "blob", // ← required: tells axios to keep raw binary data, not try to parse as JSON/text
        },
      );

      // Pull the filename the server sent, if present, otherwise fall back
      const disposition = res.headers["content-disposition"];
      let filename = "Measurement.pdf";
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate measurement report:", err);
      alert("Failed to generate the measurement report. Please try again.");
    }
  };

  const handleGenerateItemCatalogueReport = async () => {
    try {
      const res = await axios.get(
        `${API_BASE}/api/generate-item-catalog-report`,
        {
          params: {
            ssrYearId: 7,
            regionId: itemRegion,
            categoryId: itemCategoryId,
            subCategoryId: subCategoryItemId,
          },
          responseType: "blob",
        },
      );

      const disposition = res.headers["content-disposition"];
      let filename = "Item_Catalogue.pdf";
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate item catalogue report:", err);
      alert("Failed to generate the item catalogue report. Please try again.");
    }
  };

  useEffect(() => {
    loadRegions();
    loadCategories();
    loadProjects();
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

  const activeMasterMeta = mastersMenu.find((m) => m.id === activeMaster);
  const isErrorMessage = /failed/i.test(message);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }
        html,
        body {
          margin: 0;
          background: ${theme.colors.paper};
        }
        input,
        select,
        button {
          font-family: ${theme.font.display};
        }
        input:focus,
        select:focus,
        button:focus-visible {
          outline: 2px solid ${theme.colors.accent};
          outline-offset: 1px;
        }
        .wrms-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13.5px;
        }
        .wrms-table thead th {
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #fff;
          background: ${theme.colors.navy};
          padding: 11px 12px;
        }
        .wrms-table tbody td {
          padding: 10px 12px;
          border-bottom: 1px solid ${theme.colors.line};
        }
        .wrms-table tbody tr:nth-child(even) {
          background: #fbfaf5;
        }
        .wrms-table tbody tr:hover {
          background: ${theme.colors.accentSoft};
        }
        .wrms-shell {
          display: flex;
          min-height: 100vh;
        }
        .wrms-aside {
          width: 232px;
          flex-shrink: 0;
        }
        @media (max-width: 860px) {
          .wrms-shell {
            flex-direction: column;
          }
          .wrms-aside {
            width: 100%;
            position: static !important;
            height: auto !important;
          }
          .wrms-nav-list {
            display: flex !important;
            overflow-x: auto;
            gap: 6px;
          }
        }
      `}</style>

      <div
        className="wrms-shell"
        style={{ fontFamily: theme.font.display, color: theme.colors.ink }}
      >
        {/* ── Sidebar ── */}
        <aside
          className="wrms-aside"
          style={{
            background: theme.colors.navy,
            color: "#fff",
            padding: "26px 16px",
            position: "sticky",
            top: 0,
            height: "100vh",
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "0 10px", marginBottom: 28 }}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#8FA9C7",
              }}
            >
              WERMS
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>
              Estimate Workspace
            </div>
          </div>

          <div className="wrms-nav-list" style={{ display: "grid", gap: 3 }}>
            {mastersMenu.map((item) => {
              const isActive = activeMaster === item.id;
              const isUpcoming = item.status === "upcoming";
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isUpcoming}
                  onClick={() => setActiveMaster(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 10px",
                    borderRadius: 8,
                    border: "none",
                    background: isActive ? theme.colors.accent : "transparent",
                    color: isUpcoming ? "#5D7590" : "#fff",
                    fontWeight: isActive ? 700 : 500,
                    fontSize: 13.5,
                    cursor: isUpcoming ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ fontSize: 15 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {isUpcoming && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "#8FA9C7",
                        border: "1px solid #2C4A69",
                        borderRadius: 999,
                        padding: "2px 6px",
                      }}
                    >
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, padding: "36px 44px", maxWidth: 1160 }}>
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: theme.colors.accent,
              }}
            >
              Masters {activeMasterMeta ? `· ${activeMasterMeta.label}` : ""}
            </div>
            <h1
              style={{
                margin: "4px 0 6px",
                fontSize: 28,
                color: theme.colors.ink,
              }}
            >
              Masters Management
            </h1>
            <p style={{ margin: 0, color: theme.colors.inkSoft, fontSize: 14 }}>
              Manage the reference data behind your estimates — regions,
              categories, items, works and sub-works.
            </p>
          </div>

          {message && (
            <div
              style={{
                padding: "11px 16px",
                marginBottom: 20,
                borderRadius: 8,
                fontSize: 13.5,
                background: isErrorMessage
                  ? theme.colors.redSoft
                  : theme.colors.greenSoft,
                color: isErrorMessage ? theme.colors.red : theme.colors.green,
                border: `1px solid ${isErrorMessage ? "#F0C6C2" : "#C9E6D3"}`,
              }}
            >
              {message}
            </div>
          )}

          {/* ── Regions ── */}
          {activeMaster === "regions" && (
            <Card
              eyebrow="Master · SSR Region"
              title={
                editingRegionId
                  ? `Edit region #${editingRegionId}`
                  : "SSR Regions"
              }
              subtitle="Regions used to scope SSR categories, items and rates."
            >
              <FormShell onSubmit={onRegionSubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <Field label="SSR Region Name" required>
                    <input
                      name="SSRRegionName"
                      value={regionForm.SSRRegionName}
                      onChange={onRegionChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="SSR Region Short Name" required>
                    <input
                      name="SSRRegionShortName"
                      value={regionForm.SSRRegionShortName}
                      onChange={onRegionChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder">
                    <input
                      name="DOrder"
                      value={regionForm.DOrder}
                      onChange={onRegionChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder1">
                    <input
                      name="DOrder1"
                      value={regionForm.DOrder1}
                      onChange={onRegionChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Remarks" span>
                    <input
                      name="Remarks"
                      value={regionForm.Remarks}
                      onChange={onRegionChange}
                      style={inputStyle}
                    />
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton disabled={savingRegion}>
                    {savingRegion
                      ? "Saving…"
                      : editingRegionId
                        ? "Update region"
                        : "Save region"}
                  </PrimaryButton>
                  {editingRegionId && (
                    <SecondaryButton onClick={resetRegionEdit}>
                      Cancel edit
                    </SecondaryButton>
                  )}
                </div>
              </FormShell>

              <div
                style={{
                  overflowX: "auto",
                  border: `1px solid ${theme.colors.line}`,
                  borderRadius: 10,
                }}
              >
                <table className="wrms-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Short name</th>
                      <th>DOrder</th>
                      <th>DOrder1</th>
                      <th>Remarks</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRegions ? (
                      <EmptyRow colSpan={7}>Loading…</EmptyRow>
                    ) : regions.length ? (
                      regions.map((r) => (
                        <tr key={r.SSRRegionId}>
                          <td
                            style={{
                              fontFamily: theme.font.mono,
                              color: theme.colors.inkSoft,
                            }}
                          >
                            {r.SSRRegionId}
                          </td>
                          <td>{r.SSRRegionName}</td>
                          <td>{r.SSRRegionShortName}</td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {r.DOrder ?? ""}
                          </td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {r.DOrder1 ?? ""}
                          </td>
                          <td>{r.Remarks ?? ""}</td>
                          <td>
                            <GhostIconButton
                              tone={theme.colors.accent}
                              onClick={() => startRegionEdit(r)}
                            >
                              ✎ Edit
                            </GhostIconButton>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={7}>
                        No region rows yet — add one above.
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Categories ── */}
          {activeMaster === "categories" && (
            <Card
              eyebrow="Master · SSR Category"
              title={
                editingCategoryId
                  ? `Edit category #${editingCategoryId}`
                  : "SSR Categories"
              }
              subtitle="Categories nest under a region and group SSR items."
            >
              <FormShell onSubmit={onCategorySubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <Field label="SSR Region" required>
                    <select
                      name="SSRRegionId"
                      value={categoryForm.SSRRegionId}
                      onChange={onCategoryChange}
                      required
                      style={inputStyle}
                    >
                      <option value="">Select SSR Region</option>
                      {regions.map((r) => (
                        <option key={r.SSRRegionId} value={r.SSRRegionId}>
                          {r.SSRRegionShortName || r.SSRRegionName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="SSR Category Name" required>
                    <input
                      name="SSRCategoryName"
                      value={categoryForm.SSRCategoryName}
                      onChange={onCategoryChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="SSR Category Short Name" required>
                    <input
                      name="SSRCategoryShortName"
                      value={categoryForm.SSRCategoryShortName}
                      onChange={onCategoryChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder">
                    <input
                      name="DOrder"
                      value={categoryForm.DOrder}
                      onChange={onCategoryChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder1">
                    <input
                      name="DOrder1"
                      value={categoryForm.DOrder1}
                      onChange={onCategoryChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Remarks" span>
                    <input
                      name="Remarks"
                      value={categoryForm.Remarks}
                      onChange={onCategoryChange}
                      style={inputStyle}
                    />
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton disabled={savingCategory}>
                    {savingCategory
                      ? "Saving…"
                      : editingCategoryId
                        ? "Update category"
                        : "Save category"}
                  </PrimaryButton>
                  {editingCategoryId && (
                    <SecondaryButton onClick={resetCategoryEdit}>
                      Cancel edit
                    </SecondaryButton>
                  )}
                </div>
              </FormShell>

              <div
                style={{
                  overflowX: "auto",
                  border: `1px solid ${theme.colors.line}`,
                  borderRadius: 10,
                }}
              >
                <table className="wrms-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Region</th>
                      <th>Name</th>
                      <th>Short name</th>
                      <th>DOrder</th>
                      <th>DOrder1</th>
                      <th>Remarks</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingCategories ? (
                      <EmptyRow colSpan={8}>Loading…</EmptyRow>
                    ) : categories.length ? (
                      categories.map((c) => (
                        <tr key={c.SSRCategoryId}>
                          <td
                            style={{
                              fontFamily: theme.font.mono,
                              color: theme.colors.inkSoft,
                            }}
                          >
                            {c.SSRCategoryId}
                          </td>
                          <td>
                            <Badge tone="accent">
                              {getRegionShortNameById(c.SSRRegionId) ||
                                c.SSRRegionShortName ||
                                c.SSRRegionName}
                            </Badge>
                          </td>
                          <td>{c.SSRCategoryName}</td>
                          <td>{c.SSRCategoryShortName}</td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {c.DOrder ?? ""}
                          </td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {c.DOrder1 ?? ""}
                          </td>
                          <td>{c.Remarks ?? ""}</td>
                          <td>
                            <GhostIconButton
                              tone={theme.colors.accent}
                              onClick={() => startCategoryEdit(c)}
                            >
                              ✎ Edit
                            </GhostIconButton>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={8}>
                        No category rows yet — add one above.
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Items ── */}
          {activeMaster === "items" && (
            <>
              <Card
                eyebrow="Master · SSR Item"
                title="Find SSR Items"
                subtitle="Filter by work, region, category and sub-category, then view matching items."
              >
                <FormShell onSubmit={loadItems}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                    }}
                  >
                    <Field label="Select Work" required>
                      <select
                        name="Projects"
                        value={selectedProjectId}
                        onChange={(e) => {
                          const project = e.target.value;
                          setSelectedProjectId(project);
                          loadSubWorks(project);
                        }}
                        style={inputStyle}
                      >
                        <option>Select Work Name</option>
                        {projects.map((project) => (
                          <option
                            key={project.ProjectId}
                            value={project.ProjectId}
                          >
                            {project.ProjectName}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Select Sub Work" required>
                      <select
                        name="SubWork"
                        value={selectedSubWorkId}
                        onChange={(e) => setSelectedSubWorkId(e.target.value)}
                        disabled={!selectedProjectId}
                        style={inputStyle}
                      >
                        <option>Select Sub Work</option>
                        {subWorks.map((subWork) => (
                          <option
                            key={subWork.SubWorkId}
                            value={subWork.SubWorkId}
                          >
                            {subWork.SubWorkName}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="SSR Region" required>
                      <select
                        name="SSRRegionId"
                        value={itemRegion}
                        onChange={(e) => {
                          setItemRegion(e.target.value);
                          loadRegionBasedCategories();
                        }}
                        required
                        style={inputStyle}
                      >
                        <option value="">Select SSR Region</option>
                        {regions.map((r) => (
                          <option key={r.SSRRegionId} value={r.SSRRegionId}>
                            {r.SSRRegionShortName || r.SSRRegionName}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="SSR Category" required>
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
                        style={inputStyle}
                      >
                        <option value="">Select SSR Category</option>
                        {itemCategories
                          .filter(
                            (c) => String(c.SSRRegionId) === String(itemRegion),
                          )
                          .map((c) => (
                            <option
                              key={c.SSRCategoryId}
                              value={c.SSRCategoryId}
                            >
                              {c.SSRCategoryShortName || c.SSRCategoryName}
                            </option>
                          ))}
                      </select>
                    </Field>

                    <Field label="SSR Sub Category" required span>
                      <select
                        name="SSRSubCategoryId"
                        value={subCategoryItemId}
                        onChange={(e) => setSubCategoryItemId(e.target.value)}
                        required
                        disabled={!itemCategoryId}
                        style={inputStyle}
                      >
                        <option value="">Select SSR Sub Category</option>
                        {subCategories.map((s) => (
                          <option
                            key={s.SSRSubCategoryId}
                            value={s.SSRSubCategoryId}
                          >
                            {s.SSRSubCategoryName}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <PrimaryButton>View</PrimaryButton>
                    <Button
                      color="primary"
                      variant="solid"
                      onClick={() => getCheckedItemsList()}
                      sx={{
                        marginLeft: 5,
                        fontSize: 13,
                        textTransform: "none",
                      }}
                    >
                      View Checked Items
                    </Button>
                    <Button
                      color="primary"
                      variant="solid"
                      onClick={() => handleGenerateItemCatalogueReport()}
                      sx={{
                        marginLeft: 5,
                        fontSize: 13,
                        textTransform: "none",
                      }}
                    >
                      Generate Item Catalogue Report
                    </Button>
                    <Button
                      color="primary"
                      variant="solid"
                      onClick={() => setGenerateReportModalOpen(true)}
                      sx={{
                        marginLeft: 5,
                        fontSize: 13,
                        textTransform: "none",
                      }}
                    >
                      Generate Abstract Report
                    </Button>
                    <Button
                      color="primary"
                      variant="solid"
                      onClick={() => handleGenerateRecapReport()}
                      sx={{
                        marginLeft: 5,
                        fontSize: 13,
                        textTransform: "none",
                      }}
                    >
                      Generate Recap Report
                    </Button>
                    <Button
                      color="primary"
                      variant="solid"
                      onClick={() => handleGenerateMeasurementReport()}
                      sx={{
                        marginLeft: 5,
                        fontSize: 13,
                        textTransform: "none",
                      }}
                    >
                      Generate Measurement Report
                    </Button>
                  </div>
                </FormShell>
              </Card>

              <Card style={{ paddingTop: 8 }}>
                <Tabs
                  sx={{
                    "--Tabs-gap": "0px",
                    background: "transparent",
                  }}
                >
                  <TabList
                    sx={{
                      gap: 2,
                      borderBottom: `2px solid ${theme.colors.line}`,
                      "--ListItem-minHeight": "40px",
                    }}
                  >
                    <Tab
                      value={0}
                      sx={{
                        fontWeight: 600,
                        fontSize: 13,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      SSR Items List
                    </Tab>
                    <Tab
                      value={1}
                      sx={{
                        fontWeight: 600,
                        fontSize: 13,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Checked Items List
                    </Tab>
                  </TabList>

                  {/* ── Tab 0: SSR Items List ── */}
                  <TabPanel value={0}>
                    {itemList.length > 0 ? (
                      <div style={{ marginTop: 18 }}>
                        <div
                          style={{
                            overflowX: "auto",
                            border: `1px solid ${theme.colors.line}`,
                            borderRadius: 10,
                          }}
                        >
                          <table className="wrms-table">
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
                                          selectedItems.includes(
                                            Number(item.ItemId),
                                          )
                                        }
                                        onChange={(e) => {
                                          const itemId = Number(item.ItemId);
                                          if (e.target.checked) {
                                            setSelectedItems((prev) => [
                                              ...new Set([...prev, itemId]),
                                            ]);
                                          } else {
                                            setSelectedItems((prev) =>
                                              prev.filter(
                                                (id) => id !== itemId,
                                              ),
                                            );
                                          }
                                        }}
                                      />
                                    )}
                                  </td>
                                  <td
                                    style={{
                                      fontFamily: theme.font.mono,
                                      color: theme.colors.inkSoft,
                                    }}
                                  >
                                    {item.ItemId}
                                  </td>
                                  <td style={{ fontFamily: theme.font.mono }}>
                                    {item.ItemNumber}
                                  </td>
                                  <td>{item.ItemDescription}</td>
                                  <td
                                    style={{
                                      fontFamily: theme.font.mono,
                                      textAlign: "right",
                                    }}
                                  >
                                    {item.CompletedRate}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ marginTop: 14 }}>
                          <PrimaryButton type="button" onClick={listInsert}>
                            Insert
                          </PrimaryButton>
                        </div>
                      </div>
                    ) : (
                      <p
                        style={{
                          color: theme.colors.inkSoft,
                          fontSize: 13.5,
                          marginTop: 18,
                          fontStyle: "italic",
                        }}
                      >
                        Run a search above to list matching SSR items.
                      </p>
                    )}
                  </TabPanel>

                  {/* ── Tab 1: Checked Items List — measurement panel auto-shows on checkbox ── */}
                  <TabPanel value={1}>
                    {checkedItemsList.length > 0 ? (
                      <div style={{ marginTop: 18 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "flex-start",
                            padding: "10px 14px",
                            marginBottom: 14,
                            background: theme.colors.accentSoft,
                            border: "1px solid #CFE1FA",
                            borderRadius: 8,
                            fontSize: 13,
                            color: theme.colors.ink,
                          }}
                        >
                          <span>📐</span>
                          <span>
                            Check a row to open its measurement panel. Enter
                            expressions like{" "}
                            <code style={{ fontFamily: theme.font.mono }}>
                              3.5+2.1+1.8
                            </code>{" "}
                            — quantity is computed automatically.
                          </span>
                        </div>
                        <div
                          style={{
                            overflowX: "auto",
                            border: `1px solid ${theme.colors.line}`,
                            borderRadius: 10,
                          }}
                        >
                          <table className="wrms-table">
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
                                        isOpen
                                          ? {
                                              background:
                                                theme.colors.accentSoft,
                                            }
                                          : undefined
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
                                      <td
                                        style={{
                                          fontFamily: theme.font.mono,
                                          color: theme.colors.inkSoft,
                                        }}
                                      >
                                        {item.ItemId}
                                      </td>
                                      <td
                                        style={{ fontFamily: theme.font.mono }}
                                      >
                                        {item.ItemNumber}
                                      </td>
                                      <td>{item.ItemDescription}</td>
                                      <td
                                        style={{
                                          fontFamily: theme.font.mono,
                                          textAlign: "right",
                                        }}
                                      >
                                        {item.CompletedRate}
                                      </td>
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
                        </div>
                        <div style={{ marginTop: 14 }}>
                          <PrimaryButton type="button" onClick={listUpdate}>
                            Update
                          </PrimaryButton>
                        </div>
                      </div>
                    ) : (
                      <p
                        style={{
                          color: theme.colors.inkSoft,
                          fontSize: 13.5,
                          marginTop: 18,
                          fontStyle: "italic",
                        }}
                      >
                        Click "View" above to load checked items for the
                        selected project and sub-work.
                      </p>
                    )}
                  </TabPanel>
                </Tabs>
              </Card>
            </>
          )}

          {/* ── Works ── */}
          {activeMaster === "works" && (
            <Card
              eyebrow="Master · Work"
              title="Master Work"
              subtitle="Works group sub-works and estimates under an optional project."
            >
              <FormShell onSubmit={insertWork}>
                <Field label="Select Project (optional)">
                  <select
                    name="MasterProject"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select Project</option>
                    {projects.map((c) => (
                      <option key={c.ProjectId} value={c.ProjectId}>
                        {c.ProjectCode + c.ProjectName || c.ProjectName}
                      </option>
                    ))}
                  </select>
                </Field>

                <div style={{ marginTop: 14 }}>
                  <Field label="Work Name" required>
                    <input
                      type="text"
                      value={workForm.WorkName}
                      onChange={(e) =>
                        setWorkForm((prev) => ({
                          ...prev,
                          WorkName: e.target.value,
                        }))
                      }
                      required
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <div style={{ marginTop: 18 }}>
                  <PrimaryButton>Save Work</PrimaryButton>
                </div>
              </FormShell>
            </Card>
          )}

          {/* ── Sub Work ── */}
          {activeMaster === "sub-work" && (
            <Card
              eyebrow="Master · Sub Work"
              title="Master Sub Work"
              subtitle="Sub-works break a project down into measurable units of work."
            >
              <FormShell onSubmit={insertSubWork}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <Field label="Project" required>
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
                      style={inputStyle}
                    >
                      <option value="">Select Project</option>
                      {projects.map((project) => (
                        <option
                          key={project.ProjectId}
                          value={project.ProjectId}
                        >
                          {project.ProjectName}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Sub Work Name" required>
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
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton>Save Sub Work</PrimaryButton>
                </div>
              </FormShell>

              <div
                style={{
                  overflowX: "auto",
                  border: `1px solid ${theme.colors.line}`,
                  borderRadius: 10,
                }}
              >
                <table className="wrms-table">
                  <thead>
                    <tr>
                      <th>Sub Work ID</th>
                      <th>Sub Work Name</th>
                      <th>Mark for deletion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subWorks.length > 0 ? (
                      subWorks.map((subWork) => (
                        <tr key={subWork.SubWorkId}>
                          <td
                            style={{
                              fontFamily: theme.font.mono,
                              color: theme.colors.inkSoft,
                            }}
                          >
                            {subWork.SubWorkId}
                          </td>
                          <td>{subWork.SubWorkName}</td>
                          <td>
                            <Badge
                              tone={subWork.MarkForDeletion ? "red" : "green"}
                            >
                              {subWork.MarkForDeletion ? "Yes" : "No"}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={3}>
                        No sub works found — add one above.
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </main>
      </div>
      <GenerateReportModal
        open={generateReportModalOpen}
        onClose={() => setGenerateReportModalOpen(false)}
        API_BASE={API_BASE}
        projects={projects}
        defaultProjectId={selectedProjectId}
      />
    </>
  );
}
