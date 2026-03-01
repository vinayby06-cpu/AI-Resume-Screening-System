import React, { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const getToken = () => localStorage.getItem("token") || "";
const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

// 🔥 API helper (JSON)
async function apiFetch(path, options = {}) {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = { message: "Server returned non-JSON response" };
  }

  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}

export default function JobSeekerDashboard() {
  const user = useMemo(() => getUser(), []);
  const name = user?.name || "Job Seeker";

  // Jobs
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");

  // Inputs
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");

  // Results
  const [analysisId, setAnalysisId] = useState(null);
  const [atsScore, setAtsScore] = useState(null);
  const [matchedSkills, setMatchedSkills] = useState([]);
  const [missingSkills, setMissingSkills] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  // History
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");

  // ✅ History Filters
  const [historyQuery, setHistoryQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // UI
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // -----------------------------
  // Load Jobs + History
  // -----------------------------
  const loadJobs = async () => {
    const data = await apiFetch("/api/jobs");
    setJobs(Array.isArray(data) ? data : []);
    if (!selectedJobId && Array.isArray(data) && data.length) {
      setSelectedJobId(data[0]._id);
    }
  };

  const loadHistory = async () => {
    try {
      setHistoryError("");
      const data = await apiFetch("/api/jobseeker/history");
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      setHistoryError(e.message || "Failed to load history");
    }
  };

  useEffect(() => {
    loadJobs().catch(() => {});
    loadHistory().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // Analyze Resume
  // -----------------------------
  const handleAnalyze = async () => {
    if (!resumeFile) {
      showToast("Please choose a resume file.");
      return;
    }

    setLoading(true);
    try {
      const token = getToken();

      const formData = new FormData();
      formData.append("resume", resumeFile);
      formData.append("jobId", selectedJobId || "");
      formData.append("jobDescription", jobDescription || "");

      const res = await fetch(`${API_BASE}/api/jobseeker/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Analyze failed");

      setAnalysisId(data.analysisId || data._id || null);

      setAtsScore(data.atsScore ?? 0);
      setMatchedSkills(Array.isArray(data.matchedSkills) ? data.matchedSkills : []);
      setMissingSkills(Array.isArray(data.missingSkills) ? data.missingSkills : []);
      setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : []);

      showToast("Resume analyzed successfully!");
      await loadHistory();
    } catch (e) {
      showToast(e.message || "Analyze failed");
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------
  // Apply to Job
  // -----------------------------
  const handleApply = async () => {
    if (!analysisId) {
      showToast("Analyze resume first.");
      return;
    }

    setLoading(true);
    try {
      await apiFetch("/api/jobseeker/apply", {
        method: "POST",
        body: JSON.stringify({ analysisId }),
      });

      showToast("Applied successfully!");
      await loadHistory();
    } catch (e) {
      showToast(e.message || "Apply failed");
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------
  // Download Report PDF
  // -----------------------------
  const handleDownloadReport = async () => {
    if (!analysisId) {
      showToast("Analyze resume first.");
      return;
    }

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/jobseeker/report/${analysisId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to download report");

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `ATS_Report_${analysisId}.pdf`;
      a.click();

      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      showToast(e.message || "Download failed");
    }
  };

  // -----------------------------
  // Logout
  // -----------------------------
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
  };

  const scoreSafe = typeof atsScore === "number" ? clamp(atsScore, 0, 100) : 0;

  // ✅ Filtered history (search + status)
  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    const s = (statusFilter || "all").toLowerCase();

    return history
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .filter((h) => {
        const statusOk = s === "all" ? true : (h.status || "").toLowerCase() === s;

        if (!q) return statusOk;

        const jobTitle = (h.jobTitle || "custom jd").toLowerCase();
        const matched = (h.matchedSkills || []).join(" ").toLowerCase();
        const missing = (h.missingSkills || []).join(" ").toLowerCase();
        const status = (h.status || "").toLowerCase();

        const qOk =
          jobTitle.includes(q) ||
          matched.includes(q) ||
          missing.includes(q) ||
          status.includes(q) ||
          String(h.atsScore ?? "").includes(q);

        return statusOk && qOk;
      });
  }, [history, historyQuery, statusFilter]);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.topBar}>
        <div>
          {/* ✅ SIMPLE HEADING (reduced size + reduced weight) */}
          <h1 style={styles.h1}>Job Seeker Dashboard</h1>
          <div style={styles.muted}>Upload resume, analyze ATS score, and apply to jobs.</div>
        </div>

        <div style={styles.rightHeader}>
          <div style={styles.muted}>
            Hello, <b style={{ color: "#111827" }}>{name}</b>
          </div>
          <button style={styles.btnOutline} onClick={logout}>
            <IconLogout />
            Logout
          </button>
        </div>
      </div>

      {toast ? <div style={styles.toast}>{toast}</div> : null}
      {loading ? <div style={styles.loading}>Loading...</div> : null}
      {historyError ? <div style={styles.error}>⚠ {historyError}</div> : null}

      {/* Upload & Analyze */}
      <div style={styles.card}>
        <h2 style={styles.h2}>Upload & Analyze Resume</h2>

        <div style={styles.row}>
          <select
            style={styles.select}
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
          >
            {jobs.length === 0 ? (
              <option value="">No jobs found</option>
            ) : (
              jobs.map((j) => (
                <option key={j._id} value={j._id}>
                  {j.title}
                </option>
              ))
            )}
          </select>

          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
            style={styles.fileInput}
          />
        </div>

        <textarea
          style={styles.textarea}
          placeholder="Paste Job Description here (optional if job selected)"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />

        <button style={styles.btn} onClick={handleAnalyze}>
          <IconSearch />
          Analyze Resume
        </button>
      </div>

      {/* Analysis Result */}
      <div style={styles.card}>
        <h2 style={styles.h2}>Analysis Result</h2>

        {atsScore === null ? (
          <div style={styles.muted}>No analysis yet. Upload a resume and click Analyze.</div>
        ) : (
          <>
            <div style={styles.scoreRow}>
              {/* ✅ Donut */}
              <div style={styles.donutWrap}>
                <Donut value={scoreSafe} />
                <div style={{ marginTop: 10 }}>
                  <div style={styles.muted}>ATS Score</div>
                  <div style={styles.scoreLine}>
                    <div style={styles.scoreText}>{scoreSafe}%</div>
                    <span style={scoreBadgeStyle(scoreSafe)}>
                      {scoreSafe >= 70 ? "Good" : scoreSafe >= 50 ? "Average" : "Low"}
                    </span>
                  </div>
                </div>
              </div>

              {/* ✅ Actions */}
              <div style={styles.actionGroup}>
                <button style={styles.btnOutline} onClick={handleApply}>
                  <IconSend />
                  Apply to Job
                </button>
                <button style={styles.btnOutline} onClick={handleDownloadReport}>
                  <IconDownload />
                  Download Report
                </button>
              </div>
            </div>

            {/* Responsive Grid */}
            <div style={styles.grid}>
              <div style={styles.box}>
                <h3 style={styles.h3}>Matched Skills</h3>
                {matchedSkills.length ? (
                  <div style={styles.tags}>
                    {matchedSkills.map((s, i) => (
                      <span key={i} style={styles.tagOk}>
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={styles.muted}>No matched skills found.</div>
                )}
              </div>

              <div style={styles.box}>
                <h3 style={styles.h3}>Missing Skills</h3>
                {missingSkills.length ? (
                  <div style={styles.tags}>
                    {missingSkills.map((s, i) => (
                      <span key={i} style={styles.tagWarn}>
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={styles.muted}>No missing skills found.</div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <h3 style={styles.h3}>Recommendations</h3>
              {recommendations.length ? (
                <ul style={styles.ul}>
                  {recommendations.map((r, i) => (
                    <li key={i} style={styles.li}>
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={styles.muted}>No recommendations.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* History */}
      <div style={styles.card}>
        <div style={styles.rowBetween}>
          <h2 style={styles.h2}>View History</h2>
          <button style={styles.btnSmall} onClick={loadHistory}>
            <IconRefresh />
            Refresh
          </button>
        </div>

        {/* ✅ Filters */}
        <div style={styles.filterRow}>
          <input
            style={styles.input}
            placeholder="Search history (job, skills, status, score)..."
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
          />

          <select
            style={styles.selectSmall}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="applied">Applied</option>
            <option value="selected">Selected</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="rejected">Rejected</option>
          </select>

          <button
            style={styles.btnOutline}
            onClick={() => {
              setHistoryQuery("");
              setStatusFilter("all");
            }}
          >
            Clear
          </button>
        </div>

        {filteredHistory.length === 0 ? (
          <div style={styles.muted}>No history found.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Job</th>
                  <th style={styles.th}>ATS</th>
                  <th style={styles.th}>Matched</th>
                  <th style={styles.th}>Missing</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => (
                  <tr key={h._id}>
                    <td style={styles.td}>{h.jobTitle || "Custom JD"}</td>
                    <td style={styles.td}>
                      <b>{h.atsScore ?? 0}%</b>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.tableSkillWrap}>
                        {(h.matchedSkills || []).length ? (
                          (h.matchedSkills || []).map((s, i) => (
                            <span key={i} style={styles.tablePillOk}>
                              {s}
                            </span>
                          ))
                        ) : (
                          <span style={styles.mutedSmall}>-</span>
                        )}
                      </div>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.tableSkillWrap}>
                        {(h.missingSkills || []).length ? (
                          (h.missingSkills || []).map((s, i) => (
                            <span key={i} style={styles.tablePillWarn}>
                              {s}
                            </span>
                          ))
                        ) : (
                          <span style={styles.mutedSmall}>-</span>
                        )}
                      </div>
                    </td>

                    <td style={styles.td}>
                      <span style={statusBadgeStyle(h.status)}>{h.status || "-"}</span>
                    </td>

                    <td style={styles.td}>
                      {h.createdAt ? new Date(h.createdAt).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={styles.mutedSmall}>Tip: On mobile, scroll table sideways.</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------ UI helpers ------------------ */

function clamp(n, min, max) {
  const x = Number.isFinite(Number(n)) ? Number(n) : 0;
  return Math.max(min, Math.min(max, x));
}

function Donut({ value }) {
  const v = clamp(value, 0, 100);
  const donutStyle = {
    ...styles.donut,
    background: `conic-gradient(#111827 ${v * 3.6}deg, #e5e7eb 0deg)`,
  };

  return (
    <div style={donutStyle} aria-label={`ATS score ${v}%`}>
      <div style={styles.donutInner}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{v}%</div>
        <div style={styles.mutedSmall}>ATS</div>
      </div>
    </div>
  );
}

function scoreBadgeStyle(score) {
  const base = {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    color: "#111827",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  if (score >= 70)
    return { ...base, background: "#dcfce7", borderColor: "#bbf7d0", color: "#166534" };
  if (score >= 50)
    return { ...base, background: "#ffedd5", borderColor: "#fed7aa", color: "#9a3412" };
  return { ...base, background: "#fee2e2", borderColor: "#fecaca", color: "#991b1b" };
}

function statusBadgeStyle(status) {
  const s = (status || "").toLowerCase();
  const base = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    color: "#111827",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  if (s === "applied")
    return { ...base, background: "#dbeafe", borderColor: "#bfdbfe", color: "#1d4ed8" };
  if (s === "selected" || s === "shortlisted")
    return { ...base, background: "#dcfce7", borderColor: "#bbf7d0", color: "#166534" };
  if (s === "rejected")
    return { ...base, background: "#fee2e2", borderColor: "#fecaca", color: "#991b1b" };
  if (s === "pending")
    return { ...base, background: "#ffedd5", borderColor: "#fed7aa", color: "#9a3412" };

  return base;
}

/* ------------------ Inline SVG Icons (no packages) ------------------ */
function IconBase({ children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginRight: 8 }}
        aria-hidden="true"
      >
        {children}
      </svg>
    </span>
  );
}

function IconLogout() {
  return (
    <IconBase>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </IconBase>
  );
}
function IconSearch() {
  return (
    <IconBase>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </IconBase>
  );
}
function IconSend() {
  return (
    <IconBase>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </IconBase>
  );
}
function IconDownload() {
  return (
    <IconBase>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </IconBase>
  );
}
function IconRefresh() {
  return (
    <IconBase>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14" />
    </IconBase>
  );
}

/* ------------------ Styles ------------------ */
const styles = {
  page: {
    padding: 24,
    maxWidth: 1140,
    margin: "0 auto",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
    color: "#111827",
    background: "#ffffff",
  },

  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 8,
    flexWrap: "wrap",
  },

  rightHeader: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  // ✅ SIMPLE HEADING STYLE
  h1: { margin: 0, fontSize: 18, fontWeight: 600 },
  h2: { marginTop: 0, marginBottom: 12, fontSize: 15, fontWeight: 600 },
  h3: { margin: "0 0 10px", fontSize: 14, fontWeight: 600 },

  muted: { color: "#6b7280", fontSize: 13 },
  mutedSmall: { color: "#6b7280", fontSize: 12, marginTop: 10 },

  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 18,
    marginTop: 16,
    background: "#fff",
  },

  row: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  filterRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
  },

  input: {
    flex: "1 1 320px",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    outline: "none",
    fontSize: 14,
    color: "#111827",
    background: "#fff",
  },

  select: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    minWidth: 320,
    fontSize: 14,
    background: "#fff",
    color: "#111827",
  },

  selectSmall: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    fontSize: 14,
    background: "#fff",
    color: "#111827",
  },

  fileInput: { fontSize: 14 },

  textarea: {
    width: "100%",
    height: 120,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    resize: "vertical",
    fontSize: 14,
    fontFamily: "inherit",
    color: "#111827",
    outline: "none",
  },

  btn: {
    width: "100%",
    marginTop: 12,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  btnOutline: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    color: "#111827",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  btnSmall: {
    padding: "9px 12px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  toast: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    fontSize: 14,
  },

  error: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #fecaca",
    background: "#fee2e2",
    fontSize: 14,
  },

  loading: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    fontSize: 14,
  },

  scoreRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },

  donutWrap: {
    display: "flex",
    gap: 16,
    alignItems: "center",
    flexWrap: "wrap",
  },

  donut: {
    width: 92,
    height: 92,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
  },

  donutInner: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "#fff",
    border: "1px solid #e5e7eb",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
  },

  scoreLine: { display: "flex", alignItems: "center", gap: 10, marginTop: 6 },
  scoreText: { fontSize: 24, fontWeight: 700, lineHeight: 1.05 },

  actionGroup: { display: "flex", gap: 10, flexWrap: "wrap" },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 12,
    marginTop: 12,
  },

  box: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 14,
    background: "#fafafa",
  },

  tags: { display: "flex", flexWrap: "wrap", gap: 8 },

  tagOk: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #bbf7d0",
    background: "#dcfce7",
    fontSize: 13,
    fontWeight: 700,
    color: "#166534",
  },

  tagWarn: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #fed7aa",
    background: "#ffedd5",
    fontSize: 13,
    fontWeight: 700,
    color: "#9a3412",
  },

  ul: { margin: "8px 0 0", paddingLeft: 18 },
  li: { marginBottom: 6, color: "#111827", fontSize: 14 },

  table: { width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 900 },

  th: {
    textAlign: "left",
    padding: "12px 10px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
    fontSize: 13,
    fontWeight: 700,
    color: "#374151",
    whiteSpace: "nowrap",
  },

  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #f3f4f6",
    color: "#111827",
    verticalAlign: "top",
  },

  tableSkillWrap: {
    display: "flex",
    gap: 6,
    flexWrap: "nowrap",
    overflowX: "auto",
    maxWidth: 320,
    paddingBottom: 4,
  },

  tablePillOk: {
    whiteSpace: "nowrap",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #bbf7d0",
    background: "#dcfce7",
    fontSize: 12,
    fontWeight: 700,
    color: "#166534",
  },

  tablePillWarn: {
    whiteSpace: "nowrap",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #fed7aa",
    background: "#ffedd5",
    fontSize: 12,
    fontWeight: 700,
    color: "#9a3412",
  },
};