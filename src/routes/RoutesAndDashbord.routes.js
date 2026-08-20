const express = require('express');
const { ReportAndDashbordController } = require('../controllers');
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization');

const router = express.Router();

// Read access: Admin, Administrator and all operational managers
const canView = requireAdminRoles('Admin', 'Administrator', 'Inventory Manager', 'Warehouse Manager', 'Packing Reporter', 'Sales Person');
// Write access (create financial year): Admin only
const canManage = requireAdminRoles('Admin', 'Administrator', 'Inventory Manager', 'Warehouse Manager', 'Packing Reporter', 'Sales Person');
// Account dashboard: same as canView plus the Account Section role
const canViewAccount = requireAdminRoles('Admin', 'Administrator', 'Inventory Manager', 'Warehouse Manager', 'Packing Reporter', 'Sales Person', 'Account Section');

// Report routes
router.get('/sell-report', requireAuth, canView, ReportAndDashbordController.getsellReports);
router.get('/customers-report', requireAuth, canView, ReportAndDashbordController.getCustomerReport);
router.get('/warehouse-report', requireAuth, canView, ReportAndDashbordController.getwarehouseStockReport);

//Dashboard routes
router.get('/sell-dashboard', requireAuth, canView, ReportAndDashbordController.getSellDashboard);
router.get('/product-dashboard', requireAuth, canView, ReportAndDashbordController.getsTotalsProductions);
router.get('/inventory-dashboard', requireAuth, canView, ReportAndDashbordController.getInventoryDashboard);
router.get('/account-dashboard', requireAuth, canViewAccount, ReportAndDashbordController.getaccountSummery);
router.get('/warehouse-dashboard', requireAuth, canView, ReportAndDashbordController.getwarehouseSummery);
router.get('/production-dashboard', requireAuth, canView, ReportAndDashbordController.getproductionSummery);
router.get('/top-sales', requireAuth, canView, ReportAndDashbordController.gettopsell);
router.get('/low-stock', requireAuth, canView, ReportAndDashbordController.getLowStockAlerts);

//Graphical data Representation on Dashboard
router.get('/stock-graph', requireAuth, canView, ReportAndDashbordController.getStockGraphData);
router.get('/production-graph', requireAuth, canView, ReportAndDashbordController.getProductionGraph);
router.get('/sales-graph', requireAuth, canView, ReportAndDashbordController.getSalesGraphatDelivery);


router.post('/filterStock', requireAuth, canView, ReportAndDashbordController.getStockReport);
router.get('/financial-years', requireAuth, canView, ReportAndDashbordController.getFinancialYears);
router.post('/financial-years', requireAuth, canManage, ReportAndDashbordController.createFinancialYear);

module.exports = router;