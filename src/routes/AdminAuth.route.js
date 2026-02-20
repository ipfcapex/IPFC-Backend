const express = require('express')
const router = express.Router();
const { AdminAuthService } = require('../controllers')


router.post("/token", AdminAuthService.resetAdminAuthController)
router.put("/:id", AdminAuthService.updateUserController)

module.exports = router;