import { Fragment, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import axios from "axios";
import {
  TabList,
  Tabs,
  Tab,
  TabPanel,
  Button,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
} from "@mui/joy";
import MeasurementPanel from "../components/MeasurementPanel";
import GenerateReportModal from "../components/GenerateReportModal";
import UserProfileModal from "../components/UserProfileModal";

const SESSION_KEY = "werms_user";

const API_BASE = "https://estimate-project-omega.vercel.app";
//const API_BASE = "http://localhost:4000";

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

const superAdminMenu = [
  {
    id: "organizations",
    label: "Organizations",
    status: "active",
    icon: "🏢",
  },
  { id: "users", label: "Users", status: "active", icon: "👤" },
  {
    id: "designations",
    label: "Designations",
    status: "active",
    icon: "🏷",
  },
  { id: "regions", label: "SSR Regions", status: "active", icon: "🗺" },
  { id: "categories", label: "SSR Categories", status: "active", icon: "🗂" },
  {
    id: "subcategories",
    label: "SSR Subcategories",
    status: "active",
    icon: "📂",
  },
  { id: "units", label: "Units", status: "active", icon: "📏" },
  {
    id: "materials",
    label: "Material Components",
    status: "active",
    icon: "🧱",
  },
  {
    id: "print-ssr",
    label: "Print SSR",
    status: "active",
    icon: "🖨",
  },
];

const allUsersMenu = [
  {
    id: "item-master",
    label: "Item Master",
    status: "active",
    icon: "📑",
  },
  {
    id: "master-projects",
    label: "Project Master",
    status: "active",
    icon: "📁",
  },
  { id: "works", label: "Work Master", status: "active", icon: "🏗" },
  { id: "sub-work", label: "Sub Work Master", status: "active", icon: "🧩" },
  { id: "items", label: "Estimation", status: "active", icon: "📋" },
];

const initialProjectForm = {
  OrganizationId: "",
  ProjectCode: "",
  ProjectName: "",
  ClientName: "",
  ClientAddress: "",
  ClientContactInfo: "",
  DOrder: "",
  Remarks: "",
  ArchAssigned: "",
  EngrAssigned: "",
  MarkForDeletion: false,
};

const initialOrganizationForm = {
  OrgCode: "",
  OrgName: "",
  OrgAddress: "",
  OrgCountryId: "",
  OrgStateId: "",
  OrgDistrictId: "",
  OrgPinZip: "",
  OrgEmail: "",
  OrgContact: "",
  OrgContactPerson: "",
  OrgConPerDesig: "",
  DOrder: "",
  DOrder1: "",
  MarkForDeletion: false,
};

const initialUserMasterForm = {
  OrganizationId: "",
  UserCategoryId: "",
  DesignationId: "",
  UserLoginName: "",
  UserName: "",
  UserPWD: "",
  UserAddress: "",
  UserDateOfJoining: "",
  UserDateOfBirth: "",
  UserContact: "",
  UserEmail: "",
  DateOfRelieving: "",
  DOrder: "",
  Remarks: "",
  IsActive: true,
  MarkForDeletion: false,
};

const initialDesignationForm = {
  OrganizationId: "",
  DesignationName: "",
  DesignationShortName: "",
  BranchId: "",
  Remarks: "",
  DOrder: "",
  DOrder1: "",
  MarkForDeletion: false,
};

function toDateInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatRupees(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const mastersMenu = [...superAdminMenu, ...allUsersMenu];

function isSuperAdminUser(user) {
  const category = String(user?.UserCategoryName || "")
    .trim()
    .toLowerCase();
  return category === "superadmin" || category === "super admin";
}

function isOrgAdminUser(user) {
  const category = String(user?.UserCategoryName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return category === "orgadmin";
}

function isIndvUserUser(user) {
  const category = String(user?.UserCategoryName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return category === "indvuser";
}

/** NON SSR region locks for Item Master (OrgAdmin=3, IndvUser=4). */
const ITEM_MASTER_ORG_ADMIN_REGION_ID = 3;
const ITEM_MASTER_INDV_USER_REGION_ID = 4;

function getItemMasterAllowedRegionId(user) {
  if (isOrgAdminUser(user)) return ITEM_MASTER_ORG_ADMIN_REGION_ID;
  if (isIndvUserUser(user)) return ITEM_MASTER_INDV_USER_REGION_ID;
  return null;
}

function canAccessItemMaster(user) {
  return (
    isSuperAdminUser(user) || isOrgAdminUser(user) || isIndvUserUser(user)
  );
}

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

const initialSubCategoryForm = {
  SSRRegionId: "",
  SSRCategoryId: "",
  SSRSubCategoryName: "",
  SSRSubCategoryShortName: "",
  DOrder: "",
  DOrder1: "",
  Remarks: "",
  MarkForDeletion: false,
};

const initialUnitForm = {
  UnitName: "",
  UnitShortName: "",
  DOrder: "",
  DOrder1: "",
  Remarks: "",
  MarkForDeletion: false,
};

const initialItemMasterForm = {
  ItemId: "",
  UserId: "",
  RegionId: "",
  CategoryId: "",
  SubCategoryId: "",
  SSRYearId: "",
  UnitId: "",
  ItemNumber: "",
  ItemDescription: "",
  ItemShortDescription: "",
  CompletedRate: "",
  LabourRate: "",
  PageNumber: "",
};

const initialMaterialComponentForm = {
  MaterialId: "",
  MaterialComponent: "",
  MaterialUnitId: "",
};

function createMaterialDraftRow() {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    MaterialId: "",
    MaterialComponent: "",
    MaterialUnitId: "",
  };
}

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
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeMaster, setActiveMaster] = useState("items");
  const [regionForm, setRegionForm] = useState(initialRegionForm);
  const [categoryForm, setCategoryForm] = useState(initialCategoryForm);
  const [regions, setRegions] = useState([]);
  const [estimationRegions, setEstimationRegions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [savingRegion, setSavingRegion] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingRegionId, setEditingRegionId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [subCategoryForm, setSubCategoryForm] = useState(initialSubCategoryForm);
  const [subCategoryList, setSubCategoryList] = useState([]);
  const [loadingSubCategories, setLoadingSubCategories] = useState(false);
  const [savingSubCategory, setSavingSubCategory] = useState(false);
  const [editingSubCategoryId, setEditingSubCategoryId] = useState(null);
  const [unitForm, setUnitForm] = useState(initialUnitForm);
  const [unitList, setUnitList] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [itemMasterForm, setItemMasterForm] = useState(initialItemMasterForm);
  const [itemMasterList, setItemMasterList] = useState([]);
  const [loadingItemMaster, setLoadingItemMaster] = useState(false);
  const [savingItemMaster, setSavingItemMaster] = useState(false);
  const [editingItemMasterId, setEditingItemMasterId] = useState(null);
  const [itemMasterYears, setItemMasterYears] = useState([]);
  const [itemMasterCategories, setItemMasterCategories] = useState([]);
  const [itemMasterSubCategories, setItemMasterSubCategories] = useState([]);
  const [itemMasterFilterRegionId, setItemMasterFilterRegionId] = useState("");
  const [itemMasterFilterYearId, setItemMasterFilterYearId] = useState("");
  const [itemMasterFilterCategoryId, setItemMasterFilterCategoryId] =
    useState("");
  const [itemMasterFilterSubCategoryId, setItemMasterFilterSubCategoryId] =
    useState("");
  const [itemMasterListYears, setItemMasterListYears] = useState([]);
  const [itemMasterListCategories, setItemMasterListCategories] = useState([]);
  const [itemMasterListSubCategories, setItemMasterListSubCategories] =
    useState([]);
  const [materialRegionId, setMaterialRegionId] = useState("");
  const [materialSsrYearId, setMaterialSsrYearId] = useState("");
  const [materialSsrYears, setMaterialSsrYears] = useState([]);
  const [materialCategoryId, setMaterialCategoryId] = useState("");
  const [materialSubCategoryId, setMaterialSubCategoryId] = useState("");
  const [materialCategories, setMaterialCategories] = useState([]);
  const [materialSubCategories, setMaterialSubCategories] = useState([]);
  const [materialItemList, setMaterialItemList] = useState([]);
  const [loadingMaterialItems, setLoadingMaterialItems] = useState(false);
  const [selectedMaterialItemId, setSelectedMaterialItemId] = useState(null);
  const [materialMasterList, setMaterialMasterList] = useState([]);
  const [materialComponentList, setMaterialComponentList] = useState([]);
  const [loadingMaterialComponents, setLoadingMaterialComponents] =
    useState(false);
  const [materialComponentForm, setMaterialComponentForm] = useState(
    initialMaterialComponentForm,
  );
  const [materialDraftRows, setMaterialDraftRows] = useState([
    createMaterialDraftRow(),
  ]);
  const [editingMaterialComponentId, setEditingMaterialComponentId] =
    useState(null);
  const [savingMaterialComponent, setSavingMaterialComponent] = useState(false);
  const [message, setMessage] = useState("");

  const [itemRegion, setItemRegion] = useState("");
  const [itemSsrYearId, setItemSsrYearId] = useState("");
  const [ssrYears, setSsrYears] = useState([]);
  const [itemCategories, setItemCategories] = useState([]);
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [subCategories, setSubCategories] = useState([]);
  const [subCategoryItemId, setSubCategoryItemId] = useState("");
  const [itemList, setItemList] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectMasterList, setProjectMasterList] = useState([]);
  const [projectForm, setProjectForm] = useState(initialProjectForm);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [savingProject, setSavingProject] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectListOrgFilter, setProjectListOrgFilter] = useState("");
  const [projectFormOrgUsers, setProjectFormOrgUsers] = useState([]);
  const [orgUsers, setOrgUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [organizationForm, setOrganizationForm] = useState(
    initialOrganizationForm,
  );
  const [editingOrganizationId, setEditingOrganizationId] = useState(null);
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [masterUsers, setMasterUsers] = useState([]);
  const [userMasterForm, setUserMasterForm] = useState(initialUserMasterForm);
  const [editingUserMasterId, setEditingUserMasterId] = useState(null);
  const [savingUserMaster, setSavingUserMaster] = useState(false);
  const [loadingMasterUsers, setLoadingMasterUsers] = useState(false);
  const [userCategories, setUserCategories] = useState([]);
  const [userDesignations, setUserDesignations] = useState([]);
  const [designationList, setDesignationList] = useState([]);
  const [designationForm, setDesignationForm] = useState(initialDesignationForm);
  const [editingDesignationId, setEditingDesignationId] = useState(null);
  const [savingDesignation, setSavingDesignation] = useState(false);
  const [loadingDesignations, setLoadingDesignations] = useState(false);
  const [branches, setBranches] = useState([]);
  const [subWorks, setSubWorks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(0);
  const [selectedSubWorkId, setSelectedSubWorkId] = useState(0);
  const [estimationTab, setEstimationTab] = useState(0);
  const [loadingCheckedItems, setLoadingCheckedItems] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState(0);
  const [selectedItems, setSelectedItems] = useState([]);
  const [checkedItemIds, setCheckedItemIds] = useState([]);
  const [checkedItemsList, setCheckedItemsList] = useState([]);
  const [checkedListDragId, setCheckedListDragId] = useState(null);
  const [reorderingCheckedList, setReorderingCheckedList] = useState(false);
  const [updateSelectedItems, setUpdateSelectedItems] = useState([]);
  const [subWorkListDragId, setSubWorkListDragId] = useState(null);
  const [reorderingSubWorks, setReorderingSubWorks] = useState(false);
  const [generateReportModalOpen, setGenerateReportModalOpen] = useState(false);
  const [estimatePanelOpen, setEstimatePanelOpen] = useState(false);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimateWorkName, setEstimateWorkName] = useState("");
  const [estimateRegions, setEstimateRegions] = useState([]);
  const [estimateLeadGroups, setEstimateLeadGroups] = useState([]);
  const [savingEstimateAdditions, setSavingEstimateAdditions] = useState(false);
  const [savingEstimateLeads, setSavingEstimateLeads] = useState(false);
  const [savingWorkMaterials, setSavingWorkMaterials] = useState(false);
  const [estimateAdditionsSaved, setEstimateAdditionsSaved] = useState(false);
  const [estimateLeadsSaved, setEstimateLeadsSaved] = useState(false);
  const [calculatingLeadKey, setCalculatingLeadKey] = useState("");
  const [printSsrRegionId, setPrintSsrRegionId] = useState("");
  const [printSsrYearId, setPrintSsrYearId] = useState("");
  const [printSsrYears, setPrintSsrYears] = useState([]);
  const [printSsrCategoryId, setPrintSsrCategoryId] = useState("");
  const [printSsrCategories, setPrintSsrCategories] = useState([]);
  const [printSsrSubCategoryId, setPrintSsrSubCategoryId] = useState("");
  const [printSsrSubCategories, setPrintSsrSubCategories] = useState([]);
  const [printingSsr, setPrintingSsr] = useState(false);

  // Which items in the Checked Items tab have their panel open (tied to checkbox)
  const [checkedForMeasurement, setCheckedForMeasurement] = useState(new Set());
  const todayLocalDate = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const initialWorkForm = {
    WorkName: "",
    ProjectId: "",
    Remarks: "",
    MarkForDeletion: false,
    CreationDate: todayLocalDate(),
  };

  const [workForm, setWorkForm] = useState(initialWorkForm);
  const [worksList, setWorksList] = useState([]);
  const [workMasterList, setWorkMasterList] = useState([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [savingWork, setSavingWork] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState(null);
  const [workMasterFilterOrgId, setWorkMasterFilterOrgId] = useState("");
  const [workMasterFilterUserId, setWorkMasterFilterUserId] = useState("");
  const [workMasterUsers, setWorkMasterUsers] = useState([]);
  const [workMasterProjects, setWorkMasterProjects] = useState([]);
  const [deletingWork, setDeletingWork] = useState(false);

  const initialSubWorkForm = {
    WorkId: "",
    SubWorkName: "",
    Sequence: "",
    MarkForDeletion: false,
  };

  const [subWorkForm, setSubWorkForm] = useState(initialSubWorkForm);
  const [subWorksMasterList, setSubWorksMasterList] = useState([]);
  const [loadingSubWorksMaster, setLoadingSubWorksMaster] = useState(false);
  const [savingSubWork, setSavingSubWork] = useState(false);
  const [editingSubWorkId, setEditingSubWorkId] = useState(null);
  const [deletingSubWork, setDeletingSubWork] = useState(false);
  const [subWorkMasterFilterOrgId, setSubWorkMasterFilterOrgId] = useState("");
  const [subWorkMasterFilterUserId, setSubWorkMasterFilterUserId] =
    useState("");
  const [subWorkMasterUsers, setSubWorkMasterUsers] = useState([]);
  const [subWorkMasterWorks, setSubWorkMasterWorks] = useState([]);

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

  /** Estimation Select Region — normal regions + conditional 3/4 by session org/user. */
  const loadEstimationRegions = async (user = currentUser) => {
    const sessionUser =
      user ||
      (() => {
        try {
          return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
        } catch (_) {
          return null;
        }
      })();
    if (!sessionUser?.UserId) {
      setEstimationRegions([]);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/estimation-regions?userId=${encodeURIComponent(sessionUser.UserId)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to load estimation regions.");
      }
      const list = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : [];
      setEstimationRegions(sortByDOrderAsc(list));
      // Clear selection if current region is no longer available
      setItemRegion((prev) => {
        if (!prev) return prev;
        const stillThere = list.some(
          (r) => Number(r.SSRRegionId) === Number(prev),
        );
        return stillThere ? prev : "";
      });
    } catch (error) {
      console.error(error);
      setEstimationRegions([]);
      setMessage(`Estimation region load failed: ${error.message}`);
    }
  };

  const loadSsrYears = async (regionId) => {
    if (!regionId) {
      setSsrYears([]);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/master-years?regionId=${encodeURIComponent(regionId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load SSR years.");
      setSsrYears(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setSsrYears([]);
    }
  };

  const loadWorksMaster = async () => {
    const user =
      currentUser || JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!user?.UserId) {
      setWorksList([]);
      return;
    }
    setLoadingWorks(true);
    try {
      const res = await axios.get(`${API_BASE}/api/load-works`, {
        params: {
          userId: user.UserId,
          organizationId: user.OrganizationId || undefined,
          userCategory: user.UserCategoryName || "",
          ownerOnly: true,
        },
      });
      if (res.status === 200) setWorksList(res.data.data || []);
    } catch (error) {
      console.error(error);
      setWorksList([]);
      setMessage(`Work load failed: ${error.message}`);
    } finally {
      setLoadingWorks(false);
    }
  };

  const loadWorkMasterList = async (
    filterOrgId = workMasterFilterOrgId,
    filterUserId = workMasterFilterUserId,
  ) => {
    const user =
      currentUser || JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!user?.UserId) {
      setWorkMasterList([]);
      return;
    }
    const superAdmin = isSuperAdminUser(user);
    if (superAdmin && (!filterOrgId || !filterUserId)) {
      setWorkMasterList([]);
      return;
    }
    setLoadingWorks(true);
    try {
      const params = {
        userId: user.UserId,
        organizationId: user.OrganizationId || undefined,
        userCategory: user.UserCategoryName || "",
      };
      if (superAdmin) {
        params.filterUserId = filterUserId;
        params.includeDeleted = true;
      }
      const res = await axios.get(`${API_BASE}/api/load-works`, { params });
      if (res.status === 200) setWorkMasterList(res.data.data || []);
    } catch (error) {
      console.error(error);
      setWorkMasterList([]);
      setMessage(`Work load failed: ${error.message}`);
    } finally {
      setLoadingWorks(false);
    }
  };

  const loadWorkMasterUsers = async (organizationId) => {
    if (!organizationId) {
      setWorkMasterUsers([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/org-users`, {
        params: { organizationId },
      });
      if (res.status === 200) {
        setWorkMasterUsers(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error(error);
      setWorkMasterUsers([]);
    }
  };

  const loadWorkMasterProjects = async (organizationId) => {
    if (!organizationId) {
      setWorkMasterProjects([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/load-projects`, {
        params: { org_id: organizationId },
      });
      if (res.status === 200) setWorkMasterProjects(res.data.data || []);
    } catch (error) {
      console.error(error);
      setWorkMasterProjects([]);
    }
  };

  const resetWorkEdit = () => {
    setEditingWorkId(null);
    setWorkForm((prev) => ({
      ...initialWorkForm,
      ProjectId: prev.ProjectId,
      CreationDate: todayLocalDate(),
    }));
  };

  const onWorkChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "ProjectId") {
      setWorkForm((prev) => ({
        ...prev,
        ProjectId: value,
      }));
      return;
    }
    setWorkForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const formatWorkCreationDate = (value) => {
    if (!value) return todayLocalDate();
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const yyyy = value.getUTCFullYear();
      const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(value.getUTCDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    const raw = String(value).trim();
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    return todayLocalDate();
  };

  const startWorkEdit = (work) => {
    setEditingWorkId(work.MasterWorkId);
    setWorkForm({
      ProjectId: work.ProjectId ? String(work.ProjectId) : "",
      WorkName: work.WorkName || "",
      Remarks: work.Remarks || "",
      MarkForDeletion: Boolean(work.MarkForDeletion),
      CreationDate: formatWorkCreationDate(work.CreationDate),
    });
    setMessage("");
  };

  const refreshWorkLists = async () => {
    await loadWorksMaster();
    await loadWorkMasterList();
  };

  const softDeleteWork = async () => {
    if (!editingWorkId) return;
    if (
      !window.confirm(
        "This Work along with its Sub Works will be Deleted, do you really want to delete.",
      )
    ) {
      return;
    }
    setDeletingWork(true);
    setMessage("");
    try {
      const res = await fetch(
        `${API_BASE}/api/master-works/${editingWorkId}/soft-delete`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete work.");
      setMessage("Work and its sub-works marked for deletion.");
      resetWorkEdit();
      await refreshWorkLists();
    } catch (error) {
      setMessage(`Work delete failed: ${error.message}`);
    } finally {
      setDeletingWork(false);
    }
  };

  const undeleteWork = async () => {
    if (!editingWorkId) return;
    if (
      !window.confirm(
        "Restore this Work and its Sub Works (UnDelete)?",
      )
    ) {
      return;
    }
    setDeletingWork(true);
    setMessage("");
    try {
      const res = await fetch(
        `${API_BASE}/api/master-works/${editingWorkId}/undelete`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to undelete work.");
      setMessage("Work and its sub-works restored.");
      setWorkForm((prev) => ({ ...prev, MarkForDeletion: false }));
      await refreshWorkLists();
    } catch (error) {
      setMessage(`Work undelete failed: ${error.message}`);
    } finally {
      setDeletingWork(false);
    }
  };

  const onWorkSubmit = async (e) => {
    e.preventDefault();
    const user =
      currentUser || JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!user?.UserId) {
      setMessage("Work save failed: user session is missing.");
      return;
    }
    if (!workForm.WorkName?.trim()) {
      setMessage("Work save failed: Work name is required.");
      return;
    }
    if (!workForm.CreationDate) {
      setMessage("Work save failed: Created Date is required.");
      return;
    }

    const isEdit = Boolean(editingWorkId);
    const superAdmin = isSuperAdminUser(user);
    if (superAdmin && !isEdit && !workMasterFilterUserId) {
      setMessage(
        "Work save failed: select Organization and User before creating a work.",
      );
      return;
    }

    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this work" : "save this new work"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }

    setSavingWork(true);
    setMessage("");
    const ownerUserId =
      superAdmin && workMasterFilterUserId
        ? Number(workMasterFilterUserId)
        : user.UserId;
    const payload = {
      workName: workForm.WorkName,
      projectId: workForm.ProjectId || null,
      userId: ownerUserId,
      remarks: workForm.Remarks,
      creationDate: workForm.CreationDate,
    };

    try {
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/master-works/${editingWorkId}`
          : `${API_BASE}/api/insert-work`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save work.");
      setMessage(
        isEdit ? "Work updated successfully." : "Work saved successfully.",
      );
      const selectedProjectId = workForm.ProjectId;
      setEditingWorkId(null);
      setWorkForm({
        ...initialWorkForm,
        ProjectId: selectedProjectId,
        CreationDate: todayLocalDate(),
      });
      await refreshWorkLists();
    } catch (error) {
      setMessage(`Work save failed: ${error.message}`);
    } finally {
      setSavingWork(false);
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

  const loadSubCategoryMaster = async () => {
    setLoadingSubCategories(true);
    try {
      const res = await fetch(`${API_BASE}/api/ssr-sub-categories`);
      const data = await res.json();
      setSubCategoryList(Array.isArray(data) ? sortByDOrderAsc(data) : []);
    } catch (error) {
      setMessage(`Subcategory load failed: ${error.message}`);
    } finally {
      setLoadingSubCategories(false);
    }
  };

  const loadUnitMaster = async () => {
    setLoadingUnits(true);
    try {
      const res = await fetch(`${API_BASE}/api/master-units`);
      const data = await res.json();
      setUnitList(Array.isArray(data) ? sortByDOrderAsc(data) : []);
    } catch (error) {
      setMessage(`Unit load failed: ${error.message}`);
    } finally {
      setLoadingUnits(false);
    }
  };

  const loadRegionBasedCategories = async (regionId) => {
    const selectedRegionId = regionId || itemRegion;
    if (!selectedRegionId) {
      setItemCategories([]);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/ssr-categories/${selectedRegionId}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load categories.");
      setItemCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setItemCategories([]);
    }
  };

  const loadCategoryBasedSubCategories = (categoryId) => {
    if (!categoryId) {
      setSubCategories([]);
      return;
    }
    axios
      .get(`${API_BASE}/api/ssr-sub-categories/${categoryId}`)
      .then((res) => {
        if (res.status === 200) setSubCategories(res.data.data || []);
      })
      .catch((err) => {
        console.error(err);
        setSubCategories([]);
      });
  };

  const loadItems = (e) => {
    e.preventDefault();
    if (!itemRegion || !itemCategoryId || !itemSsrYearId) {
      alert("Please select SSR Region, SSR Year, and SSR Category.");
      return;
    }
    clearEstimationOutputs();
    setEstimationTab(0);
    getCheckedItemsList();
    getCheckedItems();
    const params = {
      regionId: itemRegion,
      categoryId: itemCategoryId,
      ssrYearId: itemSsrYearId,
    };
    if (subCategoryItemId) {
      params.subCategoryId = subCategoryItemId;
    }
    axios
      .get(`${API_BASE}/api/ssr-items-load`, { params })
      .then((res) => {
        if (res.status === 200) {
          const rows = Array.isArray(res.data?.data) ? res.data.data : [];
          setItemList(rows);
          alert(`Item List Loaded (${rows.length}).`);
        }
      })
      .catch((err) => {
        console.error(err);
        setItemList([]);
        alert(
          `Failed to load items: ${err.response?.data?.message || err.message}`,
        );
      });
  };

  const resetMaterialSelection = () => {
    setSelectedMaterialItemId(null);
    setMaterialComponentList([]);
    setMaterialComponentForm(initialMaterialComponentForm);
    setMaterialDraftRows([createMaterialDraftRow()]);
    setEditingMaterialComponentId(null);
  };

  const loadMaterialCategories = async (regionId) => {
    if (!regionId) {
      setMaterialCategories([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/ssr-categories/${regionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load categories.");
      setMaterialCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setMaterialCategories([]);
    }
  };

  const loadMaterialSsrYears = async (regionId) => {
    if (!regionId) {
      setMaterialSsrYears([]);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/master-years?regionId=${encodeURIComponent(regionId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load SSR years.");
      setMaterialSsrYears(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setMaterialSsrYears([]);
    }
  };

  const loadMaterialSubCategories = async (categoryId) => {
    if (!categoryId) {
      setMaterialSubCategories([]);
      return;
    }
    try {
      const res = await axios.get(
        `${API_BASE}/api/ssr-sub-categories/${categoryId}`,
      );
      setMaterialSubCategories(res.data?.data || []);
    } catch (err) {
      console.error(err);
      setMaterialSubCategories([]);
    }
  };

  const loadMaterialMasterList = async (regionId) => {
    if (!regionId) {
      setMaterialMasterList([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/master-materials`, {
        params: { regionId },
      });
      setMaterialMasterList(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setMaterialMasterList([]);
    }
  };

  const loadMaterialItems = async () => {
    if (
      !materialRegionId ||
      !materialSsrYearId ||
      !materialCategoryId ||
      !materialSubCategoryId
    ) {
      alert(
        "Please select SSR Region, SSR Year, SSR Category, and SSR Sub Category.",
      );
      return;
    }
    setLoadingMaterialItems(true);
    resetMaterialSelection();
    try {
      const res = await axios.get(`${API_BASE}/api/ssr-items-load`, {
        params: {
          regionId: materialRegionId,
          categoryId: materialCategoryId,
          subCategoryId: materialSubCategoryId,
          ssrYearId: materialSsrYearId,
        },
      });
      setMaterialItemList(
        Array.isArray(res.data?.data) ? res.data.data : [],
      );
    } catch (err) {
      console.error(err);
      setMaterialItemList([]);
      alert(
        `Failed to load items: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setLoadingMaterialItems(false);
    }
  };

  const loadMaterialComponents = async (itemId) => {
    if (!itemId) {
      setMaterialComponentList([]);
      return;
    }
    setLoadingMaterialComponents(true);
    try {
      const res = await axios.get(`${API_BASE}/api/material-components`, {
        params: { itemId },
      });
      setMaterialComponentList(
        Array.isArray(res.data?.data) ? res.data.data : [],
      );
    } catch (err) {
      console.error(err);
      setMaterialComponentList([]);
      setMessage(
        `Failed to load material components: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setLoadingMaterialComponents(false);
    }
  };

  const selectMaterialItem = (item) => {
    setSelectedMaterialItemId(item.ItemId);
    setMaterialComponentForm(initialMaterialComponentForm);
    setMaterialDraftRows([createMaterialDraftRow()]);
    setEditingMaterialComponentId(null);
    loadMaterialComponents(item.ItemId);
  };

  const onMaterialComponentChange = (e) => {
    const { name, value } = e.target;
    setMaterialComponentForm((prev) => {
      if (name === "MaterialId") {
        const material = materialMasterList.find(
          (m) => Number(m.MaterialId) === Number(value),
        );
        return {
          ...prev,
          MaterialId: value,
          MaterialUnitId: material?.MaterialLocalUnitId
            ? String(material.MaterialLocalUnitId)
            : "",
        };
      }
      return { ...prev, [name]: value };
    });
  };

  const onMaterialDraftChange = (rowKey, name, value) => {
    setMaterialDraftRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row;
        if (name === "MaterialId") {
          const material = materialMasterList.find(
            (m) => Number(m.MaterialId) === Number(value),
          );
          return {
            ...row,
            MaterialId: value,
            MaterialUnitId: material?.MaterialLocalUnitId
              ? String(material.MaterialLocalUnitId)
              : "",
          };
        }
        return { ...row, [name]: value };
      }),
    );
  };

  const addMaterialDraftRow = () => {
    setMaterialDraftRows((prev) => [...prev, createMaterialDraftRow()]);
  };

  const removeMaterialDraftRow = (rowKey) => {
    setMaterialDraftRows((prev) => {
      if (prev.length <= 1) return [createMaterialDraftRow()];
      return prev.filter((row) => row.key !== rowKey);
    });
  };

  const resetMaterialComponentEdit = () => {
    setEditingMaterialComponentId(null);
    setMaterialComponentForm(initialMaterialComponentForm);
    setMaterialDraftRows([createMaterialDraftRow()]);
  };

  const startMaterialComponentEdit = (row) => {
    const material = materialMasterList.find(
      (m) => Number(m.MaterialId) === Number(row.MaterialId),
    );
    setEditingMaterialComponentId(row.MaterialComponentId);
    setMaterialComponentForm({
      MaterialId: String(row.MaterialId || ""),
      MaterialComponent:
        row.MaterialComponent === null || row.MaterialComponent === undefined
          ? ""
          : String(row.MaterialComponent),
      MaterialUnitId: material?.MaterialLocalUnitId
        ? String(material.MaterialLocalUnitId)
        : String(row.MaterialUnitId || ""),
    });
  };

  const onMaterialComponentSubmit = async (e) => {
    e.preventDefault();
    if (!isSuperAdminUser(currentUser)) {
      setMessage("Only SuperAdmin can manage material components.");
      return;
    }
    if (!selectedMaterialItemId) {
      alert("Please select an item from the list first.");
      return;
    }

    // Edit existing single row
    if (editingMaterialComponentId) {
      if (
        !materialComponentForm.MaterialId ||
        materialComponentForm.MaterialComponent === ""
      ) {
        alert("Material and Material Component are required.");
        return;
      }
      if (!materialComponentForm.MaterialUnitId) {
        alert(
          "Selected material has no Material Local Unit. Choose another material.",
        );
        return;
      }
      if (!window.confirm("Update this material component?")) return;

      setSavingMaterialComponent(true);
      setMessage("");
      try {
        await axios.put(
          `${API_BASE}/api/material-components/${editingMaterialComponentId}`,
          {
            userId: currentUser?.UserId,
            ItemId: selectedMaterialItemId,
            MaterialId: materialComponentForm.MaterialId,
            MaterialComponent: materialComponentForm.MaterialComponent,
          },
        );
        setMessage("Material component updated.");
        resetMaterialComponentEdit();
        await loadMaterialComponents(selectedMaterialItemId);
      } catch (err) {
        console.error(err);
        setMessage(
          `Material component save failed: ${err.response?.data?.message || err.message}`,
        );
      } finally {
        setSavingMaterialComponent(false);
      }
      return;
    }

    // Add one or more draft rows
    const validRows = materialDraftRows.filter(
      (row) => row.MaterialId && row.MaterialComponent !== "",
    );
    if (!validRows.length) {
      alert("Add at least one material with a component value.");
      return;
    }
    const missingUnit = validRows.find((row) => !row.MaterialUnitId);
    if (missingUnit) {
      alert(
        "One or more selected materials have no Material Local Unit. Choose another material.",
      );
      return;
    }
    if (
      !window.confirm(
        validRows.length === 1
          ? "Save this material component?"
          : `Save ${validRows.length} material components?`,
      )
    ) {
      return;
    }

    setSavingMaterialComponent(true);
    setMessage("");
    try {
      const res = await axios.post(
        `${API_BASE}/api/material-components/batch`,
        {
          userId: currentUser?.UserId,
          ItemId: selectedMaterialItemId,
          rows: validRows.map((row) => ({
            MaterialId: row.MaterialId,
            MaterialComponent: row.MaterialComponent,
          })),
        },
      );
      const count = res.data?.count || validRows.length;
      setMessage(
        count === 1
          ? "Material component saved."
          : `${count} material components saved.`,
      );
      setMaterialDraftRows([createMaterialDraftRow()]);
      await loadMaterialComponents(selectedMaterialItemId);
    } catch (err) {
      console.error(err);
      setMessage(
        `Material component save failed: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setSavingMaterialComponent(false);
    }
  };

  const loadSubWorksMaster = async (workId) => {
    if (!workId) {
      setSubWorksMasterList([]);
      return;
    }
    setLoadingSubWorksMaster(true);
    try {
      const user =
        currentUser ||
        JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      const params = { workId };
      if (isSuperAdminUser(user)) {
        params.includeDeleted = true;
      }
      const res = await axios.get(`${API_BASE}/api/load-sub-works`, {
        params,
      });
      if (res.status === 200) setSubWorksMasterList(res.data.data || []);
    } catch (error) {
      console.error(error);
      setSubWorksMasterList([]);
      setMessage(`Sub work load failed: ${error.message}`);
    } finally {
      setLoadingSubWorksMaster(false);
    }
  };

  const loadSubWorkMasterUsers = async (organizationId) => {
    if (!organizationId) {
      setSubWorkMasterUsers([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/org-users`, {
        params: { organizationId },
      });
      if (res.status === 200) {
        setSubWorkMasterUsers(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error(error);
      setSubWorkMasterUsers([]);
    }
  };

  const loadSubWorkMasterWorks = async (filterUserId) => {
    const user =
      currentUser || JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!user?.UserId || !filterUserId) {
      setSubWorkMasterWorks([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/load-works`, {
        params: {
          userId: user.UserId,
          userCategory: user.UserCategoryName || "",
          filterUserId,
        },
      });
      if (res.status === 200) setSubWorkMasterWorks(res.data.data || []);
    } catch (error) {
      console.error(error);
      setSubWorkMasterWorks([]);
    }
  };

  const resetSubWorkEdit = () => {
    setEditingSubWorkId(null);
    setSubWorkForm((prev) => ({
      ...initialSubWorkForm,
      WorkId: prev.WorkId,
    }));
  };

  const softDeleteSubWork = async () => {
    if (!editingSubWorkId) return;
    if (
      !window.confirm(
        "This Sub Works will be Deleted, do you really want to delete.",
      )
    ) {
      return;
    }
    setDeletingSubWork(true);
    setMessage("");
    try {
      const res = await fetch(
        `${API_BASE}/api/master-sub-works/${editingSubWorkId}/soft-delete`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete sub work.");
      setMessage("Sub work marked for deletion.");
      const selectedWorkId = subWorkForm.WorkId;
      resetSubWorkEdit();
      setSubWorkForm((prev) => ({ ...prev, WorkId: selectedWorkId }));
      await loadSubWorksMaster(selectedWorkId);
    } catch (error) {
      setMessage(`Sub work delete failed: ${error.message}`);
    } finally {
      setDeletingSubWork(false);
    }
  };

  const undeleteSubWork = async () => {
    if (!editingSubWorkId) return;
    if (!window.confirm("Restore this Sub Work (UnDelete)?")) {
      return;
    }
    setDeletingSubWork(true);
    setMessage("");
    try {
      const res = await fetch(
        `${API_BASE}/api/master-sub-works/${editingSubWorkId}/undelete`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.message || "Failed to undelete sub work.");
      setMessage("Sub work restored.");
      setSubWorkForm((prev) => ({ ...prev, MarkForDeletion: false }));
      await loadSubWorksMaster(subWorkForm.WorkId);
    } catch (error) {
      setMessage(`Sub work undelete failed: ${error.message}`);
    } finally {
      setDeletingSubWork(false);
    }
  };

  const persistSubWorkOrder = async (orderedList) => {
    const workId = subWorkForm.WorkId;
    if (!workId || !orderedList.length) return;
    // Only reorder active (non-deleted) rows
    const activeList = orderedList.filter((row) => !row.MarkForDeletion);
    if (!activeList.length) return;
    setReorderingSubWorks(true);
    try {
      await axios.put(`${API_BASE}/api/master-sub-works/reorder`, {
        workId,
        orderedIds: activeList.map((row) => row.SubWorkId),
      });
      setSubWorksMasterList((prev) => {
        const deleted = prev.filter((row) => row.MarkForDeletion);
        const resequenced = activeList.map((row, idx) => ({
          ...row,
          Sequence: idx + 1,
        }));
        return [...resequenced, ...deleted];
      });
      // Keep Estimation Sub Work dropdown in sync when same work is selected
      if (Number(selectedProjectId) === Number(workId)) {
        loadSubWorks(workId);
      }
    } catch (err) {
      console.error(err);
      alert(
        `Sub Work reorder failed: ${err.response?.data?.message || err.message}`,
      );
      loadSubWorksMaster(workId);
    } finally {
      setReorderingSubWorks(false);
    }
  };

  const moveSubWorkItem = (fromSubWorkId, toSubWorkId) => {
    if (!fromSubWorkId || !toSubWorkId || fromSubWorkId === toSubWorkId) {
      return;
    }
    setSubWorksMasterList((prev) => {
      const active = prev.filter((r) => !r.MarkForDeletion);
      const deleted = prev.filter((r) => r.MarkForDeletion);
      const fromIdx = active.findIndex(
        (r) => Number(r.SubWorkId) === Number(fromSubWorkId),
      );
      const toIdx = active.findIndex(
        (r) => Number(r.SubWorkId) === Number(toSubWorkId),
      );
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...active];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      queueMicrotask(() => persistSubWorkOrder([...next, ...deleted]));
      return [...next, ...deleted];
    });
  };

  const onSubWorkChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "WorkId") {
      setSubWorkForm((prev) => ({
        ...prev,
        WorkId: value,
        SubWorkName: editingSubWorkId ? prev.SubWorkName : "",
        Sequence: editingSubWorkId ? prev.Sequence : "",
        MarkForDeletion: editingSubWorkId ? prev.MarkForDeletion : false,
      }));
      if (!editingSubWorkId) setEditingSubWorkId(null);
      loadSubWorksMaster(value);
      return;
    }
    setSubWorkForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const startSubWorkEdit = (row) => {
    setEditingSubWorkId(row.SubWorkId);
    setSubWorkForm({
      WorkId: row.WorkId ? String(row.WorkId) : subWorkForm.WorkId,
      SubWorkName: row.SubWorkName || "",
      Sequence: row.Sequence ?? "",
      MarkForDeletion: Boolean(row.MarkForDeletion),
    });
    setMessage("");
  };

  const onSubWorkSubmit = async (e) => {
    e.preventDefault();
    if (!subWorkForm.WorkId) {
      setMessage("Sub work save failed: Work is required.");
      return;
    }
    if (!subWorkForm.SubWorkName?.trim()) {
      setMessage("Sub work save failed: Sub Work name is required.");
      return;
    }

    const isEdit = Boolean(editingSubWorkId);
    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this sub work" : "save this new sub work"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }

    setSavingSubWork(true);
    setMessage("");
    const payload = {
      workId: subWorkForm.WorkId,
      subWorkName: subWorkForm.SubWorkName,
      sequence: subWorkForm.Sequence,
    };

    try {
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/master-sub-works/${editingSubWorkId}`
          : `${API_BASE}/api/insert-subwork`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save sub work.");
      setMessage(
        isEdit
          ? "Sub work updated successfully."
          : "Sub work saved successfully.",
      );
      const selectedWorkId = subWorkForm.WorkId;
      setEditingSubWorkId(null);
      setSubWorkForm({
        ...initialSubWorkForm,
        WorkId: selectedWorkId,
      });
      await loadSubWorksMaster(selectedWorkId);
    } catch (error) {
      setMessage(`Sub work save failed: ${error.message}`);
    } finally {
      setSavingSubWork(false);
    }
  };

  const loadProjects = async () => {
    const user =
      currentUser || JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!user?.OrganizationId) return;
    setLoadingProjects(true);
    try {
      const res = await axios.get(`${API_BASE}/api/load-projects`, {
        params: { org_id: user.OrganizationId },
      });
      if (res.status === 200) setProjects(res.data.data || []);
    } catch (error) {
      setMessage(`Project load failed: ${error.message}`);
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadProjectMaster = async () => {
    setLoadingProjects(true);
    try {
      const res = await axios.get(`${API_BASE}/api/load-projects`);
      if (res.status === 200) setProjectMasterList(res.data.data || []);
    } catch (error) {
      setMessage(`Project load failed: ${error.message}`);
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadOrgUsers = async (organizationId) => {
    const user =
      currentUser || JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    const orgId = organizationId || user?.OrganizationId;
    if (!orgId) {
      setOrgUsers([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/org-users`, {
        params: { organizationId: orgId },
      });
      if (res.status === 200) setOrgUsers(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(error);
      setOrgUsers([]);
    }
  };

  const loadProjectFormOrgUsers = async (organizationId) => {
    if (!organizationId) {
      setProjectFormOrgUsers([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/org-users`, {
        params: { organizationId },
      });
      if (res.status === 200) {
        setProjectFormOrgUsers(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error(error);
      setProjectFormOrgUsers([]);
    }
  };

  const loadCountries = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/countries`);
      if (res.status === 200) {
        setCountries(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loadStates = async (countryId) => {
    if (!countryId) {
      setStates([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/states`, {
        params: { countryId },
      });
      if (res.status === 200) {
        setStates(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error(error);
      setStates([]);
    }
  };

  const loadDistricts = async (stateId) => {
    if (!stateId) {
      setDistricts([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/districts`, {
        params: { stateId },
      });
      if (res.status === 200) {
        setDistricts(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error(error);
      setDistricts([]);
    }
  };

  const loadOrganizations = async () => {
    setLoadingOrganizations(true);
    try {
      const res = await axios.get(`${API_BASE}/api/master-organizations`);
      if (res.status === 200) {
        setOrganizations(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      setMessage(`Organization load failed: ${error.message}`);
    } finally {
      setLoadingOrganizations(false);
    }
  };

  const onOrganizationChange = async (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === "checkbox" ? checked : value;

    if (name === "OrgCountryId") {
      setOrganizationForm((prev) => ({
        ...prev,
        OrgCountryId: nextValue,
        OrgStateId: "",
        OrgDistrictId: "",
      }));
      await loadStates(nextValue);
      setDistricts([]);
      return;
    }

    if (name === "OrgStateId") {
      setOrganizationForm((prev) => ({
        ...prev,
        OrgStateId: nextValue,
        OrgDistrictId: "",
      }));
      await loadDistricts(nextValue);
      return;
    }

    setOrganizationForm((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  };

  const resetOrganizationEdit = () => {
    setEditingOrganizationId(null);
    setOrganizationForm(initialOrganizationForm);
    setStates([]);
    setDistricts([]);
  };

  const startOrganizationEdit = async (org) => {
    setEditingOrganizationId(org.OrganizationId);
    setOrganizationForm({
      OrgCode: org.OrgCode || "",
      OrgName: org.OrgName || "",
      OrgAddress: org.OrgAddress || "",
      OrgCountryId: org.OrgCountryId ? String(org.OrgCountryId) : "",
      OrgStateId: org.OrgStateId ? String(org.OrgStateId) : "",
      OrgDistrictId: org.OrgDistrictId ? String(org.OrgDistrictId) : "",
      OrgPinZip: org.OrgPinZip || "",
      OrgEmail: org.OrgEmail || "",
      OrgContact: org.OrgContact || "",
      OrgContactPerson: org.OrgContactPerson || "",
      OrgConPerDesig: org.OrgConPerDesig || "",
      DOrder: org.DOrder ?? "",
      DOrder1: org.DOrder1 ?? "",
      MarkForDeletion: Boolean(org.MarkForDeletion),
    });
    setMessage("");
    if (org.OrgCountryId) await loadStates(org.OrgCountryId);
    else setStates([]);
    if (org.OrgStateId) await loadDistricts(org.OrgStateId);
    else setDistricts([]);
  };

  const onOrganizationSubmit = async (e) => {
    e.preventDefault();
    const isEdit = Boolean(editingOrganizationId);
    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this organization" : "save this new organization"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }

    setSavingOrganization(true);
    setMessage("");
    const payload = {
      orgCode: organizationForm.OrgCode,
      orgName: organizationForm.OrgName,
      orgAddress: organizationForm.OrgAddress,
      orgCountryId: organizationForm.OrgCountryId,
      orgStateId: organizationForm.OrgStateId,
      orgDistrictId: organizationForm.OrgDistrictId,
      orgPinZip: organizationForm.OrgPinZip,
      orgEmail: organizationForm.OrgEmail,
      orgContact: organizationForm.OrgContact,
      orgContactPerson: organizationForm.OrgContactPerson,
      orgConPerDesig: organizationForm.OrgConPerDesig,
      dOrder: organizationForm.DOrder,
      dOrder1: organizationForm.DOrder1,
      markForDeletion: organizationForm.MarkForDeletion,
    };

    try {
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/master-organizations/${editingOrganizationId}`
          : `${API_BASE}/api/master-organizations`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save organization.");
      }
      setMessage(
        isEdit
          ? "Organization updated successfully."
          : "Organization saved successfully.",
      );
      resetOrganizationEdit();
      await loadOrganizations();
    } catch (error) {
      setMessage(`Organization save failed: ${error.message}`);
    } finally {
      setSavingOrganization(false);
    }
  };

  const loadUserCategories = async (organizationId) => {
    if (!organizationId) {
      setUserCategories([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/user-categories`, {
        params: { organizationId },
      });
      if (res.status === 200) {
        setUserCategories(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error(error);
      setUserCategories([]);
    }
  };

  const loadUserDesignations = async (organizationId) => {
    if (!organizationId) {
      setUserDesignations([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/designations`, {
        params: { organizationId },
      });
      if (res.status === 200) {
        setUserDesignations(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error(error);
      setUserDesignations([]);
    }
  };

  const loadMasterUsers = async () => {
    setLoadingMasterUsers(true);
    try {
      const res = await axios.get(`${API_BASE}/api/master-users`);
      if (res.status === 200) {
        setMasterUsers(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      setMessage(`User load failed: ${error.message}`);
    } finally {
      setLoadingMasterUsers(false);
    }
  };

  const onUserMasterChange = async (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === "checkbox" ? checked : value;

    if (name === "OrganizationId") {
      setUserMasterForm((prev) => ({
        ...prev,
        OrganizationId: nextValue,
        UserCategoryId: "",
        DesignationId: "",
      }));
      await loadUserCategories(nextValue);
      await loadUserDesignations(nextValue);
      return;
    }

    setUserMasterForm((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  };

  const resetUserMasterEdit = () => {
    setEditingUserMasterId(null);
    setUserMasterForm(initialUserMasterForm);
    setUserCategories([]);
    setUserDesignations([]);
  };

  const startUserMasterEdit = async (user) => {
    setEditingUserMasterId(user.UserId);
    setUserMasterForm({
      OrganizationId: user.OrganizationId ? String(user.OrganizationId) : "",
      UserCategoryId: user.UserCategoryId ? String(user.UserCategoryId) : "",
      DesignationId: user.DesignationId ? String(user.DesignationId) : "",
      UserLoginName: user.UserLoginName || "",
      UserName: user.UserName || "",
      UserPWD: "",
      UserAddress: user.UserAddress || "",
      UserDateOfJoining: toDateInputValue(user.UserDateOfJoining),
      UserDateOfBirth: toDateInputValue(user.UserDateOfBirth),
      UserContact: user.UserContact || "",
      UserEmail: user.UserEmail || "",
      DateOfRelieving: toDateInputValue(user.DateOfRelieving),
      DOrder: user.DOrder ?? "",
      Remarks: user.Remarks || "",
      IsActive: user.IsActive !== false,
      MarkForDeletion: Boolean(user.MarkForDeletion),
    });
    setMessage("");
    if (user.OrganizationId) {
      await loadUserCategories(user.OrganizationId);
      await loadUserDesignations(user.OrganizationId);
    } else {
      setUserCategories([]);
      setUserDesignations([]);
    }
  };

  const onUserMasterSubmit = async (e) => {
    e.preventDefault();
    const isEdit = Boolean(editingUserMasterId);
    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this user" : "save this new user"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }

    setSavingUserMaster(true);
    setMessage("");
    const payload = {
      organizationId: userMasterForm.OrganizationId,
      userCategoryId: userMasterForm.UserCategoryId,
      designationId: userMasterForm.DesignationId,
      userLoginName: userMasterForm.UserLoginName,
      userName: userMasterForm.UserName,
      userPWD: userMasterForm.UserPWD,
      userAddress: userMasterForm.UserAddress,
      userDateOfJoining: userMasterForm.UserDateOfJoining || null,
      userDateOfBirth: userMasterForm.UserDateOfBirth || null,
      userContact: userMasterForm.UserContact,
      userEmail: userMasterForm.UserEmail,
      dateOfRelieving: userMasterForm.DateOfRelieving || null,
      dOrder: userMasterForm.DOrder,
      remarks: userMasterForm.Remarks,
      isActive: userMasterForm.IsActive,
      markForDeletion: userMasterForm.MarkForDeletion,
    };

    try {
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/master-users/${editingUserMasterId}`
          : `${API_BASE}/api/master-users`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save user.");
      setMessage(
        isEdit ? "User updated successfully." : "User saved successfully.",
      );
      resetUserMasterEdit();
      await loadMasterUsers();
      await loadOrgUsers();
    } catch (error) {
      setMessage(`User save failed: ${error.message}`);
    } finally {
      setSavingUserMaster(false);
    }
  };

  const loadBranches = async (organizationId) => {
    if (!organizationId) {
      setBranches([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/branches`, {
        params: { organizationId },
      });
      if (res.status === 200) {
        setBranches(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      console.error(error);
      setBranches([]);
    }
  };

  const loadDesignationMaster = async () => {
    setLoadingDesignations(true);
    try {
      const res = await axios.get(`${API_BASE}/api/master-designations`);
      if (res.status === 200) {
        setDesignationList(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error) {
      setMessage(`Designation load failed: ${error.message}`);
    } finally {
      setLoadingDesignations(false);
    }
  };

  const onDesignationMasterChange = async (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === "checkbox" ? checked : value;

    if (name === "OrganizationId") {
      setDesignationForm((prev) => ({
        ...prev,
        OrganizationId: nextValue,
        BranchId: "",
      }));
      await loadBranches(nextValue);
      return;
    }

    setDesignationForm((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  };

  const resetDesignationEdit = () => {
    setEditingDesignationId(null);
    setDesignationForm(initialDesignationForm);
    setBranches([]);
  };

  const startDesignationEdit = async (row) => {
    setEditingDesignationId(row.DesignationId);
    setDesignationForm({
      OrganizationId: row.OrganizationId ? String(row.OrganizationId) : "",
      DesignationName: row.DesignationName || "",
      DesignationShortName: row.DesignationShortName || "",
      BranchId: row.BranchId ? String(row.BranchId) : "",
      Remarks: row.Remarks || "",
      DOrder: row.DOrder ?? "",
      DOrder1: row.DOrder1 ?? "",
      MarkForDeletion: Boolean(row.MarkForDeletion),
    });
    setMessage("");
    if (row.OrganizationId) await loadBranches(row.OrganizationId);
    else setBranches([]);
  };

  const onDesignationMasterSubmit = async (e) => {
    e.preventDefault();
    const isEdit = Boolean(editingDesignationId);
    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this designation" : "save this new designation"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }

    setSavingDesignation(true);
    setMessage("");
    const payload = {
      organizationId: designationForm.OrganizationId,
      designationName: designationForm.DesignationName,
      designationShortName: designationForm.DesignationShortName,
      branchId: designationForm.BranchId,
      remarks: designationForm.Remarks,
      dOrder: designationForm.DOrder,
      dOrder1: designationForm.DOrder1,
      markForDeletion: designationForm.MarkForDeletion,
    };

    try {
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/master-designations/${editingDesignationId}`
          : `${API_BASE}/api/master-designations`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save designation.");
      }
      setMessage(
        isEdit
          ? "Designation updated successfully."
          : "Designation saved successfully.",
      );
      resetDesignationEdit();
      await loadDesignationMaster();
    } catch (error) {
      setMessage(`Designation save failed: ${error.message}`);
    } finally {
      setSavingDesignation(false);
    }
  };

  const onProjectChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "OrganizationId") {
      setProjectForm((prev) => ({
        ...prev,
        OrganizationId: value,
        ArchAssigned: "",
        EngrAssigned: "",
      }));
      loadProjectFormOrgUsers(value);
      return;
    }
    setProjectForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetProjectEdit = () => {
    setEditingProjectId(null);
    const sessionOrgId = currentUser?.OrganizationId
      ? String(currentUser.OrganizationId)
      : "";
    setProjectForm({
      ...initialProjectForm,
      OrganizationId: sessionOrgId,
    });
    if (sessionOrgId) loadProjectFormOrgUsers(sessionOrgId);
    else setProjectFormOrgUsers([]);
  };

  const startProjectEdit = (project) => {
    if (!isOrgAdminUser(currentUser) && !isSuperAdminUser(currentUser)) {
      setMessage("Only OrgAdmin or SuperAdmin can edit projects.");
      return;
    }
    const organizationId = project.OrganizationID
      ? String(project.OrganizationID)
      : currentUser?.OrganizationId
        ? String(currentUser.OrganizationId)
        : "";
    if (
      isOrgAdminUser(currentUser) &&
      !isSuperAdminUser(currentUser) &&
      currentUser?.OrganizationId &&
      Number(organizationId) !== Number(currentUser.OrganizationId)
    ) {
      setMessage("You can only edit projects for your organization.");
      return;
    }
    setEditingProjectId(project.ProjectId);
    setProjectForm({
      OrganizationId: organizationId,
      ProjectCode: project.ProjectCode || "",
      ProjectName: project.ProjectName || "",
      ClientName: project.ClientName || "",
      ClientAddress: project.ClientAddress || "",
      ClientContactInfo: project.ClientContactInfo || "",
      DOrder: project.DOrder ?? "",
      Remarks: project.Remarks || "",
      ArchAssigned: project.ArchAssigned ? String(project.ArchAssigned) : "",
      EngrAssigned: project.EngrAssigned ? String(project.EngrAssigned) : "",
      MarkForDeletion: Boolean(project.MarkForDeletion),
    });
    loadProjectFormOrgUsers(organizationId);
    setMessage("");
  };

  const onProjectSubmit = async (e) => {
    e.preventDefault();
    const user =
      currentUser || JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    const isSuperAdmin = isSuperAdminUser(user);
    const isOrgAdmin = isOrgAdminUser(user);
    if (!isOrgAdmin && !isSuperAdmin) {
      setMessage(
        "Project save failed: only OrgAdmin or SuperAdmin can add or update projects.",
      );
      return;
    }

    const organizationId = isSuperAdmin
      ? projectForm.OrganizationId
      : user?.OrganizationId;
    if (!organizationId) {
      setMessage("Project save failed: Organization is required.");
      return;
    }

    const isEdit = Boolean(editingProjectId);
    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this project" : "save this new project"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }

    setSavingProject(true);
    setMessage("");
    const payload = {
      projectCode: projectForm.ProjectCode,
      projectName: projectForm.ProjectName,
      organizationId,
      userId: user.UserId,
      clientName: projectForm.ClientName,
      clientAddress: projectForm.ClientAddress,
      clientContactInfo: projectForm.ClientContactInfo,
      dOrder: projectForm.DOrder,
      remarks: projectForm.Remarks,
      archAssigned: projectForm.ArchAssigned,
      engrAssigned: projectForm.EngrAssigned,
      markForDeletion: projectForm.MarkForDeletion,
    };

    try {
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/master-projects/${editingProjectId}`
          : `${API_BASE}/api/insert-project`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save project.");
      setMessage(
        isEdit
          ? "Project updated successfully."
          : "Project saved successfully.",
      );
      resetProjectEdit();
      await loadProjectMaster();
      await loadProjects();
    } catch (error) {
      setMessage(`Project save failed: ${error.message}`);
    } finally {
      setSavingProject(false);
    }
  };

  const loadSubWorks = (workId) => {
    if (!workId) {
      setSubWorks([]);
      return;
    }
    axios
      .get(`${API_BASE}/api/load-sub-works/`, {
        params: {
          workId,
        },
      })
      .then((res) => {
        if (res.status === 200) setSubWorks(res.data.data || []);
      })
      .catch((err) => {
        console.error(err);
        setSubWorks([]);
      });
  };

  const listInsert = async (e) => {
    e.preventDefault();
    clearEstimationOutputs();
    if (!selectedProjectId || !selectedSubWorkId) {
      alert("Please select Work and Sub Work first.");
      return;
    }
    const newItems = selectedItems.filter(
      (id) => !checkedItemIds.includes(Number(id)),
    );
    if (newItems.length === 0) {
      alert("Please check at least one new item in the SSR Item List.");
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/api/insert-work-abstract`, {
        projectId: selectedProjectId,
        workId: selectedProjectId,
        subWorkId: selectedSubWorkId,
        items: newItems,
      });
      if (res.status === 200) {
        alert(res.data.message);
        setSelectedItems([]);
        getCheckedItems();
        getCheckedItemsList();
      }
    } catch (err) {
      console.error(err);
      alert(
        `Insert failed: ${err.response?.data?.message || err.message}`,
      );
    }
  };

  const listUpdate = async () => {
    clearEstimationOutputs();
    if (!selectedProjectId || !selectedSubWorkId) {
      alert("Please select Work and Sub Work first.");
      return;
    }
    if (!updateSelectedItems.length) {
      alert("Please check at least one item to delete.");
      return;
    }

    const subWorkName =
      subWorks.find(
        (sw) => Number(sw.SubWorkId) === Number(selectedSubWorkId),
      )?.SubWorkName || "selected Sub Work";

    const confirmMsg =
      updateSelectedItems.length === 1
        ? `This Item will be permanently deleted from ${subWorkName}`
        : `These Items will be permanently deleted from ${subWorkName}`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await axios.delete(`${API_BASE}/api/delete-selected-items`, {
        params: {
          workId: selectedProjectId,
          subWorkId: selectedSubWorkId,
          workAbstractIds: updateSelectedItems,
        },
      });
      alert(res.data?.message || "Checked item(s) deleted.");
      setUpdateSelectedItems([]);
      setCheckedForMeasurement(new Set());
      getCheckedItems();
      getCheckedItemsList();
    } catch (err) {
      console.error(err);
      alert(
        `Delete failed: ${err.response?.data?.message || err.message}`,
      );
    }
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
    if (!selectedProjectId || !selectedSubWorkId) {
      setCheckedItemsList([]);
      return;
    }
    setLoadingCheckedItems(true);
    axios
      .get(`${API_BASE}/api/get-items-checked-list`, {
        params: {
          projectId: selectedProjectId,
          workId: selectedProjectId,
          subWorkId: selectedSubWorkId,
        },
      })
      .then((res) => {
        if (res.status === 200) {
          setCheckedItemsList(res.data.data || []);
          setCheckedForMeasurement(new Set()); // reset panels on fresh load
          setUpdateSelectedItems([]);
        }
      })
      .catch((err) => {
        console.error(err);
        setCheckedItemsList([]);
      })
      .finally(() => setLoadingCheckedItems(false));
  };

  const handleViewCheckedItems = () => {
    if (!selectedProjectId || !selectedSubWorkId) {
      alert("Please select Work and Sub Work first.");
      return;
    }
    clearEstimationOutputs();
    setEstimationTab(1);
    getCheckedItemsList();
    getCheckedItems();
  };

  // Auto-load checked items whenever Work + Sub Work are selected
  useEffect(() => {
    if (!selectedProjectId || !selectedSubWorkId) {
      setCheckedItemsList([]);
      setCheckedItemIds([]);
      return;
    }
    getCheckedItemsList();
    getCheckedItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, selectedSubWorkId]);

  const handleGenerateRecapReport = async () => {
    clearEstimationOutputs();
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

  const handleGenerateRateAnalysisReport = async () => {
    clearEstimationOutputs();
    if (!selectedProjectId) {
      alert("Please Select Work.");
      return;
    }

    try {
      const res = await axios.get(
        `${API_BASE}/api/generate-rate-analysis-report`,
        {
          params: { workId: selectedProjectId },
          responseType: "blob",
        },
      );

      const disposition = res.headers["content-disposition"];
      let filename = "RateAnalysis.pdf";
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
      console.error("Failed to generate rate analysis report:", err);
      let message = "Failed to generate the Rate Analysis report.";
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const data = JSON.parse(text);
          if (data?.message) message = data.message;
        } catch (_) {
          /* ignore */
        }
      } else if (err.response?.data?.message) {
        message = err.response.data.message;
      }
      alert(message);
    }
  };

  const handleGenerateLeadStatementReport = async () => {
    clearEstimationOutputs();
    if (!selectedProjectId) {
      alert("Please Select Work.");
      return;
    }

    try {
      const res = await axios.get(
        `${API_BASE}/api/generate-lead-statement-report`,
        {
          params: { workId: selectedProjectId },
          responseType: "blob",
        },
      );

      const disposition = res.headers["content-disposition"];
      let filename = "LeadStatement.pdf";
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
      console.error("Failed to generate lead statement report:", err);
      let message = "Failed to generate the Lead Statement report.";
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const data = JSON.parse(text);
          if (data?.message) message = data.message;
        } catch (_) {
          /* ignore */
        }
      } else if (err.response?.data?.message) {
        message = err.response.data.message;
      }
      alert(message);
    }
  };

  const clearEstimatePanel = () => {
    setEstimatePanelOpen(false);
    setEstimateWorkName("");
    setEstimateRegions([]);
    setEstimateLeadGroups([]);
    setEstimateAdditionsSaved(false);
    setEstimateLeadsSaved(false);
  };

  /** Clear previous Estimation action outputs (esp. Generate Estimate panel). */
  const clearEstimationOutputs = () => {
    clearEstimatePanel();
    setMessage("");
    setGenerateReportModalOpen(false);
  };

  const handleGenerateEstimate = async (options = {}) => {
    const { resetFlow = true } = options;
    if (!selectedProjectId) {
      alert("Please select Work first.");
      return;
    }
    setLoadingEstimate(true);
    setMessage("");
    if (resetFlow) {
      // Hide previous estimate details immediately so they are not confusing
      // while fresh data loads (also used after lead save with resetFlow: false).
      clearEstimatePanel();
      setGenerateReportModalOpen(false);
      setItemList([]);
      setMessage("");
    }
    try {
      // Work-scoped: regions/years come from WorkAbstract checked items (not UI Sub Work filters).
      const res = await axios.get(`${API_BASE}/api/generate-estimate`, {
        params: { workId: selectedProjectId },
      });
      const data = res.data || {};
      setEstimateWorkName(data.work?.WorkName || "");
      setEstimateRegions(
        Array.isArray(data.regions)
          ? data.regions.map((r) => {
              const hasAddition = Boolean(r.selectedAdditionId);
              return {
                ...r,
                selectedAdditionId: hasAddition
                  ? String(r.selectedAdditionId)
                  : "",
                ApplyForLead: r.ApplyForLead !== false,
                ApplyLabourCess: hasAddition && r.ApplyLabourCess === true,
                LabourCess:
                  hasAddition &&
                  r.LabourCess !== null &&
                  r.LabourCess !== undefined
                    ? String(r.LabourCess)
                    : "",
              };
            })
          : [],
      );
      setEstimateLeadGroups(
        Array.isArray(data.leadGroups)
          ? data.leadGroups.map((g) => ({
              ...g,
              rows: (g.rows || []).map((row) => ({
                ...row,
                QuaryName: row.QuaryName || "",
                Remarks: row.Remarks || "",
                LeadDistanceKm:
                  row.LeadDistanceKm === null ||
                  row.LeadDistanceKm === undefined ||
                  row.LeadDistanceKm === ""
                    ? "0"
                    : String(row.LeadDistanceKm),
                Lead:
                  row.Lead === null || row.Lead === undefined ? null : row.Lead,
              })),
            }))
          : [],
      );
      setEstimatePanelOpen(true);
      if (
        (!data.regions || !data.regions.length) &&
        (!data.leadGroups || !data.leadGroups.length)
      ) {
        setMessage(
          "No standard additions or lead materials found for this work's abstract items.",
        );
      }
    } catch (err) {
      console.error(err);
      clearEstimatePanel();
      alert(
        `Generate Estimate failed: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setLoadingEstimate(false);
    }
  };

  const onEstimateAdditionChange = (regionId, additionId) => {
    setEstimateRegions((prev) =>
      prev.map((r) => {
        if (Number(r.SSRRegionId) !== Number(regionId)) return r;
        const hasAddition = Boolean(additionId);
        return {
          ...r,
          selectedAdditionId: additionId,
          // Labour Cess only applies when Description + Percentage is selected
          ApplyLabourCess: hasAddition ? r.ApplyLabourCess === true : false,
          LabourCess: hasAddition ? r.LabourCess || "" : "",
        };
      }),
    );
  };

  const onEstimateApplyForLeadChange = (regionId, applyForLead) => {
    setEstimateRegions((prev) =>
      prev.map((r) =>
        Number(r.SSRRegionId) === Number(regionId)
          ? { ...r, ApplyForLead: applyForLead }
          : r,
      ),
    );
  };

  const onEstimateApplyLabourCessChange = (regionId, applyLabourCess) => {
    setEstimateRegions((prev) =>
      prev.map((r) => {
        if (Number(r.SSRRegionId) !== Number(regionId)) return r;
        if (!r.selectedAdditionId) {
          return { ...r, ApplyLabourCess: false, LabourCess: "" };
        }
        return {
          ...r,
          ApplyLabourCess: applyLabourCess,
          LabourCess: applyLabourCess ? r.LabourCess || "" : "",
        };
      }),
    );
  };

  const onEstimateLabourCessChange = (regionId, labourCess) => {
    setEstimateRegions((prev) =>
      prev.map((r) =>
        Number(r.SSRRegionId) === Number(regionId)
          ? { ...r, LabourCess: labourCess }
          : r,
      ),
    );
  };

  const onEstimateLeadFieldChange = (regionId, materialId, field, value) => {
    setEstimateLeadGroups((prev) =>
      prev.map((group) => {
        if (Number(group.SSRRegionId) !== Number(regionId)) return group;
        return {
          ...group,
          rows: group.rows.map((row) =>
            Number(row.MaterialId) === Number(materialId)
              ? { ...row, [field]: value }
              : row,
          ),
        };
      }),
    );
  };

  const recalculateLeadForRow = async (regionId, materialId, leadDistanceKm) => {
    if (
      leadDistanceKm === "" ||
      leadDistanceKm === null ||
      leadDistanceKm === undefined ||
      Number.isNaN(Number(leadDistanceKm))
    ) {
      onEstimateLeadFieldChange(regionId, materialId, "Lead", null);
      return;
    }
    const key = `${regionId}-${materialId}`;
    setCalculatingLeadKey(key);
    try {
      const res = await axios.post(`${API_BASE}/api/calculate-lead`, {
        workId: selectedProjectId,
        materialId,
        regionId,
        leadDistanceKm: Number(leadDistanceKm),
      });
      onEstimateLeadFieldChange(regionId, materialId, "Lead", res.data.lead);
    } catch (err) {
      console.error(err);
      onEstimateLeadFieldChange(regionId, materialId, "Lead", null);
      setMessage(
        `Lead calculation failed: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setCalculatingLeadKey("");
    }
  };

  const saveEstimateStandardAdditions = async () => {
    if (!selectedProjectId) {
      alert("Please select Work first.");
      return;
    }
    const rows = [];
    for (const region of estimateRegions) {
      // Description + Percentage is optional — skip blank regions
      if (!region.selectedAdditionId) continue;
      const option = (region.options || []).find(
        (o) =>
          Number(o.MasterStandardAdditionId) ===
          Number(region.selectedAdditionId),
      );
      if (!option) {
        alert(
          `Invalid standard addition for ${region.SSRRegionName || "region"}.`,
        );
        return;
      }
      const applyLabourCess = region.ApplyLabourCess === true;
      if (applyLabourCess) {
        if (
          region.LabourCess === "" ||
          region.LabourCess === null ||
          region.LabourCess === undefined ||
          Number.isNaN(Number(region.LabourCess))
        ) {
          alert(
            `Labour Cess (%) is required for ${region.SSRRegionName || "region"} when Apply Labour Cess is Yes.`,
          );
          return;
        }
      }
      rows.push({
        SSRRegionId: region.SSRRegionId,
        Description: option.Description,
        Percentage: option.Percentage,
        ApplyForLead: region.ApplyForLead !== false,
        ApplyLabourCess: applyLabourCess,
        LabourCess: applyLabourCess ? Number(region.LabourCess) : null,
      });
    }
    if (
      !window.confirm(
        rows.length
          ? `Save ${rows.length} standard addition(s) for this work? Regions left blank will not be saved.`
          : "No Description + Percentage selected. This will clear existing Work Standard Additions for this work. Continue?",
      )
    ) {
      return;
    }

    setSavingEstimateAdditions(true);
    setMessage("");
    try {
      const res = await axios.post(`${API_BASE}/api/work-standard-additions`, {
        workId: selectedProjectId,
        rows,
      });
      const successMsg = `Standard Additions saved successfully (${res.data?.count || rows.length} row(s)). You can now save Lead Details.`;
      setEstimateAdditionsSaved(true);
      // If there are no lead materials, unlock Work Material next.
      if (!estimateLeadGroups.length) {
        setEstimateLeadsSaved(true);
      } else {
        setEstimateLeadsSaved(false);
      }
      setMessage(successMsg);
      alert(successMsg);
    } catch (err) {
      console.error(err);
      const failMsg = `Standard addition save failed: ${err.response?.data?.message || err.message}`;
      setMessage(failMsg);
      alert(failMsg);
    } finally {
      setSavingEstimateAdditions(false);
    }
  };

  const saveEstimateLeads = async () => {
    if (!selectedProjectId) {
      alert("Please select Work first.");
      return;
    }
    const rows = [];
    for (const group of estimateLeadGroups) {
      for (const row of group.rows || []) {
        if (
          row.LeadDistanceKm === "" ||
          row.LeadDistanceKm === null ||
          row.LeadDistanceKm === undefined ||
          Number.isNaN(Number(row.LeadDistanceKm))
        ) {
          alert(
            `Lead in Km is required for ${row.MaterialShortDescription || row.MaterialId} (${group.SSRRegionShortName || "region"}).`,
          );
          return;
        }
        rows.push({
          SSRRegionId: group.SSRRegionId,
          MaterialId: row.MaterialId,
          MaterialUnitId: row.MaterialUnitId,
          QuaryName: row.QuaryName,
          Remarks: row.Remarks,
          LeadDistanceKm: Number(row.LeadDistanceKm),
          Lead: row.Lead,
        });
      }
    }
    if (!rows.length) {
      alert("No lead materials to save for this work.");
      return;
    }
    if (!window.confirm("Save / update lead details for this work?")) return;

    setSavingEstimateLeads(true);
    setMessage("");
    try {
      const res = await axios.post(`${API_BASE}/api/work-leads`, {
        workId: selectedProjectId,
        rows,
      });
      // Refresh estimate panel after DB save completes, then notify.
      await handleGenerateEstimate({ resetFlow: false });
      const successMsg = `Lead Details saved successfully (${res.data?.count || rows.length} row(s)). You can now Populate / Update Work Material.`;
      setEstimateLeadsSaved(true);
      setMessage(successMsg);
      setSavingEstimateLeads(false);
      alert(successMsg);
    } catch (err) {
      console.error(err);
      const failMsg = `Lead save failed: ${err.response?.data?.message || err.message}`;
      setMessage(failMsg);
      setSavingEstimateLeads(false);
      alert(failMsg);
    } finally {
      setSavingEstimateLeads(false);
    }
  };

  const populateWorkMaterials = async () => {
    if (!selectedProjectId) {
      alert("Please select Work first.");
      return;
    }
    if (
      !window.confirm(
        "Populate / update Work Material and Work Abstract rates for this work?",
      )
    ) {
      return;
    }

    setSavingWorkMaterials(true);
    setMessage("");
    try {
      const res = await axios.post(`${API_BASE}/api/populate-work-materials`, {
        workId: selectedProjectId,
      });
      const successMsg =
        res.data?.message ||
        "Work Material and Work Abstract rates updated successfully.";
      setMessage(successMsg);
      alert(successMsg);
      if (estimationTab === 1) {
        getCheckedItemsList();
        getCheckedItems();
      }
    } catch (err) {
      console.error(err);
      const failMsg = `Work Material populate failed: ${err.response?.data?.message || err.message}`;
      setMessage(failMsg);
      alert(failMsg);
    } finally {
      setSavingWorkMaterials(false);
    }
  };

  const handleGenerateMeasurementReport = async () => {
    clearEstimationOutputs();
    try {
      const res = await axios.get(
        `${API_BASE}/api/generate-measurement-report`,
        {
          params: {
            projectId: selectedProjectId,
            subWorkId: selectedSubWorkId,
          },
          responseType: "blob",
        },
      );

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

  const handlePrintSsr = async () => {
    if (!printSsrRegionId || !printSsrYearId) {
      alert("Please select SSR Region and SSR Year.");
      return;
    }
    setPrintingSsr(true);
    try {
      const params = {
        ssrYearId: printSsrYearId,
        regionId: printSsrRegionId,
      };
      if (printSsrCategoryId) params.categoryId = printSsrCategoryId;
      if (printSsrSubCategoryId) params.subCategoryId = printSsrSubCategoryId;

      const res = await axios.get(
        `${API_BASE}/api/generate-item-catalog-report`,
        {
          params,
          responseType: "blob",
        },
      );

      const disposition = res.headers["content-disposition"];
      let filename = "SSR_Catalogue.pdf";
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
      console.error("Failed to print SSR:", err);
      alert("Failed to generate the SSR report. Please try again.");
    } finally {
      setPrintingSsr(false);
    }
  };

  const loadPrintSsrYears = async (regionId) => {
    if (!regionId) {
      setPrintSsrYears([]);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/master-years?regionId=${encodeURIComponent(regionId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load SSR years.");
      setPrintSsrYears(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setPrintSsrYears([]);
    }
  };

  const loadPrintSsrCategories = async (regionId) => {
    if (!regionId) {
      setPrintSsrCategories([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/ssr-categories/${regionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load categories.");
      setPrintSsrCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setPrintSsrCategories([]);
    }
  };

  const loadPrintSsrSubCategories = async (categoryId) => {
    if (!categoryId) {
      setPrintSsrSubCategories([]);
      return;
    }
    try {
      const res = await axios.get(
        `${API_BASE}/api/ssr-sub-categories/${categoryId}`,
      );
      setPrintSsrSubCategories(res.data?.data || []);
    } catch (err) {
      console.error(err);
      setPrintSsrSubCategories([]);
    }
  };

  useEffect(() => {
    loadRegions();
    loadCategories();
    loadSubCategoryMaster();
    loadUnitMaster();
    loadProjects();
    loadProjectMaster();
    loadWorksMaster();
    loadOrgUsers();
    loadCountries();
    loadOrganizations();
    loadMasterUsers();
    loadDesignationMaster();
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) {
      router.replace("/");
      return;
    }
    try {
      const user = JSON.parse(saved);
      setCurrentUser(user);
      setActiveMaster(isSuperAdminUser(user) ? "regions" : "items");
      if (user?.OrganizationId) {
        setProjectForm((prev) => ({
          ...prev,
          OrganizationId: String(user.OrganizationId),
        }));
        loadProjectFormOrgUsers(user.OrganizationId);
      }
      loadWorksMaster();
      loadEstimationRegions(user);
      if (!isSuperAdminUser(user)) {
        // Non-SuperAdmin Work Master list matches general works (non-deleted).
        loadWorkMasterList("", "");
      }
      if (canAccessItemMaster(user)) {
        const allowed = getItemMasterAllowedRegionId(user);
        setItemMasterForm({
          ...initialItemMasterForm,
          UserId: user.UserId ? String(user.UserId) : "",
          RegionId: allowed ? String(allowed) : "",
        });
        loadItemMasterYears();
        if (allowed) {
          setItemMasterFilterRegionId(String(allowed));
          loadItemMasterCategories(allowed);
          loadItemMasterListCategories(allowed);
          loadItemMasterListYears(allowed);
        }
        setItemMasterList([]);
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    if (activeMaster === "items" && currentUser?.UserId) {
      loadEstimationRegions(currentUser);
    }
  }, [activeMaster, currentUser?.UserId]);

  const onLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setProfileOpen(false);
    router.replace("/");
  };

  const onProfileSaved = (data) => {
    const nextUser = { ...currentUser, ...data };
    setCurrentUser(nextUser);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextUser));
  };

  const onRegionChange = (e) => {
    const { name, value } = e.target;
    setRegionForm((prev) => ({ ...prev, [name]: value }));
  };

  const onCategoryChange = (e) => {
    const { name, value } = e.target;
    setCategoryForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubCategoryChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSubCategoryForm((prev) => {
      if (name === "SSRRegionId") {
        return {
          ...prev,
          SSRRegionId: value,
          SSRCategoryId: "",
        };
      }
      return {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };
    });
  };

  const onUnitChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUnitForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
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

  const onSubCategorySubmit = async (e) => {
    e.preventDefault();
    const isEdit = Boolean(editingSubCategoryId);
    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this subcategory" : "save this new subcategory"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }
    setSavingSubCategory(true);
    setMessage("");
    try {
      const payload = {
        SSRCategoryId: subCategoryForm.SSRCategoryId,
        SSRSubCategoryName: subCategoryForm.SSRSubCategoryName,
        SSRSubCategoryShortName: subCategoryForm.SSRSubCategoryShortName,
        DOrder: subCategoryForm.DOrder,
        DOrder1: subCategoryForm.DOrder1,
        Remarks: subCategoryForm.Remarks,
        MarkForDeletion: subCategoryForm.MarkForDeletion,
      };
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/ssr-sub-categories/${editingSubCategoryId}`
          : `${API_BASE}/api/ssr-sub-categories`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save.");
      setMessage(
        isEdit
          ? "Subcategory updated successfully."
          : "Subcategory saved successfully.",
      );
      setSubCategoryForm(initialSubCategoryForm);
      setEditingSubCategoryId(null);
      await loadSubCategoryMaster();
    } catch (error) {
      setMessage(`Subcategory save failed: ${error.message}`);
    } finally {
      setSavingSubCategory(false);
    }
  };

  const onUnitSubmit = async (e) => {
    e.preventDefault();
    const isEdit = Boolean(editingUnitId);
    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this unit" : "save this new unit"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }
    setSavingUnit(true);
    setMessage("");
    try {
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/master-units/${editingUnitId}`
          : `${API_BASE}/api/master-units`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(unitForm),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save.");
      setMessage(
        isEdit ? "Unit updated successfully." : "Unit saved successfully.",
      );
      setUnitForm(initialUnitForm);
      setEditingUnitId(null);
      await loadUnitMaster();
    } catch (error) {
      setMessage(`Unit save failed: ${error.message}`);
    } finally {
      setSavingUnit(false);
    }
  };

  const loadItemMasterYears = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/master-years`);
      setItemMasterYears(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setItemMasterYears([]);
    }
  };

  const loadItemMasterCategories = async (regionId) => {
    if (!regionId) {
      setItemMasterCategories([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/ssr-categories/${regionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load categories.");
      setItemMasterCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setItemMasterCategories([]);
    }
  };

  const loadItemMasterSubCategories = async (categoryId) => {
    if (!categoryId) {
      setItemMasterSubCategories([]);
      return;
    }
    try {
      const res = await axios.get(
        `${API_BASE}/api/ssr-sub-categories/${categoryId}`,
      );
      setItemMasterSubCategories(
        Array.isArray(res.data?.data) ? res.data.data : [],
      );
    } catch (err) {
      console.error(err);
      setItemMasterSubCategories([]);
    }
  };

  const loadItemMasterList = async (
    user = currentUser,
    filters = {
      regionId: itemMasterFilterRegionId,
      ssrYearId: itemMasterFilterYearId,
      categoryId: itemMasterFilterCategoryId,
      subCategoryId: itemMasterFilterSubCategoryId,
    },
  ) => {
    if (!user?.UserId || !canAccessItemMaster(user)) {
      setItemMasterList([]);
      return;
    }
    const regionId = filters.regionId;
    const ssrYearId = filters.ssrYearId;
    const categoryId = filters.categoryId;
    const subCategoryId = filters.subCategoryId;
    if (!regionId || !ssrYearId) {
      setItemMasterList([]);
      return;
    }
    setLoadingItemMaster(true);
    try {
      const params = {
        userId: user.UserId,
        regionId,
        ssrYearId,
      };
      if (categoryId) params.categoryId = categoryId;
      if (subCategoryId) params.subCategoryId = subCategoryId;
      const res = await axios.get(`${API_BASE}/api/master-items`, {
        params,
      });
      setItemMasterList(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.error(err);
      setItemMasterList([]);
      setMessage(
        `Item Master load failed: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setLoadingItemMaster(false);
    }
  };

  const loadItemMasterListYears = async (regionId) => {
    if (!regionId) {
      setItemMasterListYears([]);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/master-years`, {
        params: { regionId },
      });
      setItemMasterListYears(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setItemMasterListYears([]);
    }
  };

  const loadItemMasterListCategories = async (regionId) => {
    if (!regionId) {
      setItemMasterListCategories([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/ssr-categories/${regionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load categories.");
      setItemMasterListCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setItemMasterListCategories([]);
    }
  };

  const loadItemMasterListSubCategories = async (categoryId) => {
    if (!categoryId) {
      setItemMasterListSubCategories([]);
      return;
    }
    try {
      const res = await axios.get(
        `${API_BASE}/api/ssr-sub-categories/${categoryId}`,
      );
      setItemMasterListSubCategories(
        Array.isArray(res.data?.data) ? res.data.data : [],
      );
    } catch (err) {
      console.error(err);
      setItemMasterListSubCategories([]);
    }
  };

  const resetItemMasterEdit = () => {
    const allowedRegionId = getItemMasterAllowedRegionId(currentUser);
    setEditingItemMasterId(null);
    setItemMasterForm({
      ...initialItemMasterForm,
      UserId: currentUser?.UserId ? String(currentUser.UserId) : "",
      RegionId: allowedRegionId ? String(allowedRegionId) : "",
    });
    setItemMasterCategories([]);
    setItemMasterSubCategories([]);
    if (allowedRegionId) {
      loadItemMasterCategories(allowedRegionId);
    }
  };

  const onItemMasterChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === "checkbox" ? checked : value;
    setItemMasterForm((prev) => {
      const next = { ...prev, [name]: nextValue };
      if (name === "RegionId") {
        next.CategoryId = "";
        next.SubCategoryId = "";
        loadItemMasterCategories(value);
        setItemMasterSubCategories([]);
      }
      if (name === "CategoryId") {
        next.SubCategoryId = "";
        loadItemMasterSubCategories(value);
      }
      return next;
    });
  };

  const startItemMasterEdit = async (row) => {
    if (!isSuperAdminUser(currentUser)) {
      const allowed = getItemMasterAllowedRegionId(currentUser);
      if (!allowed || Number(row.RegionId) !== Number(allowed)) {
        alert("You can only edit NON SSR items for your allowed region.");
        return;
      }
    }
    if (
      isOrgAdminUser(currentUser) &&
      Number(row.CreatorOrganizationId) !== Number(currentUser.OrganizationId)
    ) {
      alert(
        "You can only edit NON SSR items entered by your organization.",
      );
      return;
    }
    setEditingItemMasterId(row.ItemId);
    setItemMasterForm({
      ItemId: String(row.ItemId),
      UserId: row.UserId != null ? String(row.UserId) : "",
      RegionId: row.RegionId != null ? String(row.RegionId) : "",
      CategoryId: row.CategoryId != null ? String(row.CategoryId) : "",
      SubCategoryId:
        row.SubCategoryId != null ? String(row.SubCategoryId) : "",
      SSRYearId: row.SSRYearId != null ? String(row.SSRYearId) : "",
      UnitId: row.UnitId != null ? String(row.UnitId) : "",
      ItemNumber: row.ItemNumber || "",
      ItemDescription: row.ItemDescription || "",
      ItemShortDescription: row.ItemShortDescription || "",
      CompletedRate:
        row.CompletedRate === null || row.CompletedRate === undefined
          ? ""
          : String(row.CompletedRate),
      LabourRate:
        row.LabourRate === null || row.LabourRate === undefined
          ? ""
          : String(row.LabourRate),
      PageNumber: row.PageNumber != null ? String(row.PageNumber) : "",
    });
    if (row.RegionId) await loadItemMasterCategories(row.RegionId);
    if (row.CategoryId) await loadItemMasterSubCategories(row.CategoryId);
  };

  const onItemMasterSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser?.UserId || !canAccessItemMaster(currentUser)) {
      setMessage("Item Master save failed: not authorised.");
      return;
    }
    const isEdit = Boolean(editingItemMasterId);
    if (
      !window.confirm(
        `Please review the details.\nDo you want to ${isEdit ? "update this item" : "save this new item"}?`,
      )
    ) {
      setMessage("Save canceled. You can continue editing the form.");
      return;
    }
    setSavingItemMaster(true);
    setMessage("");
    const payload = {
      ...itemMasterForm,
      actingUserId: currentUser.UserId,
      userId: currentUser.UserId,
    };
    try {
      const res = await fetch(
        isEdit
          ? `${API_BASE}/api/master-items/${editingItemMasterId}`
          : `${API_BASE}/api/master-items`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save item.");
      setMessage(
        isEdit ? "Item updated successfully." : "Item saved successfully.",
      );
      resetItemMasterEdit();
      if (itemMasterFilterRegionId && itemMasterFilterYearId) {
        await loadItemMasterList(currentUser, {
          regionId: itemMasterFilterRegionId,
          ssrYearId: itemMasterFilterYearId,
          categoryId: itemMasterFilterCategoryId,
          subCategoryId: itemMasterFilterSubCategoryId,
        });
      } else {
        setItemMasterList([]);
      }
    } catch (error) {
      setMessage(`Item Master save failed: ${error.message}`);
    } finally {
      setSavingItemMaster(false);
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

  const startSubCategoryEdit = (row) => {
    setActiveMaster("subcategories");
    setEditingSubCategoryId(row.SSRSubCategoryId);
    setSubCategoryForm({
      SSRRegionId: row.SSRRegionId ? String(row.SSRRegionId) : "",
      SSRCategoryId: row.SSRCategoryId ? String(row.SSRCategoryId) : "",
      SSRSubCategoryName: row.SSRSubCategoryName || "",
      SSRSubCategoryShortName: row.SSRSubCategoryShortName || "",
      DOrder: row.DOrder ?? "",
      DOrder1: row.DOrder1 ?? "",
      Remarks: row.Remarks || "",
      MarkForDeletion: Boolean(row.MarkForDeletion),
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

  const resetSubCategoryEdit = () => {
    setEditingSubCategoryId(null);
    setSubCategoryForm(initialSubCategoryForm);
  };

  const startUnitEdit = (row) => {
    setActiveMaster("units");
    setEditingUnitId(row.UnitId);
    setUnitForm({
      UnitName: row.UnitName || "",
      UnitShortName: row.UnitShortName || "",
      DOrder: row.DOrder ?? "",
      DOrder1: row.DOrder1 ?? "",
      Remarks: row.Remarks || "",
      MarkForDeletion: Boolean(row.MarkForDeletion),
    });
  };

  const resetUnitEdit = () => {
    setEditingUnitId(null);
    setUnitForm(initialUnitForm);
  };

  const getRegionShortNameById = (regionId) => {
    const region = regions.find(
      (item) => Number(item.SSRRegionId) === Number(regionId),
    );
    return region?.SSRRegionShortName || "";
  };

  const getCategoryNameById = (categoryId) => {
    const category = categories.find(
      (item) => Number(item.SSRCategoryId) === Number(categoryId),
    );
    return (
      category?.SSRCategoryShortName ||
      category?.SSRCategoryName ||
      ""
    );
  };

  const subCategoryFormCategories = categories.filter(
    (c) =>
      !subCategoryForm.SSRRegionId ||
      Number(c.SSRRegionId) === Number(subCategoryForm.SSRRegionId),
  );

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

  const persistCheckedItemOrder = async (orderedList) => {
    if (!selectedProjectId || !selectedSubWorkId || !orderedList.length) return;
    setReorderingCheckedList(true);
    try {
      await axios.put(`${API_BASE}/api/work-abstract/reorder`, {
        workId: selectedProjectId,
        projectId: selectedProjectId,
        subWorkId: selectedSubWorkId,
        orderedIds: orderedList.map((row) => row.WorkAbstractId),
      });
      setCheckedItemsList(
        orderedList.map((row, idx) => ({
          ...row,
          Sequence: idx + 1,
        })),
      );
    } catch (err) {
      console.error(err);
      alert(
        `Reorder failed: ${err.response?.data?.message || err.message}`,
      );
      getCheckedItemsList();
    } finally {
      setReorderingCheckedList(false);
    }
  };

  const moveCheckedItem = (fromAbstractId, toAbstractId) => {
    if (!fromAbstractId || !toAbstractId || fromAbstractId === toAbstractId) {
      return;
    }
    setCheckedItemsList((prev) => {
      const fromIdx = prev.findIndex(
        (r) => Number(r.WorkAbstractId) === Number(fromAbstractId),
      );
      const toIdx = prev.findIndex(
        (r) => Number(r.WorkAbstractId) === Number(toAbstractId),
      );
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      queueMicrotask(() => persistCheckedItemOrder(next));
      return next;
    });
  };

  const isSuperAdmin = isSuperAdminUser(currentUser);
  const isOrgAdmin = isOrgAdminUser(currentUser);
  const isIndvUser = isIndvUserUser(currentUser);
  const canManageProjects = isOrgAdmin || isSuperAdmin;
  const canManageMaterials = isSuperAdmin;
  const canManageItemMaster = canAccessItemMaster(currentUser);
  const itemMasterAllowedRegionId = getItemMasterAllowedRegionId(currentUser);
  const itemMasterRegionOptions = isSuperAdmin
    ? regions
    : regions.filter(
        (r) => Number(r.SSRRegionId) === Number(itemMasterAllowedRegionId),
      );
  const itemMasterRoleBanner = isOrgAdmin
    ? "Organization Admins can only add, list, and edit NON SSR items entered by their organization"
    : isIndvUser
      ? "Individual Users can only add data for NON SSR items"
      : "";
  const activeMasterMeta = mastersMenu.find((m) => m.id === activeMaster);
  const isErrorMessage = /failed/i.test(message);
  const sessionOrgId = currentUser?.OrganizationId
    ? String(currentUser.OrganizationId)
    : "";
  const sessionOrgName =
    organizations.find(
      (org) => Number(org.OrganizationId) === Number(sessionOrgId),
    )?.OrgName ||
    currentUser?.OrgName ||
    sessionOrgId;
  const filteredProjectMasterList = (
    isSuperAdmin ? projectMasterList : projects
  ).filter(
    (p) =>
      !isSuperAdmin ||
      !projectListOrgFilter ||
      Number(p.OrganizationID) === Number(projectListOrgFilter),
  );

  const renderMenuItem = (
    item,
    { forceDisabled = false, disabledTitle = "Available only for SuperAdmin" } = {},
  ) => {
    const isActive = activeMaster === item.id;
    const isUpcoming = item.status === "upcoming";
    const isDisabled = forceDisabled || isUpcoming;
    return (
      <button
        key={item.id}
        type="button"
        disabled={isDisabled}
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
          background: isActive && !isDisabled ? theme.colors.accent : "transparent",
          color: isDisabled ? "#5D7590" : "#fff",
          fontWeight: isActive && !isDisabled ? 700 : 500,
          fontSize: 13.5,
          cursor: isDisabled ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
          opacity: forceDisabled ? 0.55 : 1,
        }}
        title={
          forceDisabled
            ? disabledTitle
            : isUpcoming
              ? "Coming soon"
              : item.label
        }
      >
        <span style={{ fontSize: 15 }}>{item.icon}</span>
        <span style={{ flex: 1 }}>{item.label}</span>
        {forceDisabled ? (
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
            Admin
          </span>
        ) : (
          isUpcoming && (
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
          )
        )}
      </button>
    );
  };

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
            padding: "26px 16px 16px",
            position: "sticky",
            top: 0,
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "0 10px", marginBottom: 28, flexShrink: 0 }}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#8FA9C7",
              }}
            >
              SoftChariot
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>
              Estimate Workspace
            </div>
          </div>

          <div
            className="wrms-nav-list"
            style={{
              display: "grid",
              gap: 3,
              flex: 1,
              overflowY: "auto",
              alignContent: "start",
              minHeight: 0,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#8FA9C7",
                padding: "2px 4px 6px",
              }}
            >
              SuperAdmin
            </div>
            {superAdminMenu.map((item) =>
              renderMenuItem(item, { forceDisabled: !isSuperAdmin }),
            )}

            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#8FA9C7",
                padding: "14px 4px 6px",
                marginTop: 6,
                borderTop: `1px solid ${theme.colors.navyLine}`,
              }}
            >
              All Users
            </div>
            {allUsersMenu.map((item) =>
              renderMenuItem(item, {
                forceDisabled:
                  item.id === "item-master" ? !canManageItemMaster : false,
              }),
            )}
          </div>

          {currentUser && (
            <div
              style={{
                flexShrink: 0,
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px solid ${theme.colors.navyLine}`,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#8FA9C7",
                  marginBottom: 10,
                  padding: "0 4px",
                }}
              >
                User Profile
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  width: "100%",
                  padding: "10px",
                  borderRadius: 10,
                  border: "none",
                  background: theme.colors.navySoft,
                  color: "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                  marginBottom: 10,
                }}
                title="Open user profile"
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: theme.colors.accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {(currentUser.UserName || "?").charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13.5,
                      lineHeight: 1.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {currentUser.UserName}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#8FA9C7",
                      marginTop: 2,
                    }}
                  >
                    View profile
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={onLogout}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #2C4A69",
                  background: "transparent",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </div>
          )}
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

          {/* ── Organizations ── */}
          {activeMaster === "organizations" && isSuperAdmin && (
            <Card
              eyebrow="Master · Organization"
              title={
                editingOrganizationId
                  ? `Edit organization #${editingOrganizationId}`
                  : "Organization Master"
              }
              subtitle="Create and maintain organizations (MasterOrganization)."
            >
              <FormShell onSubmit={onOrganizationSubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <Field label="Organization Code" required>
                    <input
                      name="OrgCode"
                      value={organizationForm.OrgCode}
                      onChange={onOrganizationChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Organization Name">
                    <input
                      name="OrgName"
                      value={organizationForm.OrgName}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Address" span>
                    <input
                      name="OrgAddress"
                      value={organizationForm.OrgAddress}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Country">
                    <select
                      name="OrgCountryId"
                      value={organizationForm.OrgCountryId}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                    >
                      <option value="">Select country</option>
                      {countries.map((c) => (
                        <option key={c.CountryId} value={c.CountryId}>
                          {c.CountryName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="State">
                    <select
                      name="OrgStateId"
                      value={organizationForm.OrgStateId}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                      disabled={!organizationForm.OrgCountryId}
                    >
                      <option value="">Select state</option>
                      {states.map((s) => (
                        <option key={s.StateId} value={s.StateId}>
                          {s.StateName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="District">
                    <select
                      name="OrgDistrictId"
                      value={organizationForm.OrgDistrictId}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                      disabled={!organizationForm.OrgStateId}
                    >
                      <option value="">Select district</option>
                      {districts.map((d) => (
                        <option key={d.DistrictId} value={d.DistrictId}>
                          {d.DistrictName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="PIN / ZIP">
                    <input
                      name="OrgPinZip"
                      value={organizationForm.OrgPinZip}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      name="OrgEmail"
                      type="email"
                      value={organizationForm.OrgEmail}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Contact">
                    <input
                      name="OrgContact"
                      value={organizationForm.OrgContact}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Contact Person">
                    <input
                      name="OrgContactPerson"
                      value={organizationForm.OrgContactPerson}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Contact Person Designation">
                    <input
                      name="OrgConPerDesig"
                      value={organizationForm.OrgConPerDesig}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder">
                    <input
                      name="DOrder"
                      value={organizationForm.DOrder}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder1">
                    <input
                      name="DOrder1"
                      value={organizationForm.DOrder1}
                      onChange={onOrganizationChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Mark for deletion">
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 500,
                        minHeight: 42,
                      }}
                    >
                      <input
                        type="checkbox"
                        name="MarkForDeletion"
                        checked={organizationForm.MarkForDeletion}
                        onChange={onOrganizationChange}
                      />
                      Yes
                    </label>
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton disabled={savingOrganization}>
                    {savingOrganization
                      ? "Saving…"
                      : editingOrganizationId
                        ? "Update organization"
                        : "Save organization"}
                  </PrimaryButton>
                  {editingOrganizationId && (
                    <SecondaryButton onClick={resetOrganizationEdit}>
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
                      <th>Code</th>
                      <th>Name</th>
                      <th>Country</th>
                      <th>State</th>
                      <th>District</th>
                      <th>PIN</th>
                      <th>Deleted</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingOrganizations ? (
                      <EmptyRow colSpan={9}>Loading…</EmptyRow>
                    ) : organizations.length ? (
                      organizations.map((org) => (
                        <tr key={org.OrganizationId}>
                          <td
                            style={{
                              fontFamily: theme.font.mono,
                              color: theme.colors.inkSoft,
                            }}
                          >
                            {org.OrganizationId}
                          </td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {org.OrgCode}
                          </td>
                          <td>{org.OrgName || "—"}</td>
                          <td>{org.CountryName || "—"}</td>
                          <td>{org.StateName || "—"}</td>
                          <td>{org.DistrictName || "—"}</td>
                          <td>{org.OrgPinZip || "—"}</td>
                          <td>
                            <Badge
                              tone={org.MarkForDeletion ? "red" : "green"}
                            >
                              {org.MarkForDeletion ? "Yes" : "No"}
                            </Badge>
                          </td>
                          <td>
                            <SecondaryButton
                              onClick={() => startOrganizationEdit(org)}
                            >
                              Edit
                            </SecondaryButton>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={9}>
                        No organizations found — add one above.
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Users ── */}
          {activeMaster === "users" && isSuperAdmin && (
            <Card
              eyebrow="Master · User"
              title={
                editingUserMasterId
                  ? `Edit user #${editingUserMasterId}`
                  : "User Master"
              }
              subtitle="Create and maintain users (MasterUser). Category and Designation depend on Organization."
            >
              <FormShell onSubmit={onUserMasterSubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <Field label="Organization" required>
                    <select
                      name="OrganizationId"
                      value={userMasterForm.OrganizationId}
                      onChange={onUserMasterChange}
                      required
                      style={inputStyle}
                    >
                      <option value="">Select organization</option>
                      {organizations.map((org) => (
                        <option
                          key={org.OrganizationId}
                          value={org.OrganizationId}
                        >
                          {org.OrgCode} — {org.OrgName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="User Category" required>
                    <select
                      name="UserCategoryId"
                      value={userMasterForm.UserCategoryId}
                      onChange={onUserMasterChange}
                      required
                      disabled={!userMasterForm.OrganizationId}
                      style={inputStyle}
                    >
                      <option value="">Select category</option>
                      {userCategories.map((c) => (
                        <option
                          key={c.UserCategoryId}
                          value={c.UserCategoryId}
                        >
                          {c.UserCategoryName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Designation" required>
                    <select
                      name="DesignationId"
                      value={userMasterForm.DesignationId}
                      onChange={onUserMasterChange}
                      required
                      disabled={!userMasterForm.OrganizationId}
                      style={inputStyle}
                    >
                      <option value="">Select designation</option>
                      {userDesignations.map((d) => (
                        <option key={d.DesignationId} value={d.DesignationId}>
                          {d.DesignationName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="User Login Name" required>
                    <input
                      name="UserLoginName"
                      value={userMasterForm.UserLoginName}
                      onChange={onUserMasterChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="User Name" required>
                    <input
                      name="UserName"
                      value={userMasterForm.UserName}
                      onChange={onUserMasterChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field
                    label={
                      editingUserMasterId
                        ? "Password (leave blank to keep)"
                        : "Password"
                    }
                    required={!editingUserMasterId}
                  >
                    <input
                      name="UserPWD"
                      type="password"
                      value={userMasterForm.UserPWD}
                      onChange={onUserMasterChange}
                      required={!editingUserMasterId}
                      style={inputStyle}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="User Address" span>
                    <input
                      name="UserAddress"
                      value={userMasterForm.UserAddress}
                      onChange={onUserMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Date of Joining">
                    <input
                      name="UserDateOfJoining"
                      type="date"
                      value={userMasterForm.UserDateOfJoining}
                      onChange={onUserMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Date of Birth">
                    <input
                      name="UserDateOfBirth"
                      type="date"
                      value={userMasterForm.UserDateOfBirth}
                      onChange={onUserMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Contact">
                    <input
                      name="UserContact"
                      value={userMasterForm.UserContact}
                      onChange={onUserMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      name="UserEmail"
                      type="email"
                      value={userMasterForm.UserEmail}
                      onChange={onUserMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Date of Relieving">
                    <input
                      name="DateOfRelieving"
                      type="date"
                      value={userMasterForm.DateOfRelieving}
                      onChange={onUserMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder">
                    <input
                      name="DOrder"
                      value={userMasterForm.DOrder}
                      onChange={onUserMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Remarks" span>
                    <input
                      name="Remarks"
                      value={userMasterForm.Remarks}
                      onChange={onUserMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Is Active">
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 500,
                        minHeight: 42,
                      }}
                    >
                      <input
                        type="checkbox"
                        name="IsActive"
                        checked={userMasterForm.IsActive}
                        onChange={onUserMasterChange}
                      />
                      Yes
                    </label>
                  </Field>
                  <Field label="Mark for deletion">
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 500,
                        minHeight: 42,
                      }}
                    >
                      <input
                        type="checkbox"
                        name="MarkForDeletion"
                        checked={userMasterForm.MarkForDeletion}
                        onChange={onUserMasterChange}
                      />
                      Yes
                    </label>
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton disabled={savingUserMaster}>
                    {savingUserMaster
                      ? "Saving…"
                      : editingUserMasterId
                        ? "Update user"
                        : "Save user"}
                  </PrimaryButton>
                  {editingUserMasterId && (
                    <SecondaryButton onClick={resetUserMasterEdit}>
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
                      <th>Login</th>
                      <th>Name</th>
                      <th>Organization</th>
                      <th>Category</th>
                      <th>Designation</th>
                      <th>Active</th>
                      <th>Deleted</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMasterUsers ? (
                      <EmptyRow colSpan={9}>Loading…</EmptyRow>
                    ) : masterUsers.length ? (
                      masterUsers.map((u) => (
                        <tr key={u.UserId}>
                          <td
                            style={{
                              fontFamily: theme.font.mono,
                              color: theme.colors.inkSoft,
                            }}
                          >
                            {u.UserId}
                          </td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {u.UserLoginName}
                          </td>
                          <td>{u.UserName}</td>
                          <td>
                            {u.OrgCode || u.OrgName || u.OrganizationId}
                          </td>
                          <td>{u.UserCategoryName || "—"}</td>
                          <td>{u.DesignationName || "—"}</td>
                          <td>
                            <Badge tone={u.IsActive ? "green" : "red"}>
                              {u.IsActive ? "Yes" : "No"}
                            </Badge>
                          </td>
                          <td>
                            <Badge
                              tone={u.MarkForDeletion ? "red" : "green"}
                            >
                              {u.MarkForDeletion ? "Yes" : "No"}
                            </Badge>
                          </td>
                          <td>
                            <SecondaryButton
                              onClick={() => startUserMasterEdit(u)}
                            >
                              Edit
                            </SecondaryButton>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={9}>
                        No users found — add one above.
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Designations ── */}
          {activeMaster === "designations" && isSuperAdmin && (
            <Card
              eyebrow="Master · Designation"
              title={
                editingDesignationId
                  ? `Edit designation #${editingDesignationId}`
                  : "Designation Master"
              }
              subtitle="Create and maintain designations (MasterDesignation). Branch depends on Organization."
            >
              <FormShell onSubmit={onDesignationMasterSubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <Field label="Organization" required>
                    <select
                      name="OrganizationId"
                      value={designationForm.OrganizationId}
                      onChange={onDesignationMasterChange}
                      required
                      style={inputStyle}
                    >
                      <option value="">Select organization</option>
                      {organizations.map((org) => (
                        <option
                          key={org.OrganizationId}
                          value={org.OrganizationId}
                        >
                          {org.OrgCode} — {org.OrgName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Branch">
                    <select
                      name="BranchId"
                      value={designationForm.BranchId}
                      onChange={onDesignationMasterChange}
                      disabled={!designationForm.OrganizationId}
                      style={inputStyle}
                    >
                      <option value="">Select branch (optional)</option>
                      {branches.map((b) => (
                        <option key={b.BranchID} value={b.BranchID}>
                          {b.BranchCode
                            ? `${b.BranchCode} — ${b.BranchName}`
                            : b.BranchName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Designation Name" required>
                    <input
                      name="DesignationName"
                      value={designationForm.DesignationName}
                      onChange={onDesignationMasterChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Designation Short Name" required>
                    <input
                      name="DesignationShortName"
                      value={designationForm.DesignationShortName}
                      onChange={onDesignationMasterChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder">
                    <input
                      name="DOrder"
                      value={designationForm.DOrder}
                      onChange={onDesignationMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder1">
                    <input
                      name="DOrder1"
                      value={designationForm.DOrder1}
                      onChange={onDesignationMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Remarks" span>
                    <input
                      name="Remarks"
                      value={designationForm.Remarks}
                      onChange={onDesignationMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Mark for deletion">
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 500,
                        minHeight: 42,
                      }}
                    >
                      <input
                        type="checkbox"
                        name="MarkForDeletion"
                        checked={designationForm.MarkForDeletion}
                        onChange={onDesignationMasterChange}
                      />
                      Yes
                    </label>
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton disabled={savingDesignation}>
                    {savingDesignation
                      ? "Saving…"
                      : editingDesignationId
                        ? "Update designation"
                        : "Save designation"}
                  </PrimaryButton>
                  {editingDesignationId && (
                    <SecondaryButton onClick={resetDesignationEdit}>
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
                      <th>Organization</th>
                      <th>Branch</th>
                      <th>DOrder</th>
                      <th>Deleted</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingDesignations ? (
                      <EmptyRow colSpan={8}>Loading…</EmptyRow>
                    ) : designationList.length ? (
                      designationList.map((row) => (
                        <tr key={row.DesignationId}>
                          <td
                            style={{
                              fontFamily: theme.font.mono,
                              color: theme.colors.inkSoft,
                            }}
                          >
                            {row.DesignationId}
                          </td>
                          <td>{row.DesignationName}</td>
                          <td>{row.DesignationShortName}</td>
                          <td>
                            {row.OrgCode || row.OrgName || row.OrganizationId}
                          </td>
                          <td>
                            {row.BranchName ||
                              row.BranchCode ||
                              (row.BranchId ? row.BranchId : "—")}
                          </td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {row.DOrder ?? "—"}
                          </td>
                          <td>
                            <Badge
                              tone={row.MarkForDeletion ? "red" : "green"}
                            >
                              {row.MarkForDeletion ? "Yes" : "No"}
                            </Badge>
                          </td>
                          <td>
                            <SecondaryButton
                              onClick={() => startDesignationEdit(row)}
                            >
                              Edit
                            </SecondaryButton>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={8}>
                        No designations found — add one above.
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
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

          {/* ── Subcategories ── */}
          {activeMaster === "subcategories" && (
            <Card
              eyebrow="Master · SSR SubCategory"
              title={
                editingSubCategoryId
                  ? `Edit subcategory #${editingSubCategoryId}`
                  : "SSR Subcategories"
              }
              subtitle="Subcategories nest under a category and group SSR items."
            >
              <FormShell onSubmit={onSubCategorySubmit}>
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
                      value={subCategoryForm.SSRRegionId}
                      onChange={onSubCategoryChange}
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
                      value={subCategoryForm.SSRCategoryId}
                      onChange={onSubCategoryChange}
                      required
                      disabled={!subCategoryForm.SSRRegionId}
                      style={inputStyle}
                    >
                      <option value="">Select SSR Category</option>
                      {subCategoryFormCategories.map((c) => (
                        <option key={c.SSRCategoryId} value={c.SSRCategoryId}>
                          {c.SSRCategoryShortName || c.SSRCategoryName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="SSR SubCategory Name" required>
                    <input
                      name="SSRSubCategoryName"
                      value={subCategoryForm.SSRSubCategoryName}
                      onChange={onSubCategoryChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="SSR SubCategory Short Name" required>
                    <input
                      name="SSRSubCategoryShortName"
                      value={subCategoryForm.SSRSubCategoryShortName}
                      onChange={onSubCategoryChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder">
                    <input
                      name="DOrder"
                      value={subCategoryForm.DOrder}
                      onChange={onSubCategoryChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder1">
                    <input
                      name="DOrder1"
                      value={subCategoryForm.DOrder1}
                      onChange={onSubCategoryChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Remarks" span>
                    <input
                      name="Remarks"
                      value={subCategoryForm.Remarks}
                      onChange={onSubCategoryChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Mark for deletion">
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 500,
                        minHeight: 42,
                      }}
                    >
                      <input
                        type="checkbox"
                        name="MarkForDeletion"
                        checked={subCategoryForm.MarkForDeletion}
                        onChange={onSubCategoryChange}
                      />
                      Yes
                    </label>
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton disabled={savingSubCategory}>
                    {savingSubCategory
                      ? "Saving…"
                      : editingSubCategoryId
                        ? "Update subcategory"
                        : "Save subcategory"}
                  </PrimaryButton>
                  {editingSubCategoryId && (
                    <SecondaryButton onClick={resetSubCategoryEdit}>
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
                      <th>Category</th>
                      <th>Name</th>
                      <th>Short name</th>
                      <th>DOrder</th>
                      <th>DOrder1</th>
                      <th>Deleted</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingSubCategories ? (
                      <EmptyRow colSpan={9}>Loading…</EmptyRow>
                    ) : subCategoryList.length ? (
                      subCategoryList.map((row) => (
                        <tr key={row.SSRSubCategoryId}>
                          <td
                            style={{
                              fontFamily: theme.font.mono,
                              color: theme.colors.inkSoft,
                            }}
                          >
                            {row.SSRSubCategoryId}
                          </td>
                          <td>
                            <Badge tone="accent">
                              {getRegionShortNameById(row.SSRRegionId) ||
                                row.SSRRegionShortName ||
                                row.SSRRegionName}
                            </Badge>
                          </td>
                          <td>
                            {getCategoryNameById(row.SSRCategoryId) ||
                              row.SSRCategoryShortName ||
                              row.SSRCategoryName}
                          </td>
                          <td>{row.SSRSubCategoryName}</td>
                          <td>{row.SSRSubCategoryShortName}</td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {row.DOrder ?? ""}
                          </td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {row.DOrder1 ?? ""}
                          </td>
                          <td>
                            <Badge
                              tone={row.MarkForDeletion ? "red" : "green"}
                            >
                              {row.MarkForDeletion ? "Yes" : "No"}
                            </Badge>
                          </td>
                          <td>
                            <GhostIconButton
                              tone={theme.colors.accent}
                              onClick={() => startSubCategoryEdit(row)}
                            >
                              ✎ Edit
                            </GhostIconButton>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={9}>
                        No subcategory rows yet — add one above.
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Units ── */}
          {activeMaster === "units" && (
            <Card
              eyebrow="Master · Unit"
              title={
                editingUnitId ? `Edit unit #${editingUnitId}` : "Unit Master"
              }
              subtitle="Measurement units used by SSR items (MasterUnit)."
            >
              <FormShell onSubmit={onUnitSubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <Field label="Unit Name" required>
                    <input
                      name="UnitName"
                      value={unitForm.UnitName}
                      onChange={onUnitChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Unit Short Name" required>
                    <input
                      name="UnitShortName"
                      value={unitForm.UnitShortName}
                      onChange={onUnitChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder">
                    <input
                      name="DOrder"
                      value={unitForm.DOrder}
                      onChange={onUnitChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DOrder1">
                    <input
                      name="DOrder1"
                      value={unitForm.DOrder1}
                      onChange={onUnitChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Remarks" span>
                    <input
                      name="Remarks"
                      value={unitForm.Remarks}
                      onChange={onUnitChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Mark for deletion">
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 500,
                        minHeight: 42,
                      }}
                    >
                      <input
                        type="checkbox"
                        name="MarkForDeletion"
                        checked={unitForm.MarkForDeletion}
                        onChange={onUnitChange}
                      />
                      Yes
                    </label>
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton disabled={savingUnit}>
                    {savingUnit
                      ? "Saving…"
                      : editingUnitId
                        ? "Update unit"
                        : "Save unit"}
                  </PrimaryButton>
                  {editingUnitId && (
                    <SecondaryButton onClick={resetUnitEdit}>
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
                      <th>Deleted</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingUnits ? (
                      <EmptyRow colSpan={8}>Loading…</EmptyRow>
                    ) : unitList.length ? (
                      unitList.map((row) => (
                        <tr key={row.UnitId}>
                          <td
                            style={{
                              fontFamily: theme.font.mono,
                              color: theme.colors.inkSoft,
                            }}
                          >
                            {row.UnitId}
                          </td>
                          <td>{row.UnitName}</td>
                          <td>{row.UnitShortName}</td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {row.DOrder ?? ""}
                          </td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {row.DOrder1 ?? ""}
                          </td>
                          <td>{row.Remarks ?? ""}</td>
                          <td>
                            <Badge
                              tone={row.MarkForDeletion ? "red" : "green"}
                            >
                              {row.MarkForDeletion ? "Yes" : "No"}
                            </Badge>
                          </td>
                          <td>
                            <GhostIconButton
                              tone={theme.colors.accent}
                              onClick={() => startUnitEdit(row)}
                            >
                              ✎ Edit
                            </GhostIconButton>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={8}>
                        No unit rows yet — add one above.
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Item Master ── */}
          {activeMaster === "item-master" && canManageItemMaster && (
            <Card
              eyebrow="Master · Item"
              title={
                editingItemMasterId
                  ? `Edit item #${editingItemMasterId}`
                  : "Item Master"
              }
              subtitle="Add / edit MasterItem rows. FK fields use short names from lookup tables."
            >
              {itemMasterRoleBanner && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${theme.colors.line}`,
                    background: "#fff8e8",
                    color: "#8a5a00",
                    fontSize: 13.5,
                    fontWeight: 600,
                  }}
                >
                  {itemMasterRoleBanner}
                </div>
              )}

              <FormShell onSubmit={onItemMasterSubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                    gap: 14,
                  }}
                >
                  <Field label="Item Id">
                    <input
                      value={itemMasterForm.ItemId || "(New)"}
                      disabled
                      readOnly
                      style={{
                        ...inputStyle,
                        background: "#EEF1F4",
                        color: theme.colors.inkSoft,
                        cursor: "not-allowed",
                      }}
                    />
                  </Field>
                  <Field label="User Id">
                    <input
                      value={itemMasterForm.UserId || ""}
                      disabled
                      readOnly
                      style={{
                        ...inputStyle,
                        background: "#EEF1F4",
                        color: theme.colors.inkSoft,
                        cursor: "not-allowed",
                      }}
                    />
                  </Field>
                  <Field label="Region" required>
                    <select
                      name="RegionId"
                      value={itemMasterForm.RegionId}
                      onChange={onItemMasterChange}
                      required
                      disabled={!isSuperAdmin}
                      style={{
                        ...inputStyle,
                        ...(!isSuperAdmin
                          ? {
                              background: "#EEF1F4",
                              color: theme.colors.inkSoft,
                              cursor: "not-allowed",
                            }
                          : null),
                      }}
                    >
                      <option value="">Select Region</option>
                      {itemMasterRegionOptions.map((r) => (
                        <option key={r.SSRRegionId} value={r.SSRRegionId}>
                          {r.SSRRegionShortName || r.SSRRegionName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="SSR Year">
                    <select
                      name="SSRYearId"
                      value={itemMasterForm.SSRYearId}
                      onChange={onItemMasterChange}
                      style={inputStyle}
                    >
                      <option value="">Select Year</option>
                      {itemMasterYears.map((y) => (
                        <option key={y.YearId} value={y.YearId}>
                          {y.Year}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Item Number" required>
                    <input
                      name="ItemNumber"
                      value={itemMasterForm.ItemNumber}
                      onChange={onItemMasterChange}
                      required
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Page Number">
                    <input
                      name="PageNumber"
                      value={itemMasterForm.PageNumber}
                      onChange={onItemMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 3fr",
                    gap: 14,
                    marginTop: 14,
                  }}
                >
                  <Field label="Category">
                    <select
                      name="CategoryId"
                      value={itemMasterForm.CategoryId}
                      onChange={onItemMasterChange}
                      disabled={!itemMasterForm.RegionId}
                      style={inputStyle}
                    >
                      <option value="">Select Category</option>
                      {itemMasterCategories.map((c) => (
                        <option
                          key={c.SSRCategoryId}
                          value={c.SSRCategoryId}
                        >
                          {c.SSRCategoryShortName || c.SSRCategoryName}
                          {c.SSRCategoryShortName && c.SSRCategoryName
                            ? ` — ${c.SSRCategoryName}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Sub Category">
                    <select
                      name="SubCategoryId"
                      value={itemMasterForm.SubCategoryId}
                      onChange={onItemMasterChange}
                      disabled={!itemMasterForm.CategoryId}
                      style={inputStyle}
                    >
                      <option value="">Select Sub Category</option>
                      {itemMasterSubCategories.map((sc) => (
                        <option
                          key={sc.SSRSubCategoryId}
                          value={sc.SSRSubCategoryId}
                        >
                          {sc.SSRSubCategoryShortName ||
                            sc.SSRSubCategoryName}
                          {sc.SSRSubCategoryShortName &&
                          sc.SSRSubCategoryName
                            ? ` — ${sc.SSRSubCategoryName}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 14,
                    marginTop: 14,
                  }}
                >
                  <Field label="Item Description" required span>
                    <textarea
                      name="ItemDescription"
                      value={itemMasterForm.ItemDescription}
                      onChange={onItemMasterChange}
                      required
                      rows={4}
                      style={{
                        ...inputStyle,
                        width: "100%",
                        minHeight: 96,
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </Field>
                  <Field label="Item Short Description" span>
                    <input
                      name="ItemShortDescription"
                      value={itemMasterForm.ItemShortDescription}
                      onChange={onItemMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Unit">
                    <select
                      name="UnitId"
                      value={itemMasterForm.UnitId}
                      onChange={onItemMasterChange}
                      style={inputStyle}
                    >
                      <option value="">Select Unit</option>
                      {[...unitList]
                        .sort((a, b) =>
                          String(
                            a.UnitShortName || a.UnitName || "",
                          ).localeCompare(
                            String(b.UnitShortName || b.UnitName || ""),
                          ),
                        )
                        .map((u) => (
                          <option key={u.UnitId} value={u.UnitId}>
                            {u.UnitShortName || u.UnitName}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Completed Rate">
                    <input
                      name="CompletedRate"
                      type="number"
                      step="any"
                      value={itemMasterForm.CompletedRate}
                      onChange={onItemMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Labour Rate">
                    <input
                      name="LabourRate"
                      type="number"
                      step="any"
                      value={itemMasterForm.LabourRate}
                      onChange={onItemMasterChange}
                      style={inputStyle}
                    />
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton disabled={savingItemMaster}>
                    {savingItemMaster
                      ? "Saving…"
                      : editingItemMasterId
                        ? "Update item"
                        : "Save item"}
                  </PrimaryButton>
                  {editingItemMasterId && (
                    <SecondaryButton onClick={resetItemMasterEdit}>
                      Cancel edit
                    </SecondaryButton>
                  )}
                </div>
              </FormShell>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: 12,
                  alignItems: "end",
                  marginBottom: 12,
                }}
              >
                <Field label="SSR Region">
                  <select
                    value={itemMasterFilterRegionId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setItemMasterFilterRegionId(value);
                      setItemMasterFilterYearId("");
                      setItemMasterFilterCategoryId("");
                      setItemMasterFilterSubCategoryId("");
                      setItemMasterListYears([]);
                      setItemMasterListSubCategories([]);
                      setItemMasterList([]);
                      loadItemMasterListYears(value);
                      loadItemMasterListCategories(value);
                    }}
                    disabled={!isSuperAdmin}
                    style={{
                      ...inputStyle,
                      ...(!isSuperAdmin
                        ? {
                            background: "#EEF1F4",
                            color: theme.colors.inkSoft,
                            cursor: "not-allowed",
                          }
                        : null),
                    }}
                  >
                    {isSuperAdmin && (
                      <option value="">Select SSR Region</option>
                    )}
                    {(isSuperAdmin ? regions : itemMasterRegionOptions).map(
                      (r) => (
                        <option key={r.SSRRegionId} value={r.SSRRegionId}>
                          {r.SSRRegionShortName || r.SSRRegionName}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="SSR Year">
                  <select
                    value={itemMasterFilterYearId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setItemMasterFilterYearId(value);
                      if (itemMasterFilterRegionId && value) {
                        loadItemMasterList(currentUser, {
                          regionId: itemMasterFilterRegionId,
                          ssrYearId: value,
                          categoryId: itemMasterFilterCategoryId,
                          subCategoryId: itemMasterFilterSubCategoryId,
                        });
                      } else {
                        setItemMasterList([]);
                      }
                    }}
                    disabled={!itemMasterFilterRegionId}
                    style={inputStyle}
                  >
                    <option value="">
                      {itemMasterFilterRegionId
                        ? "Select SSR Year"
                        : "Select SSR Region first"}
                    </option>
                    {itemMasterListYears.map((y) => (
                      <option key={y.YearId} value={y.YearId}>
                        {y.Year}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="SSR Category">
                  <select
                    value={itemMasterFilterCategoryId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setItemMasterFilterCategoryId(value);
                      setItemMasterFilterSubCategoryId("");
                      setItemMasterListSubCategories([]);
                      loadItemMasterListSubCategories(value);
                    }}
                    disabled={!itemMasterFilterRegionId}
                    style={inputStyle}
                  >
                    <option value="">All SSR Categories</option>
                    {itemMasterListCategories.map((c) => (
                      <option key={c.SSRCategoryId} value={c.SSRCategoryId}>
                        {c.SSRCategoryShortName || c.SSRCategoryName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="SSR Sub Category">
                  <select
                    value={itemMasterFilterSubCategoryId}
                    onChange={(e) => {
                      setItemMasterFilterSubCategoryId(e.target.value);
                    }}
                    disabled={!itemMasterFilterCategoryId}
                    style={inputStyle}
                  >
                    <option value="">
                      {itemMasterFilterCategoryId
                        ? "All SSR Sub Categories"
                        : "Select SSR Category first"}
                    </option>
                    {itemMasterListSubCategories.map((sc) => (
                      <option
                        key={sc.SSRSubCategoryId}
                        value={sc.SSRSubCategoryId}
                      >
                        {sc.SSRSubCategoryShortName || sc.SSRSubCategoryName}
                      </option>
                    ))}
                  </select>
                </Field>
                <SecondaryButton
                  type="button"
                  disabled={
                    !itemMasterFilterRegionId || !itemMasterFilterYearId
                  }
                  onClick={() =>
                    loadItemMasterList(currentUser, {
                      regionId: itemMasterFilterRegionId,
                      ssrYearId: itemMasterFilterYearId,
                      categoryId: itemMasterFilterCategoryId,
                      subCategoryId: itemMasterFilterSubCategoryId,
                    })
                  }
                >
                  Refresh list
                </SecondaryButton>
              </div>

              <div
                style={{
                  fontSize: 12.5,
                  color: theme.colors.inkSoft,
                  marginBottom: 8,
                }}
              >
                Select SSR Region and SSR Year, then click Refresh list.
                Category and Sub Category are optional filters.
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
                      <th>ID</th>
                      <th>Region</th>
                      <th>Category</th>
                      <th>Sub Category</th>
                      <th>Number</th>
                      <th style={{ minWidth: 360, width: "40%" }}>
                        Description
                      </th>
                      <th>Unit</th>
                      <th>Rate</th>
                      <th>User</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingItemMaster ? (
                      <EmptyRow colSpan={10}>Loading…</EmptyRow>
                    ) : !itemMasterFilterRegionId ||
                      !itemMasterFilterYearId ? (
                      <EmptyRow colSpan={10}>
                        Select SSR Region and SSR Year above, then click Refresh
                        list.
                      </EmptyRow>
                    ) : itemMasterList.length ? (
                      itemMasterList.map((row) => {
                        const canEditRow =
                          isSuperAdmin ||
                          (itemMasterAllowedRegionId &&
                            Number(row.RegionId) ===
                              Number(itemMasterAllowedRegionId));
                        return (
                          <tr key={row.ItemId}>
                            <td
                              style={{
                                fontFamily: theme.font.mono,
                                color: theme.colors.inkSoft,
                              }}
                            >
                              {row.ItemId}
                            </td>
                            <td>
                              {row.SSRRegionShortName ||
                                row.SSRRegionName ||
                                row.RegionId ||
                                "—"}
                            </td>
                            <td>
                              {row.SSRCategoryShortName ||
                                row.SSRCategoryName ||
                                "—"}
                            </td>
                            <td>
                              {row.SSRSubCategoryShortName ||
                                row.SSRSubCategoryName ||
                                "—"}
                            </td>
                            <td style={{ fontFamily: theme.font.mono }}>
                              {row.ItemNumber}
                            </td>
                            <td style={{ minWidth: 360, width: "40%" }}>
                              {row.ItemDescription}
                            </td>
                            <td style={{ fontFamily: theme.font.mono }}>
                              {row.UnitShortName ?? ""}
                            </td>
                            <td
                              style={{
                                fontFamily: theme.font.mono,
                                textAlign: "right",
                              }}
                            >
                              {formatRupees(row.CompletedRate)}
                            </td>
                            <td style={{ fontFamily: theme.font.mono }}>
                              {row.UserId ?? "—"}
                            </td>
                            <td>
                              {canEditRow ? (
                                <GhostIconButton
                                  tone={theme.colors.accent}
                                  onClick={() => startItemMasterEdit(row)}
                                >
                                  ✎ Edit
                                </GhostIconButton>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <EmptyRow colSpan={10}>
                        No items found — add one above.
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Print SSR ── */}
          {activeMaster === "print-ssr" && isSuperAdmin && (
            <Card
              eyebrow="Reports · SSR"
              title="Print SSR"
              subtitle="Select SSR filters and print the SSR item catalogue. Category and Sub Category are optional."
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <Field label="SSR Region" required>
                  <select
                    value={printSsrRegionId}
                    onChange={(e) => {
                      const regionId = e.target.value;
                      setPrintSsrRegionId(regionId);
                      setPrintSsrYearId("");
                      setPrintSsrCategoryId("");
                      setPrintSsrSubCategoryId("");
                      setPrintSsrSubCategories([]);
                      loadPrintSsrYears(regionId);
                      loadPrintSsrCategories(regionId);
                    }}
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

                <Field label="SSR Year" required>
                  <select
                    value={printSsrYearId}
                    onChange={(e) => setPrintSsrYearId(e.target.value)}
                    disabled={!printSsrRegionId}
                    style={inputStyle}
                  >
                    <option value="">
                      {printSsrRegionId
                        ? "Select SSR Year"
                        : "Select SSR Region first"}
                    </option>
                    {printSsrYears.map((y) => (
                      <option key={y.YearId} value={y.YearId}>
                        {y.Year}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="SSR Category">
                  <select
                    value={printSsrCategoryId}
                    onChange={(e) => {
                      const categoryId = e.target.value;
                      setPrintSsrCategoryId(categoryId);
                      setPrintSsrSubCategoryId("");
                      loadPrintSsrSubCategories(categoryId);
                    }}
                    disabled={!printSsrRegionId}
                    style={inputStyle}
                  >
                    <option value="">All Categories</option>
                    {printSsrCategories.map((c) => (
                      <option key={c.SSRCategoryId} value={c.SSRCategoryId}>
                        {c.SSRCategoryShortName || c.SSRCategoryName}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="SSR Sub Category">
                  <select
                    value={printSsrSubCategoryId}
                    onChange={(e) => setPrintSsrSubCategoryId(e.target.value)}
                    disabled={!printSsrCategoryId}
                    style={inputStyle}
                  >
                    <option value="">All Sub Categories</option>
                    {printSsrSubCategories.map((s) => (
                      <option
                        key={s.SSRSubCategoryId}
                        value={s.SSRSubCategoryId}
                      >
                        {s.SSRSubCategoryShortName || s.SSRSubCategoryName}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div style={{ marginTop: 18 }}>
                <PrimaryButton
                  type="button"
                  onClick={handlePrintSsr}
                  disabled={
                    printingSsr || !printSsrRegionId || !printSsrYearId
                  }
                >
                  {printingSsr ? "Printing…" : "Print SSR"}
                </PrimaryButton>
              </div>
            </Card>
          )}

          {/* ── Material ── */}
          {activeMaster === "materials" && canManageMaterials && (
            <>
              <Card
                eyebrow="Master · Material Components"
                title="Material Components"
                subtitle="Select SSR region, year, category and an item to view, add, or edit MasterMaterialComponent rows."
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
                    gap: 14,
                    alignItems: "end",
                  }}
                >
                  <Field label="SSR Region" required>
                    <select
                      value={materialRegionId}
                      onChange={(e) => {
                        const regionId = e.target.value;
                        setMaterialRegionId(regionId);
                        setMaterialSsrYearId("");
                        setMaterialCategoryId("");
                        setMaterialSubCategoryId("");
                        setMaterialSubCategories([]);
                        setMaterialItemList([]);
                        resetMaterialSelection();
                        loadMaterialSsrYears(regionId);
                        loadMaterialCategories(regionId);
                        loadMaterialMasterList(regionId);
                      }}
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

                  <Field label="SSR Year" required>
                    <select
                      value={materialSsrYearId}
                      onChange={(e) => {
                        setMaterialSsrYearId(e.target.value);
                        setMaterialItemList([]);
                        resetMaterialSelection();
                      }}
                      disabled={!materialRegionId}
                      style={inputStyle}
                    >
                      <option value="">
                        {materialRegionId
                          ? "Select SSR Year"
                          : "Select SSR Region first"}
                      </option>
                      {materialSsrYears.map((y) => (
                        <option key={y.YearId} value={y.YearId}>
                          {y.Year}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="SSR Category" required>
                    <select
                      value={materialCategoryId}
                      onChange={(e) => {
                        const categoryId = e.target.value;
                        setMaterialCategoryId(categoryId);
                        setMaterialSubCategoryId("");
                        setMaterialItemList([]);
                        resetMaterialSelection();
                        loadMaterialSubCategories(categoryId);
                      }}
                      disabled={!materialRegionId}
                      style={inputStyle}
                    >
                      <option value="">Select SSR Category</option>
                      {materialCategories.map((c) => (
                        <option
                          key={c.SSRCategoryId}
                          value={c.SSRCategoryId}
                        >
                          {c.SSRCategoryShortName || c.SSRCategoryName}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="SSR Sub Category" required>
                    <select
                      value={materialSubCategoryId}
                      onChange={(e) => {
                        setMaterialSubCategoryId(e.target.value);
                        setMaterialItemList([]);
                        resetMaterialSelection();
                      }}
                      disabled={!materialCategoryId}
                      style={inputStyle}
                    >
                      <option value="">Select SSR Sub Category</option>
                      {materialSubCategories.map((s) => (
                        <option
                          key={s.SSRSubCategoryId}
                          value={s.SSRSubCategoryId}
                        >
                          {s.SSRSubCategoryShortName || s.SSRSubCategoryName}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <PrimaryButton
                    type="button"
                    onClick={loadMaterialItems}
                    disabled={loadingMaterialItems}
                  >
                    {loadingMaterialItems ? "Loading…" : "View Items"}
                  </PrimaryButton>
                </div>
              </Card>

              <Card
                eyebrow="Items"
                title="SSR Items"
                subtitle="Click a row to load material components for that item."
              >
                <div
                  style={{
                    overflowX: "auto",
                    border: `1px solid ${theme.colors.line}`,
                    borderRadius: 10,
                    maxHeight: 320,
                    overflowY: "auto",
                  }}
                >
                  <table className="wrms-table">
                    <thead>
                      <tr>
                        <th>Item Number</th>
                        <th>Description</th>
                        <th>Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingMaterialItems ? (
                        <EmptyRow colSpan={3}>Loading…</EmptyRow>
                      ) : materialItemList.length ? (
                        materialItemList.map((row) => {
                          const selected =
                            Number(selectedMaterialItemId) ===
                            Number(row.ItemId);
                          const desc = String(row.ItemDescription || "").trim();
                          const singleLineDesc = desc
                            .replace(/\s+/g, " ")
                            .trim();
                          return (
                            <tr
                              key={row.ItemId}
                              onClick={() => selectMaterialItem(row)}
                              style={{
                                cursor: "pointer",
                                background: selected
                                  ? "rgba(15, 42, 68, 0.08)"
                                  : undefined,
                              }}
                            >
                              <td
                                style={{
                                  fontFamily: theme.font.mono,
                                  whiteSpace: "nowrap",
                                  verticalAlign: "top",
                                }}
                              >
                                {row.ItemNumber}
                              </td>
                              <td
                                title={singleLineDesc}
                                style={
                                  selected
                                    ? {
                                        maxWidth: 520,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                        verticalAlign: "top",
                                        fontWeight: 600,
                                      }
                                    : {
                                        maxWidth: 520,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        verticalAlign: "top",
                                      }
                                }
                              >
                                {selected ? desc : singleLineDesc}
                              </td>
                              <td style={{ verticalAlign: "top" }}>
                                {row.UnitShortName || ""}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <EmptyRow colSpan={3}>
                          Select filters above and click View Items.
                        </EmptyRow>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card
                eyebrow="MasterMaterialComponent"
                title={
                  editingMaterialComponentId
                    ? `Edit component #${editingMaterialComponentId}`
                    : selectedMaterialItemId
                      ? `Material components for item #${selectedMaterialItemId}`
                      : "Material components"
                }
                subtitle="Add or edit material component rows for the selected item."
              >
                {!selectedMaterialItemId ? (
                  <div style={{ color: theme.colors.inkSoft, fontSize: 14 }}>
                    Select an item from the list to manage its material
                    components.
                  </div>
                ) : (
                  <>
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
                            <th>Sr.No.</th>
                            <th>Material</th>
                            <th>Material Component</th>
                            <th>Unit</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingMaterialComponents ? (
                            <EmptyRow colSpan={5}>Loading…</EmptyRow>
                          ) : materialComponentList.length ? (
                            materialComponentList.map((row, index) => (
                              <tr key={row.MaterialComponentId}>
                                <td
                                  style={{ fontFamily: theme.font.mono }}
                                >
                                  {index + 1}
                                </td>
                                <td>
                                  {row.MaterialShortName ||
                                    row.MaterialDescription ||
                                    row.MaterialId}
                                </td>
                                <td style={{ fontFamily: theme.font.mono }}>
                                  {row.MaterialComponent}
                                </td>
                                <td>
                                  {row.MaterialUnitShortName ||
                                    row.MaterialUnitId}
                                </td>
                                <td>
                                  <GhostIconButton
                                    tone={theme.colors.accent}
                                    onClick={() =>
                                      startMaterialComponentEdit(row)
                                    }
                                  >
                                    ✎ Edit
                                  </GhostIconButton>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <EmptyRow colSpan={5}>
                              No material components for this item — add one
                              below.
                            </EmptyRow>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: 18 }}>
                      <FormShell onSubmit={onMaterialComponentSubmit}>
                        {editingMaterialComponentId ? (
                          <>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr 1fr",
                                gap: 14,
                              }}
                            >
                              <Field label="Material" required>
                                <select
                                  name="MaterialId"
                                  value={materialComponentForm.MaterialId}
                                  onChange={onMaterialComponentChange}
                                  required
                                  style={inputStyle}
                                >
                                  <option value="">Select Material</option>
                                  {materialMasterList.map((m) => (
                                    <option
                                      key={m.MaterialId}
                                      value={m.MaterialId}
                                    >
                                      {m.MaterialShortName ||
                                        m.MaterialDescription}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="Material Component" required>
                                <input
                                  name="MaterialComponent"
                                  type="number"
                                  step="any"
                                  value={
                                    materialComponentForm.MaterialComponent
                                  }
                                  onChange={onMaterialComponentChange}
                                  required
                                  style={inputStyle}
                                />
                              </Field>
                              <Field label="Material Unit">
                                <input
                                  value={
                                    materialMasterList.find(
                                      (m) =>
                                        Number(m.MaterialId) ===
                                        Number(
                                          materialComponentForm.MaterialId,
                                        ),
                                    )?.MaterialLocalUnitShortName || ""
                                  }
                                  disabled
                                  readOnly
                                  style={{
                                    ...inputStyle,
                                    background: "#EEF1F4",
                                    color: theme.colors.inkSoft,
                                    cursor: "not-allowed",
                                  }}
                                />
                              </Field>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 10,
                                marginTop: 18,
                              }}
                            >
                              <PrimaryButton
                                disabled={savingMaterialComponent}
                              >
                                {savingMaterialComponent
                                  ? "Saving…"
                                  : "Update component"}
                              </PrimaryButton>
                              <SecondaryButton
                                type="button"
                                onClick={resetMaterialComponentEdit}
                              >
                                Cancel edit
                              </SecondaryButton>
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                marginBottom: 10,
                                color: theme.colors.ink,
                              }}
                            >
                              Add components (one or more)
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gap: 12,
                              }}
                            >
                              {materialDraftRows.map((row, index) => {
                                const unitName =
                                  materialMasterList.find(
                                    (m) =>
                                      Number(m.MaterialId) ===
                                      Number(row.MaterialId),
                                  )?.MaterialLocalUnitShortName || "";
                                return (
                                  <div
                                    key={row.key}
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns:
                                        "1fr 1fr 1fr auto",
                                      gap: 12,
                                      alignItems: "end",
                                      padding: 12,
                                      border: `1px solid ${theme.colors.line}`,
                                      borderRadius: 8,
                                      background: "#fff",
                                    }}
                                  >
                                    <Field
                                      label={`Material ${index + 1}`}
                                      required
                                    >
                                      <select
                                        value={row.MaterialId}
                                        onChange={(e) =>
                                          onMaterialDraftChange(
                                            row.key,
                                            "MaterialId",
                                            e.target.value,
                                          )
                                        }
                                        style={inputStyle}
                                      >
                                        <option value="">
                                          Select Material
                                        </option>
                                        {materialMasterList.map((m) => (
                                          <option
                                            key={m.MaterialId}
                                            value={m.MaterialId}
                                          >
                                            {m.MaterialShortName ||
                                              m.MaterialDescription}
                                          </option>
                                        ))}
                                      </select>
                                    </Field>
                                    <Field
                                      label="Material Component"
                                      required
                                    >
                                      <input
                                        type="number"
                                        step="any"
                                        value={row.MaterialComponent}
                                        onChange={(e) =>
                                          onMaterialDraftChange(
                                            row.key,
                                            "MaterialComponent",
                                            e.target.value,
                                          )
                                        }
                                        style={inputStyle}
                                      />
                                    </Field>
                                    <Field label="Material Unit">
                                      <input
                                        value={unitName}
                                        disabled
                                        readOnly
                                        placeholder="From selected material"
                                        style={{
                                          ...inputStyle,
                                          background: "#EEF1F4",
                                          color: theme.colors.inkSoft,
                                          cursor: "not-allowed",
                                        }}
                                      />
                                    </Field>
                                    <SecondaryButton
                                      type="button"
                                      onClick={() =>
                                        removeMaterialDraftRow(row.key)
                                      }
                                      style={{ marginBottom: 2 }}
                                    >
                                      Remove
                                    </SecondaryButton>
                                  </div>
                                );
                              })}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 10,
                                marginTop: 18,
                                flexWrap: "wrap",
                              }}
                            >
                              <SecondaryButton
                                type="button"
                                onClick={addMaterialDraftRow}
                              >
                                + Add another material
                              </SecondaryButton>
                              <PrimaryButton
                                disabled={savingMaterialComponent}
                              >
                                {savingMaterialComponent
                                  ? "Saving…"
                                  : materialDraftRows.filter(
                                        (r) =>
                                          r.MaterialId &&
                                          r.MaterialComponent !== "",
                                      ).length > 1
                                    ? "Save all components"
                                    : "Save component"}
                              </PrimaryButton>
                            </div>
                          </>
                        )}
                      </FormShell>
                    </div>
                  </>
                )}
              </Card>
            </>
          )}

          {/* ── Items ── */}
          {activeMaster === "items" && (
            <>
              <Card
                eyebrow="Master · SSR Item"
                title="Find SSR Items"
                subtitle="Filter by work, region, year and category (sub-category optional), then view matching items."
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
                        name="Works"
                        value={selectedProjectId || ""}
                        onChange={(e) => {
                          const workId = e.target.value;
                          setSelectedProjectId(workId);
                          setSelectedSubWorkId(0);
                          setSubWorks([]);
                          setCheckedItemsList([]);
                          setCheckedItemIds([]);
                          setItemRegion("");
                          setItemSsrYearId("");
                          setItemCategoryId("");
                          setSubCategoryItemId("");
                          setSsrYears([]);
                          setItemCategories([]);
                          setSubCategories([]);
                          setItemList([]);
                          clearEstimationOutputs();
                          loadSubWorks(workId);
                        }}
                        style={inputStyle}
                      >
                        <option value="">Select Work</option>
                        {worksList.map((work) => (
                          <option
                            key={work.MasterWorkId}
                            value={work.MasterWorkId}
                          >
                            {work.WorkName}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Select Sub Work" required>
                      <select
                        name="SubWork"
                        value={selectedSubWorkId || ""}
                        onChange={(e) => {
                          setSelectedSubWorkId(e.target.value);
                          setCheckedItemsList([]);
                          setCheckedItemIds([]);
                          setItemRegion("");
                          setItemSsrYearId("");
                          setItemCategoryId("");
                          setSubCategoryItemId("");
                          setSsrYears([]);
                          setItemCategories([]);
                          setSubCategories([]);
                          setItemList([]);
                          clearEstimationOutputs();
                        }}
                        disabled={!selectedProjectId}
                        style={inputStyle}
                      >
                        <option value="">Select Sub Work</option>
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

                    {!(selectedProjectId && selectedSubWorkId) && (
                      <div
                        style={{
                          gridColumn: "1 / -1",
                          color: theme.colors.red || "#B42318",
                          fontSize: 13.5,
                          fontWeight: 600,
                          padding: "2px 0 4px",
                        }}
                      >
                        Please Select Work and Sub Work
                      </div>
                    )}

                    <Field label="SSR Region" required>
                      <select
                        name="SSRRegionId"
                        value={itemRegion}
                        onChange={(e) => {
                          const regionId = e.target.value;
                          setItemRegion(regionId);
                          setItemSsrYearId("");
                          setItemCategoryId("");
                          setSubCategoryItemId("");
                          setSubCategories([]);
                          setItemList([]);
                          loadSsrYears(regionId);
                          loadRegionBasedCategories(regionId);
                        }}
                        required
                        disabled={!(selectedProjectId && selectedSubWorkId)}
                        style={{
                          ...inputStyle,
                          ...(!(selectedProjectId && selectedSubWorkId)
                            ? {
                                background: "#EEF1F4",
                                color: theme.colors.inkSoft,
                                cursor: "not-allowed",
                              }
                            : {}),
                        }}
                      >
                        <option value="">
                          {selectedProjectId && selectedSubWorkId
                            ? "Select SSR Region"
                            : "Please Select Work and Sub Work"}
                        </option>
                        {estimationRegions.map((r) => (
                          <option key={r.SSRRegionId} value={r.SSRRegionId}>
                            {r.SSRRegionShortName || r.SSRRegionName}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="SSR Year" required>
                      <select
                        name="SSRYearId"
                        value={itemSsrYearId}
                        onChange={(e) => {
                          setItemSsrYearId(e.target.value);
                          setItemList([]);
                        }}
                        required
                        disabled={!itemRegion}
                        style={inputStyle}
                      >
                        <option value="">
                          {itemRegion
                            ? "Select SSR Year"
                            : "Select SSR Region first"}
                        </option>
                        {ssrYears.map((y) => (
                          <option key={y.YearId} value={y.YearId}>
                            {y.Year}
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
                          setSubCategoryItemId("");
                          setItemList([]);
                          loadCategoryBasedSubCategories(categoryId);
                        }}
                        required
                        disabled={!itemRegion}
                        style={inputStyle}
                      >
                        <option value="">Select SSR Category</option>
                        {itemCategories.map((c) => (
                          <option
                            key={c.SSRCategoryId}
                            value={c.SSRCategoryId}
                          >
                            {c.SSRCategoryShortName || c.SSRCategoryName}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="SSR Sub Category">
                      <select
                        name="SSRSubCategoryId"
                        value={subCategoryItemId}
                        onChange={(e) => setSubCategoryItemId(e.target.value)}
                        disabled={!itemCategoryId}
                        style={inputStyle}
                      >
                        <option value="">All Sub Categories</option>
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

                  <div
                    style={{
                      marginTop: 18,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <PrimaryButton>View</PrimaryButton>
                    <Button
                      type="button"
                      color="primary"
                      variant="solid"
                      onClick={handleViewCheckedItems}
                      sx={{
                        fontSize: 13,
                        textTransform: "none",
                      }}
                    >
                      View Checked Items
                    </Button>
                    <Dropdown>
                      <MenuButton
                        type="button"
                        color="primary"
                        variant="solid"
                        sx={{
                          fontSize: 13,
                          textTransform: "none",
                        }}
                      >
                        Reports
                      </MenuButton>
                      <Menu
                        placement="bottom-start"
                        sx={{
                          minWidth: 240,
                          zIndex: 1300,
                        }}
                      >
                        <MenuItem
                          onClick={() => {
                            clearEstimationOutputs();
                            setGenerateReportModalOpen(true);
                          }}
                        >
                          Generate Abstract Report
                        </MenuItem>
                        <MenuItem onClick={() => handleGenerateRecapReport()}>
                          Generate Recap Report
                        </MenuItem>
                        <MenuItem
                          onClick={() => handleGenerateMeasurementReport()}
                        >
                          Generate Measurement Report
                        </MenuItem>
                        <MenuItem
                          onClick={() => handleGenerateRateAnalysisReport()}
                          title={
                            !selectedProjectId
                              ? "Please Select Work"
                              : "Rate Analysis Report"
                          }
                        >
                          Rate Analysis Report
                        </MenuItem>
                        <MenuItem
                          onClick={() => handleGenerateLeadStatementReport()}
                          title={
                            !selectedProjectId
                              ? "Please Select Work"
                              : "Lead Statement"
                          }
                        >
                          Lead Statement
                        </MenuItem>
                      </Menu>
                    </Dropdown>
                    <Button
                      type="button"
                      color="primary"
                      variant="solid"
                      onClick={() => handleGenerateEstimate()}
                      disabled={!selectedProjectId || loadingEstimate}
                      sx={{
                        fontSize: 13,
                        textTransform: "none",
                      }}
                      title={
                        !selectedProjectId
                          ? "Select Work first"
                          : "Generate Estimate"
                      }
                    >
                      {loadingEstimate ? "Generating…" : "Generate Estimate"}
                    </Button>
                  </div>
                </FormShell>
              </Card>

              {estimatePanelOpen && (
                <>
                  <Card
                    eyebrow="Estimate · Standard Addition"
                    title="Work Standard Additions"
                    subtitle="One row per distinct SSR Region from checked items (and any previously saved WorkStandardAddition). Prior saves are pre-selected; others start blank."
                  >
                    {!estimateRegions.length ? (
                      <div style={{ color: theme.colors.inkSoft, fontSize: 14 }}>
                        No matching MasterStandardAddition rows for regions used
                        by this work.
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: "grid",
                            gap: 14,
                          }}
                        >
                          {estimateRegions.map((region) => (
                            <div
                              key={region.SSRRegionId}
                              style={{
                                display: "grid",
                                gap: 14,
                                padding: 12,
                                border: `1px solid ${theme.colors.line}`,
                                borderRadius: 8,
                                background: theme.colors.paper,
                              }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 2fr",
                                  gap: 14,
                                  alignItems: "end",
                                }}
                              >
                                <Field label="SSR Region">
                                  <input
                                    value={
                                      region.SSRRegionName ||
                                      region.SSRRegionShortName ||
                                      ""
                                    }
                                    disabled
                                    readOnly
                                    style={{
                                      ...inputStyle,
                                      background: "#EEF1F4",
                                      color: theme.colors.inkSoft,
                                      cursor: "not-allowed",
                                    }}
                                  />
                                </Field>
                                <Field label="Description + Percentage">
                                  <select
                                    value={region.selectedAdditionId || ""}
                                    onChange={(e) =>
                                      onEstimateAdditionChange(
                                        region.SSRRegionId,
                                        e.target.value,
                                      )
                                    }
                                    style={inputStyle}
                                  >
                                    <option value="">
                                      Select standard addition (optional)
                                    </option>
                                    {(region.options || []).map((opt) => (
                                      <option
                                        key={opt.MasterStandardAdditionId}
                                        value={opt.MasterStandardAdditionId}
                                      >
                                        {opt.Description}
                                        {opt.Percentage !== null &&
                                        opt.Percentage !== undefined
                                          ? ` — ${opt.Percentage}%`
                                          : ""}
                                        {opt.Year ? ` (${opt.Year})` : ""}
                                      </option>
                                    ))}
                                  </select>
                                </Field>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr 1fr",
                                  gap: 14,
                                  alignItems: "end",
                                }}
                              >
                                <Field label="Apply For Lead">
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 16,
                                      minHeight: 42,
                                    }}
                                  >
                                    <label
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        fontWeight: 500,
                                        cursor: "pointer",
                                      }}
                                    >
                                      <input
                                        type="radio"
                                        name={`applyForLead-${region.SSRRegionId}`}
                                        checked={region.ApplyForLead !== false}
                                        onChange={() =>
                                          onEstimateApplyForLeadChange(
                                            region.SSRRegionId,
                                            true,
                                          )
                                        }
                                      />
                                      Yes
                                    </label>
                                    <label
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        fontWeight: 500,
                                        cursor: "pointer",
                                      }}
                                    >
                                      <input
                                        type="radio"
                                        name={`applyForLead-${region.SSRRegionId}`}
                                        checked={region.ApplyForLead === false}
                                        onChange={() =>
                                          onEstimateApplyForLeadChange(
                                            region.SSRRegionId,
                                            false,
                                          )
                                        }
                                      />
                                      No
                                    </label>
                                  </div>
                                </Field>
                                <Field label="Apply Labour Cess">
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 16,
                                      minHeight: 42,
                                      opacity: region.selectedAdditionId
                                        ? 1
                                        : 0.55,
                                    }}
                                  >
                                    <label
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        fontWeight: 500,
                                        cursor: region.selectedAdditionId
                                          ? "pointer"
                                          : "not-allowed",
                                      }}
                                    >
                                      <input
                                        type="radio"
                                        name={`applyLabourCess-${region.SSRRegionId}`}
                                        checked={
                                          region.ApplyLabourCess === true
                                        }
                                        disabled={!region.selectedAdditionId}
                                        onChange={() =>
                                          onEstimateApplyLabourCessChange(
                                            region.SSRRegionId,
                                            true,
                                          )
                                        }
                                      />
                                      Yes
                                    </label>
                                    <label
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        fontWeight: 500,
                                        cursor: region.selectedAdditionId
                                          ? "pointer"
                                          : "not-allowed",
                                      }}
                                    >
                                      <input
                                        type="radio"
                                        name={`applyLabourCess-${region.SSRRegionId}`}
                                        checked={
                                          region.ApplyLabourCess !== true
                                        }
                                        disabled={!region.selectedAdditionId}
                                        onChange={() =>
                                          onEstimateApplyLabourCessChange(
                                            region.SSRRegionId,
                                            false,
                                          )
                                        }
                                      />
                                      No
                                    </label>
                                  </div>
                                </Field>
                                <Field label="Labour Cess">
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      opacity:
                                        region.selectedAdditionId &&
                                        region.ApplyLabourCess === true
                                          ? 1
                                          : 0.55,
                                    }}
                                  >
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={
                                        region.selectedAdditionId &&
                                        region.ApplyLabourCess === true
                                          ? region.LabourCess ?? ""
                                          : ""
                                      }
                                      onChange={(e) =>
                                        onEstimateLabourCessChange(
                                          region.SSRRegionId,
                                          e.target.value,
                                        )
                                      }
                                      placeholder="e.g. 1.5"
                                      required={
                                        Boolean(region.selectedAdditionId) &&
                                        region.ApplyLabourCess === true
                                      }
                                      disabled={
                                        !region.selectedAdditionId ||
                                        region.ApplyLabourCess !== true
                                      }
                                      style={{
                                        ...inputStyle,
                                        flex: 1,
                                        ...(!region.selectedAdditionId ||
                                        region.ApplyLabourCess !== true
                                          ? {
                                              background: "#EEF1F4",
                                              color: theme.colors.inkSoft,
                                              cursor: "not-allowed",
                                            }
                                          : null),
                                      }}
                                    />
                                    <span
                                      style={{
                                        fontWeight: 700,
                                        color: theme.colors.inkSoft,
                                        minWidth: 18,
                                      }}
                                    >
                                      %
                                    </span>
                                  </div>
                                </Field>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 18 }}>
                          <PrimaryButton
                            type="button"
                            onClick={saveEstimateStandardAdditions}
                            disabled={savingEstimateAdditions}
                            title="Step 1 of 3"
                          >
                            {savingEstimateAdditions
                              ? "Saving…"
                              : "Save Standard Additions"}
                          </PrimaryButton>
                          {estimateAdditionsSaved && (
                            <div
                              style={{
                                marginTop: 8,
                                fontSize: 13,
                                color: theme.colors.green,
                              }}
                            >
                              Standard Additions saved.
                              {estimateLeadGroups.length > 0
                                ? " Lead Details is now enabled."
                                : " Work Material is now enabled."}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </Card>

                  {estimateLeadGroups.length === 0 ? (
                    <Card
                      eyebrow="Estimate · Lead"
                      title={`Lead Details for the Materials required for ${estimateWorkName || "selected work"}`}
                      subtitle="No material components found for items in this work's abstract."
                    >
                      <div style={{ color: theme.colors.inkSoft, fontSize: 14 }}>
                        Add abstract items with material components, then
                        generate estimate again.
                      </div>
                    </Card>
                  ) : (
                    estimateLeadGroups.map((group) => (
                      <Card
                        key={group.SSRRegionId}
                        eyebrow="Estimate · Lead"
                        title={`Lead Details for the Materials required for ${estimateWorkName || "selected work"} for ${group.SSRRegionShortName || group.SSRRegionName || "Region"}`}
                        subtitle="Enter Lead in Km to calculate Lead. Quary Name and Remarks are optional."
                      >
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
                                <th>Sr.No.</th>
                                <th>Quary Name</th>
                                <th>Material</th>
                                <th>Lead in Km.</th>
                                <th>Unit</th>
                                <th>Remarks</th>
                                <th>Lead</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(group.rows || []).map((row, index) => {
                                const calcKey = `${group.SSRRegionId}-${row.MaterialId}`;
                                return (
                                  <tr key={`${group.SSRRegionId}-${row.MaterialId}`}>
                                    <td
                                      style={{ fontFamily: theme.font.mono }}
                                    >
                                      {index + 1}
                                    </td>
                                    <td>
                                      <input
                                        value={row.QuaryName || ""}
                                        onChange={(e) =>
                                          onEstimateLeadFieldChange(
                                            group.SSRRegionId,
                                            row.MaterialId,
                                            "QuaryName",
                                            e.target.value,
                                          )
                                        }
                                        style={{ ...inputStyle, width: "100%" }}
                                        placeholder="Optional"
                                      />
                                    </td>
                                    <td>
                                      {row.MaterialShortDescription ||
                                        row.MaterialId}
                                    </td>
                                    <td>
                                      <input
                                        type="number"
                                        step="any"
                                        value={
                                          row.LeadDistanceKm === null ||
                                          row.LeadDistanceKm === undefined
                                            ? "0"
                                            : row.LeadDistanceKm
                                        }
                                        onChange={(e) =>
                                          onEstimateLeadFieldChange(
                                            group.SSRRegionId,
                                            row.MaterialId,
                                            "LeadDistanceKm",
                                            e.target.value,
                                          )
                                        }
                                        onBlur={(e) =>
                                          recalculateLeadForRow(
                                            group.SSRRegionId,
                                            row.MaterialId,
                                            e.target.value === ""
                                              ? "0"
                                              : e.target.value,
                                          )
                                        }
                                        required
                                        style={{ ...inputStyle, width: "100%" }}
                                        placeholder="0"
                                      />
                                    </td>
                                    <td>
                                      {row.UnitShortName || row.MaterialUnitId}
                                    </td>
                                    <td>
                                      <input
                                        value={row.Remarks || ""}
                                        onChange={(e) =>
                                          onEstimateLeadFieldChange(
                                            group.SSRRegionId,
                                            row.MaterialId,
                                            "Remarks",
                                            e.target.value,
                                          )
                                        }
                                        style={{ ...inputStyle, width: "100%" }}
                                        placeholder="Optional"
                                      />
                                    </td>
                                    <td
                                      style={{
                                        fontFamily: theme.font.mono,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {calculatingLeadKey === calcKey
                                        ? "…"
                                        : row.Lead === null ||
                                            row.Lead === undefined
                                          ? "—"
                                          : Number(row.Lead).toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    ))
                  )}

                  {estimateLeadGroups.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <PrimaryButton
                        type="button"
                        onClick={saveEstimateLeads}
                        disabled={
                          savingEstimateLeads || !estimateAdditionsSaved
                        }
                        title={
                          !estimateAdditionsSaved
                            ? "Save Standard Additions first"
                            : "Step 2 of 3"
                        }
                      >
                        {savingEstimateLeads
                          ? "Saving…"
                          : "Save / Update Lead Details"}
                      </PrimaryButton>
                      {!estimateAdditionsSaved ? (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 13,
                            color: theme.colors.inkSoft,
                          }}
                        >
                          Save Standard Additions first to enable this step.
                        </div>
                      ) : estimateLeadsSaved ? (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 13,
                            color: theme.colors.green,
                          }}
                        >
                          Lead Details saved. Work Material is now enabled.
                        </div>
                      ) : null}
                    </div>
                  )}

                  <Card
                    eyebrow="Estimate · Work Material"
                    title="Populate Work Material & Rates"
                    subtitle="Deletes existing WorkMaterial for this Work, rebuilds from MasterMaterialComponent + WorkLead, and updates WorkAbstract IsRA / RateString / FinalRate."
                  >
                    <PrimaryButton
                      type="button"
                      onClick={populateWorkMaterials}
                      disabled={
                        savingWorkMaterials ||
                        !selectedProjectId ||
                        !estimateAdditionsSaved ||
                        !estimateLeadsSaved
                      }
                      title={
                        !estimateAdditionsSaved
                          ? "Save Standard Additions first"
                          : !estimateLeadsSaved
                            ? "Save Lead Details first"
                            : "Step 3 of 3"
                      }
                    >
                      {savingWorkMaterials
                        ? "Updating…"
                        : "Populate / Update Work Material"}
                    </PrimaryButton>
                    {(!estimateAdditionsSaved || !estimateLeadsSaved) && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 13,
                          color: theme.colors.inkSoft,
                        }}
                      >
                        {!estimateAdditionsSaved
                          ? "Save Standard Additions first to enable this step."
                          : "Save / Update Lead Details first to enable this step."}
                      </div>
                    )}
                  </Card>
                </>
              )}

              <Card style={{ paddingTop: 8 }}>
                <Tabs
                  value={estimationTab}
                  onChange={(_, value) => {
                    const tab = Number(value);
                    setEstimationTab(tab);
                    clearEstimationOutputs();
                    if (tab === 1) {
                      if (!selectedProjectId || !selectedSubWorkId) {
                        alert("Please select Work and Sub Work first.");
                        return;
                      }
                      getCheckedItemsList();
                      getCheckedItems();
                    }
                  }}
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
                                <th>Unit</th>
                                <th>Rate</th>
                              </tr>
                            </thead>
                            <tbody>
                              {itemList.map((item) => {
                                // Selectable when item has a CompletedRate.
                                // Parent wording rows usually have no rate.
                                const canSelect =
                                  item.CompletedRate != null &&
                                  item.CompletedRate !== "" &&
                                  Number.isFinite(Number(item.CompletedRate));
                                return (
                                  <tr
                                    key={item.ItemId}
                                    style={
                                      !canSelect
                                        ? { background: "rgba(0,0,0,0.03)" }
                                        : undefined
                                    }
                                  >
                                    <td>
                                      {canSelect ? (
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
                                      ) : null}
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
                                    <td
                                      style={
                                        !canSelect
                                          ? { fontWeight: 600 }
                                          : undefined
                                      }
                                    >
                                      {item.ItemDescription}
                                    </td>
                                    <td style={{ fontFamily: theme.font.mono }}>
                                      {item.UnitShortName ?? ""}
                                    </td>
                                    <td
                                      style={{
                                        fontFamily: theme.font.mono,
                                        textAlign: "right",
                                      }}
                                    >
                                      {formatRupees(item.CompletedRate)}
                                    </td>
                                  </tr>
                                );
                              })}
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
                    {loadingCheckedItems ? (
                      <p
                        style={{
                          color: theme.colors.inkSoft,
                          fontSize: 13.5,
                          marginTop: 18,
                          fontStyle: "italic",
                        }}
                      >
                        Loading checked items…
                      </p>
                    ) : !selectedProjectId || !selectedSubWorkId ? (
                      <p
                        style={{
                          color: theme.colors.inkSoft,
                          fontSize: 13.5,
                          marginTop: 18,
                          fontStyle: "italic",
                        }}
                      >
                        Select Work and Sub Work above to see previously checked
                        items.
                      </p>
                    ) : checkedItemsList.length > 0 ? (
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
                            fontSize: 12,
                            color: theme.colors.inkSoft,
                            marginBottom: 10,
                          }}
                        >
                          Drag ⠿ to change Sub Work sequence (starts at 1 for
                          this Sub Work).
                          {reorderingCheckedList ? " Updating sequence…" : ""}
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
                                <th style={{ width: 40 }}>Seq</th>
                                <th style={{ width: 28 }} />
                                <th style={{ width: 50 }}>ID</th>
                                <th style={{ width: 80 }}>Number</th>
                                <th>Item Name</th>
                                <th style={{ width: 70 }}>Unit</th>
                                <th style={{ width: 90 }}>Rate</th>
                              </tr>
                            </thead>
                            <tbody>
                              {checkedItemsList.map((item) => {
                                const isOpen = checkedForMeasurement.has(
                                  item.WorkAbstractId,
                                );
                                return (
                                  <Fragment key={item.WorkAbstractId}>
                                    {/* ── Item row ── */}
                                    <tr
                                      onDragOver={(e) => {
                                        if (!checkedListDragId) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = "move";
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        const fromId =
                                          e.dataTransfer.getData("text/plain") ||
                                          checkedListDragId;
                                        moveCheckedItem(
                                          fromId,
                                          item.WorkAbstractId,
                                        );
                                        setCheckedListDragId(null);
                                      }}
                                      style={{
                                        ...(isOpen
                                          ? {
                                              background:
                                                theme.colors.accentSoft,
                                            }
                                          : null),
                                        ...(Number(checkedListDragId) ===
                                        Number(item.WorkAbstractId)
                                          ? { opacity: 0.55 }
                                          : null),
                                      }}
                                    >
                                      <td>
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
                                      </td>
                                      <td
                                        style={{
                                          fontFamily: theme.font.mono,
                                          fontWeight: 700,
                                          color: theme.colors.accent,
                                          textAlign: "center",
                                        }}
                                      >
                                        {item.Sequence ?? ""}
                                      </td>
                                      <td
                                        draggable={!reorderingCheckedList}
                                        onDragStart={(e) => {
                                          setCheckedListDragId(
                                            item.WorkAbstractId,
                                          );
                                          e.dataTransfer.effectAllowed = "move";
                                          e.dataTransfer.setData(
                                            "text/plain",
                                            String(item.WorkAbstractId),
                                          );
                                        }}
                                        onDragEnd={() =>
                                          setCheckedListDragId(null)
                                        }
                                        title="Drag to reorder"
                                        style={{
                                          cursor: "grab",
                                          color: theme.colors.inkSoft,
                                          textAlign: "center",
                                          userSelect: "none",
                                        }}
                                      >
                                        ⠿
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
                                        style={{ fontFamily: theme.font.mono }}
                                      >
                                        {item.UnitShortName ?? ""}
                                      </td>
                                      <td
                                        style={{
                                          fontFamily: theme.font.mono,
                                          textAlign: "right",
                                        }}
                                      >
                                        {formatRupees(item.CompletedRate)}
                                      </td>
                                    </tr>

                                    {/* ── Inline measurement panel — mounts when checked ── */}
                                    {isOpen && (
                                      <MeasurementPanel
                                        key={`mp-${item.WorkAbstractId}`}
                                        item={item}
                                        projectId={selectedProjectId}
                                        subWorkId={selectedSubWorkId}
                                        API_BASE={API_BASE}
                                        onCommentSaved={(workAbstractId, comment) => {
                                          setCheckedItemsList((prev) =>
                                            prev.map((row) =>
                                              Number(row.WorkAbstractId) ===
                                              Number(workAbstractId)
                                                ? { ...row, Comment: comment }
                                                : row,
                                            ),
                                          );
                                        }}
                                      />
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ marginTop: 14 }}>
                          <PrimaryButton type="button" onClick={listUpdate}>
                            Delete Checked Items
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
                        No checked items for this Work and Sub Work yet. Select
                        items in the SSR Items List and click Insert.
                      </p>
                    )}
                  </TabPanel>
                </Tabs>
              </Card>
            </>
          )}

          {/* ── Project Master ── */}
          {activeMaster === "master-projects" && (
            <Card
              eyebrow="Master · Project"
              title={
                editingProjectId
                  ? `Edit project #${editingProjectId}`
                  : "Project Master"
              }
              subtitle={
                canManageProjects
                  ? "Create and maintain projects (MasterProject)."
                  : "View projects for your organization. Only OrgAdmin or SuperAdmin can add new projects."
              }
            >
              {canManageProjects ? (
                <FormShell onSubmit={onProjectSubmit}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                    }}
                  >
                    <Field label="Organization" required>
                      <select
                        name="OrganizationId"
                        value={
                          isSuperAdmin
                            ? projectForm.OrganizationId
                            : sessionOrgId || projectForm.OrganizationId
                        }
                        onChange={onProjectChange}
                        disabled={!isSuperAdmin}
                        required
                        style={inputStyle}
                      >
                        {isSuperAdmin ? (
                          <>
                            <option value="">Select organization</option>
                            {organizations.map((org) => (
                              <option
                                key={org.OrganizationId}
                                value={org.OrganizationId}
                              >
                                {org.OrgName || org.OrgCode}
                              </option>
                            ))}
                          </>
                        ) : (
                          <option value={sessionOrgId}>
                            {sessionOrgName || "Session organization"}
                          </option>
                        )}
                      </select>
                    </Field>
                    <Field label="Project Code" required>
                      <input
                        name="ProjectCode"
                        value={projectForm.ProjectCode}
                        onChange={onProjectChange}
                        required
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Project Name" required>
                      <input
                        name="ProjectName"
                        value={projectForm.ProjectName}
                        onChange={onProjectChange}
                        required
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Client Name">
                      <input
                        name="ClientName"
                        value={projectForm.ClientName}
                        onChange={onProjectChange}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Client Contact Info">
                      <input
                        name="ClientContactInfo"
                        value={projectForm.ClientContactInfo}
                        onChange={onProjectChange}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Client Address" span>
                      <input
                        name="ClientAddress"
                        value={projectForm.ClientAddress}
                        onChange={onProjectChange}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Architect Assigned">
                      <select
                        name="ArchAssigned"
                        value={projectForm.ArchAssigned}
                        onChange={onProjectChange}
                        style={inputStyle}
                      >
                        <option value="">Select user</option>
                        {projectFormOrgUsers.map((u) => (
                          <option key={u.UserId} value={u.UserId}>
                            {u.UserName}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Engineer Assigned">
                      <select
                        name="EngrAssigned"
                        value={projectForm.EngrAssigned}
                        onChange={onProjectChange}
                        style={inputStyle}
                      >
                        <option value="">Select user</option>
                        {projectFormOrgUsers.map((u) => (
                          <option key={u.UserId} value={u.UserId}>
                            {u.UserName}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="DOrder">
                      <input
                        name="DOrder"
                        value={projectForm.DOrder}
                        onChange={onProjectChange}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Remarks">
                      <input
                        name="Remarks"
                        value={projectForm.Remarks}
                        onChange={onProjectChange}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Mark for deletion">
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontWeight: 500,
                          minHeight: 42,
                        }}
                      >
                        <input
                          type="checkbox"
                          name="MarkForDeletion"
                          checked={projectForm.MarkForDeletion}
                          onChange={onProjectChange}
                        />
                        Yes
                      </label>
                    </Field>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                    <PrimaryButton disabled={savingProject}>
                      {savingProject
                        ? "Saving…"
                        : editingProjectId
                          ? "Update project"
                          : "Save project"}
                    </PrimaryButton>
                    {editingProjectId && (
                      <SecondaryButton onClick={resetProjectEdit}>
                        Cancel edit
                      </SecondaryButton>
                    )}
                  </div>
                </FormShell>
              ) : (
                <div
                  style={{
                    marginBottom: 18,
                    padding: "11px 14px",
                    borderRadius: 8,
                    background: theme.colors.amberSoft,
                    color: theme.colors.amber,
                    border: "1px solid #F0D7A8",
                    fontSize: 13.5,
                  }}
                >
                  View only — new projects can be added by OrgAdmin or SuperAdmin.
                </div>
              )}

              {isSuperAdmin && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 320px) 1fr",
                    gap: 14,
                    alignItems: "end",
                    marginBottom: 14,
                  }}
                >
                  <Field label="Filter by Organization">
                    <select
                      value={projectListOrgFilter}
                      onChange={(e) => setProjectListOrgFilter(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">All organizations</option>
                      {organizations.map((org) => (
                        <option
                          key={org.OrganizationId}
                          value={org.OrganizationId}
                        >
                          {org.OrgName || org.OrgCode}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

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
                      <th>Organization</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Client</th>
                      <th>Architect</th>
                      <th>Engineer</th>
                      <th>DOrder</th>
                      <th>Deleted</th>
                      {canManageProjects && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingProjects ? (
                      <EmptyRow colSpan={canManageProjects ? 10 : 9}>
                        Loading…
                      </EmptyRow>
                    ) : filteredProjectMasterList.length ? (
                      filteredProjectMasterList.map((p) => {
                        const archName =
                          projectFormOrgUsers.find(
                            (u) => Number(u.UserId) === Number(p.ArchAssigned),
                          )?.UserName ||
                          orgUsers.find(
                            (u) => Number(u.UserId) === Number(p.ArchAssigned),
                          )?.UserName ||
                          p.ArchAssigned ||
                          "—";
                        const engrName =
                          projectFormOrgUsers.find(
                            (u) => Number(u.UserId) === Number(p.EngrAssigned),
                          )?.UserName ||
                          orgUsers.find(
                            (u) => Number(u.UserId) === Number(p.EngrAssigned),
                          )?.UserName ||
                          p.EngrAssigned ||
                          "—";
                        return (
                          <tr key={p.ProjectId}>
                            <td
                              style={{
                                fontFamily: theme.font.mono,
                                color: theme.colors.inkSoft,
                              }}
                            >
                              {p.ProjectId}
                            </td>
                            <td>
                              <Badge tone="accent">
                                {p.OrgName ||
                                  p.OrgCode ||
                                  sessionOrgName ||
                                  p.OrganizationID}
                              </Badge>
                            </td>
                            <td style={{ fontFamily: theme.font.mono }}>
                              {p.ProjectCode}
                            </td>
                            <td>{p.ProjectName}</td>
                            <td>{p.ClientName || "—"}</td>
                            <td>{archName}</td>
                            <td>{engrName}</td>
                            <td
                              style={{
                                fontFamily: theme.font.mono,
                                textAlign: "right",
                              }}
                            >
                              {p.DOrder ?? "—"}
                            </td>
                            <td>
                              <Badge
                                tone={p.MarkForDeletion ? "red" : "green"}
                              >
                                {p.MarkForDeletion ? "Yes" : "No"}
                              </Badge>
                            </td>
                            {canManageProjects && (
                              <td>
                                <SecondaryButton
                                  onClick={() => startProjectEdit(p)}
                                >
                                  Edit
                                </SecondaryButton>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    ) : (
                      <EmptyRow colSpan={canManageProjects ? 10 : 9}>
                        No projects found
                        {canManageProjects ? " — add one above." : "."}
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Works ── */}
          {activeMaster === "works" && (
            <Card
              eyebrow="Master · Work"
              title={
                editingWorkId ? `Edit work #${editingWorkId}` : "Work Master"
              }
              subtitle={
                isSuperAdmin
                  ? "Select Organization and User to view or maintain that user’s works. Soft-deleted works remain visible here so you can UnDelete them."
                  : isOrgAdmin
                    ? "Works for your organization, ordered by Project Code."
                    : "Works created by you, ordered by Project Code. Project is optional."
              }
            >
              {isSuperAdmin && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                    marginBottom: 16,
                  }}
                >
                  <Field label="Organization" required>
                    <select
                      value={workMasterFilterOrgId}
                      onChange={async (e) => {
                        const value = e.target.value;
                        setWorkMasterFilterOrgId(value);
                        setWorkMasterFilterUserId("");
                        setWorkMasterUsers([]);
                        setWorkMasterList([]);
                        resetWorkEdit();
                        await loadWorkMasterUsers(value);
                        await loadWorkMasterProjects(value);
                      }}
                      style={{ ...inputStyle, width: "100%" }}
                    >
                      <option value="">Select Organization</option>
                      {organizations.map((org) => (
                        <option
                          key={org.OrganizationId}
                          value={org.OrganizationId}
                        >
                          {org.OrgName || org.OrgCode || org.OrganizationId}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="User" required>
                    <select
                      value={workMasterFilterUserId}
                      onChange={async (e) => {
                        const value = e.target.value;
                        setWorkMasterFilterUserId(value);
                        resetWorkEdit();
                        await loadWorkMasterList(
                          workMasterFilterOrgId,
                          value,
                        );
                      }}
                      disabled={!workMasterFilterOrgId}
                      style={{ ...inputStyle, width: "100%" }}
                    >
                      <option value="">
                        {workMasterFilterOrgId
                          ? "Select User"
                          : "Select Organization first"}
                      </option>
                      {workMasterUsers.map((u) => (
                        <option key={u.UserId} value={u.UserId}>
                          {u.UserName || u.UserLoginName || u.UserId}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              <FormShell onSubmit={onWorkSubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 3fr",
                    gap: 14,
                  }}
                >
                  <Field label="Select Project" span>
                    <select
                      name="ProjectId"
                      value={workForm.ProjectId}
                      onChange={onWorkChange}
                      style={{ ...inputStyle, width: "100%" }}
                    >
                      <option value="">No Project</option>
                      {(isSuperAdmin ? workMasterProjects : projects).map(
                        (project) => (
                          <option
                            key={project.ProjectId}
                            value={project.ProjectId}
                          >
                            {project.ProjectCode
                              ? `${project.ProjectCode} — ${project.ProjectName}`
                              : project.ProjectName}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Work Name" required span>
                    <textarea
                      name="WorkName"
                      value={workForm.WorkName}
                      onChange={onWorkChange}
                      required
                      rows={3}
                      style={{
                        ...inputStyle,
                        width: "100%",
                        minHeight: 72,
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </Field>
                  <Field label="Created Date" required>
                    <input
                      name="CreationDate"
                      type="date"
                      value={workForm.CreationDate || ""}
                      onChange={onWorkChange}
                      required
                      style={{ ...inputStyle, width: "100%" }}
                    />
                  </Field>
                  <Field label="Remarks">
                    <input
                      name="Remarks"
                      value={workForm.Remarks}
                      onChange={onWorkChange}
                      style={{ ...inputStyle, width: "100%" }}
                    />
                  </Field>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton
                    disabled={
                      savingWork ||
                      deletingWork ||
                      (isSuperAdmin &&
                        !editingWorkId &&
                        !workMasterFilterUserId)
                    }
                  >
                    {savingWork
                      ? "Saving…"
                      : editingWorkId
                        ? "Update work"
                        : "Save work"}
                  </PrimaryButton>
                  {editingWorkId && (
                    <SecondaryButton
                      onClick={resetWorkEdit}
                      disabled={savingWork || deletingWork}
                    >
                      Cancel edit
                    </SecondaryButton>
                  )}
                  {editingWorkId && !workForm.MarkForDeletion && (
                    <SecondaryButton
                      onClick={softDeleteWork}
                      disabled={savingWork || deletingWork}
                      style={{
                        borderColor: theme.colors.red,
                        color: theme.colors.red,
                      }}
                    >
                      {deletingWork ? "Deleting…" : "Delete"}
                    </SecondaryButton>
                  )}
                  {editingWorkId &&
                    workForm.MarkForDeletion &&
                    isSuperAdmin && (
                      <SecondaryButton
                        onClick={undeleteWork}
                        disabled={savingWork || deletingWork}
                        style={{
                          borderColor: theme.colors.green,
                          color: theme.colors.green,
                        }}
                      >
                        {deletingWork ? "Restoring…" : "UnDelete"}
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
                      {(isSuperAdmin || isOrgAdmin) && <th>Organization</th>}
                      <th>Project Code</th>
                      <th>Work Name</th>
                      <th>Created Date</th>
                      {(isSuperAdmin || isOrgAdmin) && <th>User</th>}
                      <th>Remarks</th>
                      {isSuperAdmin && <th>Deleted</th>}
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingWorks ? (
                      <EmptyRow
                        colSpan={
                          isSuperAdmin ? 9 : isOrgAdmin ? 8 : 6
                        }
                      >
                        Loading…
                      </EmptyRow>
                    ) : isSuperAdmin &&
                      (!workMasterFilterOrgId ||
                        !workMasterFilterUserId) ? (
                      <EmptyRow colSpan={9}>
                        Select Organization and User above to view works.
                      </EmptyRow>
                    ) : workMasterList.length ? (
                      workMasterList.map((work) => (
                        <tr key={work.MasterWorkId}>
                          <td
                            style={{
                              fontFamily: theme.font.mono,
                              color: theme.colors.inkSoft,
                            }}
                          >
                            {work.MasterWorkId}
                          </td>
                          {(isSuperAdmin || isOrgAdmin) && (
                            <td>
                              {work.OrgName ||
                                work.OrgCode ||
                                work.OrganizationID ||
                                "—"}
                            </td>
                          )}
                          <td style={{ fontFamily: theme.font.mono }}>
                            {work.ProjectCode || "—"}
                          </td>
                          <td>{work.WorkName}</td>
                          <td style={{ fontFamily: theme.font.mono }}>
                            {work.CreationDate
                              ? formatWorkCreationDate(work.CreationDate)
                              : "—"}
                          </td>
                          {(isSuperAdmin || isOrgAdmin) && (
                            <td>{work.UserName || work.UserId || "—"}</td>
                          )}
                          <td>{work.Remarks || "—"}</td>
                          {isSuperAdmin && (
                            <td>
                              <Badge
                                tone={
                                  work.MarkForDeletion ? "red" : "green"
                                }
                              >
                                {work.MarkForDeletion ? "Yes" : "No"}
                              </Badge>
                            </td>
                          )}
                          <td>
                            <SecondaryButton
                              onClick={() => startWorkEdit(work)}
                            >
                              Edit
                            </SecondaryButton>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow
                        colSpan={
                          isSuperAdmin ? 9 : isOrgAdmin ? 8 : 6
                        }
                      >
                        No works found — add one above.
                      </EmptyRow>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Sub Work ── */}
          {activeMaster === "sub-work" && (
            <Card
              eyebrow="Master · Sub Work"
              title={
                editingSubWorkId
                  ? `Edit sub work #${editingSubWorkId}`
                  : "Sub Work Master"
              }
              subtitle={
                isSuperAdmin
                  ? "Select Organization and User, then a Work, to maintain that user’s sub-works. Soft-deleted sub-works remain visible so you can UnDelete them."
                  : "Select a work, then create and maintain its sub-works."
              }
            >
              {isSuperAdmin && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                    marginBottom: 16,
                  }}
                >
                  <Field label="Organization" required>
                    <select
                      value={subWorkMasterFilterOrgId}
                      onChange={async (e) => {
                        const value = e.target.value;
                        setSubWorkMasterFilterOrgId(value);
                        setSubWorkMasterFilterUserId("");
                        setSubWorkMasterUsers([]);
                        setSubWorkMasterWorks([]);
                        setSubWorksMasterList([]);
                        setSubWorkForm(initialSubWorkForm);
                        setEditingSubWorkId(null);
                        await loadSubWorkMasterUsers(value);
                      }}
                      style={{ ...inputStyle, width: "100%" }}
                    >
                      <option value="">Select Organization</option>
                      {organizations.map((org) => (
                        <option
                          key={org.OrganizationId}
                          value={org.OrganizationId}
                        >
                          {org.OrgName || org.OrgCode || org.OrganizationId}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="User" required>
                    <select
                      value={subWorkMasterFilterUserId}
                      onChange={async (e) => {
                        const value = e.target.value;
                        setSubWorkMasterFilterUserId(value);
                        setSubWorksMasterList([]);
                        setSubWorkForm(initialSubWorkForm);
                        setEditingSubWorkId(null);
                        await loadSubWorkMasterWorks(value);
                      }}
                      disabled={!subWorkMasterFilterOrgId}
                      style={{ ...inputStyle, width: "100%" }}
                    >
                      <option value="">
                        {subWorkMasterFilterOrgId
                          ? "Select User"
                          : "Select Organization first"}
                      </option>
                      {subWorkMasterUsers.map((u) => (
                        <option key={u.UserId} value={u.UserId}>
                          {u.UserName || u.UserLoginName || u.UserId}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              <FormShell onSubmit={onSubWorkSubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 14,
                  }}
                >
                  <Field label="Select Work" required>
                    <select
                      name="WorkId"
                      value={subWorkForm.WorkId}
                      onChange={onSubWorkChange}
                      required
                      disabled={
                        isSuperAdmin &&
                        (!subWorkMasterFilterOrgId ||
                          !subWorkMasterFilterUserId)
                      }
                      style={{ ...inputStyle, width: "100%" }}
                    >
                      <option value="">
                        {isSuperAdmin && !subWorkMasterFilterUserId
                          ? "Select Organization and User first"
                          : "Select Work"}
                      </option>
                      {(isSuperAdmin ? subWorkMasterWorks : worksList).map(
                        (work) => (
                          <option
                            key={work.MasterWorkId}
                            value={work.MasterWorkId}
                          >
                            {work.WorkName}
                            {work.ProjectCode
                              ? ` (${work.ProjectCode})`
                              : ""}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>

                  <Field label="Sub Work Name" required>
                    <textarea
                      name="SubWorkName"
                      value={subWorkForm.SubWorkName}
                      onChange={onSubWorkChange}
                      required
                      rows={2}
                      style={{
                        ...inputStyle,
                        width: "100%",
                        minHeight: 56,
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </Field>

                  <Field label="Sequence">
                    <input
                      name="Sequence"
                      type="number"
                      min="1"
                      step="1"
                      value={subWorkForm.Sequence}
                      onChange={onSubWorkChange}
                      placeholder="Optional — auto by entry order"
                      style={{ ...inputStyle, width: "100%" }}
                      title="Leave blank to assign next Sequence for this Work"
                    />
                  </Field>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <PrimaryButton
                    disabled={
                      savingSubWork ||
                      deletingSubWork ||
                      (isSuperAdmin && !subWorkMasterFilterUserId)
                    }
                  >
                    {savingSubWork
                      ? "Saving…"
                      : editingSubWorkId
                        ? "Update sub work"
                        : "Save sub work"}
                  </PrimaryButton>
                  {editingSubWorkId && (
                    <SecondaryButton
                      onClick={resetSubWorkEdit}
                      disabled={savingSubWork || deletingSubWork}
                    >
                      Cancel edit
                    </SecondaryButton>
                  )}
                  {editingSubWorkId && !subWorkForm.MarkForDeletion && (
                    <SecondaryButton
                      onClick={softDeleteSubWork}
                      disabled={savingSubWork || deletingSubWork}
                      style={{
                        borderColor: theme.colors.red,
                        color: theme.colors.red,
                      }}
                    >
                      {deletingSubWork ? "Deleting…" : "Delete"}
                    </SecondaryButton>
                  )}
                  {editingSubWorkId &&
                    subWorkForm.MarkForDeletion &&
                    isSuperAdmin && (
                      <SecondaryButton
                        onClick={undeleteSubWork}
                        disabled={savingSubWork || deletingSubWork}
                        style={{
                          borderColor: theme.colors.green,
                          color: theme.colors.green,
                        }}
                      >
                        {deletingSubWork ? "Restoring…" : "UnDelete"}
                      </SecondaryButton>
                    )}
                </div>
              </FormShell>

              {subWorkForm.WorkId &&
                subWorksMasterList.some((s) => !s.MarkForDeletion) && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: theme.colors.inkSoft,
                    marginBottom: 8,
                  }}
                >
                  Drag ⠿ to change Sub Work sequence (starts at 1 for this
                  Work).
                  {reorderingSubWorks ? " Updating sequence…" : ""}
                </div>
              )}
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
                      <th style={{ width: 40 }}>Seq</th>
                      <th style={{ width: 28 }} />
                      <th>ID</th>
                      <th>Work</th>
                      <th>Sub Work Name</th>
                      {isSuperAdmin && <th>Deleted</th>}
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isSuperAdmin &&
                    (!subWorkMasterFilterOrgId ||
                      !subWorkMasterFilterUserId) ? (
                      <EmptyRow colSpan={isSuperAdmin ? 7 : 6}>
                        Select Organization and User above to manage
                        sub-works.
                      </EmptyRow>
                    ) : !subWorkForm.WorkId ? (
                      <EmptyRow colSpan={isSuperAdmin ? 7 : 6}>
                        Select a work above to list sub-works.
                      </EmptyRow>
                    ) : loadingSubWorksMaster ? (
                      <EmptyRow colSpan={isSuperAdmin ? 7 : 6}>
                        Loading…
                      </EmptyRow>
                    ) : subWorksMasterList.length ? (
                      subWorksMasterList.map((subWork) => {
                        const isDeleted = Boolean(subWork.MarkForDeletion);
                        return (
                          <tr
                            key={subWork.SubWorkId}
                            onDragOver={(e) => {
                              if (!subWorkListDragId || isDeleted) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(e) => {
                              if (isDeleted) return;
                              e.preventDefault();
                              const fromId =
                                e.dataTransfer.getData("text/plain") ||
                                subWorkListDragId;
                              moveSubWorkItem(fromId, subWork.SubWorkId);
                              setSubWorkListDragId(null);
                            }}
                            style={
                              Number(subWorkListDragId) ===
                              Number(subWork.SubWorkId)
                                ? { opacity: 0.55 }
                                : isDeleted
                                  ? { opacity: 0.7 }
                                  : undefined
                            }
                          >
                            <td
                              style={{
                                fontFamily: theme.font.mono,
                                fontWeight: 700,
                                color: theme.colors.accent,
                                textAlign: "center",
                              }}
                            >
                              {isDeleted ? "—" : subWork.Sequence ?? ""}
                            </td>
                            <td
                              draggable={!reorderingSubWorks && !isDeleted}
                              onDragStart={(e) => {
                                if (isDeleted) {
                                  e.preventDefault();
                                  return;
                                }
                                setSubWorkListDragId(subWork.SubWorkId);
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData(
                                  "text/plain",
                                  String(subWork.SubWorkId),
                                );
                              }}
                              onDragEnd={() => setSubWorkListDragId(null)}
                              title={
                                isDeleted
                                  ? "Deleted — cannot reorder"
                                  : "Drag to reorder"
                              }
                              style={{
                                cursor:
                                  reorderingSubWorks || isDeleted
                                    ? "default"
                                    : "grab",
                                color: theme.colors.inkSoft,
                                textAlign: "center",
                                userSelect: "none",
                              }}
                            >
                              {isDeleted ? "" : "⠿"}
                            </td>
                            <td
                              style={{
                                fontFamily: theme.font.mono,
                                color: theme.colors.inkSoft,
                              }}
                            >
                              {subWork.SubWorkId}
                            </td>
                            <td>
                              {subWork.WorkName ||
                                (isSuperAdmin
                                  ? subWorkMasterWorks
                                  : worksList
                                ).find(
                                  (w) =>
                                    Number(w.MasterWorkId) ===
                                    Number(subWork.WorkId),
                                )?.WorkName ||
                                "—"}
                            </td>
                            <td>{subWork.SubWorkName}</td>
                            {isSuperAdmin && (
                              <td>
                                <Badge tone={isDeleted ? "red" : "green"}>
                                  {isDeleted ? "Yes" : "No"}
                                </Badge>
                              </td>
                            )}
                            <td>
                              <SecondaryButton
                                onClick={() => startSubWorkEdit(subWork)}
                              >
                                Edit
                              </SecondaryButton>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <EmptyRow colSpan={isSuperAdmin ? 7 : 6}>
                        No sub works found for this work — add one above.
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
        works={worksList}
        defaultWorkId={selectedProjectId}
      />
      <UserProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        API_BASE={API_BASE}
        userId={currentUser?.UserId}
        onSaved={onProfileSaved}
      />
    </>
  );
}
