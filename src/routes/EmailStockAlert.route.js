const express = require('express');
const router = express.Router();
const { SellEmailController }= require('../controllers');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization');

router.get('/getall', requireAuth, requireAdminRoles('Admin', 'Administrator', 'Inventory Manager'), SellEmailController.getStockReport);

module.exports = router;