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

// ================== IMPORTANT STARTUP CHECKS ==================
if (!process.env.MONGO_URI) console.error("❌ MONGO_URI is missing in environment variables");
if (!process.env.JWT_SECRET)
  console.error("❌ JWT_SECRET is missing in environment variables (LOGIN WILL FAIL)");
if (!process.env.RESET_KEY) console.warn("⚠️ RESET_KEY is missing (debug/reset APIs disabled)");

// ================== HELPERS ==================
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const normalizeText = (v) => String(v || "").trim();
const ROLES = new Set(["admin", "recruiter", "jobseeker"]);

// ================== MIDDLEWARE ==================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ CORS (Netlify + localhost + Render)
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "https://ai-resume-screening-system.netlify.app",
  "https://ai-resume-screening-system-by.onrender.com",
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;

  if (allowedOrigins.has(origin)) return true;

  // Netlify preview deploys
  if (/^https:\/\/deploy-preview-\d+--ai-resume-screening-system\.netlify\.app$/.test(origin))
    return true;

  // Netlify branch deploys
  if (/^https:\/\/[a-z0-9-]+--ai-resume-screening-system\.netlify\.app$/.test(origin))
    return true;

  return false;
}

const corsOptions = {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(new Error("CORS blocked: " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// request log
app.use((req, res, next) => {
  const start = Date.now();
  const origin = req.headers.origin || "";
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms ORIGIN:${origin}`
    );
  });
  next();
});

// Serve uploads
app.use("/uploads", express.static("uploads"));

// Health
app.get("/api/health", async (req, res) => {
  const state = mongoose.connection.readyState; // 0,1,2,3
  res.json({
    ok: true,
    time: new Date().toISOString(),
    mongoReadyState: state,
  });
});

// ================== DB CONNECT ==================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ================== MODELS ==================
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
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

// ensure index for unique email
userSchema.index({ email: 1 }, { unique: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    skills: { type: [String], default: [] },
    postedBy: { type: String },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);
const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: "Applicant" },
    email: { type: String, required: true },
    recruiterEmail: { type: String, default: "" },
    jobId: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    analysisId: { type: String, default: "" },
    atsScore: { type: Number, default: 0 },
    status: { type: String, default: "Pending" },
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
    status: { type: String, default: "Pending" },
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

const notificationSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true },
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
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const requireRole = (roles = []) => (req, res, next) => {
  if (!req.user?.role) return res.status(401).json({ message: "Unauthorized" });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
  next();
};

// ================== UPLOAD SETUP ==================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ================== ROUTES ==================
app.get("/", (req, res) => res.send("🚀 AI Resume Screening Backend Running"));

// ---------- REGISTER ----------
app.post("/api/auth/register", async (req, res) => {
  try {
    let { name, email, password, role } = req.body || {};
    name = normalizeText(name);
    email = normalizeEmail(email);
    password = String(password || "");
    role = normalizeText(role);

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!ROLES.has(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: "User already exists" });

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
    // handle duplicate key error nicely
    if (err?.code === 11000) return res.status(409).json({ message: "User already exists" });
    return res.status(500).json({ message: "Registration failed" });
  }
});

// ---------- LOGIN ----------
app.post("/api/auth/login", async (req, res) => {
  try {
    let { email, password, role } = req.body || {};
    email = normalizeEmail(email);
    password = String(password || "");
    role = normalizeText(role); // optional (if frontend sends it)

    console.log("LOGIN TRY:", { email, hasPassword: !!password, role: role || "not-sent" });

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    console.log("USER FOUND:", !!user);

    // ✅ 401 for auth failures
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    // If frontend sends role, enforce matching role
    if (role && user.role !== role) {
      console.log("ROLE MISMATCH:", { dbRole: user.role, clientRole: role });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    console.log("PASSWORD MATCH:", match);

    if (!match) return res.status(401).json({ message: "Invalid credentials" });

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

// ✅ Debug endpoint to confirm user exists in deployed DB (protected by RESET_KEY)
// POST /api/auth/debug-user  { email, key }
app.post("/api/auth/debug-user", async (req, res) => {
  try {
    if (!process.env.RESET_KEY) return res.status(400).json({ message: "RESET_KEY not configured" });

    const email = normalizeEmail(req.body?.email);
    const key = String(req.body?.key || "");
    if (!email || !key) return res.status(400).json({ message: "email and key required" });
    if (key !== process.env.RESET_KEY) return res.status(403).json({ message: "Forbidden" });

    const user = await User.findOne({ email }).lean();
    return res.json({
      email,
      exists: !!user,
      role: user?.role || null,
      // do NOT return password; just show if hash exists
      hasPasswordHash: !!user?.password,
    });
  } catch (err) {
    console.error("DEBUG USER ERROR:", err);
    return res.status(500).json({ message: "Debug failed" });
  }
});

// ---------- RESET PASSWORD ----------
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    if (!process.env.RESET_KEY) return res.status(400).json({ message: "RESET_KEY not configured" });

    const email = normalizeEmail(req.body?.email);
    const newPassword = String(req.body?.newPassword || "");
    const key = String(req.body?.key || "");

    if (!email || !newPassword || !key) {
      return res.status(400).json({ message: "email, newPassword, key are required" });
    }
    if (key !== process.env.RESET_KEY) return res.status(403).json({ message: "Forbidden" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await Log.create({ level: "info", message: "Password reset", actor: email });
    return res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Reset failed" });
  }
});

// ================== JOBS ==================
app.get("/api/jobs", async (req, res) => {
  try {
    const jobs = await Job.find({ status: "approved" }).sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error("GET JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load jobs" });
  }
});

app.get("/api/jobseeker/jobs", async (req, res) => {
  try {
    const jobs = await Job.find({ status: "approved" }).sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error("JOBSEEKER JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load jobs" });
  }
});

// analyze resume
app.post(
  "/api/jobseeker/analyze",
  verifyToken,
  requireRole(["jobseeker"]),
  upload.single("resume"),
  async (req, res) => {
    try {
      const userId = req.user?.id || "";
      const userEmail = req.user?.email || "";
      const { jobId = "", jobTitle = "" } = req.body || {};

      if (!req.file) return res.status(400).json({ message: "Resume file is required" });

      const analysis = await Analysis.create({
        userId,
        userEmail,
        recruiterEmail: "",
        jobId,
        jobTitle: jobTitle || "Custom JD",
        resumeFile: `/uploads/${req.file.filename}`,
        atsScore: 0,
        matchedSkills: [],
        missingSkills: [],
        recommendations: [],
        status: "Pending",
      });

      await Log.create({ level: "info", message: "Resume analyzed", actor: userEmail });

      return res.json({ message: "Analysis created", analysis });
    } catch (err) {
      console.error("JOBSEEKER ANALYZE ERROR:", err);
      return res.status(500).json({ message: "Analyze failed" });
    }
  }
);

app.get("/api/jobseeker/history", verifyToken, requireRole(["jobseeker"]), async (req, res) => {
  try {
    const userId = req.user?.id || "";
    const items = await Analysis.find({ userId }).sort({ createdAt: -1 });
    return res.json({ items });
  } catch (err) {
    console.error("JOBSEEKER HISTORY ERROR:", err);
    return res.status(500).json({ message: "Failed to load history" });
  }
});

// ================== RECRUITER ==================
app.get("/api/recruiter/stats", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    const totalJobs = await Job.countDocuments({ postedBy: recruiterEmail });
    const totalCandidates = await Candidate.countDocuments({ recruiterEmail });

    const avg = await Analysis.aggregate([
      { $match: { recruiterEmail } },
      { $group: { _id: null, avgScore: { $avg: "$atsScore" } } },
    ]);

    return res.json({
      totalJobs,
      totalCandidates,
      averageATS: Number(avg[0]?.avgScore || 0).toFixed(1),
    });
  } catch (err) {
    console.error("RECRUITER STATS ERROR:", err);
    return res.status(500).json({ message: "Failed to load stats" });
  }
});

app.post("/api/recruiter/jobs", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    const { title, skills } = req.body || {};
    if (!title) return res.status(400).json({ message: "Job title is required" });

    const job = await Job.create({
      title,
      skills: Array.isArray(skills)
        ? skills
        : String(skills || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
      postedBy: recruiterEmail,
      status: "pending",
    });

    await Log.create({ level: "info", message: "Job posted", actor: recruiterEmail });
    return res.status(201).json({ message: "Job created", job });
  } catch (err) {
    console.error("RECRUITER CREATE JOB ERROR:", err);
    return res.status(500).json({ message: "Failed to create job" });
  }
});

app.get("/api/recruiter/jobs", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    const jobs = await Job.find({ postedBy: recruiterEmail }).sort({ createdAt: -1 });
    return res.json({ jobs });
  } catch (err) {
    console.error("RECRUITER JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load jobs" });
  }
});

app.get("/api/recruiter/candidates", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    const candidates = await Candidate.find({ recruiterEmail }).sort({ createdAt: -1 });
    return res.json({ candidates });
  } catch (err) {
    console.error("RECRUITER CANDIDATES ERROR:", err);
    return res.status(500).json({ message: "Failed to load candidates" });
  }
});

app.patch(
  "/api/recruiter/candidates/:id/status",
  verifyToken,
  requireRole(["recruiter"]),
  async (req, res) => {
    try {
      const recruiterEmail = req.user?.email || "";
      const { status } = req.body || {};
      if (!status) return res.status(400).json({ message: "Status is required" });

      const cand = await Candidate.findByIdAndUpdate(req.params.id, { status }, { new: true });

      await Log.create({
        level: "info",
        message: "Candidate status updated",
        actor: recruiterEmail,
      });

      if (cand?.email) {
        await Notification.create({
          userEmail: cand.email,
          title: "Application Update",
          message: `Your application status changed to: ${status}`,
          type: "info",
          jobId: cand.jobId || "",
          jobTitle: cand.jobTitle || "",
          recruiterEmail,
          status,
        });
      }

      return res.json({ message: "Status updated", candidate: cand });
    } catch (err) {
      console.error("RECRUITER UPDATE STATUS ERROR:", err);
      return res.status(500).json({ message: "Failed to update status" });
    }
  }
);

// ================== ADMIN ==================
app.get("/api/admin/stats", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalRecruiters = await User.countDocuments({ role: "recruiter" });
    const totalJobSeekers = await User.countDocuments({ role: "jobseeker" });
    const totalJobs = await Job.countDocuments();
    const totalResumes = await Analysis.countDocuments();
    const totalLogs = await Log.countDocuments();

    const avg = await Analysis.aggregate([{ $group: { _id: null, avgScore: { $avg: "$atsScore" } } }]);

    return res.json({
      totalUsers,
      totalRecruiters,
      totalJobSeekers,
      totalJobs,
      totalResumes,
      totalLogs,
      avgScore: Number(avg[0]?.avgScore || 0).toFixed(1),
    });
  } catch (err) {
    console.error("ADMIN STATS ERROR:", err);
    return res.status(500).json({ message: "Failed to load stats" });
  }
});

app.get("/api/admin/users", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    return res.json(users);
  } catch (err) {
    console.error("ADMIN USERS ERROR:", err);
    return res.status(500).json({ message: "Failed to load users" });
  }
});

app.delete("/api/admin/users/:id", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    return res.json({ message: "User deleted" });
  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    return res.status(500).json({ message: "Delete failed" });
  }
});

app.put("/api/admin/users/:id/role", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const role = normalizeText(req.body?.role);
    if (!role) return res.status(400).json({ message: "Role is required" });
    if (!ROLES.has(role)) return res.status(400).json({ message: "Invalid role" });

    await User.findByIdAndUpdate(req.params.id, { role });
    return res.json({ message: "Role updated" });
  } catch (err) {
    console.error("UPDATE ROLE ERROR:", err);
    return res.status(500).json({ message: "Role update failed" });
  }
});

app.get("/api/admin/jobs", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error("ADMIN JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load jobs" });
  }
});

app.patch("/api/admin/jobs/:id/status", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const status = normalizeText(req.body?.status);
    if (!status) return res.status(400).json({ message: "Status is required" });

    await Job.findByIdAndUpdate(req.params.id, { status });
    return res.json({ message: "Job status updated" });
  } catch (err) {
    console.error("UPDATE JOB STATUS ERROR:", err);
    return res.status(500).json({ message: "Job update failed" });
  }
});

app.get("/api/admin/resumes", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const resumes = await Analysis.find().sort({ createdAt: -1 });
    return res.json(resumes);
  } catch (err) {
    console.error("ADMIN RESUMES ERROR:", err);
    return res.status(500).json({ message: "Failed to load resumes" });
  }
});

app.get("/api/admin/logs", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const logs = await Log.find().sort({ createdAt: -1 });
    return res.json(logs);
  } catch (err) {
    console.error("ADMIN LOGS ERROR:", err);
    return res.status(500).json({ message: "Failed to load logs" });
  }
});

// JSON 404 for API
app.use("/api", (req, res) => {
  return res.status(404).json({
    message: "API route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  return res.status(500).json({ message: err.message || "Server error" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));