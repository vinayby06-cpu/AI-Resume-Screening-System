const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
require("dotenv").config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const newPassword = "123456"; // your new login password
    const hashed = await bcrypt.hash(newPassword, 10);

    await User.updateOne(
      { email: "vinay@gmail.com" },
      { $set: { password: hashed } }
    );

    console.log("Password updated successfully!");
    mongoose.connection.close();
  })
  .catch(err => console.error(err));
