const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
  {
    scoringWeights: {
      skills: { type: Number, default: 60 },
      experience: { type: Number, default: 25 },
      education: { type: Number, default: 15 },
    },
    minShortlistScore: { type: Number, default: 70 },
    skillSynonyms: {
      type: Map,
      of: [String], // e.g. "js" -> ["javascript", "java script"]
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);