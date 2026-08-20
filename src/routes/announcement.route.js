const express = require('express')
const router = express.Router();
const { announcementController } = require('../controllers')
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')


router.post("/create", requireAuth, requireAdminRoles('Admin', 'Administrator'), announcementController.createAnnouncements)
router.get("/get", requireAuth, requireAdminRoles('Admin', 'Administrator', 'Sales Person'), announcementController.getAllAnnouncements)
router.get("/:id", requireAuth, requireAdminRoles('Admin', 'Administrator'), announcementController.getByIDAnnouncement)
router.put("/:id/update", requireAuth, requireAdminRoles('Admin', 'Administrator'), announcementController.updateAnnouncementController)
router.delete("/:id", requireAuth, requireAdminRoles('Admin', 'Administrator'), announcementController.deletedAnnouncement)
module.exports = router;