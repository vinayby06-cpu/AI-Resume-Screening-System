import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";

// ✅ Backend API
const API =
  process.env.REACT_APP_API_BASE ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://ai-resume-screening-system-vinay.onrender.com");

export default function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/auth/login`, formData, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.user.role);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      const role = res.data.user.role;
      if (role === "admin") navigate("/admin-dashboard");
      else if (role === "recruiter") navigate("/recruiter-dashboard");
      else navigate("/jobseeker-dashboard");
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        (err?.code === "ECONNABORTED" ? "Request timeout. Try again." : null) ||
        "Login failed ❌";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>AI Resume Screening</h2>
        <h3 style={styles.subtitle}>Login</h3>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            required
            style={styles.input}
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
            style={styles.input}
          />

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Logging in..." : "Login"}
          </button>

          <Link to="/register" style={styles.registerBtn}>
            Create New Account
          </Link>
        </form>

        <p style={styles.footerText}>
          Forgot password?{" "}
          <span
            style={styles.forgotText}
            onClick={() => alert("Add Forgot Password Page")}
          >
            Click here
          </span>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    width: "100%",
    backgroundColor: "#ffffff",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  card: {
    width: "420px",
    padding: "40px",
    borderRadius: "12px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
    textAlign: "center",
    backgroundColor: "#fff",
  },

  title: {
    fontSize: "26px",
    marginBottom: "6px",
    fontWeight: "600",
    color: "#111827",
  },

  subtitle: {
    fontSize: "18px",
    marginBottom: "25px",
    color: "#555",
  },

  form: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },

  input: {
    padding: "12px",
    fontSize: "15px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    outline: "none",
  },

  button: {
    padding: "12px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#111827",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "0.3s ease",
  },

  registerBtn: {
    display: "block",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #111827",
    backgroundColor: "#ffffff",
    color: "#111827",
    fontSize: "16px",
    fontWeight: "600",
    textDecoration: "none",
    cursor: "pointer",
    transition: "0.3s ease",
  },

  footerText: {
    marginTop: "20px",
    fontSize: "14px",
    color: "#444",
  },

  forgotText: {
    color: "#111827",
    fontWeight: "600",
    cursor: "pointer",
    textDecoration: "underline",
  },
};