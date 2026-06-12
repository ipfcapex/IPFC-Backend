const express = require("express");
const router = express.Router();
const { factoryController } = require("../controllers");
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')

router.get("/get-all-factories",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), factoryController.getAllFactories);
router.post("/add", requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), factoryController.createFactory);
router.get("/:id/get-factory",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), factoryController.getFactoryById);
router.put("/:id/update-factory",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), factoryController.updateFactoryById);
router.delete("/:id/delete-factory",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), factoryController.deleteFactoryById);
router.patch("/:id/reactivate", requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter','Inventory Manager'), factoryController.reactiveFactory);

module.exports = router;
