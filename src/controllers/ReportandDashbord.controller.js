const { ReportandDashbordService } = require('../services');
const { Order } = require("../models");

exports.getsellReports = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = "", ...filters } = req.query;

    const data = await ReportandDashbordService.getsellReport(
      filters,
      parseInt(page),
      parseInt(limit),
      search
    );

    const { report, pagination } = data;

    res.status(200).json({
      success: true,
      data: report,
      pagination: {
        currentPage: parseInt(page) || 1,
        totalPages: pagination.totalPages,
        totalItems: pagination.totalItems,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getCustomerReport = async (req, res) => {
  try {
    const page = parseInt(req.query.page) ;
    const limit = parseInt(req.query.limit) ;
    const search = req.query.search ? req.query.search.trim() : "";
    const result = await ReportandDashbordService.getCustomerReport(page, limit, search);
    
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("Error generating customer report:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

exports.getwarehouseStockReport = async (req, res) => {
  try {
    const stockReport = await ReportandDashbordService.getStockbyWarehouse();
    res.status(200).json({
      success: true,
      data: stockReport,
    });
  } catch (error) {
    console.error("Error fetching stock by warehouse:", error);
    res.status(500).json({      
      success: false,   
      message: "Failed to fetch stock by warehouse",
      error: error.message,
    });
  }
};

exports.getSellDashboard = async (req, res) => {
  try {
    const dashboard = await ReportandDashbordService.getsellReportatAdmin();

    return res.status(200).json({
      success: true,
      message: "Sell order dashboard fetched successfully",
      data: dashboard,
    });
  } catch (error) {
    console.error("Error fetching sell dashboard:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard",
      error: error.message,
    });
  }
};

exports.getsTotalsProductions = async (req, res) => {
  try {
    const totals = await ReportandDashbordService.getTotalProduction();  
    return res.status(200).json({
      success: true,
      message: "Total production fetched successfully",
      data: totals,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch total production",
      error: error.message,
    });
  }
};

exports.getInventoryDashboard = async (req, res) => {
  try {
    const data = await ReportandDashbordService.getTotalInventory();
    res.status(200).json({
      message: "Inventory dashboard fetched successfully",
      data
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Server Error" });
  }
};

exports.getaccountSummery = async (req, res) => {
  try {
    const data = await ReportandDashbordService.getAccountSectionApprovalSummary();
    res.status(200).json({
      message: "Account dashboard fetched successfully",
      data
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Server Error" });
  }
};

exports.getwarehouseSummery = async (req, res) => {
  try {
    const data = await ReportandDashbordService.getTotalWarehouseSummary();
    res.status(200).json({
      message: "Warehouse dashboard fetched successfully",
      data
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Server Error" });
  }
};

exports.getproductionSummery = async (req, res) => {
  try {
    const data = await ReportandDashbordService.getProductionSummery();
    res.status(200).json({
      message: "Production dashboard fetched successfully",
      data
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Server Error" });
  }
};

exports.getStockGraphData = async (req, res) => {
  try {
    const data = await ReportandDashbordService.getStockGraphData();
    res.status(200).json({
      message: "Stock Graphical representation on dashboard fetched successfully",
      data
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Server Error" });
  }
};

exports.getProductionGraph = async (req, res) => {
  try {
    const data = await ReportandDashbordService.getMonthlyProductionTotals();
    res.status(200).json({
      message: "Production at factroy Graphical representation on dashboard fetched successfully",
      data
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Server Error" });
  }
};

exports.getSalesGraphatDelivery = async (req, res) => {
  try {
    const data = await ReportandDashbordService.getSalesGraph();
    res.status(200).json({
      message: "sales data representation on dashboard fetched successfully",
      data
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Server Error" });
  }
};

exports.gettopsell = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, ...filters } = req.query;

    const data = await ReportandDashbordService.getTopsales(
      filters,
      parseInt(page),
      parseInt(limit)
    );

    const { report, pagination } = data;

    res.status(200).json({
      success: true,
      data: report,
      pagination: {
        currentPage: parseInt(page) || 1,
        totalPages: pagination.totalPages,
        totalItems: pagination.totalItems,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getLowStockAlerts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;

    const result = await ReportandDashbordService.lowstockAlert(page, limit);

    res.status(200).json(result);
  } catch (err) {
    console.error("LowStock Alert Controller Error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
}; 

// Controller to fetch stock report with filters (supports multiple quarters)
exports.getStockReport = async (req, res) => {
  try {
    const { type, name, filter } = req.body;

    // Get array of pipelines (one per quarter)
    const pipelines = ReportandDashbordService.getStockReportWithMoreFilters({ type, name, filter });

    // =========================
    // Execute each pipeline separately
    // =========================
    let results = [];

    for (const pipeline of pipelines) {
      const data = await Order.aggregate(pipeline);
      if (data.length > 0) {
        results.push(data[0]); // each pipeline returns one object with facets
      }
    }

    // =========================
    // Send response
    // =========================
    return res.status(200).json({
      code: 200,
      status: true,
      message: "Stock report fetched successfully",
      data: results,
    });

  } catch (error) {
    console.error("Error fetching stock report:", error);
    return res.status(500).json({
      code: 500,
      status: false,
      message: "Failed to fetch stock report",
      error: error.message,
    });
  }
};

