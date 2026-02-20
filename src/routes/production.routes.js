const express = require('express');
const router = express.Router();
const { productionController } = require('../controllers');
const { validateProduct } = require('../validations/production.validation');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization');
const { validationResult } = require('express-validator');

// Wrap controller with validation check
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

router.post('/addProduct', requireAuth, requireAdminRoles('Administrator', 'Packing Reporter','Admin', 'Warehouse Manager'), validateProduct, handleValidation, productionController.createProduct);
router.get('/', requireAuth, requireAdminRoles('Administrator', 'Packing Reporter','Admin', 'Warehouse Manager'), productionController.getProducts);
router.get('/productionmanager', requireAuth, productionController.getProductionDatabyPM);
//get production data with out QR data
router.get('/noqr', requireAuth, requireAdminRoles('Administrator', 'Packing Reporter','Admin', 'Warehouse Manager'), productionController.getProductionsWithoutQR);
router.get('/:id', requireAuth, requireAdminRoles('Administrator', 'Packing Reporter','Admin', 'Warehouse Manager'), productionController.getProductByIdController);
router.get('/factory/:factory', requireAuth, productionController.getStockByFactoryssss);
router.put('/:id', requireAuth, requireAdminRoles('Administrator', 'Packing Reporter','Admin', 'Warehouse Manager'), validateProduct, handleValidation, productionController.updateProduct);
router.delete('/:id', requireAuth, requireAdminRoles('Administrator', 'Packing Reporter','Admin', 'Warehouse Manager'), productionController.deleteProduct);
router.post('/qrscan', requireAuth, requireAdminRoles('Administrator', 'Packing Reporter','Admin', 'Warehouse Manager'),productionController.TrackProductionbyQr);

module.exports = router;
