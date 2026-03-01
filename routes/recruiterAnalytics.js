const express = require("express");
const router = express.Router();

const Job = require("../models/Job");
const Application = require("../models/Application");
const authorizeRoles = require("../middleware/roleMiddleware");

// GET recruiter analytics
router.get(
  "/dashboard",
  authorizeRoles("recruiter"),
  async (req, res) => {
    try {
      const recruiterId = req.user.id;

      // total jobs
      const totalJobs = await Job.countDocuments({
        recruiter: recruiterId,
      });

      // jobs list
      const jobs = await Job.find({ recruiter: recruiterId });

      const jobIds = jobs.map((job) => job._id);

      // total applications
      const totalApplications = await Application.countDocuments({
        job: { $in: jobIds },
      });

      // average ATS
      const avgATS = await Application.aggregate([
        { $match: { job: { $in: jobIds } } },
        {
          $group: {
            _id: null,
            avgScore: { $avg: "$atsScore" },
          },
        },
      ]);

      // shortlisted
      const shortlisted = await Application.countDocuments({
        job: { $in: jobIds },
        status: "shortlisted",
      });

      // rejected
      const rejected = await Application.countDocuments({
        job: { $in: jobIds },
        status: "rejected",
      });

      res.json({
        totalJobs,
        totalApplications,
        averageATS: avgATS[0]?.avgScore || 0,
        shortlisted,
        rejected,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
