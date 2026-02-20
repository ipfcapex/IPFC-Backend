const { Order } = require('../models');
const { inventoryService } = require('../services');

exports.getAllStockDetails = async (req, res) => {
  try {
    const result = await inventoryService.getAllStockQuantities(); // no input
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// exports.verifyStockAndUpdate = async (req, res) => {
//   try {
    
//     const result = await inventoryService.verifyStockAndApprove(req, res);
//     console.log("result",result);
    
//     res.status(201).json(result);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

exports.getArticleList = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search?.trim() || "";  

    const result = await inventoryService.getStockByWarehouseAndFactory(
      page,
      limit,
      search
    );

    res.status(200).json({
      success: true,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
      data: result.data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.assignStockToWarehouse = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body || req.body.data;

const order = await inventoryService.assignStockToWarehouse(id, data);
    console.log("My order data ", data)
    res.status(200).json({
      success: true,
      message: `Order ${data.salesorderNO} has been ${data.inventoryManagerApproval}`,
      data: order,
    });
    console.log(order)
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getArticleList2 = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || "";

    const result = await inventoryService.getStockByWarehouseAndFactory2(page, limit, search);

    return res.status(200).json({
      success: true,
      message: "Stock fetched successfully",
      ...result,
    });
  } catch (error) {
    console.error("Error fetching stock:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock",
      error: error.message,
    });
  }
};
