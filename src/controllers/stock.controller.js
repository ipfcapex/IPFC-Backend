const { stockService } = require("../services");
const { User } = require("../models")
const { SellOrder } = require("../models")

exports.createStockbyQr = async (req, res) => {
  try {
    const qrImage = req.body.qrImage;

    const stock = await stockService.createStockByQr(qrImage);

    return res.status(201).json({
      message: "Stock created successfully",
      stock,
    });
  } catch (error) {
    console.error("Error in createStockbyQr:", error);
    return res.status(400).json({ error: error.message });
  }
};

exports.getAllStock = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Clone and clean filters
    const filters = { ...req.query };
    delete filters.page;
    delete filters.limit;

    const stock = await stockService.getAllStock(filters, page, limit);

    return res.status(200).json({
      message: "All stock data retrieved successfully",
      stock,
    });
  } catch (error) {
    console.error("Error in getAllStock:", error);
    return res.status(400).json({ error: error.message });
  }
};

exports.getStockById = async (req, res) => {
  const stock = await stockService.getStockById(req.params.id);
  if (!stock)
    return res.status(404).json({ message: "Stock not found or Deleted" });
  res.json(stock);
};

exports.getAllStockss = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Clone and clean filters
    const filters = { ...req.query };
    delete filters.page;
    delete filters.limit;

    const stock = await stockService.getAllStockss({
      page,
      limit,
      ...filters
    });

    return res.status(200).json({
      message: "All stock data retrieved successfully",
      ...stock,
    });
  } catch (error) {
    console.error("Error in getAllStock:", error);
    return res.status(400).json({ error: error.message });
  }
};


exports.updateStock = async (req, res) => {
  const updated = await stockService.updateStock(req.params.id, req.body);
  res.json({ success: true, data: updated });
};

exports.softDeleteStock = async (req, res) => {
  const deleted = await stockService.softDeleteStock(req.params.id);
  res.json({ success: true, data: deleted });
};

exports.getWishlistData = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Clone and clean filters
    const filters = { ...req.query };
    delete filters.page;
    delete filters.limit;
    const data = await stockService.getWishlistItems(
      filters,
      page,
      limit,
      Wishlist
    );
    return res.status(200).json({
      message: "All stock data retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error in getWishlistData:", error);
    return res.status(400).json({ error: error.message });
  }
};

exports.scanAndDispatch = async (req, res) => {
  try {
    const stock = await stockService.scanAndDispatch(req, res);

    return res.status(201).json({
      success: true,
      message: "Stock dispatched successfully",
      stock,
    });
  } catch (error) {
    console.error("Error in createStockbyQr:", error);
    return res.status(400).json({ error: error.message });
  }
};

exports.getStockByWarehouseController = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const result = await stockService.getStockByWarehouse(
      warehouseId,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
};

exports.bypassScanAndAddStock = async (req, res) => {
  try {
    const { productionNo} = req.body;

    if (!productionNo) {
      return res.status(400).json({
        success: false,
        message: "productionNo are required",
      });
    }

    const result = await stockService.bypassScanAndAddStock(productionNo);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
      });
    } else {
      return res.status(200).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    console.error("Error in bypassScanAndAddStock:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while bypassing scan",
      error: error.message,
    });
  }
};

exports.bypassDeliveryController = async (req, res) => {
  try {
    const { productionNo, article, quantity } = req.body;

    if (!productionNo || !article || !quantity) {
      return res.status(400).json({
        success: false,
        message: "productionNo, article, and quantity are required",
      });
    }

    const result = await stockService.bypassScanAtDelivery(productionNo, article, quantity);

    return res.status(200).json({
      success: true,
      message: "Bypass delivery successful",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

exports.addDeliveryRecordss = async (req, res) => {
  try {
    const { id } = req.params;         // 🔹 get orderId from URL
    const { deliveryStatus } = req.body; // 🔹 status from body

    if (!deliveryStatus) {
      return res.status(400).json({
        success: false,
        message: "Delivery status is required",
      });
    }

    const updatedOrder = await stockService.addDeliveryRecord(id, deliveryStatus);

    return res.status(200).json({
      success: true,
      message: "Delivery status updated successfully",
      data: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.addScanRecordss = async (req, res) => {
  try {
    const { id } = req.params;        
    const { ScanByorder, warehouse, quantity, article } = req.body; 
    console.log("Request body:", req.body);

    // Validate input
    if (!ScanByorder || !warehouse || !quantity || !article) {
      return res.status(400).json({
        success: false,
        message: "All fields (ScanByorder, warehouse, quantity, article) are required",
      });
    }

    // Call service to update scanned status
    const updatedOrder = await stockService.getstockScanedbyWM(
      id,
      article,
      ScanByorder,
      warehouse,
      quantity
    );

    console.log("Updated Order:", updatedOrder);

    return res.status(200).json({
      success: true,
      message: "Scanned status updated successfully",
      data: updatedOrder,
    });

  } catch (error) {
    console.error("Error updating scanned status:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


