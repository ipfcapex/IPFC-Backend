const express = require("express");
const router = express.Router();
const { factoryController } = require("../controllers");
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')

router.get("/get-all-factories",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter'), factoryController.getAllFactories);
router.post("/add", requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter'), factoryController.createFactory);
router.get("/:id/get-factory",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter'), factoryController.getFactoryById);
router.put("/:id/update-factory",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter'), factoryController.updateFactoryById);
router.delete("/:id/delete-factory",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter'), factoryController.deleteFactoryById);
router.patch("/:id/reactivate", requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person','Packing Reporter'), factoryController.reactiveFactory);

module.exports = router;
