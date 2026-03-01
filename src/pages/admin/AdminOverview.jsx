import { useEffect, useState } from "react";

export default function AdminOverview() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("http://localhost:5000/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  if (!stats) return <p>Loading...</p>;

  return (
    <div>
      <h2>Overview</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <Card title="Total Users" value={stats.totalUsers} />
        <Card title="Recruiters" value={stats.totalRecruiters} />
        <Card title="Job Seekers" value={stats.totalJobSeekers} />
        <Card title="Jobs" value={stats.totalJobs} />
        <Card title="Resumes" value={stats.totalResumes} />
        <Card title="Avg Match Score" value={`${stats.avgScore}%`} />
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 10 }}>
      <p style={{ margin: 0, opacity: 0.7 }}>{title}</p>
      <h3 style={{ margin: "8px 0 0" }}>{value}</h3>
    </div>
  );
}