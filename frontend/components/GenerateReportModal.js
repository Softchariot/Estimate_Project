import { useEffect, useState } from "react";
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Select,
  Option,
  Button,
  Stack,
  FormLabel,
} from "@mui/joy";
import axios from "axios";

// ─────────────────────────────────────────────────────────────────────────────
// GenerateReportModal
// Loads ALL sub works once when the modal opens, then filters them client-side
// by the selected MasterWork (WorkId).
// ─────────────────────────────────────────────────────────────────────────────

export default function GenerateReportModal({
  open,
  onClose,
  API_BASE,
  works, // [{ MasterWorkId, WorkName }, ...]
  defaultWorkId, // optional — pre-select whatever Work the user already has selected
}) {
  const [allSubWorks, setAllSubWorks] = useState([]);
  const [loadingSubWorks, setLoadingSubWorks] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState(
    defaultWorkId ? String(defaultWorkId) : "",
  );
  const [selectedSubWorkId, setSelectedSubWorkId] = useState("all");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Load every sub work exactly once, the moment the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadAllSubWorks = async () => {
      console.log("Loading all sub works from backend...");
      setLoadingSubWorks(true);
      setError("");
      try {
        const res = await axios.get(`${API_BASE}/api/load-all-sub-works`);
        if (res.status === 200) {
          const data = await res.data;
          console.log("Loaded all sub works:", data.data);
          if (!cancelled) setAllSubWorks(data.data || []);
          console.log("Sub works set:", data.data || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingSubWorks(false);
      }
    };

    loadAllSubWorks();
    console.log("All sub works loaded:", allSubWorks);
    return () => {
      cancelled = true;
    };
  }, [open, API_BASE]);

  // Reset the sub work choice whenever the Work changes.

  //   const loadSpecificSubWorks = async (projectId) => {
  //     setLoadingSubWorks(true);
  //     setError("");
  //     try {
  //       const res = await axios.get(`${API_BASE}/api/load-sub-works`, {
  //         params: { projectId: projectId },
  //       });
  //       const data = await res.data;
  //       console.log("Loaded sub works for projectId", projectId, ":", data.data);
  //       setAllSubWorks(data.data || []);
  //     } catch (err) {
  //       setError(err.message);
  //     } finally {
  //       setLoadingSubWorks(false);
  //     }
  //   };

  useEffect(() => {
    if (!open) return;
    setSelectedWorkId(defaultWorkId ? String(defaultWorkId) : "");
    setSelectedSubWorkId("all");
  }, [open, defaultWorkId]);

  const handleWorkChange = (workId) => {
    setSelectedWorkId(workId);
    setSelectedSubWorkId("all");
  };

  const subWorksForSelectedWork = selectedWorkId
    ? allSubWorks.filter(
        (sw) => String(sw.WorkId) === String(selectedWorkId),
      )
    : [];

  const handleGenerate = async () => {
    if (!selectedWorkId) {
      setError("Please select a Work first.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const params = new URLSearchParams({
        projectId: Number(selectedWorkId),
        subWorkId: selectedSubWorkId, // "all" or a specific SubWorkId
      });

      const res = await fetch(
        `${API_BASE}/api/generate-report?${params.toString()}`,
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Report generation failed.");
      }

      const workName =
        works?.find((w) => String(w.MasterWorkId) === String(selectedWorkId))
          ?.WorkName || "Abstract";

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = workName.replace(/[^\w\-]+/g, "_");
      a.download = `${safeName}_Abstract.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: 400 }}>
        <ModalClose />
        <Typography level="title-lg" sx={{ mb: 1 }}>
          Generate Report
        </Typography>
        <Typography level="body-sm" sx={{ mb: 2, color: "neutral.500" }}>
          Pick a Work, then choose which sub work(s) to include. Each sub work
          prints on its own page with a total at the end.
        </Typography>

        <Stack spacing={2}>
          <div>
            <FormLabel sx={{ mb: 0.5 }}>Work</FormLabel>
            <Select
              placeholder="Select Work"
              value={selectedWorkId}
              onChange={(_, value) => handleWorkChange(value)}
            >
              {(works || []).map((w) => (
                <Option key={w.MasterWorkId} value={String(w.MasterWorkId)}>
                  {w.WorkName}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <FormLabel sx={{ mb: 0.5 }}>Sub Work</FormLabel>
            <Select
              value={selectedSubWorkId}
              onChange={(_, value) => setSelectedSubWorkId(value)}
              disabled={loadingSubWorks}
            >
              <Option value="all">All Sub Works</Option>
              {subWorksForSelectedWork.map((sw) => (
                <Option key={sw.SubWorkId} value={String(sw.SubWorkId)}>
                  {sw.SubWorkName}
                </Option>
              ))}
            </Select>
            {loadingSubWorks && (
              <Typography
                level="body-xs"
                sx={{ mt: 0.5, color: "neutral.500" }}
              >
                Loading sub works…
              </Typography>
            )}
          </div>

          {error && (
            <Typography level="body-sm" sx={{ color: "danger.500" }}>
              {error}
            </Typography>
          )}

          <Button
            loading={generating}
            disabled={!selectedWorkId}
            onClick={handleGenerate}
          >
            Generate and Download Report
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
