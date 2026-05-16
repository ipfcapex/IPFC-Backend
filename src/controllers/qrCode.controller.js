const qrService = require('../services/qrCode.service');
// const qrService = require('../services/qrService');
const { sendNotification } = require("../services/notificationService");
const { validationResult, check } = require("express-validator");

exports.addQrCodeDetails = async (req, res) => {
  try {
    console.log("req.body",req.body);
    
    const result = await qrService.addQrCodesByArticle(req.body);
    console.log("result",result);
    
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.generateQrCode = async (req, res) => {
  try {
    console.log("req.body",req.body);
    const qrCodes = await qrService.generateQrCodesByArticle(req.body);
       // Send real-time notification
    sendNotification("qrGenerated", {
      message: `QR Code for ${qrCodes} generated successfully!`,
      data: qrCodes
    });
    res.status(201).json(qrCodes);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getQrCode = async (req, res) => {
  try {
    console.log("req.body",req.body);
    const qrCodes = await qrService.getQrCodes(req.body);
    
    res.status(201).json(qrCodes);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.transferStock = [
  // ✅ Validation rules
  check("factory").notEmpty().withMessage("Factory ID is required"),
  check("factory_name").notEmpty().withMessage("Factory name is required"),
  check("fromWarehouse").notEmpty().withMessage("Source warehouse is required"),
  check("toWarehouse").notEmpty().withMessage("Destination warehouse is required"),
  check("productionNo").notEmpty().withMessage("ProductionNo is required"),
  check("article").notEmpty().withMessage("Article is required"),
  check("quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
  check("category").notEmpty().withMessage("Category details are required"),

  // ✅ Controller logic
  async (req, res) => {
    try {
      // 1️⃣ Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const {
        factory,
        factory_name,
        fromWarehouse,
        formqunatity,
        toWarehouse,
        productionNo,
        article,
        quantity,
        category, // <-- add this
      } = req.body;

      // 2️⃣ Call service
      const result = await qrService.stockTransferWithinWarehouses({
        factory,
        factory_name,
        fromWarehouse,
        toWarehouse,
        productionNo,
        article,
        quantity,
        category, // <-- pass category to service
      });

      // 3️⃣ Respond
      res.status(200).json({
        success: true,
        message: "Stock transfer completed successfully",
        data: result,
      });
    } catch (error) {
      console.error("❌ Stock Transfer Error:", error.message);
      res.status(500).json({
        success: false,
        message: "Stock transfer failed",
        error: error.message,
      });
    }
  },
];

exports.getAllFactoryScannedQrCodes = async (req, res) => {
  try {
    const productionNo = req.query.productionNo || undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await qrService.getAllFactoryScannedQrCodes({
      productionNo,
      page,
      limit,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getAllFactoryScannedQrCodes:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.generateReturnQr = async (req, res) => {
  try {
    const {
      factory,
      productionNo,
      warehouse,
      article,
      category,
      quantity,
    } = req.body;

    if (!factory || !productionNo || !warehouse || !article || !category || !quantity) {
      return res.status(400).json({
        success: false,
        message:
          "factory, productionNo, warehouse, article, category and quantity are required",
      });
    }

    const result = await qrService.generateReturnQrAndBypassFactoryScan({
      factory,
      productionNo,
      warehouse,
      article,
      category,
      quantity,
    });

    return res.status(201).json({
      success: true,
      message: "Return QR generated and factory scan bypassed",
      data: result,
    });
  } catch (error) {
    console.error("generateReturnQr error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getInternaltransfers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const result = await qrService.getInternalTransfersByTime(page, limit, search);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getInternaltransfer:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
