
const express = require("express");
const router = express.Router();
const { LogController } = require("../controllers");

router.get("/", LogController.getLogs);
// router.get("/warehouse", LogController.getWarehouseLogs);
module.exports = router;
