const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job"
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  atsScore: Number,
  status: {
    type: String,
    enum: ["applied", "shortlisted", "rejected"],
    default: "applied"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Application", applicationSchema);
