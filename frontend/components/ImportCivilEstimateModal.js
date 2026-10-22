import { useEffect, useState } from "react";
import axios from "axios";
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Button,
  FormLabel,
} from "@mui/joy";

export default function ImportCivilEstimateModal({
  open,
  onClose,
  works,
  API_BASE,
}) {
  const [workCode, setWorkCode] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    if (!open) return;
    const first = (works || []).find(
      (row) => row.WorkCode !== null && row.WorkCode !== undefined,
    );
    setWorkCode(first ? String(first.WorkCode) : "");
    setSelection(null);
    setSelecting(false);
  }, [open, works]);

  const handleSelectWork = async () => {
    if (!workCode || selecting) return;
    setSelecting(true);
    setSelection(null);
    try {
      const res = await axios.get(
        `${API_BASE}/api/civil-estimate/aemwork/${encodeURIComponent(workCode)}/selection`,
      );
      setSelection(res.data || null);
    } catch (err) {
      window.alert(
        err.response?.data?.message || "Could not read the selected work.",
      );
    } finally {
      setSelecting(false);
    }
  };

  const userLabel = [selection?.userName, selection?.userAddress]
    .filter(Boolean)
    .join(" ");
  const subWorks = Array.isArray(selection?.subWorks) ? selection.subWorks : [];

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 720, maxWidth: "94vw" }}>
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 0.5 }}>
          Import
        </Typography>
        <Typography level="body-sm" sx={{ mb: 2, color: "neutral.500" }}>
          Welcome to the IMPORT Utility for Existing Software Users
        </Typography>
        <FormLabel sx={{ mb: 0.5 }}>WORKDESCRIPTION</FormLabel>
        <select
          value={workCode}
          onChange={(event) => {
            setWorkCode(event.target.value);
            setSelection(null);
          }}
          disabled={!works?.length || selecting}
          style={{
            width: "100%",
            fontSize: 14,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #cdd7e1",
            background: "#fff",
          }}
        >
          {!works?.length ? (
            <option value="">No works found in AEMWORK</option>
          ) : (
            works.map((row, index) => (
              <option
                key={`${row.WorkCode ?? "work"}-${index}`}
                value={String(row.WorkCode)}
              >
                {row.WorkDescription}
              </option>
            ))
          )}
        </select>
        {selection ? (
          <Typography level="body-sm" sx={{ mt: 2, color: "neutral.800" }}>
            Dear User {userLabel}, You have selected the Work :
            <br />
            <strong>“{selection.workDescription}”</strong>
            <br />
            and
            <br />
            Sub Works
            {subWorks.map((row, index) => (
              <span key={`${row.SubWorkCode ?? "sub"}-${index}`}>
                <br />
                {index + 1}. “{row.SubWorkDescription}”
              </span>
            ))}
            <br />
            for importing to Online Software
          </Typography>
        ) : null}
        <Button
          variant="solid"
          loading={selecting}
          disabled={!workCode}
          sx={{ mt: 2 }}
          onClick={handleSelectWork}
        >
          Click to Proceed
        </Button>
      </ModalDialog>
    </Modal>
  );
}
