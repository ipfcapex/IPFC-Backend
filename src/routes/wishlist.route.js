const express = require('express');
const router = express.Router();
const { WishlistController } = require("../controllers");
const { requireAuth, requireAdminRoles } = require('../middleware/auth.authorization')


router.post('/add',WishlistController.addWishlist);
router.get('/all', WishlistController.getAllWishlist);
//get wishlist for sales person
router.get("/get/bysalesperson",requireAuth, requireAdminRoles('Sales Person'), WishlistController.getWishlistBySalesperson);
router.get('/:id', WishlistController.getWishlistById);
router.put('/:id', WishlistController.updateWishlistById);
//get is accept and delete for order
router.delete('/mark/:id', WishlistController.completeWishlist);
router.delete('/:id', WishlistController.softDeleteWishlistById);

module.exports = router;
