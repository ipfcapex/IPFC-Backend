const { Customer, Product, Wishlist, Schemes, WishlistHistory, SellOrder, Cart } = require("../models");
const mongoose = require("mongoose");
const { enrichOrdersWithProductDetails } = require("./salesOrder.service");
const { sendNotification } = require("./notificationService");

// Compute a virtual status for active (non-archived) wishlists based on
// whether the requested article has been prepared (wishlistStockTime set)
// and how old the wishlist is. Returns null when the existing countdown /
// Accept / Reject flow should apply (stock time is set), "Not Fulfilled"
// when the article was never prepared, or "Expired" when it has been
// unfulfilled for >= 1 year.
const computeActiveWishlistStatus = (wishlist) => {
  // Article was prepared (stock time applied) — existing flow handles this
  if (wishlist.wishlistStockTime) return null;

  const createdAt = new Date(wishlist.originalCreatedAt || wishlist.createdAt);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  return createdAt <= oneYearAgo ? 'Expired' : 'Not Fulfilled';
};

/**
 * Add items to wishlist
 * @param {string} customer - Customer name
 * @param {Array} location - Array of location objects
 * @param {Array} items - Array of items
 * @param {string} schemesId - Optional scheme ID
 * @param {string} createdBy - User ID creating the wishlist
 * @param {string} description - Optional wishlist description
 * @returns {Object} - Populated wishlist document
 */
exports.AddToWishlist = async ({
  customer,
  location,
  items,
  schemesId,
  createdBy,
  description
}) => {
  // 1️⃣ Validate customer
  const existingCustomer = await Customer.findOne({ name: customer });
  if (!existingCustomer) throw new Error("Customer not found");

  // 2️⃣ Validate scheme (optional)
  let scheme = null;
  if (schemesId) {
    scheme = await Schemes.findById(schemesId);
    if (!scheme) throw new Error("Scheme not found");
  }

  // 3️⃣ Process wishlist items
  const wishlistItems = [];

  for (const item of items) {
    // Quantity validation
    if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1) {
      throw new Error(
        `Quantity for article ${item.article}, categoryCode ${item.categoryCode} must be at least 1`
      );
    }

    // 🔍 STRICT product + category match.
    // type/quality must be part of the match: a single color+size can have
    // multiple sub-documents differing only by type/quality (e.g. Soft/Hard/
    // Common × A/B), all sharing the same categoryCode. Without them we would
    // always pick the first variant regardless of what the user selected.
    // STRICT variant match: article + categoryCode + color + size + type +
    // quality must ALL be present and matched, otherwise a color+size+categoryCode
    // with several type/quality sub-documents resolves the FIRST one and stores
    // the wrong categoryId (which then breaks the order/production/dispatch match).
    if (!item.categoryCode || !item.color || !item.size || !item.type || !item.quality) {
      throw new Error(
        `Incomplete product details for article ${item.article || "?"}: ` +
          `categoryCode, color, size, type and quality are all required.`
      );
    }

    const productRecord = await Product.findOne({
      article: item.article,
      category: {
        $elemMatch: {
          categoryCode: item.categoryCode,
          color: { $regex: new RegExp(`^${item.color}$`, "i") },
          size: { $regex: new RegExp(`^${item.size}$`, "i") },
          type: { $regex: new RegExp(`^${item.type}$`, "i") },
          quality: { $regex: new RegExp(`^${item.quality}$`, "i") }
        }
      }
    });
    if (!productRecord) {
      throw new Error(
        `Product not found for article ${item.article} with categoryCode ${item.categoryCode}, color ${item.color}, size ${item.size}, type ${item.type}, quality ${item.quality}`
      );
    }

    let image = [];
    let matchedCategoryId = null;

    if (productRecord && productRecord.category?.length) {
      const matchedCategory = productRecord.category.find(cat =>
        cat.categoryCode === item.categoryCode &&
        cat.color?.toLowerCase() === item.color?.toLowerCase() &&
        cat.size?.toLowerCase() === item.size?.toLowerCase() &&
        (cat.type || []).some(t => t?.toLowerCase() === item.type.toLowerCase()) &&
        (cat.quality || []).some(q => q?.toLowerCase() === item.quality.toLowerCase())
      );

      if (matchedCategory) {
        matchedCategoryId = matchedCategory._id;
        // 🖼️ Image only if exact match
        if (matchedCategory.image?.length) {
          image = [matchedCategory.image[0]];
        }
      }
    }

    // Never store an unresolved / wrong variant on the wishlist.
    if (!matchedCategoryId) {
      throw new Error(
        `No matching product variant for article ${item.article}, ` +
          `categoryCode ${item.categoryCode}, color ${item.color}, size ${item.size}, ` +
          `type ${item.type}, quality ${item.quality}.`
      );
    }

    // ✅ Push clean wishlist item (ids only)
    wishlistItems.push({
      productId: productRecord._id,
      categoryId: matchedCategoryId,
      quantity: item.quantity,
      image
    });
  }

  // 4️⃣ Create Wishlist document
  const wishlistData = {
    customer: existingCustomer._id,
    Location: location,
    WishList: wishlistItems,
    createdBy,
    description: description || "",
    isActive: true
  };

  if (scheme) wishlistData.scheme = scheme._id;

  const wishlist = await Wishlist.create(wishlistData);

  // 5️⃣ Populate & return
  return await Wishlist.findById(wishlist._id)
    .populate("customer")
    .populate("createdBy")
    .populate("scheme");
};

exports.getWishlist = async (filter = {}, page = 1, limit = 10, search = "", extra = {}) => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const { article, salesperson, status } = extra;

  // Article filter: the article name lives on the Product, while wishlists only
  // store productId. Resolve the matching products first, then constrain both
  // collections to wishlists that reference one of them.
  let articleProductIds = null;
  if (article && article.trim() !== "") {
    const arx = new RegExp(article.trim(), "i");
    const products = await Product.find({ article: arx }).select("_id").lean();
    articleProductIds = products.map((p) => p._id);
  }

  // Salesperson filter: createdBy id (only apply when it's a valid ObjectId).
  const salespersonId =
    salesperson && mongoose.Types.ObjectId.isValid(salesperson) ? salesperson : null;

  // Single search input: matches the wishlist description, the embedded
  // Location snapshot, and the customer's live name / city / state. Location can
  // live either on the wishlist snapshot or on the customer record, so we resolve
  // matching customers first and include them alongside the snapshot match.
  let searchOr = null;
  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");
    const matchedCustomers = await Customer.find({
      $or: [{ name: regex }, { "location.city": regex }, { "location.state": regex }],
    })
      .select("_id")
      .lean();
    searchOr = [
      { description: { $regex: regex } },
      { "Location.city": { $regex: regex } },
      { "Location.state": { $regex: regex } },
    ];
    if (matchedCustomers.length) {
      searchOr.push({ customer: { $in: matchedCustomers.map((c) => c._id) } });
    }
  }

  // Active (pending) wishlists.
  const activeQuery = { isActive: true, ...filter };
  if (searchOr) activeQuery.$or = searchOr;
  if (salespersonId) activeQuery.createdBy = salespersonId;
  if (articleProductIds) activeQuery["WishList.productId"] = { $in: articleProductIds };

  // Archived wishlists (accepted / rejected / timeout). Reuse the same customer
  // filter; the incoming date filter is on createdAt, so remap it to actionAt
  // (when the wishlist was archived).
  const historyQuery = {};
  if (filter.customer) historyQuery.customer = filter.customer;
  if (filter.createdAt) historyQuery.actionAt = filter.createdAt;
  if (searchOr) historyQuery.$or = searchOr;
  if (salespersonId) historyQuery.createdBy = salespersonId;
  if (articleProductIds) historyQuery["WishList.productId"] = { $in: articleProductIds };

  // One-year cutoff for the computed "Expired" status (mirrors
  // computeActiveWishlistStatus, expressed for the aggregation pipeline).
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Computed status for active wishlists: stock time set -> null (existing
  // countdown / Accept / Reject flow), otherwise "Expired" when unfulfilled for
  // >= 1 year, else "Not Fulfilled".
  const activeWishActionExpr = {
    $cond: [
      "$wishlistStockTime",
      null,
      {
        $cond: [
          { $lte: [{ $ifNull: ["$originalCreatedAt", "$createdAt"] }, oneYearAgo] },
          "Expired",
          "Not Fulfilled",
        ],
      },
    ],
  };

  const wanted = status && status.trim() !== "" ? status.trim() : null;

  // Merge active + history in the DB (via $unionWith), tag/compute status, then
  // filter, sort and paginate server-side so only one page is ever materialised.
  // The expensive populate + product enrichment then runs on that single page
  // instead of on the entire (ever-growing) history collection.
  const pipeline = [
    { $match: activeQuery },
    {
      $addFields: {
        isHistory: false,
        _sortDate: { $ifNull: ["$updatedAt", "$createdAt"] },
        wishAction: activeWishActionExpr,
      },
    },
    {
      $unionWith: {
        coll: WishlistHistory.collection.name,
        pipeline: [
          { $match: historyQuery },
          {
            $addFields: {
              isHistory: true,
              _sortDate: {
                $ifNull: ["$actionAt", { $ifNull: ["$updatedAt", "$createdAt"] }],
              },
              wishAction: null,
            },
          },
        ],
      },
    },
    // "Stock Time" status filter on the computed value; null wishAction (stock
    // time set, or any history row) counts as "Pending".
    { $addFields: { statusForFilter: { $ifNull: ["$wishAction", "Pending"] } } },
    ...(wanted ? [{ $match: { statusForFilter: wanted } }] : []),
    { $sort: { _sortDate: -1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limitNum },
          { $project: { _id: 1, isHistory: 1, wishAction: 1 } },
        ],
        meta: [{ $count: "totalItems" }],
      },
    },
  ];

  const [aggResult] = await Wishlist.aggregate(pipeline).allowDiskUse(true);
  const pageRefs = aggResult?.data || [];
  const totalItems = aggResult?.meta?.[0]?.totalItems || 0;
  const totalPages = Math.ceil(totalItems / limitNum) || 1;

  // Re-fetch just this page's documents from each collection with the same
  // populated relations as before.
  const activeIds = pageRefs.filter((r) => !r.isHistory).map((r) => r._id);
  const historyIds = pageRefs.filter((r) => r.isHistory).map((r) => r._id);

  const [activeDocs, historyDocs] = await Promise.all([
    activeIds.length
      ? Wishlist.find({ _id: { $in: activeIds } })
          .populate("customer", "name email phone location")
          .populate("createdBy", "name email")
          .populate("scheme", "name")
          .lean()
      : [],
    historyIds.length
      ? WishlistHistory.find({ _id: { $in: historyIds } })
          .populate("customer", "name email phone location")
          .populate("createdBy", "name email")
          .populate("scheme", "name")
          .lean()
      : [],
  ]);

  const activeMap = new Map(activeDocs.map((d) => [String(d._id), d]));
  const historyMap = new Map(historyDocs.map((d) => [String(d._id), d]));

  // Rebuild the page in the DB-sorted order, re-attaching the computed tags so
  // the response shape matches the previous implementation exactly.
  const pageSlice = pageRefs
    .map((ref) => {
      const base = ref.isHistory
        ? historyMap.get(String(ref._id))
        : activeMap.get(String(ref._id));
      if (!base) return null;
      return ref.isHistory
        ? { ...base, isHistory: true }
        : { ...base, isHistory: false, wishAction: ref.wishAction };
    })
    .filter(Boolean);

  await enrichOrdersWithProductDetails(pageSlice);

  return {
    wishlists: pageSlice,
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalItems,
    },
  };
};

// exports.getWISbySalesperson = async ({
//   salesId,
//   page = 1,
//   limit = 10,
//   search = "",
//   filter = {}
// }) => {
//   const pageNum = parseInt(page, 10) || 1;
//   const limitNum = parseInt(limit, 10) || 10;
//   const skip = (pageNum - 1) * limitNum;

//   const query = {
//     isActive: true,
//     ...filter,
//     createdBy: new mongoose.Types.ObjectId(salesId)
//   };

//   if (search && search.trim()) {
//     const regex = new RegExp(search.trim(), "i");
//     query.$or = [
//       { description: { $regex: regex } },
//       { "items.article": { $regex: regex } },
//       { "items.categoryCode": { $regex: regex } }
//     ];
//   }

//   const [wishlists, totalItems] = await Promise.all([
//     Wishlist.find(query)
//       .populate("customer", "name email phone location")
//       .populate("createdBy", "name email")
//       .populate("scheme", "name")
//       .sort({ updatedAt: -1 })
//       .skip(skip)
//       .limit(limitNum),
//     Wishlist.countDocuments(query)
//   ]);

//   return {
//     wishlists,
//     pagination: {
//       currentPage: pageNum,
//       totalPages: Math.ceil(totalItems / limitNum),
//       totalItems
//     }
//   };
// };

exports.getWishlistById = async (id) => {
  let wishlist = await Wishlist.findById(id)
    .populate("customer", "name email phone location")
    .populate("createdBy", "name email")
    .populate("scheme", "name")
    .lean();

  // Fall back to the archive so the View action works for accepted / rejected /
  // timed-out wishlists too. Tag it so the UI can show it as historic.
  if (!wishlist) {
    wishlist = await WishlistHistory.findById(id)
      .populate("customer", "name email phone location")
      .populate("createdBy", "name email")
      .populate("scheme", "name")
      .lean();
    if (wishlist) wishlist.isHistory = true;
  } else {
    // Active wishlist: compute virtual status for Not Fulfilled / Expired
    wishlist.wishAction = computeActiveWishlistStatus(wishlist);
  }

  if (!wishlist) throw new Error("Wishlist not found");
  await enrichOrdersWithProductDetails([wishlist]);
  return wishlist;
};

exports.updateWishlistById = async (id, updateData) => {
  if (!id) throw new Error("Wishlist ID is required");

  const wishlist = await Wishlist.findById(id);
  if (!wishlist) throw new Error("Wishlist not found");

  // Update customer if provided
  if (updateData.customer) {
    const customer = await Customer.findOne({ name: updateData.customer });
    if (!customer) throw new Error("Customer not found");
    wishlist.customer = customer._id;
  }

  // Update scheme if provided
  if (updateData.schemesId) {
    const scheme = await Schemes.findById(updateData.schemesId);
    if (!scheme) throw new Error("Scheme not found");
    wishlist.scheme = scheme._id;
  }

  // Update location if provided
  if (updateData.location) wishlist.Location = updateData.location;

  // Update description if provided
  if (updateData.description !== undefined) wishlist.description = updateData.description;

  // Update wishlist items if provided
  if (updateData.items && Array.isArray(updateData.items)) {
    const updatedItems = [];
    for (const item of updateData.items) {
      if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1) {
        throw new Error(`Quantity for article ${item.article} must be at least 1`);
      }

      // STRICT variant match: article + categoryCode + color + size + type +
      // quality must ALL be present and matched, otherwise a color+size+
      // categoryCode with several type/quality sub-documents resolves the FIRST
      // one and stores the wrong categoryId (breaking order/production/dispatch).
      if (!item.categoryCode || !item.color || !item.size || !item.type || !item.quality) {
        throw new Error(
          `Incomplete product details for article ${item.article || "?"}: ` +
            `categoryCode, color, size, type and quality are all required.`
        );
      }

      const productRecord = await Product.findOne({
        article: item.article,
        category: {
          $elemMatch: {
            categoryCode: item.categoryCode,
            color: { $regex: new RegExp(`^${item.color}$`, "i") },
            size: { $regex: new RegExp(`^${item.size}$`, "i") },
            type: { $regex: new RegExp(`^${item.type}$`, "i") },
            quality: { $regex: new RegExp(`^${item.quality}$`, "i") }
          }
        }
      });

      let imageUrl = null;
      let matchedCategoryId = null;
      if (productRecord && productRecord.category?.length > 0) {
        const matchedCategory = productRecord.category.find(cat =>
          cat.categoryCode === item.categoryCode &&
          cat.color?.toLowerCase() === item.color.toLowerCase() &&
          cat.size?.toLowerCase() === item.size.toLowerCase() &&
          (cat.type || []).some(t => t?.toLowerCase() === item.type.toLowerCase()) &&
          (cat.quality || []).some(q => q?.toLowerCase() === item.quality.toLowerCase())
        );
        if (matchedCategory) {
          matchedCategoryId = matchedCategory._id;
          imageUrl = matchedCategory.image[0];
        }
      }

      // Never store an unresolved / wrong variant on the wishlist.
      if (!matchedCategoryId) {
        throw new Error(
          `No matching product variant for article ${item.article}, ` +
            `categoryCode ${item.categoryCode}, color ${item.color}, size ${item.size}, ` +
            `type ${item.type}, quality ${item.quality}.`
        );
      }

      updatedItems.push({
        productId: productRecord._id,
        categoryId: matchedCategoryId,
        quantity: item.quantity,
        image: imageUrl ? [imageUrl] : [],
      });
    }

    wishlist.WishList = updatedItems;
  }

  const savedWishlist = await wishlist.save();

  // Populate references
  const populatedWishlist = await Wishlist.findById(savedWishlist._id)
    .populate("customer", "name email phone location")
    .populate("createdBy", "name email")
    .populate("scheme", "name");

  return populatedWishlist;
};

// Copy a wishlist document into WishlistHistory with the given action, then
// remove it from the active Wishlist collection. Returns the created history
// record. `action` is one of "Accepted" | "Rejected" | "Timeout" | "Expired".
// `extra` is an optional object with partial-order metadata that is spread
// onto the history record (requestedQuantity, acceptedQuantity, etc.).
exports.archiveWishlist = async (wishlist, action, extra = {}) => {
  const history = await WishlistHistory.create({
    originalWishlistId: wishlist._id,
    createdBy: wishlist.createdBy,
    customer: wishlist.customer,
    Location: wishlist.Location,
    WishList: wishlist.WishList,
    description: wishlist.description,
    scheme: wishlist.scheme,
    wishlistStockTime: wishlist.wishlistStockTime,
    wishAction: action,
    actionAt: new Date(),
    originalCreatedAt: wishlist.createdAt,
    originalUpdatedAt: wishlist.updatedAt,
    ...extra,
  });

  await Wishlist.deleteOne({ _id: wishlist._id });

  return history;
};

// Accept (Approve) a wishlist: supports both full and partial orders.
// When `acceptedQuantities` is provided (an array of numbers corresponding to
// each WishList item), only those quantities are turned into a SellOrder. If
// any accepted qty < requested qty, the order is marked as a partial order and
// `partialOrderReason` is mandatory. The remaining quantity stays on the active
// wishlist for future ordering; if the order is full, the wishlist is archived.
exports.findandmarkdone = async (id, { schemesId, acceptedQuantities, partialOrderReason } = {}) => {
  if (!id) throw new Error("Wishlist ID is required");

  const wishlist = await Wishlist.findById(id);

  // Check if it exists at all
  if (!wishlist) {
    throw new Error("Wishlist not found or already deleted");
  }

  // Can only be accepted once stock has been applied
  if (wishlist.wishlistStockTime === null) {
    throw new Error("Wishlist is not ready: stock time has not been applied");
  }

  // Must have items to turn into an order
  if (!wishlist.WishList || wishlist.WishList.length === 0) {
    throw new Error("Wishlist has no items to create an order");
  }

  // --- Resolve accepted quantities per item ---
  // If acceptedQuantities is not provided, default to full quantity for each item.
  const items = wishlist.WishList;
  const resolvedAccepted = items.map((it, i) => {
    if (acceptedQuantities && Array.isArray(acceptedQuantities) && acceptedQuantities.length > i) {
      return Number(acceptedQuantities[i]);
    }
    return Number(it.quantity);
  });

  // Validate each accepted quantity
  const totalRequested = items.reduce((s, it) => s + Number(it.quantity), 0);
  let totalAccepted = 0;
  for (let i = 0; i < items.length; i++) {
    const reqQty = Number(items[i].quantity);
    const accQty = resolvedAccepted[i];
    if (!Number.isFinite(accQty) || accQty < 0) {
      throw new Error(`Accepted quantity for item ${i + 1} must be a non-negative number`);
    }
    if (accQty > reqQty) {
      throw new Error(
        `Accepted quantity (${accQty}) cannot exceed requested quantity (${reqQty}) for item ${i + 1}`
      );
    }
    totalAccepted += accQty;
  }

  if (totalAccepted <= 0) {
    throw new Error("At least one item must have a positive accepted quantity");
  }

  const totalRemaining = totalRequested - totalAccepted;
  const isPartial = totalAccepted < totalRequested;

  // Partial order reason validation
  if (isPartial) {
    if (!partialOrderReason || typeof partialOrderReason !== "string" || !partialOrderReason.trim()) {
      throw new Error("Partial order reason is required");
    }
  }

  // Scheme to attach to the order: a scheme chosen at approval time (from the
  // confirm modal) overrides whatever was on the wishlist. Falls back to the
  // wishlist's own scheme when none is passed.
  let orderScheme = wishlist.scheme;
  if (schemesId) {
    const scheme = await Schemes.findById(schemesId);
    if (!scheme) throw new Error("Scheme not found");
    orderScheme = scheme._id;
  }

  // --- Compute waiting time ---
  const createdAt = new Date(wishlist.createdAt);
  const now = new Date();
  const waitingTimeMs = now.getTime() - createdAt.getTime();
  const waitingTimeDays = Number((waitingTimeMs / (1000 * 60 * 60 * 24)).toFixed(2));

  // --- Partial order metadata for history ---
  const partialMeta = {
    requestedQuantity: totalRequested,
    acceptedQuantity: totalAccepted,
    remainingQuantity: totalRemaining,
    isPartialOrder: isPartial,
    partialOrderReason: isPartial ? partialOrderReason : null,
    fulfillmentDate: now,
    waitingTimeDays,
  };

  // Build the WishList snapshot to archive (with accepted quantities).
  const acceptedItems = items.map((it, i) => ({
    productId: it.productId,
    categoryId: it.categoryId,
    quantity: resolvedAccepted[i],
    image: it.image || [],
  })).filter(it => it.quantity > 0);

  // 1️⃣ ARCHIVE: Create the WishlistHistory record.
  // For partial orders we store a snapshot of the ACCEPTED quantities, not the
  // originals, so the history record reflects what was actually ordered.
  const historyWishlist = {
    ...wishlist.toObject(),
    WishList: acceptedItems,
  };
  // archiveWishlist will delete the active doc, but for partial orders we need
  // to keep it. So we handle partial/full differently.
  let history;
  if (isPartial) {
    // Don't delete the active wishlist — just create the history entry manually.
    history = await WishlistHistory.create({
      originalWishlistId: wishlist._id,
      createdBy: wishlist.createdBy,
      customer: wishlist.customer,
      Location: wishlist.Location,
      WishList: acceptedItems,
      description: wishlist.description,
      scheme: wishlist.scheme,
      wishlistStockTime: wishlist.wishlistStockTime,
      wishAction: "Accepted",
      actionAt: now,
      originalCreatedAt: wishlist.createdAt,
      originalUpdatedAt: wishlist.updatedAt,
      ...partialMeta,
    });

    // Update the active wishlist with remaining quantities.
    for (let i = 0; i < items.length; i++) {
      const remaining = Number(items[i].quantity) - resolvedAccepted[i];
      wishlist.WishList[i].quantity = remaining;
    }
    // Remove items with 0 remaining quantity
    wishlist.WishList = wishlist.WishList.filter(it => Number(it.quantity) > 0);
    // Reset stock time so remaining quantity is eligible for future production allocations
    wishlist.wishlistStockTime = null;
    await wishlist.save();
  } else {
    // Full order — archive and delete the active wishlist.
    history = await exports.archiveWishlist(wishlist, "Accepted", partialMeta);
  }

  // 2️⃣ PLACE ORDER. Generate the next sales order number the same way as
  // Cart/checkout: pick the higher of the last Cart and last SellOrder number,
  // then increment.
  const lastCartOrder = await Cart.findOne().sort({ createdAt: -1 });
  const lastSellOrder = await SellOrder.findOne().sort({ createdAt: -1 });
  const nextNo = Math.max(
    lastCartOrder ? parseInt(lastCartOrder.salesOrderNo.split("/")[1]) : 0,
    lastSellOrder ? parseInt(lastSellOrder.salesOrderNo.split("/")[1]) : 0
  ) + 1;
  const salesOrderNo = `SO/${nextNo}`;

  // Map accepted items to order items (ids only; article/category details are
  // resolved from productId/categoryId when the order is read).
  const orderItems = acceptedItems.map((it) => ({
    productId: it.productId,
    categoryId: it.categoryId,
    quantity: it.quantity,
    image: it.image || [],
  }));

  // Create the Cart directly from the wishlist's customer + products.
  const order = await Cart.create({
    salesOrderNo,
    customer: wishlist.customer,
    Location: wishlist.Location,
    items: orderItems,
    scheme: orderScheme,
    createdBy: wishlist.createdBy,
    isActive: true,
  });

  await order.populate("createdBy", "name");

  return { order, history };
};

// Reject a wishlist: archive the whole record to WishlistHistory as "Rejected"
// and remove it from the active wishlist collection.
exports.softDeleteWishlistById = async (id) => {
  if (!id) throw new Error("Wishlist ID is required");

  const wishlist = await Wishlist.findById(id);
  if (!wishlist) throw new Error("Wishlist not found");

  return await exports.archiveWishlist(wishlist, "Rejected");
};

// Export the helper so the controller (which has its own inline query for the
// salesperson view) can apply the same computed status logic.
exports.computeActiveWishlistStatus = computeActiveWishlistStatus;

/**
 * Aggregates wishlist data across active and history collections to generate
 * performance ratings and metrics grouped by salesperson and customer.
 */
exports.getWishlistRating = async ({ startDate, endDate, search, salespersonId, customerId } = {}) => {
  const activeQuery = { isActive: true };
  if (salespersonId) activeQuery.createdBy = salespersonId;
  if (customerId) activeQuery.customer = customerId;
  if (startDate || endDate) {
    activeQuery.createdAt = {};
    if (startDate) activeQuery.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      activeQuery.createdAt.$lte = end;
    }
  }

  const historyQuery = {};
  if (salespersonId) historyQuery.createdBy = salespersonId;
  if (customerId) historyQuery.customer = customerId;
  if (startDate || endDate) {
    const dateRange = {};
    if (startDate) dateRange.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateRange.$lte = end;
    }
    historyQuery.$or = [
      { originalCreatedAt: dateRange },
      { actionAt: dateRange },
      { createdAt: dateRange },
    ];
  }

  const [activeDocs, historyDocs] = await Promise.all([
    Wishlist.find(activeQuery)
      .populate("customer", "name email phone location")
      .populate("createdBy", "name email role")
      .lean(),
    WishlistHistory.find(historyQuery)
      .populate("customer", "name email phone location")
      .populate("createdBy", "name email role")
      .lean(),
  ]);

  // Combine all wishlist documents
  const allDocs = [
    ...activeDocs.map((d) => ({ ...d, _isAccepted: false })),
    ...historyDocs.map((d) => ({ ...d, _isAccepted: d.wishAction === "Accepted" })),
  ];

  const salespersonMap = new Map();
  const customerMap = new Map();
  const detailMap = new Map();

  let overallTotalWishlistQty = 0;
  let overallAcceptedQty = 0;
  let overallWishlistCount = allDocs.length;
  let overallAcceptedCount = 0;

  for (const doc of allDocs) {
    const sId = doc.createdBy?._id ? String(doc.createdBy._id) : "unassigned";
    const sName = doc.createdBy?.name || "Unassigned";
    const sEmail = doc.createdBy?.email || "";

    const cId = doc.customer?._id ? String(doc.customer._id) : "unknown";
    const cName = doc.customer?.name || "Unknown Customer";
    const cPhone = doc.customer?.phone || "";

    const qty = (doc.WishList || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const isAccepted = Boolean(doc._isAccepted);
    const accQty = isAccepted ? qty : 0;

    overallTotalWishlistQty += qty;
    overallAcceptedQty += accQty;
    if (isAccepted) overallAcceptedCount += 1;

    // 1. Detailed map (salesperson + customer)
    const detailKey = `${sId}___${cId}`;
    if (!detailMap.has(detailKey)) {
      detailMap.set(detailKey, {
        salespersonId: sId,
        salespersonName: sName,
        salespersonEmail: sEmail,
        customerId: cId,
        customerName: cName,
        customerPhone: cPhone,
        totalWishlistQty: 0,
        acceptedQty: 0,
        wishlistCount: 0,
        acceptedCount: 0,
      });
    }
    const detailItem = detailMap.get(detailKey);
    detailItem.totalWishlistQty += qty;
    detailItem.acceptedQty += accQty;
    detailItem.wishlistCount += 1;
    if (isAccepted) detailItem.acceptedCount += 1;

    // 2. Salesperson map
    if (!salespersonMap.has(sId)) {
      salespersonMap.set(sId, {
        salespersonId: sId,
        salespersonName: sName,
        salespersonEmail: sEmail,
        totalWishlistQty: 0,
        acceptedQty: 0,
        wishlistCount: 0,
        acceptedCount: 0,
        customerMap: new Map(),
      });
    }
    const sItem = salespersonMap.get(sId);
    sItem.totalWishlistQty += qty;
    sItem.acceptedQty += accQty;
    sItem.wishlistCount += 1;
    if (isAccepted) sItem.acceptedCount += 1;
    if (!sItem.customerMap.has(cId)) {
      sItem.customerMap.set(cId, {
        customerId: cId,
        customerName: cName,
        customerPhone: cPhone,
        totalWishlistQty: 0,
        acceptedQty: 0,
        wishlistCount: 0,
        acceptedCount: 0,
      });
    }
    const sCustItem = sItem.customerMap.get(cId);
    sCustItem.totalWishlistQty += qty;
    sCustItem.acceptedQty += accQty;
    sCustItem.wishlistCount += 1;
    if (isAccepted) sCustItem.acceptedCount += 1;

    // 3. Customer map
    if (!customerMap.has(cId)) {
      customerMap.set(cId, {
        customerId: cId,
        customerName: cName,
        customerPhone: cPhone,
        totalWishlistQty: 0,
        acceptedQty: 0,
        wishlistCount: 0,
        acceptedCount: 0,
        salespersonMap: new Map(),
      });
    }
    const cItem = customerMap.get(cId);
    cItem.totalWishlistQty += qty;
    cItem.acceptedQty += accQty;
    cItem.wishlistCount += 1;
    if (isAccepted) cItem.acceptedCount += 1;
    if (!cItem.salespersonMap.has(sId)) {
      cItem.salespersonMap.set(sId, {
        salespersonId: sId,
        salespersonName: sName,
        salespersonEmail: sEmail,
        totalWishlistQty: 0,
        acceptedQty: 0,
        wishlistCount: 0,
        acceptedCount: 0,
      });
    }
    const cSalesItem = cItem.salespersonMap.get(sId);
    cSalesItem.totalWishlistQty += qty;
    cSalesItem.acceptedQty += accQty;
    cSalesItem.wishlistCount += 1;
    if (isAccepted) cSalesItem.acceptedCount += 1;
  }

  // Format salesperson summary
  let salespersonSummary = Array.from(salespersonMap.values()).map((s) => {
    const rate = s.totalWishlistQty > 0 ? Number(((s.acceptedQty / s.totalWishlistQty) * 100).toFixed(2)) : 0;
    const customers = Array.from(s.customerMap.values()).map((c) => {
      const cRate = c.totalWishlistQty > 0 ? Number(((c.acceptedQty / c.totalWishlistQty) * 100).toFixed(2)) : 0;
      return {
        ...c,
        acceptanceRate: cRate,
      };
    }).sort((a, b) => b.totalWishlistQty - a.totalWishlistQty);

    return {
      salespersonId: s.salespersonId,
      salespersonName: s.salespersonName,
      salespersonEmail: s.salespersonEmail,
      totalWishlistQty: s.totalWishlistQty,
      acceptedQty: s.acceptedQty,
      acceptanceRate: rate,
      wishlistCount: s.wishlistCount,
      acceptedCount: s.acceptedCount,
      customersCount: customers.length,
      customers,
    };
  }).sort((a, b) => b.totalWishlistQty - a.totalWishlistQty);

  // Format customer summary
  let customerSummary = Array.from(customerMap.values()).map((c) => {
    const rate = c.totalWishlistQty > 0 ? Number(((c.acceptedQty / c.totalWishlistQty) * 100).toFixed(2)) : 0;
    const salespersons = Array.from(c.salespersonMap.values()).map((s) => {
      const sRate = s.totalWishlistQty > 0 ? Number(((s.acceptedQty / s.totalWishlistQty) * 100).toFixed(2)) : 0;
      return {
        ...s,
        acceptanceRate: sRate,
      };
    }).sort((a, b) => b.totalWishlistQty - a.totalWishlistQty);

    return {
      customerId: c.customerId,
      customerName: c.customerName,
      customerPhone: c.customerPhone,
      totalWishlistQty: c.totalWishlistQty,
      acceptedQty: c.acceptedQty,
      acceptanceRate: rate,
      wishlistCount: c.wishlistCount,
      acceptedCount: c.acceptedCount,
      salespersonsCount: salespersons.length,
      salespersons,
    };
  }).sort((a, b) => b.totalWishlistQty - a.totalWishlistQty);

  // Format detail breakdown
  let detailedBreakdown = Array.from(detailMap.values()).map((d) => {
    const rate = d.totalWishlistQty > 0 ? Number(((d.acceptedQty / d.totalWishlistQty) * 100).toFixed(2)) : 0;
    return {
      ...d,
      acceptanceRate: rate,
    };
  }).sort((a, b) => b.totalWishlistQty - a.totalWishlistQty);

  // Apply search query filter if provided
  if (search && search.trim() !== "") {
    const q = search.trim().toLowerCase();
    detailedBreakdown = detailedBreakdown.filter(
      (d) =>
        d.salespersonName.toLowerCase().includes(q) ||
        d.customerName.toLowerCase().includes(q)
    );
    salespersonSummary = salespersonSummary.filter(
      (s) =>
        s.salespersonName.toLowerCase().includes(q) ||
        s.customers.some((c) => c.customerName.toLowerCase().includes(q))
    );
    customerSummary = customerSummary.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        c.salespersons.some((s) => s.salespersonName.toLowerCase().includes(q))
    );
  }

  const overallAcceptanceRate =
    overallTotalWishlistQty > 0
      ? Number(((overallAcceptedQty / overallTotalWishlistQty) * 100).toFixed(2))
      : 0;

  return {
    overall: {
      totalWishlistQty: overallTotalWishlistQty,
      acceptedQty: overallAcceptedQty,
      acceptanceRate: overallAcceptanceRate,
      totalSalespersons: salespersonMap.size,
      totalCustomers: customerMap.size,
      totalWishlists: overallWishlistCount,
      acceptedWishlists: overallAcceptedCount,
    },
    salespersonSummary,
    customerSummary,
    detailedBreakdown,
  };
};

/**
 * Wishlist Analytics / Yearly Reporting.
 * Aggregates wishlist data across active and history collections and computes
 * KPI metrics for the requested financial year (Apr → Mar).
 *
 * @param {Object} options
 * @param {string} [options.financialYear] - e.g. "2026-27"
 * @param {number} [options.month]         - 1-12 (calendar month)
 */
exports.getWishlistAnalytics = async ({ financialYear, month } = {}) => {
  // --- Determine date range from financial year ---
  let dateFrom = null;
  let dateTo = null;

  if (financialYear) {
    // Parse "2026-27" → start April 2026, end March 2027
    const parts = financialYear.split("-");
    const startYear = parseInt(parts[0], 10);
    dateFrom = new Date(startYear, 3, 1); // April 1
    dateTo = new Date(startYear + 1, 2, 31, 23, 59, 59, 999); // March 31 end

    // If a specific month is requested, narrow further
    if (month) {
      const m = parseInt(month, 10); // 1-12 calendar month
      // Financial year months: Apr(4)..Dec(12), Jan(1)..Mar(3)
      const calYear = m >= 4 ? startYear : startYear + 1;
      dateFrom = new Date(calYear, m - 1, 1);
      dateTo = new Date(calYear, m, 0, 23, 59, 59, 999); // last day of month
    }
  }

  // --- Query both collections ---
  const activeQuery = { isActive: true };
  const historyQuery = {};

  if (dateFrom && dateTo) {
    activeQuery.createdAt = { $gte: dateFrom, $lte: dateTo };
    historyQuery.$or = [
      { originalCreatedAt: { $gte: dateFrom, $lte: dateTo } },
      { actionAt: { $gte: dateFrom, $lte: dateTo } },
    ];
  }

  const [activeDocs, historyDocs, totalOrdersResult] = await Promise.all([
    Wishlist.find(activeQuery).lean(),
    WishlistHistory.find(historyQuery).lean(),
    // Total sell orders in the period (for wishlist-order percentage)
    SellOrder.countDocuments(
      dateFrom && dateTo
        ? { createdAt: { $gte: dateFrom, $lte: dateTo }, isActive: true }
        : { isActive: true }
    ),
  ]);

  // Tag active docs with computed status
  const allDocs = [
    ...activeDocs.map((d) => ({
      ...d,
      _source: "active",
      wishAction: computeActiveWishlistStatus(d),
    })),
    ...historyDocs.map((d) => ({
      ...d,
      _source: "history",
    })),
  ];

  // --- Compute KPIs ---
  let totalWishlists = allDocs.length;
  let totalWishlistQty = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let notFulfilledCount = 0;
  let expiredCount = 0;
  let timeoutCount = 0;
  let fullOrderCount = 0;
  let partialOrderCount = 0;
  let totalAcceptedQty = 0;
  let totalRemainingQty = 0;
  let totalRequestedQtyInPartial = 0;
  let totalAcceptedQtyInPartial = 0;
  let totalRemainingQtyInPartial = 0;
  const reasonMap = {};
  let waitingTimeSumDays = 0;
  let waitingTimeCount = 0;
  let orderFromWishlistCount = 0;

  // Monthly breakdown: keyed by "YYYY-MM"
  const monthlyMap = {};

  for (const doc of allDocs) {
    const qty = (doc.WishList || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    totalWishlistQty += qty;

    const action = doc.wishAction;

    // Monthly tracking
    const docDate = new Date(doc.originalCreatedAt || doc.createdAt);
    const monthKey = `${docDate.getFullYear()}-${String(docDate.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[monthKey]) {
      monthlyMap[monthKey] = {
        month: monthKey,
        totalWishlists: 0,
        accepted: 0,
        rejected: 0,
        expired: 0,
        timeout: 0,
        notFulfilled: 0,
        fullOrders: 0,
        partialOrders: 0,
        totalQty: 0,
        acceptedQty: 0,
      };
    }
    const mm = monthlyMap[monthKey];
    mm.totalWishlists += 1;
    mm.totalQty += qty;

    if (action === "Accepted") {
      acceptedCount += 1;
      orderFromWishlistCount += 1;
      mm.accepted += 1;

      const reqQty = doc.requestedQuantity || qty;
      const accQty = doc.acceptedQuantity || qty;
      const remQty = doc.remainingQuantity || 0;

      totalAcceptedQty += accQty;
      totalRemainingQty += remQty;
      mm.acceptedQty += accQty;

      if (doc.isPartialOrder) {
        partialOrderCount += 1;
        mm.partialOrders += 1;
        totalRequestedQtyInPartial += reqQty;
        totalAcceptedQtyInPartial += accQty;
        totalRemainingQtyInPartial += remQty;

        const reason = doc.partialOrderReason || "Unspecified";
        if (!reasonMap[reason]) {
          reasonMap[reason] = {
            reason,
            count: 0,
            requestedQty: 0,
            acceptedQty: 0,
            remainingQty: 0,
          };
        }
        reasonMap[reason].count += 1;
        reasonMap[reason].requestedQty += reqQty;
        reasonMap[reason].acceptedQty += accQty;
        reasonMap[reason].remainingQty += remQty;
      } else {
        fullOrderCount += 1;
        mm.fullOrders += 1;
      }

      // Waiting time (only for fulfilled/accepted wishlists)
      if (doc.waitingTimeDays != null) {
        waitingTimeSumDays += doc.waitingTimeDays;
        waitingTimeCount += 1;
      } else if (doc.fulfillmentDate && (doc.originalCreatedAt || doc.createdAt)) {
        const created = new Date(doc.originalCreatedAt || doc.createdAt);
        const fulfilled = new Date(doc.fulfillmentDate);
        const days = (fulfilled - created) / (1000 * 60 * 60 * 24);
        waitingTimeSumDays += days;
        waitingTimeCount += 1;
      }
    } else if (action === "Rejected") {
      rejectedCount += 1;
      mm.rejected += 1;
    } else if (action === "Not Fulfilled") {
      notFulfilledCount += 1;
      mm.notFulfilled += 1;
    } else if (action === "Expired") {
      expiredCount += 1;
      mm.expired += 1;
    } else if (action === "Timeout") {
      timeoutCount += 1;
      mm.timeout += 1;
    }
  }

  const totalOrders = totalOrdersResult || 0;
  const wishlistOrderPercentage =
    totalOrders > 0
      ? Number(((orderFromWishlistCount / totalOrders) * 100).toFixed(2))
      : 0;

  const partialOrderPercentage =
    acceptedCount > 0
      ? Number(((partialOrderCount / acceptedCount) * 100).toFixed(2))
      : 0;

  const averageWaitingTimeDays =
    waitingTimeCount > 0
      ? Number((waitingTimeSumDays / waitingTimeCount).toFixed(2))
      : 0;

  // Sort monthly breakdown in financial-year order (Apr → Mar)
  const monthlyBreakdown = Object.values(monthlyMap).sort((a, b) => {
    // Parse "YYYY-MM" and sort in FY order
    const [aY, aM] = a.month.split("-").map(Number);
    const [bY, bM] = b.month.split("-").map(Number);
    const aFY = aM >= 4 ? aM : aM + 12;
    const bFY = bM >= 4 ? bM : bM + 12;
    return aY !== bY ? aY - bY : aFY - bFY;
  });

  return {
    kpis: {
      totalWishlists,
      totalWishlistQty,
      totalOrders,
      ordersFromWishlist: orderFromWishlistCount,
      wishlistOrderPercentage,
      acceptedOrders: acceptedCount,
      rejectedOrders: rejectedCount,
      notFulfilledOrders: notFulfilledCount,
      expiredOrders: expiredCount,
      timeoutOrders: timeoutCount,
      fullOrders: fullOrderCount,
      partialOrders: partialOrderCount,
      partialOrderPercentage,
      averageWaitingTimeDays,
      totalAcceptedQty,
      totalRemainingQty,
    },
    partialOrderBreakdown: {
      totalPartialOrders: partialOrderCount,
      partialOrderPercentage,
      totalRequestedQty: totalRequestedQtyInPartial,
      totalAcceptedQty: totalAcceptedQtyInPartial,
      totalRemainingQty: totalRemainingQtyInPartial,
      byReason: Object.values(reasonMap),
    },
    monthlyBreakdown,
  };
};
