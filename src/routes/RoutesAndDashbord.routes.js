const express = require('express');
const { ReportAndDashbordController } = require('../controllers');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization');

const router = express.Router();

// Report routes
router.get('/sell-report', ReportAndDashbordController.getsellReports);
router.get('/customers-report', ReportAndDashbordController.getCustomerReport);
router.get('/warehouse-report', ReportAndDashbordController.getwarehouseStockReport);

//Dashboard routes
router.get('/sell-dashboard', ReportAndDashbordController.getSellDashboard);
router.get('/product-dashboard', ReportAndDashbordController.getsTotalsProductions);
router.get('/inventory-dashboard', ReportAndDashbordController.getInventoryDashboard);
router.get('/account-dashboard', ReportAndDashbordController.getaccountSummery);
router.get('/warehouse-dashboard', ReportAndDashbordController.getwarehouseSummery);
router.get('/production-dashboard', ReportAndDashbordController.getproductionSummery);
router.get('/top-sales', ReportAndDashbordController.gettopsell);
router.get('/low-stock', ReportAndDashbordController.getLowStockAlerts);

//Graphical data Representation on Dashboard
router.get('/stock-graph', ReportAndDashbordController.getStockGraphData);
router.get('/production-graph', ReportAndDashbordController.getProductionGraph);
router.get('/sales-graph', ReportAndDashbordController.getSalesGraphatDelivery);


router.post('/filterStock', ReportAndDashbordController.getStockReport);
module.exports = router;