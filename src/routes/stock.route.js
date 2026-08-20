const express = require("express");
const router = express.Router();
const { stockController } = require("../controllers");
const { requireAuth, requireAdminRoles } = require("../middleware/auth.authorization");

const stockRoles = requireAdminRoles('Admin', 'Administrator', 'Inventory Manager', 'Warehouse Manager');

router.post("/add", requireAuth, stockRoles, stockController.createStockbyQr);
router.get("/", requireAuth, stockRoles, stockController.getAllStock);
router.get("/get", requireAuth, stockRoles, stockController.getAllStockss);
router.get("/summary/in-out", requireAuth, stockRoles, stockController.getStockInOutSummary);
router.get("/:id", requireAuth, stockRoles, stockController.getStockById);

router.get("/warehouse/:warehouseId", requireAuth, stockRoles, stockController.getStockByWarehouseController);
router.put("/:id", requireAuth, stockRoles, stockController.updateStock);

//get stock by Pn number

//Add Scanned at waherouse Record
router.put("/scanned/:id", requireAuth, stockRoles, stockController.addScanRecordss);
// add delivery status
router.put("/delivery/:id", requireAuth, stockRoles, stockController.addDeliveryRecordss);
router.delete("/:id", requireAuth, stockRoles, stockController.softDeleteStock);
router.post("/scan-qr", requireAuth, stockRoles, stockController.scanAndDispatch);

//Bypass stock
router.post("/bypasstowarehouse", requireAuth, stockRoles, stockController.bypassScanAndAddStock);
router.post("/bypasstodelivery", requireAuth, stockRoles, stockController.bypassDeliveryController);


module.exports = router;