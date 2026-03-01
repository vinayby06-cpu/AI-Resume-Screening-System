const User = require("../models/User");
const RecruiterProfile = require("../models/RecruiterProfile");
const Resume = require("../models/Resume");
const Job = require("../models/Job");
const ScreeningLog = require("../models/ScreeningLog");
const SystemSettings = require("../models/SystemSettings");

// ✅ View analytics + dashboard stats
exports.getStats = async (req, res) => {
  const [totalUsers, totalRecruiters, totalJobSeekers, totalJobs, totalResumes, totalLogs] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "recruiter" }),
      User.countDocuments({ role: "jobseeker" }),
      Job.countDocuments({}),
      Resume.countDocuments({}),
      ScreeningLog.countDocuments({}),
    ]);

  // average match score
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
};

// ✅ Manage users (list)
exports.listUsers = async (req, res) => {
  const { role, q, page = 1, limit = 10 } = req.query;

  const filter = {};
  if (role) filter.role = role;
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [users, total] = await Promise.all([
    User.find(filter).select("-password").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  res.json({ total, page: Number(page), limit: Number(limit), users });
};

// ✅ Manage users (block/unblock)
exports.updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body; // true/false

  const user = await User.findByIdAndUpdate(
    id,
    { isActive: Boolean(isActive) },
    { new: true }
  ).select("-password");

  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ message: "User status updated", user });
};

// ✅ Delete user (optional)
exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: "User not found" });

  // cleanup optional:
  await Promise.all([
    RecruiterProfile.deleteOne({ userId: id }),
    Resume.deleteMany({ jobSeekerId: id }),
    Job.deleteMany({ recruiterId: id }),
  ]);

  await User.deleteOne({ _id: id });
  res.json({ message: "User deleted" });
};

// ✅ Manage recruiters (verification)
exports.listRecruiterRequests = async (req, res) => {
  const recruiters = await User.find({ role: "recruiter" })
    .select("-password")
    .sort({ createdAt: -1 });

  res.json({ recruiters });
};

exports.verifyRecruiter = async (req, res) => {
  const { id } = req.params; // recruiter userId
  const { isVerified } = req.body;

  const user = await User.findOneAndUpdate(
    { _id: id, role: "recruiter" },
    { isVerified: Boolean(isVerified) },
    { returnDocument: "after" }
  ).select("-password");

  if (!user) return res.status(404).json({ message: "Recruiter not found" });
  res.json({ message: "Recruiter verification updated", user });
};

// ✅ View all resumes
exports.listResumes = async (req, res) => {
  const { page = 1, limit = 10, q } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = {};
  if (q) filter.fileName = { $regex: q, $options: "i" };

  const [resumes, total] = await Promise.all([
    Resume.find(filter)
      .populate("jobSeekerId", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Resume.countDocuments(filter),
  ]);

  res.json({ total, page: Number(page), limit: Number(limit), resumes });
};

// ✅ Monitor jobs (approve/reject + view)
exports.listJobs = async (req, res) => {
  const { status, page = 1, limit = 10, q } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = {};
  if (status) filter.status = status;
  if (q) filter.title = { $regex: q, $options: "i" };

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .populate("recruiterId", "name email isVerified")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Job.countDocuments(filter),
  ]);

  res.json({ total, page: Number(page), limit: Number(limit), jobs });
};

exports.updateJobStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // "approved" | "rejected" | "pending"

  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const job = await Job.findByIdAndUpdate(id, { status }, { new: true });
  if (!job) return res.status(404).json({ message: "Job not found" });

  res.json({ message: "Job status updated", job });
};

// ✅ Access logs (screening logs)
exports.listLogs = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [logs, total] = await Promise.all([
    ScreeningLog.find({})
      .populate("recruiterId", "name email")
      .populate("jobSeekerId", "name email")
      .populate("jobId", "title status")
      .populate("resumeId", "fileName fileUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ScreeningLog.countDocuments({}),
  ]);

  res.json({ total, page: Number(page), limit: Number(limit), logs });
};

// ✅ Control system settings
exports.getSettings = async (req, res) => {
  let settings = await SystemSettings.findOne({});
  if (!settings) settings = await SystemSettings.create({});
  res.json(settings);
};

exports.updateSettings = async (req, res) => {
  const { scoringWeights, minShortlistScore, skillSynonyms } = req.body;

  let settings = await SystemSettings.findOne({});
  if (!settings) settings = await SystemSettings.create({});

  if (scoringWeights) {
    const { skills, experience, education } = scoringWeights;

    // optional: validate total = 100
    const total = Number(skills) + Number(experience) + Number(education);
    if (total !== 100) {
      return res.status(400).json({ message: "Weights must total 100" });
    }

    settings.scoringWeights = { skills, experience, education };
  }

  if (minShortlistScore !== undefined) settings.minShortlistScore = Number(minShortlistScore);

  if (skillSynonyms) {
    // expects object: { "js": ["javascript"], "ml": ["machine learning"] }
    settings.skillSynonyms = skillSynonyms;
  }

  await settings.save();
  res.json({ message: "Settings updated", settings });
};