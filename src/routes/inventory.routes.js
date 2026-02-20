const express = require("express");
const router = express.Router();
const { inventoryController } = require("../controllers");

router.get("/details", inventoryController.getAllStockDetails);
router.put("/approve/:id", inventoryController.assignStockToWarehouse);


router.get("/getallStock", inventoryController.getArticleList);
router.get("/getallStock2", inventoryController.getArticleList2);
module.exports = router;