const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    skills: [String],
    matchedSkills: [String],
    missingSkills: [String],
    matchPercentage: Number,
    resumeFile: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Resume", resumeSchema);