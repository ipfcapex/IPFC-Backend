const { SellEmailService } = require('../services');
const { Order } = require("../models");

exports.getStockReport = async (req, res) => {
  try {
    const { name } = req.query;

    const searchList = name
      ? Array.isArray(name)
        ? name
        : [name]
      : [];

    const pipeline = SellEmailService.getStockReports({ name: searchList });

    const result = await Order.aggregate(pipeline);

    return res.status(200).json({
      success: true,
      data: result[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};