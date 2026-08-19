const express = require('express');
const router = express.Router();
const { WishlistController } = require("../controllers");
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')


router.post('/add',WishlistController.addWishlist);
router.get('/all', WishlistController.getAllWishlist);
// Get rating / analytics for admin & administrator
router.get('/rating', requireAuth, requireAdminRoles('Admin', 'Administrator'), WishlistController.getWishlistRating);
// Get wishlist analytics (yearly/financial-year reporting)
router.get('/analytics', requireAuth, requireAdminRoles('Admin', 'Administrator'), WishlistController.getWishlistAnalytics);
//get wishlist for sales person
router.get("/get/bysalesperson",requireAuth, requireAdminRoles('Sales Person'), WishlistController.getWishlistBySalesperson);
router.get('/:id', WishlistController.getWishlistById);
router.put('/:id', WishlistController.updateWishlistById);
//get is accept and delete for order
router.delete('/mark/:id', WishlistController.completeWishlist);
router.delete('/:id', WishlistController.softDeleteWishlistById);

module.exports = router;
