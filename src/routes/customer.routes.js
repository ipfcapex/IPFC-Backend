const express = require("express");
const router = express.Router();
const { customerController } = require("../controllers");
const {requireAuth, requireAdminRoles} = require('../middleware/auth.authorization')

router.get("/get-users",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person'), customerController.getAllUser);
router.post("/addcustomer",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person'), customerController.createCustomer);
router.get("/get",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person'), customerController.getAllCustomers);
//get customer by salesid
router.get("/get/bysalesperson",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person'), customerController.getCustomerBySalesperson);

router.get("/:id",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person'), customerController.getCustomerById);
router.put("/:id/update",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person'), customerController.updateCustomer);
router.delete("/:id",requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person'), customerController.deleteCustomer);



module.exports = router;
