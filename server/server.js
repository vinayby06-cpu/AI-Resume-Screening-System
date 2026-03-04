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
    postedBy: { type: String, default: "" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);
const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Applicant" },
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
  { level: { type: String, default: "info" }, message: String, actor: String },
  { timestamps: true }
);
const Log = mongoose.models.Log || mongoose.model("Log", logSchema);

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

/* ✅ Debug endpoint: list routes (helps “API route not found”) */
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

/* ================== AUTH ROUTES ================== */
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

/* ================== JOBS ================== */
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
app.get("/api/recruiter/stats", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    const totalJobs = await Job.countDocuments({ postedBy: recruiterEmail });
    const totalCandidates = await Candidate.countDocuments({ recruiterEmail });

    return res.json({
      totalJobs,
      totalCandidates,
      averageATS: "0.0",
    });
  } catch (err) {
    console.error("RECRUITER STATS ERROR:", err);
    return res.status(500).json({ message: "Failed to load stats" });
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