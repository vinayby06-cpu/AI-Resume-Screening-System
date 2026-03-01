// Role-based access control middleware

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      // user comes from authMiddleware
      const userRole = req.user?.role;

      if (!userRole) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: no user role found",
        });
      }

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: insufficient role",
        });
      }

      next();
    } catch (error) {
      console.error("AuthorizeRoles error:", error);
      res.status(500).json({
        success: false,
        message: "Server error in role authorization",
      });
    }
  };
};

module.exports = authorizeRoles;
