const mongoose = require("mongoose");

const recruiterProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    companyName: { type: String, required: true },
    companyWebsite: { type: String },
    companyEmail: { type: String },
    companyLocation: { type: String },
    verificationDocUrl: { type: String }, // optional
  },
  { timestamps: true }
);

module.exports = mongoose.model("RecruiterProfile", recruiterProfileSchema);