const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Job seeker dashboard
router.get(
  "/dashboard",
  verifyToken,
  roleMiddleware(["jobseeker"]),
  (req, res) => {
    res.json({
      message: "Job Seeker Dashboard",
      user: req.user,
    });
  }
);

module.exports = router;
