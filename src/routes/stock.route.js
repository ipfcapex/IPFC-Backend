const express = require("express");
const router = express.Router();
const { stockController } = require("../controllers");

router.post("/add", stockController.createStockbyQr);
router.get("/", stockController.getAllStock);
router.get("/get", stockController.getAllStockss);
router.get("/summary/in-out", stockController.getStockInOutSummary);
router.get("/:id", stockController.getStockById);

router.get("/warehouse/:warehouseId", stockController.getStockByWarehouseController);
router.put("/:id", stockController.updateStock);

//get stock by Pn number 

//Add Scanned at waherouse Record
router.put("/scanned/:id", stockController.addScanRecordss);
// add delivery status
router.put("/delivery/:id", stockController.addDeliveryRecordss);
router.delete("/:id", stockController.softDeleteStock);
router.post("/scan-qr", stockController.scanAndDispatch);

//Bypass stock 
router.post("/bypasstowarehouse", stockController.bypassScanAndAddStock);
router.post("/bypasstodelivery", stockController.bypassDeliveryController);


module.exports = router;
