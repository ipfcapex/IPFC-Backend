const express = require('express');
const router = express.Router();
const TallyController = require('../controllers/Tally.controller');
const TallyService= require('../services/Tally.service');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')

router.post('/add', TallyController.createSalesVoucher);

router.get('/getall', TallyController.getAllVouchers);

router.get('/getCompany', TallyController.getCompanies);

router.get('/getLedgers', TallyController.getLedgers);

router.get('/getItem', TallyController.getItems);

router.get('/getUnit', TallyController.getUnits);

module.exports = router;