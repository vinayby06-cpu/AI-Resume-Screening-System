const pdfParse = require("pdf-parse");

// 🔥 Master skill database (expand anytime)
const SKILL_DB = [
  "javascript",
  "react",
  "node",
  "node.js",
  "mongodb",
  "express",
  "python",
  "java",
  "c++",
  "html",
  "css",
  "machine learning",
  "deep learning",
  "sql",
  "aws",
];

// ✅ Extract text from PDF
const extractTextFromPDF = async (fileBuffer) => {
  const data = await pdfParse(fileBuffer);
  return data.text.toLowerCase();
};

// ✅ Extract skills from resume text
const extractSkills = (text) => {
  const foundSkills = [];

  SKILL_DB.forEach((skill) => {
    if (text.includes(skill)) {
      foundSkills.push(skill);
    }
  });

  return foundSkills;
};

// ✅ Calculate match + skill gap
const analyzeSkillGap = (candidateSkills, requiredSkills) => {
  if (!requiredSkills.length) {
    return {
      matchedSkills: [],
      missingSkills: [],
      matchPercentage: 0,
    };
  }

  const matchedSkills = candidateSkills.filter((skill) =>
    requiredSkills.includes(skill)
  );

  const missingSkills = requiredSkills.filter(
    (skill) => !candidateSkills.includes(skill)
  );

  const matchPercentage = Math.round(
    (matchedSkills.length / requiredSkills.length) * 100
  );

  return {
    matchedSkills,
    missingSkills,
    matchPercentage,
  };
};

module.exports = {
  extractTextFromPDF,
  extractSkills,
  analyzeSkillGap,
};