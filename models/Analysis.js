const mongoose = require("mongoose");

const AnalysisSchema = new mongoose.Schema({
  filename: String,
  skills: [String],
  score: Number,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Analysis", AnalysisSchema);
