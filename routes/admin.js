const router = require("express").Router();
const authorizeRoles = require("../middleware/roleMiddleware");

router.get("/dashboard", authorizeRoles("admin"), (req, res) => {
  res.json({ message: "Welcome Admin" });
});

module.exports = router;
