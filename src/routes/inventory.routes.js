const express = require("express");
const router = express.Router();
const { inventoryController } = require("../controllers");
const { requireAuth, requireAdminRoles } = require("../middleware/auth.authorization");

router.get("/details", requireAuth, requireAdminRoles('Admin', 'Administrator', 'Inventory Manager'), inventoryController.getAllStockDetails);
router.put("/approve/:id", requireAuth, requireAdminRoles('Admin', 'Administrator', 'Inventory Manager'), inventoryController.assignStockToWarehouse);


router.get("/getallStock", requireAuth, requireAdminRoles('Admin', 'Administrator', 'Inventory Manager'), inventoryController.getArticleList);
router.get("/getallStock2", requireAuth, requireAdminRoles('Admin', 'Administrator', 'Inventory Manager'), inventoryController.getArticleList2);
module.exports = router;