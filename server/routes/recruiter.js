const express = require("express");
const router = express.Router(); // ⭐ THIS LINE WAS MISSING

const verifyToken = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// ===============================
// Recruiter Dashboard
// ===============================
router.get(
  "/dashboard",
  verifyToken,
  roleMiddleware(["recruiter"]),
  async (req, res) => {
    res.json({
      message: "Recruiter dashboard data",
    });
  }
);

// ===============================
// Post Job
// ===============================
router.post(
  "/post-job",
  verifyToken,
  roleMiddleware(["recruiter"]),
  async (req, res) => {
    res.json({
      message: "Job posted successfully",
    });
  }
);

module.exports = router;
