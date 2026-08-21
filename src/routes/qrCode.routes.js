const express = require('express');
const router = express.Router();
const qrController = require('../controllers/qrCode.controller');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization');

const qrRoles = requireAdminRoles('Administrator', 'Admin', 'Inventory Manager', 'Warehouse Manager', 'Packing Reporter', 'Sales Person');

router.post('/generate', requireAuth, qrRoles, qrController.generateQrCode);
router.post('/add-qr-detais', requireAuth, qrRoles, qrController.addQrCodeDetails);
router.post('/stockTransfer', requireAuth, qrController.transferStock);
router.get('/stock-Transfer', requireAuth, qrController.getInternaltransfers);
router.get('/factory-scanned', requireAuth, qrController.getAllFactoryScannedQrCodes);
router.get('/warehouse-scanned', requireAuth, qrController.getAllWarehouseScannedQrCodes);
router.get('/warehouse-dispatched', requireAuth, qrController.getAllWarehouseDispatchedQrCodes);
router.post('/return-qr', requireAuth, qrRoles, qrController.generateReturnQr);
module.exports = router;
