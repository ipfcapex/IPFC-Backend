const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouse.controller');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')


router.post('/add',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Warehouse Manager'), warehouseController.create);
router.get('/',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Inventory Manager','Warehouse Manager'), warehouseController.getAll);
router.get('/order',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Inventory Manager', 'Warehouse Manager'), warehouseController.getOrderDatabyWH);
router.get('/:id',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Inventory Manager','Warehouse Manager'), warehouseController.getOne);
router.get('/warehouse/:warehouse',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Inventory Manager','Warehouse Manager'), warehouseController.getStockByWarehousessss);
router.put('/:id',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Inventory Manager','Warehouse Manager'), warehouseController.update);
router.delete('/:id',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Warehouse Manager'), warehouseController.remove);

module.exports = router;
