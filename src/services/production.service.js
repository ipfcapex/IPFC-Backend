const { Production, Factory, Wishlist } = require("../models");
const { Product } = require("../models");
const QRCODE = require("../models/qrCode.model");
const SalesOrder = require("../models/salesOrder.model");
const { Notification } = require("../models");
const { decodeBase64Qratproduction } = require("../utils/DecodeQR");
const mongoose = require("mongoose");
const qrCodeModel = require("../models/qrCode.model");
const { sendNotification } = require("./notificationService");

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

const applyProductionToWishlists = async (productionData, currentAvailableQty = 0) => {
  const { article, categoryCode, color, size, type, quality, productionQuantity } = productionData;

  // Total stock available including production
  let totalAvailableQty = currentAvailableQty + productionQuantity;

  // Find all relevant wishlists, sorted FIFO
  const wishlists = await Wishlist.find({
    "WishList.article": article,
    "WishList.categoryCode": categoryCode,
    "WishList.color": color,
    "WishList.size": size,
    "WishList.type": type,
    "WishList.quality": quality,
    isActive: true,
    wishlistStockTime: null
  }).sort({ createdAt: 1 }); // Oldest first

  if (!wishlists.length) return;

  // Group wishlists by creator
  const groupedByCreator = {};
  wishlists.forEach(w => {
    const creatorId = String(w.createdBy);
    if (!groupedByCreator[creatorId]) groupedByCreator[creatorId] = [];
    groupedByCreator[creatorId].push(w);
  });

  for (const creatorId of Object.keys(groupedByCreator)) {
    const creatorWishlists = groupedByCreator[creatorId];

    for (const wishlist of creatorWishlists) {
      // Total quantity requested for this wishlist for the given variant
      const totalWishlistQty = wishlist.WishList
        .filter(i =>
          i.article === article &&
          i.categoryCode === categoryCode &&
          i.color === color &&
          i.size === size &&
          i.type === type &&
          i.quality === quality
        )
        .reduce((sum, i) => sum + i.quantity, 0);

      if (totalWishlistQty === 0) continue;

      // ✅ Only assign wishlistStockTime if we have enough stock
      if (totalAvailableQty >= totalWishlistQty) {
        totalAvailableQty -= totalWishlistQty;

        await Wishlist.updateOne(
          { _id: wishlist._id, wishlistStockTime: null },
          { $set: { wishlistStockTime: new Date() } }
        );

        console.log(`✅ Wishlist fulfilled → ${wishlist._id} (creator: ${creatorId})`);
      } else {
        console.log(`⚠️ Not enough stock for wishlist → ${wishlist._id} (creator: ${creatorId})`);
      }

      if (totalAvailableQty <= 0) break; // stop if stock depleted
    }

    if (totalAvailableQty <= 0) break; // stop if stock depleted
  }

  if (totalAvailableQty > 0) {
    console.log(`⚠️ Remaining stock after fulfilling wishlists: ${totalAvailableQty}`);
  }
};

// Scan Funtion is missing need to implement it
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

    //  Step 4: Check category fields
    const matchedCategory = productByArticle.category.find(cat => {
      const colorMatch = cat.color === data.color;
      const sizeMatch = cat.size === data.size;
      const typeMatch = Array.isArray(cat.type) ? cat.type.includes(selectedType) : cat.type === selectedType;
      const qualityMatch = Array.isArray(cat.quality) ? cat.quality.includes(selectedQuality) : cat.quality === selectedQuality;
      return colorMatch && sizeMatch && typeMatch && qualityMatch;
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

      // Instead of throw → return structured response
      if (errors.length > 0) {
        return {
          success: false,
          message: `Please Check Product Detail: ${errors.join(" And ")}`
        };
      }
    }

    // Step 6: Ensure production number is unique
    const orderExists = await Production.findOne({ productionNo: data.productionNo });
    if (orderExists) {
      throw new Error("Production number already exists. Please use a unique number.");
    }

    // 🧩 Step 7: Generate next production number
    const getNextProductionNumber = async () => {
      const last = await Production.aggregate([
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

      const selectedImage = Array.isArray(matchedCategory.image) && matchedCategory.image.length > 0
    ? matchedCategory.image[0]   // Pick first image (or change logic)
    : null;

    // 🏭 Step 8: Create Production record
    const productionData = {
      factory: data.factory,
      productionNo,
      article: data.article,
      productionDate: data.productionDate,
      productionQuantity: data.productionQuantity,
      status: "Ready",
      category: {
        categoryCode: data.categoryCode,
        color: data.color,
        size: data.size,
        type: selectedType,
        quality: selectedQuality,
        image: selectedImage
      }
    };

    const production = await Production.create(productionData);

// Step 9: Apply production to wishlists
    await applyProductionToWishlists({
      article: data.article,
      categoryCode: data.categoryCode,
      color: data.color,
      size: data.size,
      type: selectedType,
      quality: selectedQuality,
      productionQuantity: data.productionQuantity
    });


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

  // Base query
  const query = { isActive: true };

  // Apply search at DB level
  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");
    query.$or = [
      { name: { $regex: regex } },
      { article: { $regex: regex } },
      { productionNo: { $regex: regex } }
    ];
  }


  // Fetch products with pagination
  const [products, totalItems] = await Promise.all([
    Production.find(query)
      .populate("factory", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Production.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalItems / limitNum);

  return {
    success: true,
    products,
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

  // Get all productionNos that already have QR
  const qrProductions = await QRCODE.find().distinct("productionNo");

  // Always start with base query
  const query = {
    productionNo: { $nin: qrProductions || [] },
  };

  // If search provided, merge with $or
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
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Production.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalItems / limitNum);

  return {
    success: true,
    products: productions,
    pagination: {
      currentPage: pageNum,
      limit: limitNum,
      totalPages,
      totalItems,
    },
  };
};

exports.getProductsById = async (id) => {
  return await Production.findById(id).populate("factory", "name");
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

//Qr Scan Function
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
      throw new Error("QR already scanned at factory");
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

