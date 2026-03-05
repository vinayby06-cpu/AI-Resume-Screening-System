require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

/* ================== STARTUP CHECKS ================== */
if (!process.env.MONGO_URI) console.error("❌ MONGO_URI missing");
if (!process.env.JWT_SECRET) console.error("❌ JWT_SECRET missing (login will fail)");
if (!process.env.RESET_KEY) console.warn("⚠️ RESET_KEY missing (reset/debug disabled)");

/* ================== HELPERS ================== */
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const normalizeText = (v) => String(v || "").trim();
const ROLES = new Set(["admin", "recruiter", "jobseeker"]);

const toSkillsArray = (skills) => {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.map((s) => normalizeText(s)).filter(Boolean);
  return String(skills)
    .split(",")
    .map((s) => normalizeText(s))
    .filter(Boolean);
};

/* ================== BODY PARSERS ================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ================== CORS ==================
   NOTE: If you serve React from same backend domain (single service),
   you can remove CORS in production. For now we keep it safe. */
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "https://ai-resume-screening-system.netlify.app",
  "https://ai-resume-screening-system-by.onrender.com", // your Render frontend domain (if any)
  "https://ai-resume-screening-system-vinay.onrender.com", // your Render backend domain
]);

function isAllowedOrigin(origin) {
  if (!origin) return true; // Postman/curl
  if (allowedOrigins.has(origin)) return true;

  // Netlify previews: https://deploy-preview-123--site.netlify.app
  if (/^https:\/\/deploy-preview-\d+--ai-resume-screening-system\.netlify\.app$/.test(origin))
    return true;

  // Netlify branch deploys: https://main--site.netlify.app
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

/* ================== REQUEST LOG ================== */
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

/* ================== UPLOADS STATIC ================== */
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use("/uploads", express.static(uploadsDir));

/* ================== DB CONNECT ================== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

/* ================== MODELS ================== */
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
userSchema.index({ email: 1 }, { unique: true });
const User = mongoose.models.User || mongoose.model("User", userSchema);

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    skills: { type: [String], default: [] },
    postedBy: { type: String, default: "" }, // recruiterEmail
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);
const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Applicant" },
    email: { type: String, required: true }, // jobseeker email
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
  { level: { type: String, default: "info" }, message: String, actor: String },
  { timestamps: true }
);
const Log = mongoose.models.Log || mongoose.model("Log", logSchema);

/* ✅ Admin settings */
const settingsSchema = new mongoose.Schema(
  {
    allowRegistration: { type: Boolean, default: true },
    enableResumeUpload: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);
const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

/* ================== AUTH ================== */
const verifyToken = (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: "No token provided" });

    const token = auth.startsWith("Bearer ") ? auth.split(" ")[1] : auth;
    req.user = jwt.verify(token, process.env.JWT_SECRET);
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

/* ================== MULTER ================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

/* ================== BASIC ROUTES ================== */
app.get("/", (req, res) => res.send("🚀 AI Resume Screening Backend Running"));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    mongoReadyState: mongoose.connection.readyState,
  });
});

/* ✅ Debug endpoint: list routes */
app.get("/api/routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach((m) => {
    if (m.route && m.route.path) {
      const methods = Object.keys(m.route.methods).map((x) => x.toUpperCase());
      routes.push({ path: m.route.path, methods });
    }
  });
  res.json({ routes });
});

/* ✅ Who am I */
app.get("/api/me", verifyToken, async (req, res) => {
  try {
    const email = req.user?.email || "";
    const user = await User.findOne({ email }).select("_id name email role createdAt");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user });
  } catch (err) {
    console.error("ME ERROR:", err);
    return res.status(500).json({ message: "Failed to load user" });
  }
});

/* ================== AUTH ROUTES ================== */
app.post("/api/auth/register", async (req, res) => {
  try {
    let { name, email, password, role } = req.body || {};
    name = normalizeText(name);
    email = normalizeEmail(email);
    password = String(password || "");
    role = normalizeText(role);

    const s = await Settings.findOne({});
    if (s && s.allowRegistration === false) {
      return res.status(403).json({ message: "Registration is disabled" });
    }

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (!ROLES.has(role)) return res.status(400).json({ message: "Invalid role" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, role });

    return res.status(201).json({
      message: "User registered successfully",
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    if (err?.code === 11000) return res.status(409).json({ message: "User already exists" });
    return res.status(500).json({ message: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    let { email, password, role } = req.body || {};
    email = normalizeEmail(email);
    password = String(password || "");
    role = normalizeText(role);

    console.log("LOGIN TRY:", { email, hasPassword: !!password, role: role || "not-sent" });

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    console.log("USER FOUND:", !!user);

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

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

/* ================== PUBLIC JOBS ================== */
app.get("/api/jobs", async (req, res) => {
  try {
    const jobs = await Job.find({ status: "approved" }).sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error("GET JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load jobs" });
  }
});

/* ================== RECRUITER ================== */
/* ✅ Shared stats logic so GET + POST both work */
async function recruiterStatsHandler(req, res) {
  try {
    const recruiterEmail = req.user?.email || "";
    const totalJobs = await Job.countDocuments({ postedBy: recruiterEmail });
    const totalCandidates = await Candidate.countDocuments({ recruiterEmail });

    const agg = await Candidate.aggregate([
      { $match: { recruiterEmail } },
      { $group: { _id: null, avg: { $avg: "$atsScore" } } },
    ]);
    const averageATS = agg?.[0]?.avg ? Number(agg[0].avg).toFixed(1) : "0.0";

    return res.json({ totalJobs, totalCandidates, averageATS });
  } catch (err) {
    console.error("RECRUITER STATS ERROR:", err);
    return res.status(500).json({ message: "Failed to load stats" });
  }
}

/* ✅ Works for both GET and POST (fixes your current frontend call) */
app.get("/api/recruiter/stats", verifyToken, requireRole(["recruiter"]), recruiterStatsHandler);
app.post("/api/recruiter/stats", verifyToken, requireRole(["recruiter"]), recruiterStatsHandler);

app.post("/api/recruiter/jobs", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    let { title, skills } = req.body || {};
    title = normalizeText(title);
    const skillsArr = toSkillsArray(skills);

    if (!title) return res.status(400).json({ message: "Job title is required" });

    const recruiterEmail = req.user?.email || "";
    const job = await Job.create({
      title,
      skills: skillsArr,
      postedBy: recruiterEmail,
      status: "pending",
    });

    await Log.create({ level: "info", message: "Recruiter posted job", actor: recruiterEmail });

    return res.status(201).json({ message: "Job created (pending approval)", job });
  } catch (err) {
    console.error("RECRUITER CREATE JOB ERROR:", err);
    return res.status(500).json({ message: "Failed to create job" });
  }
});

app.get("/api/recruiter/jobs", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    const jobs = await Job.find({ postedBy: recruiterEmail }).sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error("RECRUITER GET JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load recruiter jobs" });
  }
});

app.get(
  "/api/recruiter/candidates",
  verifyToken,
  requireRole(["recruiter"]),
  async (req, res) => {
    try {
      const recruiterEmail = req.user?.email || "";
      const candidates = await Candidate.find({ recruiterEmail }).sort({ createdAt: -1 });
      return res.json(candidates);
    } catch (err) {
      console.error("RECRUITER GET CANDIDATES ERROR:", err);
      return res.status(500).json({ message: "Failed to load candidates" });
    }
  }
);

app.patch(
  "/api/recruiter/candidates/:id/status",
  verifyToken,
  requireRole(["recruiter"]),
  async (req, res) => {
    try {
      const recruiterEmail = req.user?.email || "";
      const id = req.params.id;
      const status = normalizeText(req.body?.status);

      if (!status) return res.status(400).json({ message: "Status is required" });

      const cand = await Candidate.findOneAndUpdate(
        { _id: id, recruiterEmail },
        { status },
        { new: true }
      );

      if (!cand) return res.status(404).json({ message: "Candidate not found" });

      await Log.create({
        level: "info",
        message: `Recruiter updated candidate status -> ${status}`,
        actor: recruiterEmail,
      });

      return res.json({ message: "Status updated", candidate: cand });
    } catch (err) {
      console.error("RECRUITER UPDATE CANDIDATE STATUS ERROR:", err);
      return res.status(500).json({ message: "Failed to update status" });
    }
  }
);

/* ================== JOBSEEKER ================== */
app.post("/api/jobseeker/apply", verifyToken, requireRole(["jobseeker"]), async (req, res) => {
  try {
    const jobseekerEmail = req.user?.email || "";
    let { jobId, name } = req.body || {};
    jobId = normalizeText(jobId);
    name = normalizeText(name) || "Applicant";

    if (!jobId) return res.status(400).json({ message: "jobId is required" });

    const job = await Job.findById(jobId);
    if (!job || job.status !== "approved") {
      return res.status(404).json({ message: "Job not found or not approved" });
    }

    const existing = await Candidate.findOne({ email: jobseekerEmail, jobId: job._id.toString() });
    if (existing) return res.status(409).json({ message: "Already applied to this job" });

    const cand = await Candidate.create({
      name,
      email: jobseekerEmail,
      recruiterEmail: job.postedBy,
      jobId: job._id.toString(),
      jobTitle: job.title,
      atsScore: 0,
      status: "Pending",
    });

    await Log.create({ level: "info", message: "Jobseeker applied", actor: jobseekerEmail });

    return res.status(201).json({ message: "Applied successfully", candidate: cand });
  } catch (err) {
    console.error("JOBSEEKER APPLY ERROR:", err);
    return res.status(500).json({ message: "Failed to apply" });
  }
});

app.get(
  "/api/jobseeker/applications",
  verifyToken,
  requireRole(["jobseeker"]),
  async (req, res) => {
    try {
      const jobseekerEmail = req.user?.email || "";
      const apps = await Candidate.find({ email: jobseekerEmail }).sort({ createdAt: -1 });
      return res.json(apps);
    } catch (err) {
      console.error("JOBSEEKER APPLICATIONS ERROR:", err);
      return res.status(500).json({ message: "Failed to load applications" });
    }
  }
);

app.post(
  "/api/jobseeker/analyze",
  verifyToken,
  requireRole(["jobseeker"]),
  upload.single("resume"),
  async (req, res) => {
    try {
      const s = await Settings.findOne({});
      if (s && s.enableResumeUpload === false) {
        return res.status(403).json({ message: "Resume upload is disabled" });
      }

      const userId = req.user?.id || "";
      const userEmail = req.user?.email || "";

      const resumeFile = req.file ? `/uploads/${req.file.filename}` : "";
      if (!resumeFile) return res.status(400).json({ message: "Resume file is required" });

      const analysis = await Analysis.create({
        userId,
        userEmail,
        resumeFile,
        atsScore: 0,
        matchedSkills: [],
        missingSkills: [],
        recommendations: [],
        status: "Pending",
      });

      await Log.create({ level: "info", message: "Jobseeker uploaded resume", actor: userEmail });

      return res.status(201).json({ message: "Analysis created", analysis });
    } catch (err) {
      console.error("JOBSEEKER ANALYZE ERROR:", err);
      return res.status(500).json({ message: "Failed to analyze resume" });
    }
  }
);

app.get("/api/jobseeker/history", verifyToken, requireRole(["jobseeker"]), async (req, res) => {
  try {
    const userId = req.user?.id || "";
    const list = await Analysis.find({ userId }).sort({ createdAt: -1 });
    return res.json(list);
  } catch (err) {
    console.error("JOBSEEKER HISTORY ERROR:", err);
    return res.status(500).json({ message: "Failed to load history" });
  }
});

/* ================== ADMIN ================== */
app.get("/api/admin/stats", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    const totalRecruiters = await User.countDocuments({ role: "recruiter" });
    const totalJobSeekers = await User.countDocuments({ role: "jobseeker" });

    const totalJobs = await Job.countDocuments({});
    const totalResumes = await Analysis.countDocuments({});
    const totalLogs = await Log.countDocuments({});

    const agg = await Analysis.aggregate([{ $group: { _id: null, avg: { $avg: "$atsScore" } } }]);
    const avgScore = agg?.[0]?.avg ? Number(agg[0].avg).toFixed(1) : 0;

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
    console.error("ADMIN STATS ERROR:", err);
    return res.status(500).json({ message: "Failed to load admin stats" });
  }
});

app.get("/api/admin/users", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const users = await User.find({})
      .select("_id name email role createdAt")
      .sort({ createdAt: -1 });
    return res.json(users);
  } catch (err) {
    console.error("ADMIN GET USERS ERROR:", err);
    return res.status(500).json({ message: "Failed to load users" });
  }
});

app.put("/api/admin/users/:id/role", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const id = req.params.id;
    const role = normalizeText(req.body?.role);

    if (!ROLES.has(role)) return res.status(400).json({ message: "Invalid role" });

    const updated = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, select: "_id name email role createdAt" }
    );

    if (!updated) return res.status(404).json({ message: "User not found" });

    await Log.create({
      level: "info",
      message: `Admin updated user role -> ${role}`,
      actor: req.user?.email,
    });

    return res.json({ message: "Role updated", user: updated });
  } catch (err) {
    console.error("ADMIN UPDATE ROLE ERROR:", err);
    return res.status(500).json({ message: "Failed to update role" });
  }
});

app.delete("/api/admin/users/:id", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await Log.create({
      level: "info",
      message: "Admin deleted user",
      actor: req.user?.email,
    });

    return res.json({ message: "User deleted" });
  } catch (err) {
    console.error("ADMIN DELETE USER ERROR:", err);
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

app.get("/api/admin/jobs", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const status = normalizeText(req.query?.status);
    const filter = status ? { status } : {};
    const jobs = await Job.find(filter).sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error("ADMIN GET JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load jobs" });
  }
});

app.patch("/api/admin/jobs/:id/status", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const id = req.params.id;
    const status = normalizeText(req.body?.status);

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const job = await Job.findByIdAndUpdate(id, { status }, { new: true });
    if (!job) return res.status(404).json({ message: "Job not found" });

    await Log.create({
      level: "info",
      message: `Admin set job status -> ${status}`,
      actor: req.user?.email,
    });

    return res.json({ message: "Job status updated", job });
  } catch (err) {
    console.error("ADMIN UPDATE JOB STATUS ERROR:", err);
    return res.status(500).json({ message: "Failed to update job status" });
  }
});

app.get("/api/admin/resumes", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const items = await Analysis.find({}).sort({ createdAt: -1 }).limit(500);
    return res.json(items);
  } catch (err) {
    console.error("ADMIN GET RESUMES ERROR:", err);
    return res.status(500).json({ message: "Failed to load resumes" });
  }
});

app.get("/api/admin/logs", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const items = await Log.find({}).sort({ createdAt: -1 }).limit(200);
    return res.json(items);
  } catch (err) {
    console.error("ADMIN GET LOGS ERROR:", err);
    return res.status(500).json({ message: "Failed to load logs" });
  }
});

app.get("/api/admin/settings", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    let s = await Settings.findOne({});
    if (!s) s = await Settings.create({});
    return res.json({
      allowRegistration: !!s.allowRegistration,
      enableResumeUpload: !!s.enableResumeUpload,
      maintenanceMode: !!s.maintenanceMode,
    });
  } catch (err) {
    console.error("ADMIN GET SETTINGS ERROR:", err);
    return res.status(500).json({ message: "Failed to load settings" });
  }
});

app.put("/api/admin/settings", verifyToken, requireRole(["admin"]), async (req, res) => {
  try {
    const allowRegistration = !!req.body?.allowRegistration;
    const enableResumeUpload = !!req.body?.enableResumeUpload;
    const maintenanceMode = !!req.body?.maintenanceMode;

    let s = await Settings.findOne({});
    if (!s) s = await Settings.create({});

    s.allowRegistration = allowRegistration;
    s.enableResumeUpload = enableResumeUpload;
    s.maintenanceMode = maintenanceMode;
    await s.save();

    await Log.create({
      level: "info",
      message: "Admin updated system settings",
      actor: req.user?.email,
    });

    return res.json({ message: "Settings saved" });
  } catch (err) {
    console.error("ADMIN SAVE SETTINGS ERROR:", err);
    return res.status(500).json({ message: "Failed to save settings" });
  }
});

/* ================== API 404 ================== */
app.use("/api", (req, res) => {
  return res.status(404).json({
    message: "API route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

/* ================== SPA SUPPORT (OPTIONAL) ==================
   If you are using single-service Render deployment, build React and copy to:
   server/client/build
*/
const clientBuildPath = path.join(__dirname, "client", "build");

if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));

  // Any non-API request -> index.html (fixes /login Not Found)
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
} else {
  console.warn("⚠️ React build not found at:", clientBuildPath);
}

/* ================== GLOBAL ERROR ================== */
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  return res.status(500).json({ message: err.message || "Server error" });
});

/* ================== START ================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));