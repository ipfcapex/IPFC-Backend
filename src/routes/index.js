const express = require("express");
const authRoutes = require("./auth.route");
const producrPriceRoute = require("./price.route");
const warehouseRoutes = require("./warehouse.route");
const factoryRoutes = require("./factory.route");
const billingRoutes = require("./billingOffice.route");
const articalRoutes = require("./artical.routes");
const stockRoutes = require("./stock.route");
const saleOrderRoutes = require("./salesOrder.route");
const customerRoutes = require("./customer.routes");
const productionRoutes = require("./production.routes");
const productRoutes = require("./product.routes");
const qrCodeRoutes = require("./qrCode.routes");
const inventoryRoutes = require("./inventory.routes");
const announcementRoutes = require("./announcement.route");
const accountSectionRoutes = require("./accountSection.route");
const schemesRoutes = require("./schemes.route");
const ReportAndDashbordRoutes = require("./RoutesAndDashbord.routes");
const LogRoutes = require("./log.route");
const profile= require("./profile.route");
const adminAuthRoutes = require("./AdminAuth.route");
const WishListRoutes = require("./wishlist.route");
const TallyRoutes = require("./Tally.route");

const authMiddleware = require("../middleware/authMiddleware"); // path as needed

const router = express.Router();

// Auth routes go here
router.use("/auth", authRoutes);
//Admin Auth Routes
router.use("/admin-auth", adminAuthRoutes);

// Apply auth middleware to everything after this
router.use(authMiddleware);

//CSV pricing
router.use("/pricing", producrPriceRoute);
//factory route
router.use("/factory", factoryRoutes);
//Warehouse route
router.use("/warehouses", warehouseRoutes);
//Billing office route
router.use("/billing-offices", billingRoutes);
//Artical routes
router.use("/artical", articalRoutes);
//Stock routes
router.use("/stock", stockRoutes);
//Sale Order routes

router.use("/sale-order", saleOrderRoutes);

//Customers
router.use("/customer", customerRoutes);

//Production
router.use("/production", productionRoutes);

//Product(admin will creata a product(Article with categorry and artical code))
router.use("/product", productRoutes);

//QR Code  Generate
router.use("/qr-code", qrCodeRoutes);

// Inventory Routes
router.use("/inventory", inventoryRoutes);

//Announcement Routes
router.use("/announcement", announcementRoutes);

//account
router.use("/account", accountSectionRoutes);
//schemes
router.use("/schemes", schemesRoutes);

//Report and Dashbord Routes
router.use("/report-and-dashbord", ReportAndDashbordRoutes);

//log
router.use("/log", LogRoutes);

//Profiler
router.use("/profile", profile);

//Wishlist
router.use("/wishlist", WishListRoutes);

//Tally 
router.use("/tally", TallyRoutes);

module.exports = router;
