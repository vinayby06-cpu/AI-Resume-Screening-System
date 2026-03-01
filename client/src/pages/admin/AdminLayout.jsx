import { Link, Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 240, padding: 16, borderRight: "1px solid #ddd" }}>
        <h3>Admin Panel</h3>
        <nav style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link to="/admin">Overview</Link>
          <Link to="/admin/users">Manage Users</Link>
          <Link to="/admin/recruiters">Manage Recruiters</Link>
          <Link to="/admin/resumes">All Resumes</Link>
          <Link to="/admin/jobs">Monitor Jobs</Link>
          <Link to="/admin/logs">Access Logs</Link>
          <Link to="/admin/settings">System Settings</Link>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}