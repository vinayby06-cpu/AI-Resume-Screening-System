const Resume = require("../models/Resume");
const { calculateMatchScore } = require("../utils/matchScore");

// =====================================================
// 🟢 JOBSEEKER — Upload Resume + Analyze + Save
// =====================================================
exports.uploadResume = async (req, res) => {
  try {
    const { skills = [], jobDescription = "" } = req.body;

    // ✅ Validation
    if (!Array.isArray(skills)) {
      return res.status(400).json({
        success: false,
        message: "Skills must be an array",
      });
    }

    // ✅ Calculate match score
    const result = calculateMatchScore(skills, jobDescription);

    // ✅ Save resume
    const resume = await Resume.create({
      userId: req.user.userId,
      skills,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      matchScore: result.score,
    });

    res.json({
      success: true,
      message: "Resume uploaded and analyzed successfully",
      resume,
    });
  } catch (error) {
    console.error("Upload resume error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// =====================================================
// 🟢 JOBSEEKER — Analyze Resume (without saving)
// =====================================================
exports.analyzeResume = async (req, res) => {
  try {
    const { resumeSkills = [], jobDescription = "" } = req.body;

    // ✅ Validation
    if (!Array.isArray(resumeSkills)) {
      return res.status(400).json({
        success: false,
        message: "resumeSkills must be an array",
      });
    }

    // ✅ Calculate score
    const result = calculateMatchScore(resumeSkills, jobDescription);

    res.json({
      success: true,
      message: "Resume analyzed successfully",
      data: {
        matchedSkills: result.matchedSkills,
        missingSkills: result.missingSkills,
        score: result.score,
        suggestions: result.missingSkills,
      },
    });
  } catch (error) {
    console.error("Analyze resume error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// =====================================================
// 🟢 RECRUITER — Get Top Candidates
// =====================================================
exports.getCandidates = async (req, res) => {
  try {
    const { skill } = req.query;

    let query = {};

    // ✅ Optional skill filter
    if (skill) {
      query.skills = { $regex: skill, $options: "i" };
    }

    const candidates = await Resume.find(query)
      .sort({ matchScore: -1 })
      .limit(50);

    res.json({
      success: true,
      message: "Candidates fetched (recruiter access)",
      candidates,
    });
  } catch (error) {
    console.error("Get candidates error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// =====================================================
// 🟢 ADMIN — Delete User Resume
// =====================================================
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    await Resume.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "User resume deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};