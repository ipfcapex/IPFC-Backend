const express = require('express')
const router = express.Router();
const { announcementController } = require('../controllers')


router.post("/create", announcementController.createAnnouncements)
router.get("/get", announcementController.getAllAnnouncements)
router.get("/:id", announcementController.getByIDAnnouncement)
router.put("/:id/update", announcementController.updateAnnouncementController)
router.delete("/:id", announcementController.deletedAnnouncement)
module.exports = router;