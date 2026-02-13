const mongoose = require("mongoose");

/*
  Schema = structure of one resume result
*/
const ResumeSchema = new mongoose.Schema({
  score: {
    type: Number,
    required: true
  },
  matchedSkills: {
    type: [String],
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  }
});

/*
  Model = tool to interact with MongoDB
*/
module.exports = mongoose.model("Resume", ResumeSchema);
