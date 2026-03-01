// routes/protectedRoutes.js
const express = require("express");
const router = express.Router();

// Middlewares
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");

// Controllers
const {
  uploadResume,
  analyzeResume,
  getCandidates,
  deleteUser
} = require("../controllers/protectedController");

// ==========================
// Jobseeker Routes
// ==========================

// Upload resume
router.post(
  "/upload-resume",
  authMiddleware,
  authorizeRoles("jobseeker"),
  uploadResume
);

// Analyze resume
router.post(
  "/analyze-resume",
  authMiddleware,
  authorizeRoles("jobseeker"),
  analyzeResume
);

// ==========================
// Recruiter Routes
// ==========================

// Get candidates
router.get(
  "/candidates",
  authMiddleware,
  authorizeRoles("recruiter"),
  getCandidates
);

// ==========================
// Admin Routes
// ==========================

// Delete a user
router.delete(
  "/users/:id",
  authMiddleware,
  authorizeRoles("admin"),
  deleteUser
);

module.exports = router;