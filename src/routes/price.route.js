const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/price.controller');
const upload = require('../middleware/csv.multer'); 

// router.post('/upload', upload.any(), pricingController.uploadAndMergeCSV);

module.exports = router;
