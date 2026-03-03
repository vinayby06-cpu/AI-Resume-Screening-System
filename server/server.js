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
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is missing in environment variables");
}
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing in environment variables (LOGIN WILL FAIL)");
}

// ================== MIDDLEWARE ==================
// ✅ body parsers FIRST (so req.body works)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ CORS (safe for Netlify + previews + localhost)
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "https://ai-resume-screening-system.netlify.app",
  // Add your Render FRONTEND here only if you really have a separate frontend service:
  "https://ai-resume-screening-system-by.onrender.com",
]);

function isAllowedOrigin(origin) {
  if (!origin) return true; // Postman/curl has no origin
  if (allowedOrigins.has(origin)) return true;

  // ✅ allow Netlify preview deploys:
  // https://deploy-preview-123--ai-resume-screening-system.netlify.app
  if (/^https:\/\/deploy-preview-\d+--ai-resume-screening-system\.netlify\.app$/.test(origin))
    return true;

  // ✅ allow Netlify branch deploys:
  // https://main--ai-resume-screening-system.netlify.app
  // https://feature-xyz--ai-resume-screening-system.netlify.app
  if (/^https:\/\/[a-z0-9-]+--ai-resume-screening-system\.netlify\.app$/.test(origin))
    return true;

  return false;
}

// ✅ IMPORTANT: Use ONE cors config everywhere (including OPTIONS)
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

// ✅ IMPORTANT FIX: handle preflight using SAME cors options (works on Express 4/5)
app.options(/.*/, cors(corsOptions));

// ✅ helpful debug for deployment issues (logs origin + status)
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

// ✅ quick health endpoint (useful for testing from browser)
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

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
    const { name, email, password, role } = req.body || {};

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
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

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

// ================== PUBLIC JOBS (JOBSEEKER DROPDOWN) ==================
app.get("/api/jobs", async (req, res) => {
  try {
    const jobs = await Job.find({ status: "approved" }).sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error("GET JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load jobs" });
  }
});

// ================== JOBSEEKER ROUTES ==================

// alias for convenience (optional)
app.get("/api/jobseeker/jobs", async (req, res) => {
  try {
    const jobs = await Job.find({ status: "approved" }).sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error("JOBSEEKER JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load jobs" });
  }
});

// analyze resume (upload + JD)
app.post(
  "/api/jobseeker/analyze",
  verifyToken,
  requireRole(["jobseeker"]),
  upload.single("resume"),
  async (req, res) => {
    try {
      const userId = req.user?.id || "";
      const userEmail = req.user?.email || "";
      const { jobId = "", jobTitle = "", jobDescription = "" } = req.body || {};

      if (!req.file) {
        return res.status(400).json({ message: "Resume file is required" });
      }

      // NOTE: real ATS parsing can be added later (pdf-parse/natural)
      // For now we store record and return dummy result (so UI works)
      const atsScore = 0;
      const matchedSkills = [];
      const missingSkills = [];
      const recommendations = [];

      const analysis = await Analysis.create({
        userId,
        userEmail,
        recruiterEmail: "",
        jobId,
        jobTitle: jobTitle || "Custom JD",
        resumeFile: `/uploads/${req.file.filename}`,
        atsScore,
        matchedSkills,
        missingSkills,
        recommendations,
        status: "Pending",
      });

      await Log.create({ level: "info", message: "Resume analyzed", actor: userEmail });

      return res.json({
        message: "Analysis created",
        analysis,
      });
    } catch (err) {
      console.error("JOBSEEKER ANALYZE ERROR:", err);
      return res.status(500).json({ message: "Analyze failed" });
    }
  }
);

// history
app.get(
  "/api/jobseeker/history",
  verifyToken,
  requireRole(["jobseeker"]),
  async (req, res) => {
    try {
      const userId = req.user?.id || "";
      const items = await Analysis.find({ userId }).sort({ createdAt: -1 });
      return res.json({ items });
    } catch (err) {
      console.error("JOBSEEKER HISTORY ERROR:", err);
      return res.status(500).json({ message: "Failed to load history" });
    }
  }
);

// ================== RECRUITER ROUTES ==================

// create job (pending by default)
app.post(
  "/api/recruiter/jobs",
  verifyToken,
  requireRole(["recruiter"]),
  async (req, res) => {
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
  }
);

// list recruiter jobs
app.get(
  "/api/recruiter/jobs",
  verifyToken,
  requireRole(["recruiter"]),
  async (req, res) => {
    try {
      const recruiterEmail = req.user?.email || "";
      const jobs = await Job.find({ postedBy: recruiterEmail }).sort({ createdAt: -1 });
      return res.json({ jobs });
    } catch (err) {
      console.error("RECRUITER JOBS ERROR:", err);
      return res.status(500).json({ message: "Failed to load jobs" });
    }
  }
);

// list candidates
app.get(
  "/api/recruiter/candidates",
  verifyToken,
  requireRole(["recruiter"]),
  async (req, res) => {
    try {
      const recruiterEmail = req.user?.email || "";
      const candidates = await Candidate.find({ recruiterEmail }).sort({ createdAt: -1 });
      return res.json({ candidates });
    } catch (err) {
      console.error("RECRUITER CANDIDATES ERROR:", err);
      return res.status(500).json({ message: "Failed to load candidates" });
    }
  }
);

// update candidate status
app.patch(
  "/api/recruiter/candidates/:id/status",
  verifyToken,
  requireRole(["recruiter"]),
  async (req, res) => {
    try {
      const recruiterEmail = req.user?.email || "";
      const { status } = req.body || {};
      if (!status) return res.status(400).json({ message: "Status is required" });

      const cand = await Candidate.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      );

      await Log.create({
        level: "info",
        message: "Candidate status updated",
        actor: recruiterEmail,
      });

      // Optional notification
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

// ================== ADMIN ROUTES (FIX 404 ISSUE) ==================

// GET STATS
app.get("/api/admin/stats", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalRecruiters = await User.countDocuments({ role: "recruiter" });
    const totalJobSeekers = await User.countDocuments({ role: "jobseeker" });
    const totalJobs = await Job.countDocuments();
    const totalResumes = await Analysis.countDocuments();
    const totalLogs = await Log.countDocuments();

    const avg = await Analysis.aggregate([
      { $group: { _id: null, avgScore: { $avg: "$atsScore" } } },
    ]);

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

// GET USERS
app.get("/api/admin/users", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    return res.json(users);
  } catch (err) {
    console.error("ADMIN USERS ERROR:", err);
    return res.status(500).json({ message: "Failed to load users" });
  }
});

// DELETE USER
app.delete("/api/admin/users/:id", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    return res.json({ message: "User deleted" });
  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    return res.status(500).json({ message: "Delete failed" });
  }
});

// UPDATE USER ROLE
app.put("/api/admin/users/:id/role", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ message: "Role is required" });

    await User.findByIdAndUpdate(req.params.id, { role });
    return res.json({ message: "Role updated" });
  } catch (err) {
    console.error("UPDATE ROLE ERROR:", err);
    return res.status(500).json({ message: "Role update failed" });
  }
});

// GET JOBS
app.get("/api/admin/jobs", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error("ADMIN JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load jobs" });
  }
});

// UPDATE JOB STATUS
app.patch("/api/admin/jobs/:id/status", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ message: "Status is required" });

    await Job.findByIdAndUpdate(req.params.id, { status });
    return res.json({ message: "Job status updated" });
  } catch (err) {
    console.error("UPDATE JOB STATUS ERROR:", err);
    return res.status(500).json({ message: "Job update failed" });
  }
});

// GET RESUMES
app.get("/api/admin/resumes", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const resumes = await Analysis.find().sort({ createdAt: -1 });
    return res.json(resumes);
  } catch (err) {
    console.error("ADMIN RESUMES ERROR:", err);
    return res.status(500).json({ message: "Failed to load resumes" });
  }
});

// GET LOGS
app.get("/api/admin/logs", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const logs = await Log.find().sort({ createdAt: -1 });
    return res.json(logs);
  } catch (err) {
    console.error("ADMIN LOGS ERROR:", err);
    return res.status(500).json({ message: "Failed to load logs" });
  }
});

// ================== IMPORTANT: JSON 404 for API (only once) ==================
app.use("/api", (req, res) => {
  return res.status(404).json({
    message: "API route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// ================== GLOBAL ERROR HANDLER (helps debugging) ==================
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  return res.status(500).json({ message: err.message || "Server error" });
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));