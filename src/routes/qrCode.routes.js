const express = require('express');
const router = express.Router();
const qrController = require('../controllers/qrCode.controller');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization');

router.post('/generate', requireAuth, requireAdminRoles('Administrator','Admin','Inventory Manager'),qrController.generateQrCode);
router.post('/add-qr-detais', requireAuth, requireAdminRoles('Administrator','Admin','Inventory Manager'),qrController.addQrCodeDetails);
router.post('/stockTransfer',requireAuth, qrController.transferStock);
router.get('/stock-Transfer',requireAuth, qrController.getInternaltransfers)
router.get('/factory-scanned', requireAuth, qrController.getAllFactoryScannedQrCodes);
router.get('/warehouse-scanned', requireAuth, qrController.getAllWarehouseScannedQrCodes);
router.get('/warehouse-dispatched', requireAuth, qrController.getAllWarehouseDispatchedQrCodes);
router.post('/return-qr', requireAuth, requireAdminRoles('Administrator','Admin','Inventory Manager'), qrController.generateReturnQr);
module.exports = router;
