require("dotenv").config();
const mongoose = require("mongoose");

// ✅ Resume Schema (must match your real schema)
const resumeSchema = new mongoose.Schema({
  name: String,
  email: String,
  skills: [String],
  experience: Number,
  education: String,
});

const Resume = mongoose.model("Resume", resumeSchema);

// ✅ MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");

    // ✅ Insert test data
    await Resume.create({
      name: "Rahul Sharma",
      email: "rahul@example.com",
      skills: ["JavaScript", "React", "Node.js", "MongoDB"],
      experience: 2,
      education: "B.Tech CSE",
    });

    console.log("✅ Test resume inserted");
    process.exit();
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });