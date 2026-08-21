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
    const { page, limit, search, customer, startDate, endDate, article, salesperson, status } = req.query;

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

    // Extra filters resolved inside the service:
    //  - article    : partial match on the requested product's article name
    //  - salesperson: createdBy (User) id
    //  - status      : computed "Stock Time" status (Pending / Not Fulfilled /
    //                  Expired / Accepted / Rejected / Timeout)
    const extra = { article, salesperson, status };

    // Call service function
    const result = await WishlistService.getWishlist(filter, page, limit, search, extra);

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

    // Article filter: the article name lives on the Product, while wishlists only
    // store productId. Resolve the matching products first, then constrain both
    // collections to wishlists that reference one of them.
    const { article, status } = req.query;
    let articleProductIds = null;
    if (article && article.trim() !== "") {
      const arx = new RegExp(article.trim(), "i");
      const products = await Product.find({ article: arx }).select("_id").lean();
      articleProductIds = products.map((p) => p._id);
    }

    const applyFilters = (query) => {
      if (searchOr) query.$or = searchOr;
      if (articleProductIds) query["WishList.productId"] = { $in: articleProductIds };
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
    let combined = [...activeTagged, ...historyTagged].sort(
      (a, b) => new Date(b._sortDate) - new Date(a._sortDate)
    );

    // "Stock Time" status filter. Status is computed (not stored), so it is
    // applied here after both collections are tagged and merged. Active
    // wishlists whose stock time is set (wishAction null) count as "Pending".
    if (status && status.trim() !== "") {
      const wanted = status.trim();
      combined = combined.filter((d) => (d.wishAction || "Pending") === wanted);
    }

    const totalRecords = combined.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;
    const pageSlice = combined.slice(skip, skip + limit);

    await enrichOrdersWithProductDetails(pageSlice);
    await WishlistService.enrichWishlistsWithAssignedQuantity(pageSlice);
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
    const { schemesId, acceptedQuantities, partialOrderReason, partialReasonCategory, partialOrderExplanation } = req.body || {};

    const { order, history } = await WishlistService.findandmarkdone(id, {
      schemesId,
      acceptedQuantities,
      partialOrderReason,
      partialReasonCategory,
      partialOrderExplanation,
    });

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
    const { rejectionReasonCategory, rejectionOrderExplanation, rejectionReason, partialReasonCategory, partialOrderExplanation, partialOrderReason } = req.body || {};

    const rejectedWishlist = await WishlistService.softDeleteWishlistById(id, {
      rejectionReasonCategory,
      rejectionOrderExplanation,
      rejectionReason,
      partialReasonCategory,
      partialOrderExplanation,
      partialOrderReason,
    });

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

exports.getWishlistAnalytics = async (req, res) => {
  try {
    const { financialYear, month, startDate, endDate } = req.query;

    const data = await WishlistService.getWishlistAnalytics({
      financialYear,
      month,
      startDate,
      endDate,
    });

    return res.status(200).json({
      success: true,
      message: "Wishlist analytics fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Wishlist Analytics Error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch wishlist analytics",
    });
  }
};

exports.getWishlistMonthlyRecords = async (req, res) => {
  try {
    const { financialYear, month, startDate, endDate, search, status, page, limit } = req.query;

    const result = await WishlistService.getWishlistMonthlyRecords({
      financialYear,
      month,
      startDate,
      endDate,
      search,
      status,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      message: "Monthly wishlist records fetched successfully",
      data: result.records,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Wishlist Monthly Records Error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch monthly wishlist records",
    });
  }
};