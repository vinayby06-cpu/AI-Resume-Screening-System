require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: String,
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const email = "admin@gmail.com";
  const plainPassword = "admin123";
  const hashed = await bcrypt.hash(plainPassword, 10);

  const existing = await User.findOne({ email });

  if (existing) {
    existing.password = hashed;
    existing.role = "admin";
    await existing.save();
    console.log("✅ Admin updated:", email);
  } else {
    await User.create({
      name: "Admin",
      email,
      password: hashed,
      role: "admin",
    });
    console.log("✅ Admin created:", email);
  }

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});