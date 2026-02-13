import React, { useState } from "react";
import "./App.css";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { motion } from "framer-motion";

function App() {
  const [file, setFile] = useState(null);
  const [job, setJob] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // ✅ IMPORTANT: your deployed backend URL
  const API_URL =
    "https://ai-resume-screening-system-fs4i.onrender.com/api/analyze";

  const handleAnalyze = async () => {
    if (!file || !job) {
      alert("Upload resume and enter job description");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("resume", file);
    formData.append("job", job);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error(error);
      alert("Backend not reachable");
    }

    setLoading(false);
  };

  return (
    <div className="app-container">
      {!result ? (
        <motion.div
          className="form-card"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="title">AI Resume Screening</h1>

          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            className="file-input"
          />

          <textarea
            placeholder="Enter Job Description..."
            value={job}
            onChange={(e) => setJob(e.target.value)}
            className="job-input"
          />

          <button onClick={handleAnalyze} className="analyze-btn">
            {loading ? "Analyzing..." : "Analyze Resume"}
          </button>
        </motion.div>
      ) : (
        <motion.div
          className="result-card"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <h2>Analysis Result</h2>

          <div className="circle-wrapper">
            <CircularProgressbar
              value={result.score}
              text={`${result.score}%`}
              styles={buildStyles({
                textColor: "#222",
                pathColor:
                  result.score > 75
                    ? "#4caf50"
                    : result.score > 50
                    ? "#ff9800"
                    : "#f44336",
                trailColor: "#eee",
              })}
            />
          </div>

          <div className="skills-container">
            <div className="skill-box">
              <h3>Matched Skills</h3>
              <div className="tag-container">
                {result.matchedSkills.map((skill, i) => (
                  <span key={i} className="tag green">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="skill-box">
              <h3>Missing Skills</h3>
              <div className="tag-container">
                {result.missingSkills.map((skill, i) => (
                  <span key={i} className="tag red">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button className="back-btn" onClick={() => setResult(null)}>
            Analyze Another Resume
          </button>
        </motion.div>
      )}
    </div>
  );
}

export default App;
