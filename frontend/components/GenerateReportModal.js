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
// Loads ALL sub works (across every project) once when the modal opens,
// then filters them client-side by the selected Work — no extra network
// round trip when the Work dropdown changes.
//
// Assumes a backend endpoint `GET /api/sub-works` that returns every sub
// work with its owning ProjectId, e.g.:
//   { data: [{ SubWorkId, SubWorkName, ProjectId }, ...] }
// If your backend only has the project-scoped `/api/load-sub-works/`,
// swap the fetch below for that and drop the client-side filter.
// ─────────────────────────────────────────────────────────────────────────────

export default function GenerateReportModal({
  open,
  onClose,
  API_BASE,
  projects, // [{ ProjectId, ProjectName }, ...]
  defaultProjectId, // optional — pre-select whatever Work the user already has selected
}) {
  const [allSubWorks, setAllSubWorks] = useState([]);
  const [loadingSubWorks, setLoadingSubWorks] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(
    defaultProjectId ? String(defaultProjectId) : "",
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

  const handleProjectChange = (projectId) => {
    console.log("Handling Project Change. New ProjectId:", projectId);
    setSelectedProjectId(projectId);
    setSelectedSubWorkId("all");
    // loadSpecificSubWorks(projectId);
    // console.log(subWorksForSelectedProject);
  };

  const subWorksForSelectedProject = selectedProjectId
    ? allSubWorks.filter(
        (sw) => String(sw.ProjectId) === String(selectedProjectId),
      )
    : [];

  {
    console.log("Sub works for selected project:", subWorksForSelectedProject);
  }

  const handleGenerate = async () => {
    if (!selectedProjectId) {
      setError("Please select a Work first.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const params = new URLSearchParams({
        projectId: Number(selectedProjectId),
        subWorkId: selectedSubWorkId, // "all" or a specific SubWorkId
      });

      const res = await fetch(
        `${API_BASE}/api/generate-report?${params.toString()}`,
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Report generation failed.");
      }

      const projectName =
        projects?.find((p) => String(p.ProjectId) === String(selectedProjectId))
          ?.ProjectName || "Abstract";

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = projectName.replace(/[^\w\-]+/g, "_");
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
              value={selectedProjectId}
              onChange={(_, value) => handleProjectChange(value)}
            >
              {(projects || []).map((p) => (
                <Option key={p.ProjectId} value={String(p.ProjectId)}>
                  {p.ProjectName}
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
              {subWorksForSelectedProject.map((sw) => (
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
            disabled={!selectedProjectId}
            onClick={handleGenerate}
          >
            Generate and Download Report
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
