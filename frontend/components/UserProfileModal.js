import { useEffect, useState } from "react";
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Button,
  FormLabel,
  Input,
  Textarea,
  Select,
  Option,
  Stack,
  Box,
} from "@mui/joy";

async function readApiJson(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      res.status === 404
        ? "Profile API is not available on the server yet. Please redeploy the backend."
        : `Server returned a non-JSON response (${res.status}).`,
    );
  }
  if (!res.ok) {
    throw new Error(
      (data && data.message) || `Request failed (${res.status}).`,
    );
  }
  return data;
}

function toDateInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function PenIcon({ active }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#216bcb" : "#637385"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function FieldLabel({ children, editable, editing, onToggleEdit }) {
  return (
    <FormLabel
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        mb: 0.45,
        fontWeight: 600,
        fontSize: 12,
        color: "#3d4f60",
        letterSpacing: "0.01em",
      }}
    >
      <span>{children}</span>
      {editable && (
        <button
          type="button"
          onClick={onToggleEdit}
          title={editing ? "Lock field" : "Edit field"}
          aria-label={editing ? `Lock ${children}` : `Edit ${children}`}
          style={{
            border: "1px solid #c8d4df",
            background: editing ? "#eaf2ff" : "#fff",
            borderRadius: 6,
            width: 26,
            height: 26,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <PenIcon active={editing} />
        </button>
      )}
    </FormLabel>
  );
}

/**
 * Row groups — multiple fields per row based on typical value width.
 * displayKey: joined name from API (e.g. UserCategoryName, OrgName)
 */
const PROFILE_ROWS = [
  [
    { key: "UserId", label: "User Id", span: 1 },
    {
      key: "UserCategoryId",
      label: "User Category",
      displayKey: "UserCategoryName",
      span: 1,
    },
    {
      key: "OrganizationId",
      label: "Organization",
      displayKey: "OrgName",
      span: 2,
    },
  ],
  [
    { key: "UserLoginName", label: "User Login Name", span: 1 },
    { key: "UserName", label: "User Name", span: 1 },
    {
      key: "DesignationId",
      label: "Designation",
      editable: true,
      control: "designation",
      span: 2,
    },
  ],
  [
    { key: "UserContact", label: "User Contact", span: 1 },
    { key: "UserEmail", label: "User Email", span: 2 },
    {
      key: "UserPWD",
      label: "User Password",
      inputType: "password",
      span: 1,
    },
  ],
  [
    {
      key: "UserDateOfJoining",
      label: "Date of Joining",
      editable: true,
      control: "date",
      span: 1,
    },
    {
      key: "UserDateOfBirth",
      label: "Date of Birth",
      editable: true,
      control: "date",
      span: 1,
    },
    {
      key: "DateOfRelieving",
      label: "Date Of Relieving",
      control: "date",
      span: 1,
    },
    { key: "DOrder", label: "DOrder", span: 1 },
  ],
  [
    {
      key: "UserAddress",
      label: "User Address",
      editable: true,
      control: "textarea",
      span: 4,
    },
  ],
  [
    { key: "IsActive", label: "Is Active", span: 1 },
    { key: "MarkForDeletion", label: "Mark For Deletion", span: 1 },
    { key: "Remarks", label: "Remarks", span: 2 },
  ],
];

const GRID_COLS = 4;

const disabledInputSx = {
  "--Input-focusedThickness": "0px",
  backgroundColor: "#f3f6f9",
  color: "#4a5a6a",
  cursor: "not-allowed",
};

export default function UserProfileModal({
  open,
  onClose,
  API_BASE,
  userId,
  onSaved,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profile, setProfile] = useState(null);
  const [designations, setDesignations] = useState([]);
  const [editFlags, setEditFlags] = useState({
    UserAddress: false,
    UserDateOfJoining: false,
    UserDateOfBirth: false,
    DesignationId: false,
  });
  const [form, setForm] = useState({
    UserAddress: "",
    UserDateOfJoining: "",
    UserDateOfBirth: "",
    DesignationId: "",
  });

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      setSuccess("");
      setEditFlags({
        UserAddress: false,
        UserDateOfJoining: false,
        UserDateOfBirth: false,
        DesignationId: false,
      });
      try {
        const profileData = await readApiJson(
          await fetch(`${API_BASE}/api/auth/user-profile/${userId}`),
        );
        if (cancelled) return;

        setProfile(profileData);
        setForm({
          UserAddress: profileData.UserAddress || "",
          UserDateOfJoining: toDateInputValue(profileData.UserDateOfJoining),
          UserDateOfBirth: toDateInputValue(profileData.UserDateOfBirth),
          DesignationId: profileData.DesignationId
            ? String(profileData.DesignationId)
            : "",
        });

        const desigData = await readApiJson(
          await fetch(
            `${API_BASE}/api/designations?organizationId=${profileData.OrganizationId}`,
          ),
        );
        if (!cancelled) {
          setDesignations(Array.isArray(desigData) ? desigData : []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, userId, API_BASE]);

  const toggleEdit = (key) => {
    setEditFlags((prev) => ({ ...prev, [key]: !prev[key] }));
    setSuccess("");
  };

  const onSave = async () => {
    if (!userId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await readApiJson(
        await fetch(`${API_BASE}/api/auth/user-profile/${userId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: form.UserAddress,
            userDateOfJoining: form.UserDateOfJoining || null,
            userDateOfBirth: form.UserDateOfBirth || null,
            designationId: form.DesignationId,
          }),
        }),
      );
      setProfile(data);
      setForm({
        UserAddress: data.UserAddress || "",
        UserDateOfJoining: toDateInputValue(data.UserDateOfJoining),
        UserDateOfBirth: toDateInputValue(data.UserDateOfBirth),
        DesignationId: data.DesignationId ? String(data.DesignationId) : "",
      });
      setEditFlags({
        UserAddress: false,
        UserDateOfJoining: false,
        UserDateOfBirth: false,
        DesignationId: false,
      });
      setSuccess("Profile updated successfully.");
      if (onSaved) onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const anyEditing = Object.values(editFlags).some(Boolean);
  const isDirty =
    !!profile &&
    ((form.UserAddress || "") !== (profile.UserAddress || "") ||
      form.UserDateOfJoining !== toDateInputValue(profile.UserDateOfJoining) ||
      form.UserDateOfBirth !== toDateInputValue(profile.UserDateOfBirth) ||
      String(form.DesignationId || "") !== String(profile.DesignationId || ""));

  const fieldBoxSx = (span) => ({
    gridColumn: {
      xs: "span 4",
      sm: `span ${Math.min(span * 2, GRID_COLS)}`,
      md: `span ${span}`,
    },
    minWidth: 0,
  });

  const renderField = (field) => {
    if (field.editable && field.control === "textarea") {
      return (
        <Box key={field.key} sx={fieldBoxSx(field.span)}>
          <FieldLabel
            editable
            editing={editFlags.UserAddress}
            onToggleEdit={() => toggleEdit("UserAddress")}
          >
            {field.label}
          </FieldLabel>
          <Textarea
            minRows={2}
            size="sm"
            value={form.UserAddress}
            disabled={!editFlags.UserAddress}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, UserAddress: e.target.value }))
            }
            sx={!editFlags.UserAddress ? disabledInputSx : undefined}
          />
        </Box>
      );
    }

    if (field.editable && field.control === "date") {
      return (
        <Box key={field.key} sx={fieldBoxSx(field.span)}>
          <FieldLabel
            editable
            editing={editFlags[field.key]}
            onToggleEdit={() => toggleEdit(field.key)}
          >
            {field.label}
          </FieldLabel>
          <Input
            size="sm"
            type="date"
            value={form[field.key]}
            disabled={!editFlags[field.key]}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
            }
            sx={!editFlags[field.key] ? disabledInputSx : undefined}
          />
        </Box>
      );
    }

    if (field.editable && field.control === "designation") {
      return (
        <Box key={field.key} sx={fieldBoxSx(field.span)}>
          <FieldLabel
            editable
            editing={editFlags.DesignationId}
            onToggleEdit={() => toggleEdit("DesignationId")}
          >
            {field.label}
          </FieldLabel>
          <Select
            size="sm"
            value={form.DesignationId || null}
            disabled={!editFlags.DesignationId}
            onChange={(_, value) =>
              setForm((prev) => ({
                ...prev,
                DesignationId: value ? String(value) : "",
              }))
            }
            placeholder="Select designation"
            sx={!editFlags.DesignationId ? disabledInputSx : undefined}
          >
            {designations.map((d) => (
              <Option key={d.DesignationId} value={String(d.DesignationId)}>
                {d.DesignationName}
              </Option>
            ))}
          </Select>
        </Box>
      );
    }

    const raw =
      field.displayKey && profile?.[field.displayKey] != null
        ? profile[field.displayKey]
        : profile?.[field.key];
    const value =
      field.control === "date"
        ? toDateInputValue(profile?.[field.key])
        : displayValue(raw);

    return (
      <Box key={field.key} sx={fieldBoxSx(field.span)}>
        <FieldLabel>{field.label}</FieldLabel>
        <Input
          size="sm"
          type={field.inputType === "password" ? "password" : "text"}
          value={value}
          disabled
          readOnly
          sx={disabledInputSx}
        />
      </Box>
    );
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: "min(980px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
          p: { xs: 2, md: 3 },
          background:
            "linear-gradient(180deg, #f7fafc 0%, #ffffff 120px, #ffffff 100%)",
          border: "1px solid #d7e0e8",
        }}
      >
        <ModalClose />
        <Typography
          level="h4"
          sx={{ mb: 0.25, color: "#1f3344", fontWeight: 750 }}
        >
          User Profile
        </Typography>
        <Typography level="body-sm" sx={{ mb: 2.25, color: "#5d6c7a" }}>
          View your account details. Use the pen icon to edit Address, Date of
          Joining, Date of Birth, or Designation.
        </Typography>

        {loading && (
          <Typography level="body-sm" sx={{ color: "#5d6c7a" }}>
            Loading profile...
          </Typography>
        )}
        {error && (
          <Typography
            level="body-sm"
            sx={{
              mb: 1.5,
              p: 1.2,
              borderRadius: 8,
              background: "#fff0f0",
              border: "1px solid #f5c2c2",
              color: "#9b1c1c",
            }}
          >
            {error}
          </Typography>
        )}
        {success && (
          <Typography
            level="body-sm"
            sx={{
              mb: 1.5,
              p: 1.2,
              borderRadius: 8,
              background: "#e7f5ec",
              border: "1px solid #b7dfc5",
              color: "#2a7d4f",
            }}
          >
            {success}
          </Typography>
        )}

        {!loading && profile && (
          <Stack spacing={2}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 1.5,
                p: { xs: 1.5, md: 2 },
                borderRadius: 10,
                border: "1px solid #dde5ec",
                background: "#fff",
                boxShadow: "0 1px 0 rgba(36, 50, 63, 0.04)",
              }}
            >
              {PROFILE_ROWS.flatMap((row) => row.map(renderField))}
            </Box>

            <Stack
              direction="row"
              spacing={1}
              sx={{ pt: 0.5, justifyContent: "flex-end" }}
            >
              <Button variant="outlined" color="neutral" onClick={onClose}>
                Close
              </Button>
              <Button
                variant="solid"
                loading={saving}
                disabled={(!anyEditing && !isDirty) || saving}
                onClick={onSave}
              >
                Save Changes
              </Button>
            </Stack>
          </Stack>
        )}
      </ModalDialog>
    </Modal>
  );
}
