const express = require('express');
const router = express.Router();
const { SellEmailController }= require('../controllers');

router.get('/getall', SellEmailController.getStockReport);

module.exports = router;