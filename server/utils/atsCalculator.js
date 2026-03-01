// utils/atsCalculator.js

function calculateATS(resumeSkills = [], jobSkills = []) {
  // normalize
  const normalize = (arr) =>
    arr.map((s) => s.toLowerCase().trim());

  const resume = normalize(resumeSkills);
  const job = normalize(jobSkills);

  // matched skills
  const matched = job.filter((skill) => resume.includes(skill));

  // missing skills
  const missing = job.filter((skill) => !resume.includes(skill));

  // score
  const score =
    job.length === 0
      ? 0
      : Math.round((matched.length / job.length) * 100);

  return {
    atsScore: score,
    matchedSkills: matched,
    missingSkills: missing,
  };
}

module.exports = calculateATS;
