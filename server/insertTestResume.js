require("dotenv").config();
const mongoose = require("mongoose");
const Resume = require("./models/Resume");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

async function insertTest() {
  const testResume = new Resume({
    userId: new mongoose.Types.ObjectId(), // random test user
    skills: ["javascript", "node", "react"],
    jobDescription: "Looking for full stack JS developer",
    matchScore: 0,
    matchedSkills: [],
    missingSkills: []
  });

  await testResume.save();
  console.log("✅ Test resume inserted");
  mongoose.connection.close();
}

insertTest();