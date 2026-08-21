const express = require('express')
const router = express.Router();
const { accountSectionController } = require('../controllers')
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')

router.put("/addNote/:id", requireAuth, requireAdminRoles('Admin', 'Administrator', 'Account Section'), accountSectionController.addNote)

module.exports = router;