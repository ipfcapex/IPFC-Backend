const { Customer, Product, Wishlist, Schemes } = require("../models");
const mongoose = require("mongoose");
const { enrichOrdersWithProductDetails } = require("./salesOrder.service");

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
    const productRecord = await Product.findOne({
      article: item.article,
      category: {
        $elemMatch: {
          categoryCode: item.categoryCode,
          color: { $regex: new RegExp(`^${item.color}$`, "i") },
          size: { $regex: new RegExp(`^${item.size}$`, "i") },
          ...(item.type && { type: { $regex: new RegExp(`^${item.type}$`, "i") } }),
          ...(item.quality && { quality: { $regex: new RegExp(`^${item.quality}$`, "i") } })
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
        (!item.type ||
          (cat.type || []).some(t => t?.toLowerCase() === item.type.toLowerCase())) &&
        (!item.quality ||
          (cat.quality || []).some(q => q?.toLowerCase() === item.quality.toLowerCase()))
      );

      if (matchedCategory) {
        matchedCategoryId = matchedCategory._id;
        // 🖼️ Image only if exact match
        if (matchedCategory.image?.length) {
          image = [matchedCategory.image[0]];
        }
      }
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

  // Base query
  const query = { isActive: true, ...filter };

  // Add search if provided
  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");
    query.$or = [
      { description: { $regex: regex } },
      // { 'customer.name': { $regex: regex } }
    ];
  }

  // Fetch wishlists and total count in parallel
  const [wishlists, totalItems] = await Promise.all([
    Wishlist.find(query)
      .populate("customer", "name email phone location")
      .populate("createdBy", "name email")
      .populate("scheme", "name")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Wishlist.countDocuments(query)
  ]);

  await enrichOrdersWithProductDetails(wishlists);

  const totalPages = Math.ceil(totalItems / limitNum);

  return {
    wishlists,
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalItems
    }
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
  const wishlist = await Wishlist.findById(id)
    .populate("customer", "name email phone location")
    .populate("createdBy", "name email")
    .populate("scheme", "name")
    .lean();

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

      // Fetch product for image. Match type/quality too so we resolve the exact
      // sub-document (a color+size can have multiple type/quality variants that
      // share the same categoryCode).
      const productRecord = await Product.findOne({
        article: item.article,
        category: {
          $elemMatch: {
            categoryCode: item.categoryCode,
            color: { $regex: new RegExp(`^${item.color}$`, "i") },
            size: { $regex: new RegExp(`^${item.size}$`, "i") },
            ...(item.type && { type: { $regex: new RegExp(`^${item.type}$`, "i") } }),
            ...(item.quality && { quality: { $regex: new RegExp(`^${item.quality}$`, "i") } })
          }
        }
      });

      let imageUrl = null;
      let matchedCategoryId = null;
      if (productRecord && productRecord.category?.length > 0) {
        const matchedCategory = productRecord.category.find(cat =>
          cat.categoryCode === item.categoryCode &&
          cat.color.toLowerCase() === item.color.toLowerCase() &&
          cat.size.toLowerCase() === item.size.toLowerCase() &&
          (!item.type ||
            (cat.type || []).some(t => t?.toLowerCase() === item.type.toLowerCase())) &&
          (!item.quality ||
            (cat.quality || []).some(q => q?.toLowerCase() === item.quality.toLowerCase()))
        );
        if (matchedCategory) {
          matchedCategoryId = matchedCategory._id;
          imageUrl = matchedCategory.image[0];
        }
      }

      updatedItems.push({
        productId: productRecord?._id,
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

exports.findandmarkdone = async (id) => {
  if (!id) throw new Error("Wishlist ID is required");

  const wishlist = await Wishlist.findById(id);
  
  // Check if it exists at all
  if (!wishlist) {
    throw new Error("Wishlist not found or already deleted");
  }

  // Check if it's ready to be removed
  if (wishlist.wishlistStockTime !== null) {
    const deletedWishlist = await Wishlist.findByIdAndDelete(id);
    
    // Safety check: if someone else deleted it in the last millisecond
    if (!deletedWishlist) {
      throw new Error("Wishlist not found or already deleted");
    }
    
    return deletedWishlist;
  } else {
    throw new Error("Wishlist is not ready: stock time has not been applied");
  }
};

exports.softDeleteWishlistById = async (id) => {
  if (!id) throw new Error("Wishlist ID is required");

  const wishlist = await Wishlist.findByIdAndDelete(id);
  if (!wishlist) throw new Error("Wishlist not found");

  // wishlist.isActive = false;
  // const savedWishlist = await wishlist.save();

  // return savedWishlist;
};
