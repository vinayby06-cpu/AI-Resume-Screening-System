import React, { useState, useEffect } from "react";
import axios from "axios";

function RecruiterDashboard() {
  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Get token from localStorage
  const token = localStorage.getItem("recruiterToken");

  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        const res = await axios.get(
          "http://localhost:5000/api/recruiter/candidates",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.data.success) {
          setCandidates(res.data.candidates);
        } else {
          alert("Error fetching candidates: " + res.data.message);
        }
      } catch (err) {
        console.error(err);
        alert("Failed to fetch candidates");
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, [token]);

  // Filter candidates based on search input
  const filteredCandidates = candidates.filter((c) =>
    c.skills.some((skill) =>
      skill.toLowerCase().includes(search.toLowerCase())
    )
  );

  if (loading) return <p>Loading candidates...</p>;

  return (
    <div style={{ padding: "20px" }}>
      <h2>🏆 Top Candidates</h2>
      <input
        type="text"
        placeholder="Search by skill..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: "20px", padding: "8px", width: "300px" }}
      />

      {filteredCandidates.length === 0 ? (
        <p>No candidates found</p>
      ) : (
        <table border="1" cellPadding="10">
          <thead>
            <tr>
              <th>Candidate ID</th>
              <th>Match Score</th>
              <th>Matched Skills</th>
              <th>Missing Skills</th>
            </tr>
          </thead>
          <tbody>
            {filteredCandidates.map((c) => (
              <tr key={c._id}>
                <td>{c.userId}</td>
                <td>{c.matchScore || 0}</td>
                <td>{c.matchedSkills.join(", ")}</td>
                <td>{c.missingSkills.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default RecruiterDashboard;