const { Production, Factory, Wishlist } = require("../models");
const { Product } = require("../models");
const QRCODE = require("../models/qrCode.model");
const SalesOrder = require("../models/salesOrder.model");
const { Notification } = require("../models");
const { decodeBase64Qratproduction } = require("../utils/DecodeQR");
const mongoose = require("mongoose");
const qrCodeModel = require("../models/qrCode.model");
const { sendNotification } = require("./notificationService");

// Reshape a populated production (lean object):
// - keep only the product name (article) on productId
// - resolve categoryId to its related category object from the product
const attachCategoryDetail = (prod) => {
  if (!prod) return prod;
  const product = prod.productId;
  if (product && typeof product === "object") {
    const matched = Array.isArray(product.category)
      ? product.category.find(
          (c) => String(c._id) === String(prod.categoryId)
        )
      : null;
    prod.productId = { _id: product._id, article: product.article };
    if (matched) prod.categoryId = matched;
  }
  // article is available via productId, category via categoryId
  delete prod.article;
  delete prod.category;
  return prod;
};

//apply wish list to prodution qty
// const applyProductionToWishlists = async (productionData) => {
//   const {
//     article,
//     categoryCode,
//     color,
//     size,
//     type,
//     quality,
//     productionQuantity
//   } = productionData;

//   const wishlists = await Wishlist.find({
//     "WishList.article": article,
//     "WishList.categoryCode": categoryCode,
//     "WishList.color": color,
//     "WishList.size": size,
//     "WishList.type": type,
//     "WishList.quality": quality,
//     isActive: true,
//     wishlistStockTime: null
//   });

//   if (!wishlists.length) {
//     console.log("No matching wishlists found");
//   }

//   let remainingProductionQty = productionQuantity;

//   // Sort wishlists by creation date (FIFO)
//   const sortedWishlists = wishlists.sort(
//     (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
//   );

//   console.log("Matching wishlists count:", sortedWishlists.length);
//   console.log("Initial Production Qty:", remainingProductionQty);

//   for (const wishlist of sortedWishlists) {
//     if (remainingProductionQty <= 0) break;

//     let wishlistUpdated = false;

//     for (const item of wishlist.WishList) {
//       if (
//         item.article === article &&
//         item.categoryCode === categoryCode &&
//         item.color === color &&
//         item.size === size &&
//         item.type === type &&
//         item.quality === quality &&
//         item.quantity > 0 &&
//         wishlist.wishlistStockTime === null
//       ) {
//         if (remainingProductionQty >= item.quantity) {
//           remainingProductionQty -= item.quantity;
//           item.quantity = 0; // Fully fulfilled
//         } else {
//           item.quantity -= remainingProductionQty; // Partial fulfillment
//           remainingProductionQty = 0;
//         }
//         wishlistUpdated = true;
//       }
//     }

//     if (wishlistUpdated) {
//       await Wishlist.updateOne(
//         { _id: wishlist._id, wishlistStockTime: null },
//         { $set: { wishlistStockTime: new Date() } }
//       );
//       console.log(`✅ wishlistStockTime applied → ${wishlist._id}`);
//     }
//   }

//   if (remainingProductionQty > 0) {
//     console.log(
//       `⚠️ Production qty remaining after fulfilling wishlists: ${remainingProductionQty}`
//     );
//   } else {
//     console.log("✅ All production qty applied to wishlists");
//   }
// };

// Find wishlists that need this production (matched by the stored ObjectIds,
// FIFO by creation) and return the assignment records to persist on the
// Production. NOTE: this does NOT start any timer. The wishlistStockTime timer
// is only activated later, during the production stock-in scan, once real
// stock is scanned in (see activateWishlistTimersFromScan).
const applyProductionToWishlists = async (productionData) => {
  const { productId, categoryId, productionQuantity } = productionData;

  let remainingProdQty = Number(productionQuantity) || 0;
  if (remainingProdQty <= 0) return [];

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Find all relevant wishlists created within 1 year (<= 1 year old), sorted FIFO
  const wishlists = await Wishlist.find({
    WishList: {
      $elemMatch: {
        productId: new mongoose.Types.ObjectId(productId),
        categoryId: new mongoose.Types.ObjectId(categoryId)
      }
    },
    isActive: true,
    wishlistStockTime: null,
    createdAt: { $gte: oneYearAgo }
  }).sort({ createdAt: 1 }); // Oldest first

  console.log(`🔍 applyProductionToWishlists: found ${wishlists.length} matching wishlist(s) for productId=${productId}, categoryId=${categoryId}, productionQuantity=${remainingProdQty}`);

  // Fetch all active production records to check if any of these wishlists have already been allocated
  // quantity in pending (unscanned or earlier) productions.
  const activeProductions = await Production.find({
    isActive: true,
    "assignwishlistprod.wishlistId": { $in: wishlists.map(w => w._id) }
  }).select("assignwishlistprod");

  const alreadyAssignedMap = {};
  for (const prod of activeProductions) {
    for (const a of (prod.assignwishlistprod || [])) {
      if (a.wishlistId) {
        const wIdStr = String(a.wishlistId._id || a.wishlistId);
        alreadyAssignedMap[wIdStr] = (alreadyAssignedMap[wIdStr] || 0) + (a.assignedQuantity || 0);
      }
    }
  }

  // Assignments to persist on the Production record: which wishlists this
  // production is allocated to, plus the assigned & required quantities (FIFO order).
  const assignments = [];

  for (const wishlist of wishlists) {
    if (remainingProdQty <= 0) break;

    // Total quantity requested for this wishlist for the given productId + categoryId
    const totalWishlistQty = wishlist.WishList
      .filter(i =>
        String(i.productId?._id || i.productId) === String(productId) &&
        String(i.categoryId?._id || i.categoryId) === String(categoryId)
      )
      .reduce((sum, i) => sum + i.quantity, 0);

    if (totalWishlistQty === 0) continue;

    // Determine how much is still needed for this wishlist after subtracting previous allocations
    const alreadyAssigned = alreadyAssignedMap[String(wishlist._id)] || 0;
    const effectiveReqQty = Math.max(0, totalWishlistQty - alreadyAssigned);

    if (effectiveReqQty === 0) continue;

    // Allocation Logic:
    // 1. Full Allocation: Production has enough quantity to cover 100% of effectiveReqQty
    if (remainingProdQty >= effectiveReqQty) {
      const assignedQty = effectiveReqQty;
      remainingProdQty -= assignedQty;

      assignments.push({
        wishlistId: wishlist._id,
        assignedQuantity: assignedQty,
        requiredQuantity: totalWishlistQty,
      });
    } else {
      // 2. Partial Allocation: Remaining production quantity is less than effectiveReqQty.
      // Check if remaining production quantity is >= 50% of effectiveReqQty.
      const minRequiredThreshold = 0.5 * effectiveReqQty;

      if (remainingProdQty >= minRequiredThreshold) {
        const assignedQty = remainingProdQty;
        remainingProdQty = 0;

        assignments.push({
          wishlistId: wishlist._id,
          assignedQuantity: assignedQty,
          requiredQuantity: totalWishlistQty,
        });

        break; // Remaining production quantity is exhausted
      } else {
        // Remaining production quantity is < 50% of effectiveReqQty -> Skip this wishlist!
        console.log(`⚠️ Skipping wishlist ${wishlist._id}: remaining quantity (${remainingProdQty}) is < 50% of required quantity (${effectiveReqQty})`);
      }
    }
  }

  return assignments;
};

// Build the human-readable article/order details for a wishlist that just
// became ready for approval, resolving article + category from productId +
// categoryId (the wishlist items store ids only).
const buildWishlistArticleDetails = async (wishlist) => {
  const items = wishlist.WishList || [];
  const productIds = [
    ...new Set(items.map((it) => String(it.productId?._id || it.productId)).filter(Boolean)),
  ];
  const products = await Product.find({ _id: { $in: productIds } }).select("article category");
  const pmap = {};
  products.forEach((p) => { pmap[String(p._id)] = p; });

  return items.map((it) => {
    const prod = pmap[String(it.productId?._id || it.productId)];
    const cat = prod?.category?.find(
      (c) => String(c._id) === String(it.categoryId?._id || it.categoryId)
    );
    return {
      article: prod?.article || null,
      categoryCode: cat?.categoryCode || null,
      color: cat?.color || null,
      size: cat?.size || null,
      type: cat?.type ? (Array.isArray(cat.type) ? cat.type[0] : cat.type) : null,
      quality: cat?.quality ? (Array.isArray(cat.quality) ? cat.quality[0] : cat.quality) : null,
      quantity: it.quantity,
      image: it.image && it.image.length ? it.image : cat?.image || [],
    };
  });
};

// A wishlist's stock timer just started at production scan-in, so its "Approve"
// button is now available. Notify the Administrator and the Sales Person who
// created the wishlist, with the order/article details. Frontend targets the
// specific salesperson using createdById (events are broadcast, then filtered
// client-side by role + id).
const notifyWishlistReadyForApproval = async (wishlist) => {
  try {
    const articles = await buildWishlistArticleDetails(wishlist);
    const customerName = wishlist.customer?.name || "customer";
    const articleNames = [...new Set(articles.map((a) => a.article).filter(Boolean))].join(", ");

    sendNotification("WishlistReadyForApproval", {
      message: `Wishlist for ${customerName}${articleNames ? ` (${articleNames})` : ""} is ready for approval after production scan-in.`,
      createdById: wishlist.createdBy?._id ? String(wishlist.createdBy._id) : null,
      createdByName: wishlist.createdBy?.name || null,
      data: {
        wishlistId: String(wishlist._id),
        customer: customerName,
        createdBy: wishlist.createdBy?.name || null,
        articles,
      },
    });
    console.log(`🔔 WishlistReadyForApproval notified → ${wishlist._id}`);
  } catch (err) {
    // Never let a notification failure break the scan-in flow.
    console.error("notifyWishlistReadyForApproval error:", err.message);
  }
};

// Activate the wishlist timer(s) for a production once stock is scanned in.
// Walks the stored assignments FIFO and starts wishlistStockTime for each
// wishlist that the scanned-in quantity can fully cover. Already-started timers
// are left untouched but still consume their reserved quantity.
const activateWishlistTimersFromScan = async (production) => {
  const assignments = production.assignwishlistprod || [];
  if (!assignments.length) return;

  let covered = production.stockinQuantity || 0;

  for (const a of assignments) {
    const need = a.assignedQuantity || a.requiredQuantity || 0;
    if (need <= 0) continue;

    // Check if the wishlist exists and is still active (not archived/rejected)
    const existingWishlist = await Wishlist.findById(a.wishlistId);
    if (!existingWishlist || !existingWishlist.isActive) {
      // Wishlist was archived/rejected/deleted, skip reserving stock for it
      console.log(`⚠️ Skipping wishlist ${a.wishlistId} during scan-in: wishlist was archived or rejected`);
      continue;
    }

    if (existingWishlist.wishlistStockTime !== null) {
      // Already activated in a previous scan — subtract its reserved quantity
      covered -= need;
      continue;
    }

    // Timer not started yet: check if scanned stock covers the assigned quantity
    if (covered < need) break; // FIFO: stop at the first wishlist we can't cover

    covered -= need;
    // findOneAndUpdate with the wishlistStockTime:null filter guarantees we only
    // transition (and therefore only notify) a wishlist whose Approve button was
    // not already available. Returns null if it was already started / not found.
    const activated = await Wishlist.findOneAndUpdate(
      { _id: a.wishlistId, wishlistStockTime: null },
      { $set: { wishlistStockTime: new Date() } },
      { new: true }
    )
      .populate("createdBy", "name email")
      .populate("customer", "name");

    if (activated) {
      console.log(`⏱️ wishlistStockTime activated on scan → ${a.wishlistId}`);
      await notifyWishlistReadyForApproval(activated);
    }
  }
};

// Create PRoduction
exports.createProduct = async (data) => {
  try {
    //Step 1: Validate input
    
    if (!data || !data.article) throw new Error("Article is required.");
    if (
      !data.categoryCode || !data.color || !data.size ||
      !data.type || !data.quality
    ) {
      throw new Error(
        "Category details are incomplete. Provide categoryCode, color, size, type[], and quality[]."
      );
    }

    //Step 2: Extract type and quality safely (pick first element if array)
    const selectedType = Array.isArray(data.type) ? data.type[0] : data.type;       // "Soft"
    const selectedQuality = Array.isArray(data.quality) ? data.quality[0] : data.quality; // "A"

    //Step 3: Check if article exists first
    const productByArticle = await Product.findOne({ article: data.article });
    if (!productByArticle) {
      throw new Error(`Article '${data.article}' not found in product catalog.`);
    }

    //  Step 4: Check category fields.
    //  categoryCode MUST be part of the match: a single color+size+type+quality
    //  combo can exist under different categoryCodes, and the wishlist/cart/order
    //  all resolve the sub-document using categoryCode too. Omitting it here made
    //  production pick the first color/size/type/quality match, landing on a
    //  different categoryId than the order -> the generated QRs then could not be
    //  dispatched against that order.
    const matchedCategory = productByArticle.category.find(cat => {
      const codeMatch = String(cat.categoryCode) === String(data.categoryCode);
      const colorMatch = cat.color === data.color;
      const sizeMatch = cat.size === data.size;
      const typeMatch = Array.isArray(cat.type) ? cat.type.includes(selectedType) : cat.type === selectedType;
      const qualityMatch = Array.isArray(cat.quality) ? cat.quality.includes(selectedQuality) : cat.quality === selectedQuality;
      return codeMatch && colorMatch && sizeMatch && typeMatch && qualityMatch;
    });

    // Step 5: If no exact category match, build hierarchical error
    if (!matchedCategory) {
      const errors = [];

      const categoryExists = productByArticle.category.some(cat => cat.categoryCode === data.categoryCode);
      if (!categoryExists) errors.push(`categoryCode '${data.categoryCode}' does not match any category.`);

      const colorExists = productByArticle.category.some(cat => cat.color === data.color);
      if (!colorExists) errors.push(`color '${data.color}' does not match any category.`);

      const sizeExists = productByArticle.category.some(cat => cat.size === data.size);
      if (!sizeExists) errors.push(`size '${data.size}' does not match any category.`);

      const typeExists = productByArticle.category.some(cat =>
        Array.isArray(cat.type) ? cat.type.includes(selectedType) : cat.type === selectedType
      );
      if (!typeExists) errors.push(`type '${selectedType}' does not match any category.`);

      const qualityExists = productByArticle.category.some(cat =>
        Array.isArray(cat.quality) ? cat.quality.includes(selectedQuality) : cat.quality === selectedQuality
      );
      if (!qualityExists) errors.push(`quality '${selectedQuality}' does not match any category.`);

      // Dynamic check: if color exists but not with the given size
      if (colorExists) {
        const colorHasSize = productByArticle.category.some(
          cat => cat.color === data.color && cat.size === data.size
        );
        if (!colorHasSize) {
          errors.push(`For color '${data.color}', size '${data.size}' is not available.`);
        }
      }

      // ✅ Always return here when matchedCategory is undefined — 
      // either with specific field errors or a generic combination error
      const errorMessage = errors.length > 0
        ? `Please Check Product Detail: ${errors.join(" And ")}`
        : `No category found matching the combination: size='${data.size}', color='${data.color}', type='${selectedType}', quality='${selectedQuality}'. Please verify your selection.`;

      return {
        success: false,
        message: errorMessage
      };
    }

    // Step 6: Ensure production number is unique
    const orderExists = await Production.findOne({ productionNo: data.productionNo });
    if (orderExists) {
      throw new Error("Production number already exists. Please use a unique number.");
    }

    // 🧩 Step 7: Generate next production number
    const getNextProductionNumber = async () => {
      const last = await Production.aggregate([
        { $match: { productionNo: { $regex: /^PN_\d+$/ } } },
        {
          $addFields: {
            numericNo: {
              $toInt: {
                $replaceOne: { input: "$productionNo", find: "PN_", replacement: "" }
              }
            }
          }
        },
        { $sort: { numericNo: -1 } },
        { $limit: 1 }
      ]);

      return last.length ? `PN_${last[0].numericNo + 1}` : "PN_1";
    };

    const productionNo = await getNextProductionNumber();
    if (!productionNo) throw new Error("Failed to generate a valid production number.");

    // ✅ Safe image access — matchedCategory is guaranteed to be defined here
    const selectedImage = matchedCategory && Array.isArray(matchedCategory.image) && matchedCategory.image.length > 0
      ? matchedCategory.image[0]
      : null;

    // 🏭 Step 8: Create Production record
    const productionData = {
      factory: data.factory,
      productId: productByArticle._id,
      categoryId: matchedCategory._id,
      productionNo,
      productionDate: data.productionDate,
      productionQuantity: data.productionQuantity,
    };

    const production = await Production.create(productionData);

// Step 9: Match wishlists that need this production and store them on the
    // record (matched by stored ObjectIds). The timer is NOT started here; it is
    // activated later during the production stock-in scan.
    const assignwishlistprod = await applyProductionToWishlists({
      productId: productByArticle._id,
      categoryId: matchedCategory._id,
      productionQuantity: data.productionQuantity,
    });

    if (assignwishlistprod?.length) {
      production.assignwishlistprod = assignwishlistprod;
      await production.save();
    }

    


    // 🔔 Optional: Send notification
    sendNotification("productionSuccess", {
      message: `Production for article ${data.article} created successfully.`,
      data: productionData
    });

    // ✅ Step 9: Return success response
    return {
      success: true,
      message: "Production created successfully.",
      production
    };

  } catch (error) {
    console.error("❌ createProduct Service Error:", error.message);
    return { success: false, message: error.message };
  }
};

exports.getProducts = async (page = 1, limit = 10, search = "") => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  if (search && search.trim() !== "") {
    // Use aggregate to support searching across productionNo and article (from joined Product)
    const regex = new RegExp(search.trim(), "i");

    const pipeline = [
      { $match: { isActive: true } },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      { $unwind: { path: "$productDetails", preserveNullAndEmpty: true } },
      {
        $match: {
          $or: [
            { productionNo: { $regex: regex } },
            { "productDetails.article": { $regex: regex } },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    const [countResult, products] = await Promise.all([
      Production.aggregate([...pipeline, { $count: "total" }]),
      Production.aggregate([...pipeline, { $skip: skip }, { $limit: limitNum }]),
    ]);

    const totalItems = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalItems / limitNum);

    // Fetch fully populated versions of matched IDs for consistent response shape
    const ids = products.map((p) => p._id);
    const populated = await Production.find({ _id: { $in: ids } })
      .populate("factory", "name")
      .populate("productId", "article category")
      .sort({ createdAt: -1 })
      .lean();

    return {
      success: true,
      products: populated.map(attachCategoryDetail),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems,
      },
    };
  }

  // No search: simple paginated find
  const [products, totalItems] = await Promise.all([
    Production.find({ isActive: true })
      .populate("factory", "name")
      .populate("productId", "article category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Production.countDocuments({ isActive: true }),
  ]);

  const totalPages = Math.ceil(totalItems / limitNum);

  return {
    success: true,
    products: products.map(attachCategoryDetail),
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalItems,
    },
  };
};


//Get production data wit out Qr data
exports.getproductionDatawithoutQR = async (page = 1, limit = 10, search = "") => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  // Get all productionNos that already have QR (covers both PN_* and RPN_*)
  const qrProductions = await QRCODE.find().distinct("productionNo");

  const query = {
    productionNo: { $nin: qrProductions || [] },
    isActive: true,
  };

  if (search) {
    query.$or = [
      { productionNo: { $regex: search, $options: "i" } },
      { article: { $regex: search, $options: "i" } },
      { color: { $regex: search, $options: "i" } },
      { size: { $regex: search, $options: "i" } },
      { type: { $regex: search, $options: "i" } },
      { quality: { $regex: search, $options: "i" } },
    ];
  }

  // Run queries in parallel
  const [productions, totalItems] = await Promise.all([
    Production.find(query)
      .populate("factory", "name")
      .populate("productId", "article category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Production.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalItems / limitNum);

  return {
    success: true,
    products: productions.map(attachCategoryDetail),
    pagination: {
      currentPage: pageNum,
      limit: limitNum,
      totalPages,
      totalItems,
    },
  };
};

exports.getProductsById = async (id) => {
  const production = await Production.findById(id)
    .populate("factory", "name")
    .populate("productId", "article category")
    .populate({
      // Resolve the wishlists this production is allocated to, and for each one
      // the sales person who created it and the customer it belongs to.
      path: "assignwishlistprod.wishlistId",
      select: "customer createdBy",
      populate: [
        { path: "customer", select: "name phone" },
        { path: "createdBy", select: "name role" },
      ],
    })
    .lean();
  const shaped = attachCategoryDetail(production);
  if (shaped) {
    // article is available via productId, category via categoryId
    delete shaped.article;
    delete shaped.category;

    // Flatten the wishlist allocations into a UI-friendly shape: is this PN
    // assigned to any wishlist, and if so for which sales person / customer.
    const assignments = Array.isArray(shaped.assignwishlistprod)
      ? shaped.assignwishlistprod
      : [];
    shaped.wishlistAssignments = assignments.map((a) => {
      const wl = a.wishlistId && typeof a.wishlistId === "object" ? a.wishlistId : null;
      return {
        wishlistId: wl ? wl._id : a.wishlistId,
        salesPerson: wl && wl.createdBy ? wl.createdBy.name : null,
        salesPersonRole: wl && wl.createdBy ? wl.createdBy.role : null,
        customer: wl && wl.customer ? wl.customer.name : null,
        customerPhone: wl && wl.customer ? wl.customer.phone : null,
        assignedQuantity: a.assignedQuantity ?? null,
        requiredQuantity: a.requiredQuantity ?? null,
      };
    });
    shaped.isAssignedToWishlist = shaped.wishlistAssignments.length > 0;
  }
  return shaped;
};

exports.getAggregatedStockByFactory = async (factory, page = 1, limit = 10, search = "") => {
  try {
    page = Number(page);
    limit = Number(limit);

    // Convert factoryId to ObjectId if valid
    let factoryMatch = factory;
    if (mongoose.Types.ObjectId.isValid(factory)) {
      factoryMatch = new mongoose.Types.ObjectId(factory);
    }

    // Search filter
    let searchFilter = {};
    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      searchFilter = {
        $or: [
          { article: regex },
          { "category.color": regex },
          { "category.size": regex },
          { "category.quality": regex },
          { "category.type": regex }
        ]
      };
    }

    const pipeline = [
      { $match: { factory: factoryMatch } },
      ...(search ? [{ $match: searchFilter }] : []),

      // Lookup factory details
      {
        $lookup: {
          from: "factories",
          localField: "factory",
          foreignField: "_id",
          as: "factoryDetails"
        }
      },
      { $unwind: "$factoryDetails" },

      // Group by article + category (factory info outside)
      {
        $group: {
          _id: {
            article: "$article",
            color: "$category.color",
            size: "$category.size",
            quality: "$category.quality",
            type: "$category.type"
          },
          totalQuantity: { $sum: "$productionQuantity" },
          dispatchStock: { $sum: { $ifNull: ["$dispatchedQuantity", 0] } },
          factoryId: { $first: "$factory" },
          factoryName: { $first: "$factoryDetails.name" },
          factoryLocation: { $first: "$factoryDetails.location" } // nested object
        }
      },

      // Sort & paginate inside $facet
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { "_id.article": 1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ]
        }
      }
    ];

    const result = await Production.aggregate(pipeline);
    const factoryDetails = await Factory.findById(factoryMatch).select("name location");

    // Handle no aggregation result
    if (!result.length || result[0].data.length === 0) {
      return {
        factory: factoryDetails
          ? {
              factoryId: factoryDetails._id,
              factoryName: factoryDetails.name,
              factoryLocation: factoryDetails.location
            }
          : null,
        aggregatedStock: [],
        pagination: { currentPage: page, totalPages: 0, totalCount: 0 }
      };
    }
    // if (result.length === 0)
    //   return {
    //     factory: null,
    //     aggregatedStock: [],
    //     pagination: { currentPage: page, totalPages: 0, totalCount: 0 }
    //   };

    const aggregatedStock = result[0].data.map(item => ({
      article: item._id.article,
      color: item._id.color,
      size: item._id.size,
      quality: item._id.quality,
      type: item._id.type,
      totalQuantity: item.totalQuantity,
      dispatchStock: item.dispatchStock,
      AvailableQuantity: item.totalQuantity - item.dispatchStock
    }));

    const totalCount = result[0].metadata[0] ? result[0].metadata[0].total : 0;
    const totalPages = Math.ceil(totalCount / limit);

    const factoryDetail = {
      factoryId: result[0].data[0].factoryId,
      factoryName: result[0].data[0].factoryName,
      factoryLocation: result[0].data[0].factoryLocation
    };

    return {
      factory: factoryDetail,
      aggregatedStock,
      pagination: { currentPage: page, totalPages, totalCount }
    };
  } catch (err) {
    console.error("Error in getAggregatedStockByFactory:", err);
    throw { message: "Internal server error", error: err.message };
  }
};

exports.updateProduct = async (id, updateData) => {
  return await Production.findByIdAndUpdate(id, updateData, {
    new: true,
  });
};

exports.deleteProduct = async (id) => {
  const deleted = await Production.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );
  if (!deleted) {
    throw new Error("Production not found");
  }

  return deleted;
};

//Proudtion Exit sacn 
exports.scanProduct = async (qrImage) => {
  try {
    let QrCode;
    console.log("scanProduct service called with:", { qrImage });
    if (qrImage) {
      try {
        const Qrid = await qrCodeModel.findOne(
          { 'qrCodes.qrId': qrImage },        // Match inside array
          { 'qrCodes.$': 1, factory_name: 1 } // Only return the matching qrCodes object
        );
        // console.log("Qrid",Qrid.qrCodes[0].qrData);
        let qrString = Qrid.qrCodes[0].qrData;
        qrData = await decodeBase64Qratproduction(qrString);
      } catch (decodeErr) {
        throw new Error("Failed to decode QR image: " + decodeErr.message);
      }
    }

    // if (!qrData) throw new Error("QR data is required");

    let parsedQr;
    try {
      parsedQr = typeof qrData === "string" ? JSON.parse(qrData) : qrData;
    } catch (parseErr) {
      throw new Error("QR data is not valid JSON: " + parseErr.message);
    }

    const { productionNo, qrId, quantity } = parsedQr;

    if (!productionNo || !qrId) {
      return {
        error: "QR data must include both 'productionNo' and 'qrId'",
      };
    }

    const qrDoc = await qrCodeModel.findOne({ productionNo });
    if (!qrDoc)
      throw new Error(
        "QR document not found for productionNo: " + productionNo
      );

    const qrIndex = qrDoc.qrCodes.findIndex((qr) => qr.qrId === qrId);
    if (qrIndex === -1) throw new Error("QR with the given qrId not found");

    if (qrDoc.qrCodes[qrIndex].factoryScan === true) {
      throw new Error("QR stock is already scanned at factory");
    }

    const updateField = {};
    updateField[`qrCodes.${qrIndex}.factoryScan`] = true;
    await qrCodeModel.updateOne({ productionNo }, { $set: updateField });

    const production = await Production.findOne({ productionNo });
    if (!production) throw new Error("Production not found for this QR");

    const dispatchedQty = quantity || 1;
    production.dispatchedQuantity =
      (production.dispatchedQuantity || 0) + dispatchedQty;

    production.status =
      production.dispatchedQuantity >= production.productionQuantity
        ? "Dispatch from Factory"
        : "Partially Dispatched";

    await production.save();

    return {
      message: "QR scanned successfully",
      scannedQr: {
        productionNo,
        qrId,
        dispatchedQty,
        currentStatus: production.status,
      },
    };
  } catch (err) {
    console.error("scanProduct error:", err.message);
    return {
      error: err.message,
    };
  }
};

//Product Entry scan at factory
exports.scanProducttoinstock = async (qrImage) => {
  try {
    let QrCode;
    console.log("scanProduct service called with:", { qrImage });
    if (qrImage) {
      try {
        const Qrid = await qrCodeModel.findOne(
          { 'qrCodes.qrId': qrImage },        // Match inside array
          { 'qrCodes.$': 1, factory_name: 1 } // Only return the matching qrCodes object
        );
        // console.log("Qrid",Qrid.qrCodes[0].qrData);
        let qrString = Qrid.qrCodes[0].qrData;
        qrData = await decodeBase64Qratproduction(qrString);
      } catch (decodeErr) {
        throw new Error("Failed to decode QR image: " + decodeErr.message);
      }
    }

    // if (!qrData) throw new Error("QR data is required");

    let parsedQr;
    try {
      parsedQr = typeof qrData === "string" ? JSON.parse(qrData) : qrData;
    } catch (parseErr) {
      throw new Error("QR data is not valid JSON: " + parseErr.message);
    }

    const { productionNo, qrId, quantity } = parsedQr;

    if (!productionNo || !qrId) {
      return {
        error: "QR data must include both 'productionNo' and 'qrId'",
      };
    }

    const qrDoc = await qrCodeModel.findOne({ productionNo });
    if (!qrDoc)
      throw new Error(
        "QR document not found for productionNo: " + productionNo
      );

    const qrIndex = qrDoc.qrCodes.findIndex((qr) => qr.qrId === qrId);
    if (qrIndex === -1) throw new Error("QR with the given qrId not found");

    if (qrDoc.qrCodes[qrIndex].factoryinScan === true) {
      throw new Error("QR already scanned at factory");
    }

    const updateField = {};
    updateField[`qrCodes.${qrIndex}.factoryinScan`] = true;
    await qrCodeModel.updateOne({ productionNo }, { $set: updateField });

    const production = await Production.findOne({ productionNo });
    if (!production) throw new Error("Production not found for this QR");

    const stockinQty = quantity || 1;
    production.stockinQuantity =
      (production.stockinQuantity || 0) + stockinQty;

    production.status =
      production.stockinQuantity >= production.productionQuantity
        ? "Arrived at factory"
        : "Ready";

    await production.save();

    // Now that real stock is scanned in, activate the wishlist timer(s) for the
    // wishlists this production was assigned to (FIFO, as far as stock covers).
    await activateWishlistTimersFromScan(production);

    return {
      message: "QR scanned successfully Stock QTy added",
      scannedQr: {
        productionNo,
        qrId,
        stockinQty,
        currentStatus: production.status,
      },
    };
  } catch (err) {
    console.error("scanProduct error:", err.message);
    return {
      error: err.message,
    };
  }
};

