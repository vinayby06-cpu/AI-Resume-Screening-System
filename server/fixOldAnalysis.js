require("dotenv").config();
const mongoose = require("mongoose");

// Minimal schemas (only required fields)
const userSchema = new mongoose.Schema(
  { email: String },
  { timestamps: true }
);

const jobSchema = new mongoose.Schema(
  { title: String, postedBy: String },
  { timestamps: true }
);

const analysisSchema = new mongoose.Schema(
  {
    userId: String,
    userEmail: String,
    recruiterEmail: String,
    jobId: String,
    jobTitle: String,
    atsScore: Number,
    matchedSkills: [String],
    missingSkills: [String],
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);
const Analysis = mongoose.models.Analysis || mongoose.model("Analysis", analysisSchema);

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Find records that need fixing
    const records = await Analysis.find({
      $or: [
        { recruiterEmail: { $exists: false } },
        { recruiterEmail: "" },
        { userEmail: { $exists: false } },
        { userEmail: "" },
        { jobTitle: { $exists: false } },
        { jobTitle: "" },
      ],
    }).sort({ createdAt: -1 });

    console.log(`🔎 Found ${records.length} old records to fix`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const r of records) {
      let changed = false;

      // ✅ Fill recruiterEmail + jobTitle from Job
      if (r.jobId) {
        const job = await Job.findById(r.jobId).lean();
        if (job) {
          if (!r.recruiterEmail && job.postedBy) {
            r.recruiterEmail = job.postedBy;
            changed = true;
          }
          if (!r.jobTitle && job.title) {
            r.jobTitle = job.title;
            changed = true;
          }
        }
      }

      // ✅ Fill userEmail from User using userId
      if (!r.userEmail && r.userId) {
        // userId is stored as string, but it's ObjectId format
        const user = await User.findById(r.userId).lean();
        if (user?.email) {
          r.userEmail = user.email;
          changed = true;
        }
      }

      if (changed) {
        await r.save();
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log("✅ Done!");
    console.log(`🛠 Updated: ${updatedCount}`);
    console.log(`⏭ Skipped: ${skippedCount}`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Fix failed:", err);
    process.exit(1);
  }
}

run();