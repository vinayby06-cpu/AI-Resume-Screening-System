const SKILL_DB = [
  "javascript",
  "react",
  "node",
  "node.js",
  "mongodb",
  "express",
  "html",
  "css",
  "python",
  "java",
  "sql",
  "typescript",
];

const extractSkills = (text) => {
  try {
    if (!text) return [];

    // ✅ VERY IMPORTANT — normalize text
    const lowerText = text.toLowerCase();

    // ✅ find matching skills
    const foundSkills = SKILL_DB.filter((skill) =>
      lowerText.includes(skill.toLowerCase())
    );

    // ✅ remove duplicates
    return [...new Set(foundSkills)];
  } catch (error) {
    console.error("Skill extraction error:", error);
    return [];
  }
};

module.exports = extractSkills;