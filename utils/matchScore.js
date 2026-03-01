// utils/matchScore.js

// Stop words (not skills)
const STOP_WORDS = new Set([
  "we",
  "need",
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "with",
  "to",
  "of",
  "in",
  "on",
  "developer",
  "engineer",
  "experience",
  "looking",
  "required",
]);

// Known tech skills
const SKILL_KEYWORDS = new Set([
  "javascript",
  "node",
  "nodejs",
  "react",
  "mongodb",
  "express",
  "python",
  "java",
  "sql",
  "html",
  "css",
  "typescript",
]);

// Normalize text
const normalize = (text) => {
  if (!text) return "";
  return text.toLowerCase().trim();
};

// Extract skills from Job Description
const extractSkillsFromJD = (jobDescription) => {
  if (!jobDescription || typeof jobDescription !== "string") return [];

  const words = jobDescription
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/);

  const filtered = words.filter(
    (word) => !STOP_WORDS.has(word) && SKILL_KEYWORDS.has(word)
  );

  return [...new Set(filtered)];
};

// Calculate match score
const calculateMatchScore = (resumeSkills = [], jobDescription = "") => {
  if (!Array.isArray(resumeSkills)) resumeSkills = [];

  const normalizedResumeSkills = resumeSkills.map((s) => normalize(s));
  const jdSkills = extractSkillsFromJD(jobDescription);

  const matchedSkills = normalizedResumeSkills.filter((skill) =>
    jdSkills.includes(skill)
  );

  const missingSkills = jdSkills.filter(
    (skill) => !normalizedResumeSkills.includes(skill)
  );

  const score =
    jdSkills.length === 0
      ? 0
      : Math.round((matchedSkills.length / jdSkills.length) * 100);

  return {
    matchedSkills,
    missingSkills,
    score,
  };
};

// Skill suggestions
const getSkillSuggestions = (missingSkills = []) => {
  return missingSkills.slice(0, 5);
};

module.exports = {
  calculateMatchScore,
  getSkillSuggestions,
};