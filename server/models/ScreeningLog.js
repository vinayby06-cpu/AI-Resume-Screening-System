const mongoose = require("mongoose");

const screeningLogSchema = new mongoose.Schema(
  {
    recruiterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jobSeekerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: "Resume", required: true },

    matchPercentage: { type: Number, required: true },
    matchedSkills: [{ type: String }],
    missingSkills: [{ type: String }],

    // optional debug info
    scoreBreakdown: {
      skills: { type: Number, default: 0 },
      experience: { type: Number, default: 0 },
      education: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScreeningLog", screeningLogSchema);