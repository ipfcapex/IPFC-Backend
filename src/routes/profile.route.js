const express = require("express");
const router = express.Router();
const { Profile } = require("../controllers");
const authMiddleware = require("../middleware/authMiddleware");

// GET /api/user/profile
router.get("/", authMiddleware, Profile.getProfile);

module.exports = router;
