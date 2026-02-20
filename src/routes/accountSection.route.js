const express = require('express')
const router = express.Router();
const { accountSectionController } = require('../controllers')

router.put("/addNote/:id", accountSectionController.addNote)

module.exports = router;