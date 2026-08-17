const { WishlistService } = require('../services'); // your service function
const { computeActiveWishlistStatus } = require('../services/wishlist.service');
const { Customer, Product, Wishlist, Schemes, WishlistHistory } = require("../models");
const mongoose = require("mongoose");
const { enrichOrdersWithProductDetails } = require("../services/salesOrder.service");

// ------------------------
// Add items to Wishlist
// ------------------------
exports.addWishlist = async (req, res) => {
  try {
    const {
      customer,
      location,
      items, schemesId, createdBy, description } = req.body;

    // Call the service function
    const wishlistOrder = await WishlistService.AddToWishlist({
      customer,
      location,
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
    const { page, limit, search, customer, startDate, endDate } = req.query;

    // Build optional filters (customer + createdAt date range)
    const filter = {};
    if (customer) filter.customer = customer;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // include the whole end day
        filter.createdAt.$lte = end;
      }
    }

    // Call service function
    const result = await WishlistService.getWishlist(filter, page, limit, search);

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

    // 🔎 Shared filters (customer / date / search) applied to BOTH the active
    // Wishlist collection and the archived WishlistHistory collection.
    const { startDate, endDate } = req.query;
    const buildDateRange = () => {
      const range = {};
      if (startDate) range.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // include the whole end day
        range.$lte = end;
      }
      return range;
    };

    // 🔎 Single search input: matches the wishlist description as well as the
    // customer's live name / city / state. Location is read from the customer
    // record (not a wishlist snapshot), so we resolve the matching customers
    // first and then filter wishlists by those ids.
    const search =
      req.query.search && req.query.search.trim() !== ""
        ? req.query.search.trim()
        : null;
    let searchOr = null;
    if (search) {
      const rx = new RegExp(search, "i");
      const matchedCustomers = await Customer.find({
        $or: [{ name: rx }, { "location.city": rx }, { "location.state": rx }],
      })
        .select("_id")
        .lean();
      searchOr = [{ description: rx }];
      if (matchedCustomers.length) {
        searchOr.push({
          customer: { $in: matchedCustomers.map((c) => c._id) },
        });
      }
    }

    const applyFilters = (query) => {
      if (searchOr) query.$or = searchOr;
    };

    // Active (pending) wishlists
    const activeQuery = { createdBy: salesPersonId, isActive: true };
    if (req.query.customer) activeQuery.customer = req.query.customer;
    if (startDate || endDate) activeQuery.createdAt = buildDateRange();
    applyFilters(activeQuery);

    // Archived wishlists (accepted / rejected / timeout). Date filter applies to
    // when the action happened (actionAt).
    const historyQuery = { createdBy: salesPersonId };
    if (req.query.customer) historyQuery.customer = req.query.customer;
    if (startDate || endDate) historyQuery.actionAt = buildDateRange();
    applyFilters(historyQuery);

    const [activeDocs, historyDocs] = await Promise.all([
      Wishlist.find(activeQuery)
        .populate("customer", "name email phone location")
        .populate("createdBy", "name email phone location")
        .populate("scheme", "name")
        .lean(),
      WishlistHistory.find(historyQuery)
        .populate("customer", "name email phone location")
        .populate("createdBy", "name email phone location")
        .populate("scheme", "name")
        .lean(),
    ]);

    // Tag each set so the frontend can dim history rows and hide their actions.
    const activeTagged = activeDocs.map((d) => ({
      ...d,
      isHistory: false,
      wishAction: computeActiveWishlistStatus(d),
      _sortDate: d.updatedAt || d.createdAt,
    }));
    const historyTagged = historyDocs.map((d) => ({
      ...d,
      isHistory: true,
      // wishAction ("Accepted" | "Rejected" | "Timeout") already on the doc.
      _sortDate: d.actionAt || d.updatedAt || d.createdAt,
    }));

    // Merge newest-first, then paginate the combined list in memory.
    const combined = [...activeTagged, ...historyTagged].sort(
      (a, b) => new Date(b._sortDate) - new Date(a._sortDate)
    );

    const totalRecords = combined.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;
    const pageSlice = combined.slice(skip, skip + limit);

    await enrichOrdersWithProductDetails(pageSlice);
    pageSlice.forEach((d) => {
      delete d._sortDate;
    });

    return res.status(200).json({
      success: true,
      page,
      limit,
      totalPages,
      totalRecords,
      wishlists: pageSlice,
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
    const { schemesId } = req.body || {};

    const { order, history } = await WishlistService.findandmarkdone(id, schemesId);

    return res.status(200).json({
      order,
      wishlist: history,
      success: true,
      message: "Wishlist approved and order created successfully"
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
    const rejectedWishlist = await WishlistService.softDeleteWishlistById(id);

    return res.status(200).json({
      success: true,
      message: "Wishlist rejected successfully",
      data: rejectedWishlist
    });

  } catch (error) {
    console.error("Delete Wishlist Error:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getWishlistRating = async (req, res) => {
  try {
    const { startDate, endDate, search, salespersonId, customerId } = req.query;

    const data = await WishlistService.getWishlistRating({
      startDate,
      endDate,
      search,
      salespersonId,
      customerId,
    });

    return res.status(200).json({
      success: true,
      message: "Wishlist rating analytics fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Wishlist Rating Error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch wishlist rating",
    });
  }
};