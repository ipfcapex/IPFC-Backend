const { WishlistService } = require('../services'); // your service function
const { Customer, Product, Wishlist, Schemes } = require("../models");
const mongoose = require("mongoose");
const { enrichOrdersWithProductDetails } = require("../services/salesOrder.service");

// ------------------------
// Add items to Wishlist
// ------------------------
exports.addWishlist = async (req, res) => {
  try {
    const { 
      // customer,
      // location, 
      items, schemesId, createdBy, description } = req.body;

    // Call the service function
    const wishlistOrder = await WishlistService.AddToWishlist({
      // customer,
      // location,
      items,
      schemesId,
      createdBy,
      description // ✅ include this
    });

    return res.status(200).json({
      success: true,
      message: "Items added to wishlist successfully",
      data: wishlistOrder
    });

  } catch (error) {
    console.error("Add to Wishlist Error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getAllWishlist = async (req, res) => {
  try {
    const { page, limit, search } = req.query;

    // Call service function
    const result = await WishlistService.getWishlist({}, page, limit, search);

    return res.status(200).json({
      success: true,
      message: "Wishlists fetched successfully",
      data: result.wishlists,
      pagination: result.pagination
    });

  } catch (error) {
    console.error("Get Wishlist Error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getWishlistBySalesperson = async (req, res) => {
  try {
    // 🔐 Ensure logged-in user exists
    if (!req.user || (!req.user.id && !req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in request",
      });
    }

    const salesPersonId = req.user.id || req.user._id;

    // 📄 Pagination setup
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // 🔍 Base query (SalesPerson only)
    const query = {
      createdBy: salesPersonId,
      isActive: true
    };

    // 🔎 Search handling (same pattern as customer)
    if (req.query.search && req.query.search.trim() !== "") {
      const search = req.query.search.trim();
      const regex = new RegExp(search, "i");

      query.$or = [
        { description: regex },
      ];
    }

    // 📦 Fetch wishlist data
    const [wishlists, total] = await Promise.all([
      Wishlist.find(query)
        .populate("customer", "name email phone location")
        .populate("createdBy", "name email phone location")
        .populate("scheme", "name")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Wishlist.countDocuments(query)
    ]);

    await enrichOrdersWithProductDetails(wishlists);

    return res.status(200).json({
      success: true,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      wishlists
    });

  } catch (error) {
    console.error("Error fetching wishlist by salesperson:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

exports.getWishlistById = async (req, res) => {
  try {
    const { id } = req.params;
    const wishlist = await WishlistService.getWishlistById(id);

    return res.status(200).json({
      success: true,
      message: "Wishlist fetched successfully",
      data: wishlist
    });

  } catch (error) {
    console.error("Get Wishlist by ID Error:", error.message);
    return res.status(404).json({ success: false, message: error.message });
  }
};

exports.updateWishlistById = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedWishlist = await WishlistService.updateWishlistById(id, updateData);

    return res.status(200).json({
      success: true,
      message: "Wishlist updated successfully",
      data: updatedWishlist
    });

  } catch (error) {
    console.error("Update Wishlist Error:", error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.completeWishlist = async (req, res) => {
  try {
    const { id } = req.params;

    const wishlist = await WishlistService.findandmarkdone(id);

    return res.status(200).json({
      wishlist: wishlist,
      success: true,
      message: "Wishlist Successfully Accepted"
    });

  } catch (error) {
    // If the error message matches your 'not found' criteria
    if (error.message === "Wishlist not found or already deleted") {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    // Handle other logic errors (like not being ready yet)
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.softDeleteWishlistById = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedWishlist = await WishlistService.softDeleteWishlistById(id);

    return res.status(200).json({
      success: true,
      message: "Wishlist deleted successfully",
      data: deletedWishlist
    });

  } catch (error) {
    console.error("Delete Wishlist Error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};