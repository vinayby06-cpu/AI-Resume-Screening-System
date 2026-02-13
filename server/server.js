const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });

console.log("🔥 NEW SKILL-ONLY BACKEND LOADED");


app.use(cors());
app.use(express.json());

/* 🔒 ONLY THESE ARE SKILLS */
const SKILLS = [
  "python",
  "java",
  "javascript",
  "js",
  "react",
  "node",
  "express",
  "mongodb",
  "sql",
  "html",
  "css",
  "django",
  "flask"
];

/* ✅ Clean text */
function clean(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

/* ✅ Extract ONLY skills */
function extractSkills(text) {
  const cleaned = clean(text);
  return SKILLS.filter(skill => cleaned.includes(skill));
}

/* ================= API ================= */

app.post("/api/analyze", upload.single("resume"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No resume uploaded" });
    }

    const resumeText = fs.readFileSync(req.file.path, "utf8");
    const jobText = req.body.job || "";

    const resumeSkills = extractSkills(resumeText);
    const jobSkills = extractSkills(jobText);

    const matchedSkills = jobSkills.filter(skill =>
      resumeSkills.includes(skill)
    );

    const missingSkills = jobSkills.filter(skill =>
      !resumeSkills.includes(skill)
    );

    const score =
      jobSkills.length === 0
        ? 0
        : Math.round((matchedSkills.length / jobSkills.length) * 100);

    fs.unlinkSync(req.file.path);

    return res.json({
      score,
      matchedSkills,
      missingSkills
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Resume analysis failed" });
  }
});

app.listen(5000, () => {
  console.log("Backend running on port 5000");
});
