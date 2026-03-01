const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ai-resume-screening";

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    password: String,
    role: String,
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const users = await User.find({}, { email: 1, role: 1, name: 1 }).lean();

    if (!users.length) {
      console.log("❌ No users found in DB:", MONGO_URI);
    } else {
      console.log("✅ Users in DB:");
      users.forEach((u, i) =>
        console.log(`${i + 1}. ${u.email} | ${u.role} | ${u.name}`)
      );
    }

    process.exit();
  } catch (e) {
    console.log("❌ Error:", e.message);
    process.exit(1);
  }
}

run();