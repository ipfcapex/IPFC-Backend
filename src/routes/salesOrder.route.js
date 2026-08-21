const express = require('express');
const { salesOrderController } = require('../controllers');
const router = express.Router();
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')

const salesOrderRoles = requireAdminRoles('Admin', 'Administrator', 'Sales Person', 'Super Admin', 'Inventory Manager', 'Account Section', 'Warehouse Manager');
const adminRoles = requireAdminRoles('Admin', 'Administrator', 'Super Admin');

//sale order Approved from inventory manager and account manager
router.get('/wishlist', requireAuth, salesOrderRoles, salesOrderController.getApproved);
router.post("/apply-scheam", requireAuth, salesOrderRoles, salesOrderController.applyScheme);
router.post('/addtocart', requireAuth, salesOrderRoles, salesOrderController.AddOrdertoCartContorller);
router.post("/checkout/:id", requireAuth, salesOrderRoles, salesOrderController.checkoutProduct);

router.get('/totalStock', requireAuth, salesOrderRoles, salesOrderController.getAggregatedStocks);
router.get('/totalCart', requireAuth, salesOrderRoles, salesOrderController.getAllatCart);
router.get('/', requireAuth, salesOrderRoles, salesOrderController.getAll);
router.get('/getallOrders', requireAuth, salesOrderRoles, salesOrderController.getAll);
//get customer order history
router.get('/customerOrderHistory/:id', requireAuth, salesOrderRoles, salesOrderController.getCustomerById);
router.get('/wishlistdata', requireAuth, salesOrderRoles, salesOrderController.getWishlistData);
//orders pending warehouse scan/dispatch (for dispatch scanner dropdown)
router.get('/warehouse-scan/pending', requireAuth, salesOrderRoles, salesOrderController.getOrdersForWarehouseScan);

// Article Details page routes
router.get('/article-names', requireAuth, salesOrderRoles, salesOrderController.getArticleNames);
router.get('/article-details/:articleName', requireAuth, salesOrderRoles, salesOrderController.getArticleDetailsByName);

// Review List - Carton Quantity Verification (Factory -> Warehouse)
router.get('/review-list', requireAuth, adminRoles, salesOrderController.getReviewList);

//cart items (defined before :id to avoid route parameter collision)
router.get("/cart/by-salesperson", requireAuth, salesOrderRoles, salesOrderController.getCartdatabySalesperson);
router.get("/wishlist/by-salesperson", requireAuth, salesOrderRoles, salesOrderController.getWishlistItemsbySalesperson);
router.get("/order/by-salesperson", requireAuth, salesOrderRoles, salesOrderController.getAllbySalesperson);

router.get('/:id', requireAuth, salesOrderRoles, salesOrderController.getById);
router.put('/:id', requireAuth, salesOrderRoles, salesOrderController.update);
router.delete('/:id', requireAuth, salesOrderRoles, salesOrderController.remove);
router.delete('/cart/:id', requireAuth, salesOrderRoles, salesOrderController.removeCart);
router.delete('/wishlist/:id', requireAuth, salesOrderRoles, salesOrderController.deleWishlist);

router.delete('/order-delete/:id', requireAuth, salesOrderRoles, salesOrderController.deletessItem);

//Reverse delivery (return) for a delivered order
router.post('/reverse-delivery/:id', requireAuth, salesOrderRoles, salesOrderController.reverseDelivery);

//Stop order
router.post('/stop/:id', requireAuth, adminRoles, salesOrderController.stopOrder);

module.exports = router;
