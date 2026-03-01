const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
  {
    jobSeekerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileUrl: { type: String, required: true }, // local path or cloud url
    fileName: { type: String },
    extractedText: { type: String }, // if you store parsed text
    skills: [{ type: String }],      // parsed skills
  },
  { timestamps: true }
);

module.exports = mongoose.model("Resume", resumeSchema);