import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API = "http://localhost:5000";

export default function RecruiterDashboard() {
  // ===== Router =====
  const navigate = useNavigate();

  // ===== Auth =====
  const token = localStorage.getItem("token");

  // ===== Analytics =====
  const [analytics, setAnalytics] = useState({
    totalJobs: 0,
    totalCandidates: 0,
    averageATS: 0,
  });

  // ===== Jobs =====
  const [jobs, setJobs] = useState([]);
  const [jobForm, setJobForm] = useState({ title: "", skills: "" });
  const [postingJob, setPostingJob] = useState(false);

  // ===== Candidates =====
  const [candidates, setCandidates] = useState([]);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);

  // ===== Filters =====
  const [minScore, setMinScore] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | Pending | Shortlisted | Rejected
  const [search, setSearch] = useState("");

  // ===== UI / Errors =====
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ----------------- Helpers -----------------
  const authHeader = useMemo(() => {
    return { headers: { Authorization: `Bearer ${token}` } };
  }, [token]);

  const parseSkills = (skillsText) => {
    return skillsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  // ✅ Logout
  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  // ✅ Protect route (if no token, go login)
  useEffect(() => {
    if (!token) {
      navigate("/login");
    }
  }, [token, navigate]);

  // ----------------- API Calls -----------------
  const fetchAnalytics = async () => {
    const res = await axios.get(`${API}/api/analytics`, authHeader);
    setAnalytics(res.data || { totalJobs: 0, totalCandidates: 0, averageATS: 0 });
  };

  const fetchJobs = async () => {
    const res = await axios.get(`${API}/api/recruiter/jobs`, authHeader);
    setJobs(res.data?.jobs || []);
  };

  const fetchCandidates = async () => {
    const res = await axios.get(`${API}/api/recruiter/candidates`, authHeader);
    setCandidates(res.data?.candidates || []);
  };

  const refreshAll = async () => {
    try {
      setError("");
      setLoading(true);

      if (!token) {
        setError("No token found. Please login again.");
        setLoading(false);
        return;
      }

      await Promise.all([fetchAnalytics(), fetchJobs(), fetchCandidates()]);
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        "Failed to load dashboard data.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------- Actions -----------------
  const handlePostJob = async (e) => {
    e.preventDefault();
    try {
      setPostingJob(true);
      setError("");

      const title = jobForm.title.trim();
      const skillsArr = parseSkills(jobForm.skills);

      if (!title) {
        setError("Job title is required.");
        return;
      }

      await axios.post(`${API}/api/jobs`, { title, skills: skillsArr }, authHeader);

      setJobForm({ title: "", skills: "" });
      await refreshAll();
      alert("✅ Job posted successfully");
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.message || "Job posting failed.");
    } finally {
      setPostingJob(false);
    }
  };

  const updateCandidateStatus = async (candidateId, status) => {
    try {
      setStatusUpdatingId(candidateId);
      setError("");

      await axios.put(`${API}/api/candidates/${candidateId}`, { status }, authHeader);

      await fetchCandidates();
      await fetchAnalytics();
      alert(`✅ Candidate ${status}`);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.message || "Status update failed.");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // ----------------- Derived Data -----------------
  const filteredCandidates = useMemo(() => {
    let list = [...candidates];

    if (minScore !== "" && !Number.isNaN(Number(minScore))) {
      const ms = Number(minScore);
      list = list.filter((c) => Number(c.atsScore || 0) >= ms);
    }

    if (statusFilter !== "all") {
      list = list.filter((c) => (c.status || "Pending") === statusFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [candidates, minScore, statusFilter, search]);

  // ----------------- UI -----------------
  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1100,
        margin: "0 auto",
        fontSize: 14, // ✅ Normal base font size
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* ✅ Header with Refresh + Logout */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Recruiter Dashboard</h1>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={refreshAll} disabled={loading} style={btn()}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          <button onClick={handleLogout} style={btn("danger")}>
            🚪 Logout
          </button>
        </div>
      </div>

      {error && (
        <div style={alertBox()}>
          <b>⚠️</b> {error}
        </div>
      )}

      {/* ===== Analytics ===== */}
      <section style={section()}>
        <h2 style={h2()}>📊 Analytics</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard label="Total Jobs" value={analytics.totalJobs} />
          <StatCard label="Total Candidates" value={analytics.totalCandidates} />
          <StatCard
            label="Average ATS"
            value={Number(analytics.averageATS || 0).toFixed(2)}
            suffix="%"
          />
        </div>
      </section>

      {/* ===== Post Job ===== */}
      <section style={section()}>
        <h2 style={h2()}>💼 Post a Job</h2>
        <form onSubmit={handlePostJob} style={{ display: "grid", gap: 10 }}>
          <input
            value={jobForm.title}
            onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
            placeholder="Job title (e.g., Frontend Developer)"
            style={input()}
          />
          <input
            value={jobForm.skills}
            onChange={(e) => setJobForm({ ...jobForm, skills: e.target.value })}
            placeholder="Required skills (comma separated) e.g., React, Node, MongoDB"
            style={input()}
          />
          <button type="submit" disabled={postingJob} style={btn("primary")}>
            {postingJob ? "Posting..." : "Post Job"}
          </button>
        </form>

        <div style={{ marginTop: 14 }}>
          <h3 style={h3()}>Posted Jobs</h3>
          {jobs.length === 0 ? (
            <p style={{ margin: 0 }}>No jobs posted yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {jobs.map((j) => (
                <div key={j._id} style={card()}>
                  <div style={{ fontWeight: 700 }}>{j.title}</div>
                  <div style={{ marginTop: 6 }}>
                    <b>Skills:</b> {(j.skills || []).join(", ") || "—"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                    Posted by: {j.postedBy || "—"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                    Status: {j.status || "pending"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== Candidates ===== */}
      <section style={section()}>
        <h2 style={h2()}>👥 Candidates</h2>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="Min ATS score (e.g., 60)"
            style={input(220)}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={input(220)}
          >
            <option value="all">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Rejected">Rejected</option>
          </select>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name/email"
            style={input(260)}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          {loading ? (
            <p>Loading candidates...</p>
          ) : filteredCandidates.length === 0 ? (
            <p>No candidates found for selected filters.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={table()}>
                <thead>
                  <tr>
                    <th style={th()}>Name</th>
                    <th style={th()}>Email</th>
                    <th style={th()}>Job</th>
                    <th style={th()}>ATS Score</th>
                    <th style={th()}>Status</th>
                    <th style={th()}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((c) => (
                    <tr key={c._id}>
                      <td style={td()}>{c.name || "Applicant"}</td>
                      <td style={td()}>{c.email}</td>
                      <td style={td()}>{c.jobTitle || "—"}</td>
                      <td style={td()}>{Number(c.atsScore || 0)}%</td>
                      <td style={td()}>{c.status || "Pending"}</td>
                      <td style={td()}>
                        <button
                          style={btn("success")}
                          disabled={statusUpdatingId === c._id}
                          onClick={() => updateCandidateStatus(c._id, "Shortlisted")}
                        >
                          ✅ Shortlist
                        </button>{" "}
                        <button
                          style={btn("danger")}
                          disabled={statusUpdatingId === c._id}
                          onClick={() => updateCandidateStatus(c._id, "Rejected")}
                        >
                          ❌ Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                Showing {filteredCandidates.length} of {candidates.length} candidates
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ----------------- Small UI helpers -----------------
function StatCard({ label, value, suffix = "" }) {
  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 10,
        padding: 14,
        minWidth: 220,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>
        {value}
        {suffix}
      </div>
    </div>
  );
}

const section = () => ({
  marginTop: 18,
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 12,
  background: "#fff",
});

const h2 = () => ({
  margin: "0 0 10px 0",
  fontSize: 18,
  fontWeight: 600,
});

const h3 = () => ({
  margin: "16px 0 10px 0",
  fontSize: 16,
  fontWeight: 600,
});

const input = (w = "100%") => ({
  width: w,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  outline: "none",
  fontSize: 14, // ✅ normal
});

const btn = (variant) => {
  const base = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #ddd",
    cursor: "pointer",
    background: "#f7f7f7",
    fontSize: 14, // ✅ normal
  };
  if (variant === "primary")
    return { ...base, background: "#111", color: "#fff", border: "1px solid #111" };
  if (variant === "success")
    return { ...base, background: "#e9f8ef", border: "1px solid #b7e5c7" };
  if (variant === "danger")
    return { ...base, background: "#fdecec", border: "1px solid #f2b8b8" };
  return base;
};

const card = () => ({
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
  fontSize: 14,
});

const alertBox = () => ({
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #f2b8b8",
  background: "#fdecec",
  fontSize: 14,
});

const table = () => ({
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 10,
});

const th = () => ({
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "10px 8px",
  background: "#fafafa",
  fontSize: 14, // ✅ normal
});

const td = () => ({
  borderBottom: "1px solid #eee",
  padding: "10px 8px",
  fontSize: 14, // ✅ normal
});