const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema({
  name: String,
  email: String,
  atsScore: Number,
  status: { type: String, default: "Pending" },
});

module.exports = mongoose.model("Candidate", candidateSchema);