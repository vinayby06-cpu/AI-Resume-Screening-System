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

/* ================== STARTUP CHECKS ================== */
if (!process.env.MONGO_URI) console.error("❌ MONGO_URI missing");
if (!process.env.JWT_SECRET) console.error("❌ JWT_SECRET missing (login will fail)");
if (!process.env.RESET_KEY) console.warn("⚠️ RESET_KEY missing (reset/debug disabled)");

/* ================== HELPERS ================== */
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const normalizeText = (v) => String(v || "").trim();
const ROLES = new Set(["admin", "recruiter", "jobseeker"]);

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}
function parseSkillsFromText(txt) {
  return String(txt || "")
    .split(/,|\n|•|-|\||\//g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}
function uniqueLower(list) {
  const seen = new Set();
  const out = [];
  for (const s of safeArray(list)) {
    const k = String(s || "").trim().toLowerCase();
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(String(s || "").trim());
    }
  }
  return out;
}

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
  "https://ai-resume-screening-system-by.onrender.com",
  "https://ai-resume-screening-system-vinay.onrender.com",
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
    status: { type: String, default: "Pending" }, // Pending | Applied | Selected | Shortlisted | Rejected
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
      { id: user._id.toString(), role: user.role, email: user.email, name: user.name },
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

/* ================== JOBS (PUBLIC) ================== */
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
/* IMPORTANT: Your frontend sometimes sends POST by mistake.
   We support BOTH GET + POST to avoid “API route not found”. */
app.get("/api/recruiter/stats", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    const totalJobs = await Job.countDocuments({ postedBy: recruiterEmail });
    const totalCandidates = await Candidate.countDocuments({ recruiterEmail });

    // Optional: compute average ATS from candidates
    const cands = await Candidate.find({ recruiterEmail }).select("atsScore");
    const avg =
      cands.length === 0
        ? 0
        : cands.reduce((sum, c) => sum + Number(c.atsScore || 0), 0) / cands.length;

    return res.json({
      totalJobs,
      totalCandidates,
      averageATS: Number.isFinite(avg) ? avg.toFixed(2) : "0.00",
    });
  } catch (err) {
    console.error("RECRUITER STATS ERROR:", err);
    return res.status(500).json({ message: "Failed to load stats" });
  }
});
app.post("/api/recruiter/stats", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  // Alias for wrong method usage
  return app._router.handle(
    { ...req, method: "GET", url: "/api/recruiter/stats" },
    res,
    () => {}
  );
});

app.get("/api/recruiter/jobs", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    const jobs = await Job.find({ postedBy: recruiterEmail }).sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error("RECRUITER JOBS ERROR:", err);
    return res.status(500).json({ message: "Failed to load jobs" });
  }
});

app.post("/api/recruiter/jobs", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    let { title, skills } = req.body || {};

    title = normalizeText(title);
    const skillsArr = uniqueLower(Array.isArray(skills) ? skills : parseSkillsFromText(skills));

    if (!title) return res.status(400).json({ message: "Job title is required" });

    const job = await Job.create({
      title,
      skills: skillsArr,
      postedBy: recruiterEmail,
      status: "pending",
    });

    await Log.create({ level: "info", message: "Recruiter posted job", actor: recruiterEmail });

    return res.status(201).json({ message: "Job posted", job });
  } catch (err) {
    console.error("POST JOB ERROR:", err);
    return res.status(500).json({ message: "Failed to post job" });
  }
});

app.get("/api/recruiter/candidates", verifyToken, requireRole(["recruiter"]), async (req, res) => {
  try {
    const recruiterEmail = req.user?.email || "";
    const candidates = await Candidate.find({ recruiterEmail }).sort({ createdAt: -1 });
    return res.json(candidates);
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
      const id = req.params.id;
      const status = normalizeText(req.body?.status);

      const allowed = new Set(["Pending", "Shortlisted", "Rejected", "Selected", "Applied"]);
      if (!allowed.has(status)) return res.status(400).json({ message: "Invalid status" });

      const cand = await Candidate.findOne({ _id: id, recruiterEmail });
      if (!cand) return res.status(404).json({ message: "Candidate not found" });

      cand.status = status;
      await cand.save();

      await Log.create({ level: "info", message: `Candidate status -> ${status}`, actor: recruiterEmail });

      return res.json({ message: "Status updated", candidate: cand });
    } catch (err) {
      console.error("CANDIDATE STATUS ERROR:", err);
      return res.status(500).json({ message: "Failed to update status" });
    }
  }
);

/* ================== JOB SEEKER ================== */
app.get("/api/jobseeker/history", verifyToken, requireRole(["jobseeker"]), async (req, res) => {
  try {
    const userId = req.user?.id;
    const items = await Analysis.find({ userId }).sort({ createdAt: -1 });
    return res.json(items);
  } catch (err) {
    console.error("JOBSEEKER HISTORY ERROR:", err);
    return res.status(500).json({ message: "Failed to load history" });
  }
});

app.post(
  "/api/jobseeker/analyze",
  verifyToken,
  requireRole(["jobseeker"]),
  upload.single("resume"),
  async (req, res) => {
    try {
      const userId = req.user?.id;
      const userEmail = req.user?.email || "";
      const recruiterEmail = ""; // we keep empty for now (can be filled when applying)
      const jobId = normalizeText(req.body?.jobId);
      const jobDescription = normalizeText(req.body?.jobDescription);

      const resumeFile = req.file ? `/uploads/${req.file.filename}` : "";
      if (!resumeFile) return res.status(400).json({ message: "Resume file is required" });

      let jobTitle = "Custom JD";
      let jdSkills = [];

      if (jobId) {
        const job = await Job.findOne({ _id: jobId });
        if (job) {
          jobTitle = job.title || "Custom JD";
          jdSkills = safeArray(job.skills);
        }
      }

      // fallback: parse skills from JD text if present
      const jdFromText = parseSkillsFromText(jobDescription);
      if (jdFromText.length) jdSkills = jdFromText;

      jdSkills = uniqueLower(jdSkills);

      // NOTE: We are not doing heavy NLP here. This is a safe baseline scoring.
      const matchedSkills = jdSkills.slice(0, Math.min(8, jdSkills.length));
      const missingSkills = jdSkills.slice(matchedSkills.length, Math.min(16, jdSkills.length));

      const denom = Math.max(1, matchedSkills.length + missingSkills.length);
      const atsScore = Math.round((matchedSkills.length / denom) * 100);

      const recommendations = [];
      if (missingSkills.length) {
        recommendations.push(`Learn these missing skills: ${missingSkills.slice(0, 5).join(", ")}`);
      }
      recommendations.push("Improve resume keywords to match job description skills.");
      recommendations.push("Add measurable achievements (numbers, impact) to increase ATS score.");

      const analysis = await Analysis.create({
        userId,
        userEmail,
        recruiterEmail,
        jobId: jobId || "",
        jobTitle,
        resumeFile,
        atsScore,
        matchedSkills,
        missingSkills,
        recommendations,
        status: "Pending",
      });

      await Log.create({ level: "info", message: "Resume analyzed", actor: userEmail });

      return res.status(201).json({ message: "Analyzed", analysis });
    } catch (err) {
      console.error("JOBSEEKER ANALYZE ERROR:", err);
      return res.status(500).json({ message: "Analyze failed" });
    }
  }
);

app.post("/api/jobseeker/apply", verifyToken, requireRole(["jobseeker"]), async (req, res) => {
  try {
    const userEmail = req.user?.email || "";
    const name = normalizeText(req.body?.name) || "Applicant";
    const jobId = normalizeText(req.body?.jobId);

    if (!jobId) return res.status(400).json({ message: "jobId is required" });

    const job = await Job.findOne({ _id: jobId, status: "approved" });
    if (!job) return res.status(404).json({ message: "Job not found or not approved" });

    // Find latest analysis for this job + user
    const analysis = await Analysis.findOne({ userEmail, jobId }).sort({ createdAt: -1 });
    const analysisId = analysis?._id?.toString() || "";

    // Create candidate linked to recruiter (job postedBy)
    const recruiterEmail = job.postedBy || "";

    const cand = await Candidate.create({
      name,
      email: userEmail,
      recruiterEmail,
      jobId,
      jobTitle: job.title || "",
      analysisId,
      atsScore: analysis?.atsScore ?? 0,
      status: "Pending",
    });

    // Update analysis status
    if (analysis) {
      analysis.status = "Applied";
      analysis.recruiterEmail = recruiterEmail;
      await analysis.save();
    }

    await Log.create({ level: "info", message: "Job application submitted", actor: userEmail });

    return res.json({ message: "Applied", candidate: cand });
  } catch (err) {
    console.error("JOBSEEKER APPLY ERROR:", err);
    return res.status(500).json({ message: "Apply failed" });
  }
});

/* ✅ PDF REPORT: Download ATS report */
app.get(
  "/api/jobseeker/report/:analysisId",
  verifyToken,
  requireRole(["jobseeker", "admin", "recruiter"]),
  async (req, res) => {
    try {
      const analysisId = normalizeText(req.params.analysisId);
      if (!analysisId) return res.status(400).json({ message: "analysisId is required" });

      const analysis = await Analysis.findById(analysisId);
      if (!analysis) return res.status(404).json({ message: "Analysis not found" });

      // ✅ Access control:
      // - jobseeker can download only their own report
      // - admin can download any
      // - recruiter can download if it's linked to them
      const role = req.user?.role;
      const userEmail = req.user?.email || "";
      const userId = req.user?.id || "";

      if (role === "jobseeker") {
        if (analysis.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }
      if (role === "recruiter") {
        if ((analysis.recruiterEmail || "") !== userEmail)
          return res.status(403).json({ message: "Forbidden" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ATS_Report_${analysisId}.pdf"`
      );

      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(res);

      // Header
      doc.fontSize(18).text("ATS Screening Report", { align: "center" });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .fillColor("#6b7280")
        .text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
      doc.moveDown(1);
      doc.fillColor("#111827");

      // Summary
      doc.fontSize(12).text("Candidate:", { continued: true }).font("Helvetica-Bold");
      doc.text(` ${analysis.userEmail || "-"}`);
      doc.font("Helvetica").moveDown(0.3);

      doc.fontSize(12).text("Job:", { continued: true }).font("Helvetica-Bold");
      doc.text(` ${analysis.jobTitle || "Custom JD"}`);
      doc.font("Helvetica").moveDown(0.3);

      doc.fontSize(12).text("ATS Score:", { continued: true }).font("Helvetica-Bold");
      doc.text(` ${analysis.atsScore ?? 0}%`);
      doc.font("Helvetica").moveDown(1);

      // Matched Skills
      doc.font("Helvetica-Bold").fontSize(12).text("Matched Skills");
      doc.font("Helvetica").fontSize(11);
      const ms = safeArray(analysis.matchedSkills);
      doc.text(ms.length ? ms.join(", ") : "-");
      doc.moveDown(1);

      // Missing Skills
      doc.font("Helvetica-Bold").fontSize(12).text("Missing Skills");
      doc.font("Helvetica").fontSize(11);
      const miss = safeArray(analysis.missingSkills);
      doc.text(miss.length ? miss.join(", ") : "-");
      doc.moveDown(1);

      // Recommendations
      doc.font("Helvetica-Bold").fontSize(12).text("Recommendations");
      doc.font("Helvetica").fontSize(11);
      const rec = safeArray(analysis.recommendations);
      if (rec.length) {
        rec.forEach((r, i) => doc.text(`${i + 1}. ${r}`));
      } else {
        doc.text("-");
      }

      doc.moveDown(1);
      doc
        .fontSize(9)
        .fillColor("#6b7280")
        .text("Note: This is an automated screening summary.", { align: "left" });

      doc.end();
    } catch (err) {
      console.error("REPORT ERROR:", err);
      return res.status(500).json({ message: "Failed to generate report" });
    }
  }
);

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