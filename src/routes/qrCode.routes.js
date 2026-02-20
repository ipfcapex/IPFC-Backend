const express = require('express');
const router = express.Router();
const qrController = require('../controllers/qrCode.controller');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization');

router.post('/generate', requireAuth, requireAdminRoles('Administrator','Admin'),qrController.generateQrCode);
router.post('/add-qr-detais', requireAuth, requireAdminRoles('Administrator','Admin'),qrController.addQrCodeDetails);
router.post('/stockTransfer', qrController.transferStock);
router.get('/stock-Transfer', qrController.getInternaltransfers)
module.exports = router;
