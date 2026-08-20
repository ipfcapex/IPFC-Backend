
const express = require("express");
const router = express.Router();
const { LogController } = require("../controllers");
const { requireAuth, requireAdminRoles } = require("../middleware/auth.authorization");

router.get("/", requireAuth, requireAdminRoles('Admin', 'Administrator'), LogController.getLogs);
// router.get("/warehouse", LogController.getWarehouseLogs);
module.exports = router;