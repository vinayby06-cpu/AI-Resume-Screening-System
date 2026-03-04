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

/**
 * ✅ CORS
 * If you will serve frontend from SAME backend domain, CORS is not needed for prod.
 * But keep localhost + netlify allowed for dev/testing.
 */
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

// Request log
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

// ================== STATIC UPLOADS ==================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ================== API ROUTES ==================
app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    mongoReadyState: mongoose.connection.readyState,
  });
});

// REGISTER
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
      return res.status(400).json({ message: "Invalid role (use admin/recruiter/jobseeker)" });
    }

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

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    let { email, password, role } = req.body || {};
    email = normalizeEmail(email);
    password = String(password || "");
    role = normalizeText(role);

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    // optional role check if frontend sends it
    if (role && user.role !== role) return res.status(401).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
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

// recruiter stats
app.get("/api/recruiter/stats", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    const totalJobs = await Job.countDocuments({ postedBy: recruiterEmail });
    const totalCandidates = await Candidate.countDocuments({ recruiterEmail });
    return res.json({ totalJobs, totalCandidates, averageATS: "0.0" });
  } catch (err) {
    console.error("RECRUITER STATS ERROR:", err);
    return res.status(500).json({ message: "Failed to load stats" });
  }
});

// ================== API 404 ONLY ==================
app.use("/api", (req, res) => {
  return res.status(404).json({
    message: "API route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// ================== SERVE REACT FRONTEND (SPA SUPPORT) ==================
/**
 * Put React build into: server/client/build
 * Then all frontend routes like /login will work (no blank page)
 */
const clientBuildPath = path.join(__dirname, "client", "build");

if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));

  // SPA fallback: any non-API route -> index.html
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
} else {
  console.warn("⚠️ React build folder not found at:", clientBuildPath);
  // fallback home
  app.get("/", (req, res) => res.send("🚀 Backend running (React build not found)"));
}

// ================== GLOBAL ERROR HANDLER ==================
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  return res.status(500).json({ message: err.message || "Server error" });
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));