import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

// ✅ Works in BOTH local + deployed (even if Netlify env var is missing)
const API =
  process.env.REACT_APP_API_BASE ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://ai-resume-screening-system-vinay.onrender.com");

function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.role) {
      alert("Please select a role");
      return;
    }

    try {
      const res = await axios.post(`${API}/api/auth/register`, formData, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });

      alert(res.data.message);

      // Redirect based on role
      if (formData.role === "admin") {
        navigate("/admin-dashboard");
      } else if (formData.role === "recruiter") {
        navigate("/recruiter-dashboard");
      } else {
        navigate("/jobseeker-dashboard");
      }
    } catch (error) {
      console.error(error);
      const msg =
        error?.response?.data?.message ||
        (error?.code === "ECONNABORTED" ? "Request timeout. Try again." : null) ||
        "Registration failed ❌";
      alert(msg);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>AI Resume Screening</h2>
      <h3>Register</h3>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "320px",
          margin: "auto",
          gap: "12px",
        }}
      >
        <input
          type="text"
          name="name"
          placeholder="Name"
          value={formData.name}
          onChange={handleChange}
          required
        />

        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
        />

        <select
          name="role"
          value={formData.role}
          onChange={handleChange}
          required
        >
          <option value="">Select Role</option>
          <option value="admin">Admin</option>
          <option value="recruiter">Recruiter</option>
          <option value="jobseeker">Job Seeker</option>
        </select>

        <button type="submit">Register</button>
      </form>
    </div>
  );
}

export default Register;