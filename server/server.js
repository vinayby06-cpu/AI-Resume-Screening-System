require("dotenv").config();
const PDFDocument = require("pdfkit");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

// ================== MIDDLEWARE ==================
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

// Serve uploads
app.use("/uploads", express.static("uploads"));

// ================== DB CONNECT ==================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ================== MODELS ==================
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "recruiter", "jobseeker"],
      default: "jobseeker",
      required: true,
    },
  },
  { timestamps: true }
);
const User = mongoose.models.User || mongoose.model("User", userSchema);

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    skills: { type: [String], default: [] },
    postedBy: { type: String }, // recruiter email
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);
const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);

// ✅ Candidate includes recruiterEmail + jobId so recruiter can filter candidates (fixes 404)
const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: "Applicant" },
    email: { type: String, required: true }, // jobseeker email
    recruiterEmail: { type: String, default: "" }, // ✅ NEW
    jobId: { type: String, default: "" }, // ✅ NEW
    jobTitle: { type: String, default: "" }, // ✅ NEW
    analysisId: { type: String, default: "" }, // ✅ NEW

    atsScore: { type: Number, default: 0 },
    status: { type: String, default: "Pending" }, // Pending/Shortlisted/Rejected/Selected
  },
  { timestamps: true }
);
const Candidate = mongoose.models.Candidate || mongoose.model("Candidate", candidateSchema);

const analysisSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    userEmail: { type: String, default: "" },
    recruiterEmail: { type: String, default: "" },

    jobId: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    resumeFile: { type: String, default: "" },

    atsScore: { type: Number, default: 0 },
    matchedSkills: { type: [String], default: [] },
    missingSkills: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },

    status: { type: String, default: "Pending" }, // Pending/Applied/Shortlisted/Rejected/Selected
  },
  { timestamps: true }
);
const Analysis = mongoose.models.Analysis || mongoose.model("Analysis", analysisSchema);

const logSchema = new mongoose.Schema(
  {
    level: { type: String, default: "info" },
    message: { type: String, default: "" },
    actor: { type: String, default: "" },
  },
  { timestamps: true }
);
const Log = mongoose.models.Log || mongoose.model("Log", logSchema);

const settingsSchema = new mongoose.Schema(
  {
    allowRegistration: { type: Boolean, default: true },
    enableResumeUpload: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);
const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

// Notifications (Jobseeker receives messages here)
const notificationSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true }, // job seeker email
    title: { type: String, default: "Application Update" },
    message: { type: String, required: true },
    type: { type: String, enum: ["info", "success", "warning", "error"], default: "info" },
    read: { type: Boolean, default: false },

    jobId: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    recruiterEmail: { type: String, default: "" },
    status: { type: String, default: "" },
  },
  { timestamps: true }
);
const Notification =
  mongoose.models.Notification || mongoose.model("Notification", notificationSchema);

// ================== AUTH MIDDLEWARE ==================
const verifyToken = (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: "No token provided" });

    const token = auth.startsWith("Bearer ") ? auth.split(" ")[1] : auth;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user?.role) return res.status(401).json({ message: "Unauthorized" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
};

// ================== UPLOAD SETUP ==================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ================== ROUTES ==================
app.get("/", (req, res) => {
  res.send("🚀 AI Resume Screening Backend Running");
});

// ---------- REGISTER ----------
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: "Registration failed" });
  }
});

// ---------- LOGIN ----------
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    await Log.create({ level: "info", message: "User login", actor: user.email });

    return res.json({
      message: "Login successful",
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Login failed" });
  }
});

// ================== JOBS ==================
app.post("/api/jobs", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const { title, skills } = req.body;
    if (!title) return res.status(400).json({ message: "Job title required" });

    const job = await Job.create({
      title,
      skills: Array.isArray(skills) ? skills : [],
      postedBy: req.user.email,
      status: "pending",
    });

    await Log.create({ level: "info", message: `Job created: ${title}`, actor: req.user.email });
    return res.status(201).json(job);
  } catch (err) {
    console.error("POST JOB ERROR:", err);
    return res.status(500).json({ message: "Job creation failed" });
  }
});

app.get("/api/jobs", async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.log("GET JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to fetch jobs" });
  }
});

// ================== RECRUITER ANALYTICS (YOUR DASHBOARD USES THIS) ==================
app.get("/api/analytics", verifyToken, requireRole(["recruiter", "admin"]), async (req, res) => {
  try {
    const recruiterEmail = req.user.email;

    const totalJobs = await Job.countDocuments({ postedBy: recruiterEmail });
    const totalCandidates = await Candidate.countDocuments({ recruiterEmail });

    const avgAgg = await Candidate.aggregate([
      { $match: { recruiterEmail } },
      { $group: { _id: null, avgScore: { $avg: "$atsScore" } } },
    ]);
    const averageATS = Math.round(avgAgg?.[0]?.avgScore || 0);

    return res.json({ totalJobs, totalCandidates, averageATS });
  } catch (err) {
    console.log("RECRUITER ANALYTICS ERROR:", err);
    return res.status(500).json({ message: "Analytics failed" });
  }
});

// ✅ FIXES MOST RECRUITER 404s: Recruiter Jobs + Recruiter Candidates
app.get("/api/recruiter/jobs", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const jobs = await Job.find({ postedBy: req.user.email }).sort({ createdAt: -1 });
    return res.json({ jobs });
  } catch (err) {
    console.log("RECRUITER JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load recruiter jobs" });
  }
});

app.get("/api/recruiter/candidates", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const candidates = await Candidate.find({ recruiterEmail: req.user.email }).sort({
      createdAt: -1,
    });
    return res.json({ candidates });
  } catch (err) {
    console.log("RECRUITER CANDIDATES ERROR:", err);
    return res.status(500).json({ message: "Failed to load candidates" });
  }
});

// ================== JOBSEEKER ANALYZE ==================
app.post("/api/jobseeker/analyze", verifyToken, upload.single("resume"), async (req, res) => {
  try {
    const { jobId, jobDescription } = req.body;

    let jobTitle = "";
    let requiredSkills = [];
    let recruiterEmail = "";

    if (jobId) {
      const job = await Job.findById(jobId);
      if (job) {
        jobTitle = job.title;
        requiredSkills = job.skills || [];
        recruiterEmail = job.postedBy || "";
      }
    }

    if (requiredSkills.length === 0 && jobDescription) {
      requiredSkills = jobDescription
        .split(/,|\n/g)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 30);
    }

    // TEMP demo skills (upgrade later)
    const resumeSkills = ["mongodb", "react", "node.js", "express", "javascript"];

    const matchedSkills = requiredSkills.filter((s) =>
      resumeSkills.includes(String(s).toLowerCase())
    );
    const missingSkills = requiredSkills.filter((s) => !matchedSkills.includes(s));

    const atsScore =
      requiredSkills.length === 0
        ? 0
        : Math.round((matchedSkills.length / requiredSkills.length) * 100);

    const recommendations = missingSkills.slice(0, 5).map((s) => `Improve skill: ${s}`);

    const record = await Analysis.create({
      userId: req.user.id,
      userEmail: req.user.email,
      recruiterEmail,
      jobId: jobId || "",
      jobTitle,
      resumeFile: req.file?.filename || "",
      atsScore,
      matchedSkills,
      missingSkills,
      recommendations,
      status: "Pending",
    });

    await Log.create({
      level: "info",
      message: `Resume analyzed. ATS: ${atsScore}%`,
      actor: req.user.email,
    });

    return res.json({
      analysisId: record._id,
      atsScore,
      matchedSkills,
      missingSkills,
      recommendations,
    });
  } catch (err) {
    console.log("ANALYZE ERROR:", err);
    return res.status(500).json({ message: "Analysis failed" });
  }
});

// ================== JOBSEEKER: HISTORY / APPLY / REPORT ==================
app.get("/api/jobseeker/history", verifyToken, requireRole(["jobseeker", "admin"]), async (req, res) => {
  try {
    const items = await Analysis.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json(items);
  } catch (err) {
    console.log("JOBSEEKER HISTORY ERROR:", err);
    return res.status(500).json({ message: "Failed to load history" });
  }
});

app.post("/api/jobseeker/apply", verifyToken, requireRole(["jobseeker", "admin"]), async (req, res) => {
  try {
    const { analysisId } = req.body;
    if (!analysisId) return res.status(400).json({ message: "analysisId is required" });

    const record = await Analysis.findById(analysisId);
    if (!record) return res.status(404).json({ message: "Analysis not found" });

    if (String(record.userId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    record.status = "Applied";
    await record.save();

    // Create candidate record for recruiter
    await Candidate.create({
      name: "Applicant",
      email: req.user.email,
      recruiterEmail: record.recruiterEmail || "",
      jobId: record.jobId || "",
      jobTitle: record.jobTitle || "",
      analysisId: String(record._id),
      atsScore: record.atsScore || 0,
      status: "Pending",
    });

    await Log.create({ level: "info", message: "Jobseeker applied", actor: req.user.email });
    return res.json({ message: "Applied successfully" });
  } catch (err) {
    console.log("JOBSEEKER APPLY ERROR:", err);
    return res.status(500).json({ message: "Apply failed" });
  }
});

app.get("/api/jobseeker/report/:id", verifyToken, requireRole(["jobseeker", "admin"]), async (req, res) => {
  try {
    const record = await Analysis.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Analysis not found" });

    if (String(record.userId) !== String(req.user.id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=ATS_Report_${record._id}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).text("AI Resume Screening - ATS Report", { align: "center" });
    doc.moveDown();

    doc.fontSize(12).text(`Report ID: ${record._id}`);
    doc.text(`Created: ${new Date(record.createdAt).toLocaleString()}`);
    doc.text(`Job Title: ${record.jobTitle || "Custom JD"}`);
    doc.text(`Status: ${record.status || "Pending"}`);
    doc.moveDown();

    doc.fontSize(16).text(`ATS Score: ${record.atsScore || 0}%`);
    doc.moveDown();

    doc.fontSize(13).text("Matched Skills:");
    doc.fontSize(12).text(record.matchedSkills?.length ? record.matchedSkills.join(", ") : "None");
    doc.moveDown();

    doc.fontSize(13).text("Missing Skills:");
    doc.fontSize(12).text(record.missingSkills?.length ? record.missingSkills.join(", ") : "None");
    doc.moveDown();

    doc.fontSize(13).text("Recommendations:");
    if (record.recommendations?.length) {
      record.recommendations.forEach((r, i) => doc.fontSize(12).text(`${i + 1}. ${r}`));
    } else {
      doc.fontSize(12).text("No recommendations");
    }

    doc.moveDown();
    doc.fontSize(10).text("Generated by AI Resume Screening System", { align: "center" });

    doc.end();
  } catch (err) {
    console.log("JOBSEEKER REPORT ERROR:", err);
    return res.status(500).json({ message: "Report generation failed" });
  }
});

// ================== JOBSEEKER NOTIFICATIONS ==================
app.get("/api/jobseeker/notifications", verifyToken, requireRole(["jobseeker", "admin"]), async (req, res) => {
  try {
    const items = await Notification.find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .limit(200);
    return res.json(items);
  } catch (err) {
    console.log("NOTIFICATIONS GET ERROR:", err);
    return res.status(500).json({ message: "Failed to load notifications" });
  }
});

app.patch("/api/jobseeker/notifications/:id/read", verifyToken, requireRole(["jobseeker", "admin"]), async (req, res) => {
  try {
    const item = await Notification.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Notification not found" });

    if (item.userEmail !== req.user.email && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    item.read = true;
    await item.save();
    return res.json({ message: "Marked read" });
  } catch (err) {
    console.log("NOTIFICATIONS READ ERROR:", err);
    return res.status(500).json({ message: "Failed to update notification" });
  }
});

// ================== RECRUITER: UPDATE CANDIDATE STATUS + SEND NOTIFICATION ==================
app.put("/api/candidates/:id", verifyToken, requireRole(["recruiter", "admin"]), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: "Status is required" });

    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ message: "Candidate not found" });

    candidate.status = status;
    await candidate.save();

    // Also update analysis status if linked
    if (candidate.analysisId) {
      await Analysis.findByIdAndUpdate(candidate.analysisId, { status }, { new: true });
    }

    let type = "info";
    const s = String(status).toLowerCase();
    if (s.includes("short") || s.includes("select") || s.includes("accept")) type = "success";
    if (s.includes("reject")) type = "error";

    await Notification.create({
      userEmail: candidate.email,
      title: "Application Status Updated",
      message: `Your application for "${candidate.jobTitle || "a job"}" is now: ${status}`,
      type,
      recruiterEmail: req.user.email,
      jobId: candidate.jobId || "",
      jobTitle: candidate.jobTitle || "",
      status: status,
    });

    await Log.create({
      level: "info",
      message: `Candidate ${candidate.email} status changed to ${status}`,
      actor: req.user.email,
    });

    return res.json(candidate);
  } catch (err) {
    console.error("UPDATE STATUS ERROR:", err);
    return res.status(500).json({ message: "Status update failed" });
  }
});

// ================== ADMIN ROUTES ==================
app.get("/api/admin/stats", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    const totalRecruiters = await User.countDocuments({ role: "recruiter" });
    const totalJobSeekers = await User.countDocuments({ role: "jobseeker" });

    const totalJobs = await Job.countDocuments({});
    const totalResumes = await Analysis.countDocuments({});
    const totalLogs = await Log.countDocuments({});

    const avgAgg = await Analysis.aggregate([{ $group: { _id: null, avg: { $avg: "$atsScore" } } }]);
    const avgScore = Math.round(avgAgg?.[0]?.avg || 0);

    return res.json({
      totalUsers,
      totalRecruiters,
      totalJobSeekers,
      totalJobs,
      totalResumes,
      totalLogs,
      avgScore,
    });
  } catch (err) {
    console.log("ADMIN STATS ERROR:", err);
    return res.status(500).json({ message: "Failed to fetch stats" });
  }
});

app.get("/api/admin/jobs", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    return res.json({ jobs });
  } catch (err) {
    console.log("ADMIN JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to fetch jobs" });
  }
});

app.patch("/api/admin/jobs/:id/status", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const { status } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const job = await Job.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!job) return res.status(404).json({ message: "Job not found" });

    await Log.create({
      level: "info",
      message: `Job status updated to ${status}: ${job.title}`,
      actor: req.user.email,
    });

    return res.json({ message: "Job status updated", job });
  } catch (err) {
    console.log("ADMIN JOB STATUS ERROR:", err);
    return res.status(500).json({ message: "Failed to update job status" });
  }
});

app.get("/api/admin/resumes", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const items = await Analysis.find().sort({ createdAt: -1 });
    return res.json(items);
  } catch (err) {
    console.log("ADMIN RESUMES ERROR:", err);
    return res.status(500).json({ message: "Failed to fetch resumes" });
  }
});

app.get("/api/admin/logs", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const items = await Log.find().sort({ createdAt: -1 }).limit(200);
    return res.json(items);
  } catch (err) {
    console.log("ADMIN LOGS ERROR:", err);
    return res.status(500).json({ message: "Failed to fetch logs" });
  }
});

app.get("/api/admin/users", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
    return res.json(users);
  } catch (err) {
    console.log("ADMIN USERS ERROR:", err);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
});

app.get("/api/admin/settings", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = await Settings.create({});
    return res.json(s);
  } catch (err) {
    console.log("ADMIN SETTINGS GET ERROR:", err);
    return res.status(500).json({ message: "Failed to load settings" });
  }
});

app.put("/api/admin/settings", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const { allowRegistration, enableResumeUpload, maintenanceMode } = req.body;

    let s = await Settings.findOne();
    if (!s) s = await Settings.create({});

    s.allowRegistration = Boolean(allowRegistration);
    s.enableResumeUpload = Boolean(enableResumeUpload);
    s.maintenanceMode = Boolean(maintenanceMode);

    await s.save();
    return res.json({ message: "Settings saved", settings: s });
  } catch (err) {
    console.log("ADMIN SETTINGS PUT ERROR:", err);
    return res.status(500).json({ message: "Failed to save settings" });
  }
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));