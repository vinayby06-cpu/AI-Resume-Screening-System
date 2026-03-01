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
  if (!text) return [];

  const foundSkills = SKILL_DB.filter((skill) =>
    text.includes(skill.toLowerCase())
  );

  return [...new Set(foundSkills)];
};

module.exports = extractSkills;