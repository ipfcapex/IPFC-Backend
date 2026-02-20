const express = require('express');
const router = express.Router();
const controller = require('../controllers/billingOffice.controller');

router.post('/add', controller.createBillingOffice);
router.get('/', controller.getAllBillingOffice);
router.get('/:id', controller.getOneBillingOffice);
router.put('/:id', controller.updateBillingOffice);
router.delete('/:id', controller.removeBillingOffice);

module.exports = router;
