const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { isAdmin } = require("../middleware/admin");

const User = require("../models/User");
const Job = require("../models/Job");
const Resume = require("../models/Resume");
const ScreeningLog = require("../models/ScreeningLog");

// All admin routes
router.use(protect, isAdmin);

// ✅ STATS / ANALYTICS
router.get("/stats", async (req, res) => {
  const [totalUsers, totalRecruiters, totalJobSeekers, totalJobs, totalResumes, totalLogs] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "recruiter" }),
      User.countDocuments({ role: "jobseeker" }),
      Job.countDocuments({}),
      Resume.countDocuments({}),
      ScreeningLog.countDocuments({}),
    ]);

  const avgAgg = await ScreeningLog.aggregate([
    { $group: { _id: null, avgScore: { $avg: "$matchPercentage" } } },
  ]);

  const avgScore = avgAgg?.[0]?.avgScore ?? 0;

  res.json({
    totalUsers,
    totalRecruiters,
    totalJobSeekers,
    totalJobs,
    totalResumes,
    totalLogs,
    avgScore: Math.round(avgScore),
  });
});

// ✅ USERS
router.get("/users", async (req, res) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 });
  res.json(users);
});

router.put("/users/:id/role", async (req, res) => {
  const { role } = req.body;

  if (!["admin", "recruiter", "jobseeker"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select(
    "-password"
  );

  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ message: "Role updated", user });
});

router.delete("/users/:id", async (req, res) => {
  const exists = await User.findById(req.params.id);
  if (!exists) return res.status(404).json({ message: "User not found" });

  await User.deleteOne({ _id: req.params.id });
  res.json({ message: "User deleted" });
});

// ✅ JOBS (monitor + approve/reject)
router.get("/jobs", async (req, res) => {
  const jobs = await Job.find()
    .populate("recruiterId", "email name")
    .sort({ createdAt: -1 });

  res.json({ jobs });
});

router.patch("/jobs/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const job = await Job.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!job) return res.status(404).json({ message: "Job not found" });

  res.json({ message: "Job status updated", job });
});

// ✅ RESUMES (optional list of uploaded files)
router.get("/resumes", async (req, res) => {
  const resumes = await Resume.find()
    .populate("jobSeekerId", "email name")
    .sort({ createdAt: -1 });

  res.json({ resumes });
});

// ✅ LOGS (Screening logs = real access logs)
router.get("/logs", async (req, res) => {
  const logs = await ScreeningLog.find()
    .populate("recruiterId", "email name")
    .populate("jobSeekerId", "email name")
    .populate("jobId", "title")
    .sort({ createdAt: -1 });

  res.json({ logs });
});

// ✅ SETTINGS (demo save)
router.put("/settings", async (req, res) => {
  // You can save to DB later
  res.json({ message: "Settings saved" });
});

module.exports = router;