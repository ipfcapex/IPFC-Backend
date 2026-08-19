const express = require('express');
const { salesOrderController } = require('../controllers');
const router = express.Router();
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')

//sale order Approved from inventory manager and account manager
router.get('/wishlist', salesOrderController.getApproved);
router.post("/apply-scheam", salesOrderController.applyScheme);
router.post('/addtocart',requireAuth, requireAdminRoles('Admin', 'Administrator','Sales Person'), salesOrderController.AddOrdertoCartContorller);
router.post("/checkout/:id", salesOrderController.checkoutProduct);

router.get('/totalStock', salesOrderController.getAggregatedStocks);
router.get('/totalCart', salesOrderController.getAllatCart);
router.get('/getallOrders', salesOrderController.getAll);
//get customer order history
router.get('/customerOrderHistory/:id', salesOrderController.getCustomerById);
router.get('/wishlistdata', salesOrderController.getWishlistData);
//orders pending warehouse scan/dispatch (for dispatch scanner dropdown)
router.get('/warehouse-scan/pending', salesOrderController.getOrdersForWarehouseScan);

// Article Details page routes
router.get('/article-names', salesOrderController.getArticleNames);
router.get('/article-details/:articleName', salesOrderController.getArticleDetailsByName);

// Review List - Carton Quantity Verification (Factory -> Warehouse)
router.get('/review-list', requireAuth, requireAdminRoles('Admin', 'Administrator', 'Super Admin'), salesOrderController.getReviewList);

router.get('/:id',  salesOrderController.getById);
router.put('/:id', salesOrderController.update);
router.delete('/:id', salesOrderController.remove);
router.delete('/cart/:id', salesOrderController.removeCart);
router.delete('/wishlist/:id', salesOrderController.deleWishlist);

//cart items 
router.get("/cart/by-salesperson", salesOrderController.getCartdatabySalesperson);
router.get("/wishlist/by-salesperson", salesOrderController.getWishlistItemsbySalesperson);
router.get("/order/by-salesperson", salesOrderController.getAllbySalesperson);

router.delete('/order-delete/:id', salesOrderController.deletessItem);

//Reverse delivery (return) for a delivered order
router.post('/reverse-delivery/:id', salesOrderController.reverseDelivery);

//Stop order
router.post('/stop/:id', requireAuth, requireAdminRoles('Super Admin', 'Administrator', 'Admin'), salesOrderController.stopOrder);

module.exports = router;
