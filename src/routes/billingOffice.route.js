const express = require('express');
const router = express.Router();
const controller = require('../controllers/billingOffice.controller');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization');

router.post('/add', requireAuth, requireAdminRoles('Admin', 'Administrator'), controller.createBillingOffice);
router.get('/', requireAuth, requireAdminRoles('Admin', 'Administrator'), controller.getAllBillingOffice);
router.get('/:id', requireAuth, requireAdminRoles('Admin', 'Administrator'), controller.getOneBillingOffice);
router.put('/:id', requireAuth, requireAdminRoles('Admin', 'Administrator'), controller.updateBillingOffice);
router.delete('/:id', requireAuth, requireAdminRoles('Admin', 'Administrator'), controller.removeBillingOffice);

module.exports = router;