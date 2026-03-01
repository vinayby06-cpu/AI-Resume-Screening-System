import React, { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";
const getToken = () => localStorage.getItem("token") || "";

async function apiFetch(path, options = {}) {
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = { message: "Server returned non-JSON response" };
  }

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
    return Promise.reject(new Error("Session expired. Please login again."));
  }

  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}

export default function AdminDashboard() {
  const [tab, setTab] = useState("analytics");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  const [users, setUsers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [logs, setLogs] = useState([]);

  const [analytics, setAnalytics] = useState({
    totalUsers: 0,
    totalRecruiters: 0,
    totalJobSeekers: 0,
    totalJobs: 0,
    totalResumes: 0,
    totalLogs: 0,
    avgScore: 0,
  });

  const [userSearch, setUserSearch] = useState("");
  const [jobSearch, setJobSearch] = useState("");

  const [settings, setSettings] = useState({
    allowRegistration: true,
    enableResumeUpload: true,
    maintenanceMode: false,
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.role || "").toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        (j.title || "").toLowerCase().includes(q) ||
        (j.postedBy || "").toLowerCase().includes(q)
    );
  }, [jobs, jobSearch]);

  // -------------------------
  // Loaders
  // -------------------------
  const loadAnalytics = async () => {
    const data = await apiFetch("/api/admin/stats");
    setAnalytics({
      totalUsers: data.totalUsers ?? 0,
      totalRecruiters: data.totalRecruiters ?? 0,
      totalJobSeekers: data.totalJobSeekers ?? 0,
      totalJobs: data.totalJobs ?? 0,
      totalResumes: data.totalResumes ?? 0,
      totalLogs: data.totalLogs ?? 0,
      avgScore: data.avgScore ?? 0,
    });
  };

  const loadUsers = async () => {
    const data = await apiFetch("/api/admin/users");
    setUsers(Array.isArray(data) ? data : data.users || []);
  };

  const loadJobs = async () => {
    const data = await apiFetch("/api/admin/jobs");
    setJobs(Array.isArray(data) ? data : data.jobs || []);
  };

  const loadResumes = async () => {
    const data = await apiFetch("/api/admin/resumes");
    setResumes(Array.isArray(data) ? data : data.items || []);
  };

  const loadLogs = async () => {
    const data = await apiFetch("/api/admin/logs");
    setLogs(Array.isArray(data) ? data : data.items || []);
  };

  const loadTabData = async (selectedTab) => {
    setLoading(true);
    try {
      if (!getToken()) {
        showToast("Token not found. Please login again.");
        window.location.href = "/login";
        return;
      }

      if (selectedTab === "analytics") await loadAnalytics();
      if (selectedTab === "users") await loadUsers();
      if (selectedTab === "jobs") await loadJobs();
      if (selectedTab === "resumes") await loadResumes();
      if (selectedTab === "logs") await loadLogs();
    } catch (e) {
      showToast(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTabData(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // -------------------------
  // Actions
  // -------------------------
  const updateUserRole = async (userId, role) => {
    setLoading(true);
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      showToast("Role updated");
      await loadUsers();
    } catch (e) {
      showToast(e.message || "Role update failed");
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm("Delete this user?")) return;
    setLoading(true);
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      showToast("User deleted");
      await loadUsers();
    } catch (e) {
      showToast(e.message || "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  const updateJobStatus = async (jobId, status) => {
    setLoading(true);
    try {
      await apiFetch(`/api/admin/jobs/${jobId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      showToast("Job status updated");
      await loadJobs();
    } catch (e) {
      showToast(e.message || "Job update failed");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/admin/settings`, {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      showToast("Settings saved");
    } catch (e) {
      showToast(e.message || "Settings save failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          {/* ✅ Simple heading (not highlighted) */}
          <h2 style={styles.h2}>Admin Dashboard</h2>
          <p style={styles.subText}>
            Manage users, recruiters, resumes, jobs, analytics, settings & logs
          </p>
        </div>

        <button
          style={styles.btnOutline}
          onClick={() => {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "/login";
          }}
        >
          Logout
        </button>
      </div>

      <div style={styles.tabs}>
        <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")}>
          Analytics
        </TabButton>
        <TabButton active={tab === "users"} onClick={() => setTab("users")}>
          Manage Users & Recruiters
        </TabButton>
        <TabButton active={tab === "resumes"} onClick={() => setTab("resumes")}>
          View Resumes (Screening Results)
        </TabButton>
        <TabButton active={tab === "jobs"} onClick={() => setTab("jobs")}>
          Monitor Jobs
        </TabButton>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
          System Settings
        </TabButton>
        <TabButton active={tab === "logs"} onClick={() => setTab("logs")}>
          Access Logs
        </TabButton>
      </div>

      {toast ? <div style={styles.toast}>{toast}</div> : null}
      {loading ? <div style={styles.loading}>Loading...</div> : null}

      <div style={styles.card}>
        {tab === "analytics" && (
          <AnalyticsPanel analytics={analytics} onRefresh={() => loadTabData("analytics")} />
        )}

        {tab === "users" && (
          <div>
            <div style={styles.rowBetween}>
              <h3 style={styles.h3}>Users & Recruiters</h3>
              <button style={styles.btn} onClick={() => loadTabData("users")}>
                Refresh
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <input
                style={styles.input}
                placeholder="Search by name/email/role..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Created</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u._id}>
                      <td style={styles.td}>{u.name || "-"}</td>
                      <td style={styles.td}>{u.email || "-"}</td>
                      <td style={styles.td}>
                        <span style={badgeStyle(u.role)}>{u.role}</span>
                      </td>
                      <td style={styles.td}>
                        {u.createdAt ? new Date(u.createdAt).toLocaleString() : "-"}
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <select
                            style={styles.select}
                            value={u.role}
                            onChange={(e) => updateUserRole(u._id, e.target.value)}
                          >
                            <option value="admin">admin</option>
                            <option value="recruiter">recruiter</option>
                            <option value="jobseeker">jobseeker</option>
                          </select>

                          <button style={styles.btnDanger} onClick={() => deleteUser(u._id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredUsers.length === 0 && (
                    <tr>
                      <td style={styles.td} colSpan={5}>
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ✅ RESUMES SCREENING RESULTS */}
        {tab === "resumes" && (
          <div>
            <div style={styles.rowBetween}>
              <h3 style={styles.h3}>All Resume Screening Results</h3>
              <button style={styles.btn} onClick={() => loadTabData("resumes")}>
                Refresh
              </button>
            </div>

            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Candidate</th>
                    <th style={styles.th}>Recruiter</th>
                    <th style={styles.th}>Job</th>
                    <th style={styles.th}>Match %</th>
                    <th style={styles.th}>Matched Skills</th>
                    <th style={styles.th}>Missing Skills</th>
                    <th style={styles.th}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {resumes.map((r) => (
                    <tr key={r._id}>
                      <td style={styles.td}>{r.userEmail || "-"}</td>
                      <td style={styles.td}>{r.recruiterEmail || "-"}</td>
                      <td style={styles.td}>{r.jobTitle || "Custom JD"}</td>
                      <td style={styles.td}>
                        <b>{r.atsScore ?? 0}%</b>
                      </td>
                      <td style={styles.td}>
                        {(r.matchedSkills || []).slice(0, 6).join(", ")}
                        {(r.matchedSkills || []).length > 6 ? "..." : ""}
                      </td>
                      <td style={styles.td}>
                        {(r.missingSkills || []).slice(0, 6).join(", ")}
                        {(r.missingSkills || []).length > 6 ? "..." : ""}
                      </td>
                      <td style={styles.td}>
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}

                  {resumes.length === 0 && (
                    <tr>
                      <td style={styles.td} colSpan={7}>
                        No resume screening records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ✅ JOBS */}
        {tab === "jobs" && (
          <div>
            <div style={styles.rowBetween}>
              <h3 style={styles.h3}>Jobs (Monitor)</h3>
              <button style={styles.btn} onClick={() => loadTabData("jobs")}>
                Refresh
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <input
                style={styles.input}
                placeholder="Search jobs by title or recruiter email..."
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
              />
            </div>

            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Title</th>
                    <th style={styles.th}>Posted By</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Created</th>
                    <th style={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((j) => (
                    <tr key={j._id}>
                      <td style={styles.td}>{j.title || "-"}</td>
                      <td style={styles.td}>{j.postedBy || "-"}</td>
                      <td style={styles.td}>
                        <span style={badgeStyle(j.status || "pending")}>
                          {j.status || "pending"}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {j.createdAt ? new Date(j.createdAt).toLocaleString() : "-"}
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button style={styles.btn} onClick={() => updateJobStatus(j._id, "approved")}>
                            Approve
                          </button>
                          <button
                            style={styles.btnDanger}
                            onClick={() => updateJobStatus(j._id, "rejected")}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredJobs.length === 0 && (
                    <tr>
                      <td style={styles.td} colSpan={5}>
                        No jobs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ✅ SETTINGS */}
        {tab === "settings" && (
          <div>
            <div style={styles.rowBetween}>
              <h3 style={styles.h3}>System Settings</h3>
              <button style={styles.btn} onClick={saveSettings}>
                Save Settings
              </button>
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <ToggleRow
                label="Allow user registration"
                value={settings.allowRegistration}
                onChange={(v) => setSettings((p) => ({ ...p, allowRegistration: v }))}
              />
              <ToggleRow
                label="Enable resume upload"
                value={settings.enableResumeUpload}
                onChange={(v) => setSettings((p) => ({ ...p, enableResumeUpload: v }))}
              />
              <ToggleRow
                label="Maintenance mode"
                value={settings.maintenanceMode}
                onChange={(v) => setSettings((p) => ({ ...p, maintenanceMode: v }))}
              />
            </div>
          </div>
        )}

        {/* ✅ LOGS */}
        {tab === "logs" && (
          <div>
            <div style={styles.rowBetween}>
              <h3 style={styles.h3}>System Logs</h3>
              <button style={styles.btn} onClick={() => loadTabData("logs")}>
                Refresh
              </button>
            </div>

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Time</th>
                    <th style={styles.th}>Level</th>
                    <th style={styles.th}>Message</th>
                    <th style={styles.th}>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, idx) => (
                    <tr key={l._id || idx}>
                      <td style={styles.td}>
                        {l.createdAt ? new Date(l.createdAt).toLocaleString() : "-"}
                      </td>
                      <td style={styles.td}>
                        <span style={badgeStyle(l.level || "info")}>{l.level || "info"}</span>
                      </td>
                      <td style={styles.td}>{l.message || "-"}</td>
                      <td style={styles.td}>{l.actor || "-"}</td>
                    </tr>
                  ))}

                  {logs.length === 0 && (
                    <tr>
                      <td style={styles.td} colSpan={4}>
                        No logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tabBtn,
        ...(active ? styles.tabActive : {}),
      }}
    >
      {children}
    </button>
  );
}

function AnalyticsPanel({ analytics, onRefresh }) {
  return (
    <div>
      <div style={styles.rowBetween}>
        <h3 style={styles.h3}>Analytics</h3>
        <button style={styles.btn} onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <div style={styles.grid}>
        <StatCard label="Total Users" value={analytics.totalUsers} />
        <StatCard label="Recruiters" value={analytics.totalRecruiters} />
        <StatCard label="Job Seekers" value={analytics.totalJobSeekers} />
        <StatCard label="Jobs" value={analytics.totalJobs} />
        <StatCard label="Resumes" value={analytics.totalResumes} />
        <StatCard label="Avg Match Score" value={`${analytics.avgScore}%`} />
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div style={styles.toggleRow}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          {value ? "Enabled" : "Disabled"}
        </div>
      </div>
      <button style={value ? styles.btn : styles.btnOutline} onClick={() => onChange(!value)}>
        {value ? "ON" : "OFF"}
      </button>
    </div>
  );
}

function badgeStyle(type) {
  const base = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    color: "#111827",
  };

  if (type === "admin") return { ...base, background: "#fee2e2", borderColor: "#fecaca" };
  if (type === "recruiter") return { ...base, background: "#dbeafe", borderColor: "#bfdbfe" };
  if (type === "jobseeker") return { ...base, background: "#dcfce7", borderColor: "#bbf7d0" };

  if (type === "approved") return { ...base, background: "#dcfce7", borderColor: "#bbf7d0" };
  if (type === "rejected") return { ...base, background: "#fee2e2", borderColor: "#fecaca" };
  if (type === "pending") return { ...base, background: "#ffedd5", borderColor: "#fed7aa" };

  if (type === "error") return { ...base, background: "#fee2e2", borderColor: "#fecaca" };
  if (type === "warn") return { ...base, background: "#ffedd5", borderColor: "#fed7aa" };

  return base;
}

// ✅ UPDATED: Simple heading (reduced size + weight)
const styles = {
  page: {
    padding: 24,
    maxWidth: 1240,
    margin: "0 auto",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
    color: "#111827",
    background: "#ffffff",
  },

  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
  },

  // ✅ SIMPLE Heading
  h2: { margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" },
  h3: { margin: 0, fontSize: 15, fontWeight: 600, color: "#111827" },
  subText: { margin: "6px 0 0", color: "#6b7280", fontSize: 13 },

  tabs: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 },

  tabBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    color: "#111827",
  },

  tabActive: { borderColor: "#111827", background: "#f3f4f6" },

  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 18,
    background: "#ffffff",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginTop: 14,
  },

  statCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
    background: "#fafafa",
  },

  statLabel: { color: "#6b7280", fontSize: 12, fontWeight: 600 },
  statValue: { fontSize: 18, fontWeight: 700, marginTop: 6, color: "#111827" },

  rowBetween: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  input: {
    width: "100%",
    maxWidth: 460,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    outline: "none",
    fontSize: 13,
    color: "#111827",
  },

  select: {
    padding: "9px 10px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    fontSize: 13,
    color: "#111827",
    background: "#ffffff",
  },

  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },

  th: {
    textAlign: "left",
    padding: "12px 10px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
    fontSize: 12,
    fontWeight: 700,
    color: "#374151",
  },

  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "top",
    color: "#111827",
    fontSize: 13,
  },

  btn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#111827",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },

  btnOutline: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#ffffff",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    color: "#111827",
  },

  btnDanger: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #dc2626",
    background: "#dc2626",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },

  toast: {
    padding: "10px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#ffffff",
    marginBottom: 12,
    fontSize: 13,
    color: "#111827",
  },

  loading: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    marginBottom: 12,
    fontSize: 13,
    color: "#111827",
  },

  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 14,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "#fafafa",
  },
};