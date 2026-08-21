const express = require('express');
const router = express.Router();
const TallyController = require('../controllers/Tally.controller');
const TallyService= require('../services/Tally.service');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')

router.post('/add', requireAuth, requireAdminRoles('Admin', 'Administrator'), TallyController.createSalesVoucher);

router.get('/getall', requireAuth, requireAdminRoles('Admin', 'Administrator'), TallyController.getAllVouchers);

router.get('/getCompany', requireAuth, requireAdminRoles('Admin', 'Administrator'), TallyController.getCompanies);

router.get('/getLedgers', requireAuth, requireAdminRoles('Admin', 'Administrator'), TallyController.getLedgers);

router.get('/getItem', requireAuth, requireAdminRoles('Admin', 'Administrator'), TallyController.getItems);

router.get('/getUnit', requireAuth, requireAdminRoles('Admin', 'Administrator'), TallyController.getUnits);

module.exports = router;