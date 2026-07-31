const { Customer, Product, Wishlist, Schemes, WishlistHistory, SellOrder, Cart } = require("../models");
const mongoose = require("mongoose");
const { enrichOrdersWithProductDetails } = require("./salesOrder.service");
const { sendNotification } = require("./notificationService");

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

exports.getWishlist = async (filter = {}, page = 1, limit = 10, search = "") => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const searchOr =
    search && search.trim() !== ""
      ? [{ description: { $regex: new RegExp(search.trim(), "i") } }]
      : null;

  // Active (pending) wishlists.
  const activeQuery = { isActive: true, ...filter };
  if (searchOr) activeQuery.$or = searchOr;

  // Archived wishlists (accepted / rejected / timeout). Reuse the same customer
  // filter; the incoming date filter is on createdAt, so remap it to actionAt
  // (when the wishlist was archived).
  const historyQuery = {};
  if (filter.customer) historyQuery.customer = filter.customer;
  if (filter.createdAt) historyQuery.actionAt = filter.createdAt;
  if (searchOr) historyQuery.$or = searchOr;

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
    wishAction: null,
    _sortDate: d.updatedAt || d.createdAt,
  }));
  const historyTagged = historyDocs.map((d) => ({
    ...d,
    isHistory: true,
    _sortDate: d.actionAt || d.updatedAt || d.createdAt,
  }));

  const combined = [...activeTagged, ...historyTagged].sort(
    (a, b) => new Date(b._sortDate) - new Date(a._sortDate)
  );

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
