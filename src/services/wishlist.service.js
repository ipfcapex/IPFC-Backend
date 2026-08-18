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

  const [activeDocs, historyDocs] = await Promise.all([
    Wishlist.find(activeQuery)
      .populate("customer", "name email phone location")
      .populate("createdBy", "name email")
      .populate("scheme", "name")
      .lean(),
    WishlistHistory.find(historyQuery)
      .populate("customer", "name email phone location")
      .populate("createdBy", "name email")
      .populate("scheme", "name")
      .lean(),
  ]);

  // Tag so the UI can dim history rows and hide their actions.
  const activeTagged = activeDocs.map((d) => ({
    ...d,
    isHistory: false,
    wishAction: computeActiveWishlistStatus(d),
    _sortDate: d.updatedAt || d.createdAt,
  }));
  const historyTagged = historyDocs.map((d) => ({
    ...d,
    isHistory: true,
    _sortDate: d.actionAt || d.updatedAt || d.createdAt,
  }));

  let combined = [...activeTagged, ...historyTagged].sort(
    (a, b) => new Date(b._sortDate) - new Date(a._sortDate)
  );

  // "Stock Time" status filter. Status is a computed value (not a stored field),
  // so it is applied here after both collections are tagged and merged. Active
  // wishlists whose stock time is set (wishAction null) count as "Pending".
  if (status && status.trim() !== "") {
    const wanted = status.trim();
    combined = combined.filter((d) => (d.wishAction || "Pending") === wanted);
  }

  const totalItems = combined.length;
  const totalPages = Math.ceil(totalItems / limitNum) || 1;
  const pageSlice = combined.slice(skip, skip + limitNum);

  await enrichOrdersWithProductDetails(pageSlice);
  pageSlice.forEach((d) => {
    delete d._sortDate;
  });

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
// record. `action` is one of "Accepted" | "Rejected" | "Timeout".
exports.archiveWishlist = async (wishlist, action) => {
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
  });

  await Wishlist.deleteOne({ _id: wishlist._id });

  return history;
};

// Accept (Approve) a wishlist: instead of just archiving/redirecting, directly
// create a SellOrder from the wishlist's customer + product details, then
// archive the wishlist to WishlistHistory as "Accepted" and remove it from the
// active wishlist collection. Returns { order, history }.
exports.findandmarkdone = async (id, schemesId) => {
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

  // Scheme to attach to the order: a scheme chosen at approval time (from the
  // confirm modal) overrides whatever was on the wishlist. Falls back to the
  // wishlist's own scheme when none is passed.
  let orderScheme = wishlist.scheme;
  if (schemesId) {
    const scheme = await Schemes.findById(schemesId);
    if (!scheme) throw new Error("Scheme not found");
    orderScheme = scheme._id;
  }

  // 1️⃣ APPROVE FIRST: archive the wishlist as Accepted and remove it from the
  // active list. The `wishlist` document is still held in memory, so its
  // customer/product details remain available for the order created below.
  const history = await exports.archiveWishlist(wishlist, "Accepted");

  // 2️⃣ THEN PLACE ORDER. Generate the next sales order number the same way as
  // Cart/checkout: pick the higher of the last Cart and last SellOrder number,
  // then increment.
  const lastCartOrder = await Cart.findOne().sort({ createdAt: -1 });
  const lastSellOrder = await SellOrder.findOne().sort({ createdAt: -1 });
  const nextNo = Math.max(
    lastCartOrder ? parseInt(lastCartOrder.salesOrderNo.split("/")[1]) : 0,
    lastSellOrder ? parseInt(lastSellOrder.salesOrderNo.split("/")[1]) : 0
  ) + 1;
  const salesOrderNo = `SO/${nextNo}`;

  // Map wishlist items to order items (ids only; article/category details are
  // resolved from productId/categoryId when the order is read).
  const orderItems = wishlist.WishList.map((it) => ({
    productId: it.productId,
    categoryId: it.categoryId,
    quantity: it.quantity,
    image: it.image || [],
  }));

  // Create the SellOrder directly from the wishlist's customer + products.
  const order = await SellOrder.create({
    salesOrderNo,
    customer: wishlist.customer,
    Location: wishlist.Location,
    items: orderItems,
    scheme: orderScheme,
    createdBy: wishlist.createdBy,
    isActive: true,
  });

  await order.populate("createdBy", "name");

  // 3️⃣ Notify (same channel as a salesperson-generated order) for review.
  const Notification = {
    message: `Order ${order.salesOrderNo} created from approved wishlist by ${order.createdBy?.name || "Sales Person"}. Please review.`,
    data: order,
  };
  sendNotification("SalesPersonGenearated", Notification);

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
