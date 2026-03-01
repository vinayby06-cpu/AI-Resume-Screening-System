const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ai-resume-screening";

const EMAIL = "prajwal@gmail.com";         // change if needed
const NEW_PASSWORD = "Admin@123";          // set your new password here

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
});

const User = mongoose.model("User", userSchema);

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected:", MONGO_URI);

    const user = await User.findOne({ email: EMAIL });
    if (!user) {
      console.log("❌ User not found with email:", EMAIL);
      process.exit(0);
    }

    const hashed = await bcrypt.hash(NEW_PASSWORD, 10);
    user.password = hashed;
    await user.save();

    console.log("✅ Password reset successful for:", EMAIL);
    console.log("➡️ New Password is:", NEW_PASSWORD);

    process.exit(0);
  } catch (err) {
    console.log("❌ Error:", err.message);
    process.exit(1);
  }
})();