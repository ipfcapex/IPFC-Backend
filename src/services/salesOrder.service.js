const mongoose = require("mongoose");
const { SellOrder } = require("../models");
const { Stock } = require("../models");
const { Customer } = require("../models");
const { Production } = require("../models");
const { Product } = require("../models");
const { Cart } = require("../models")
const { Schemes } = require("../models")
const { Wishlist } = require("../models")
const QRCODE = require("../models/qrCode.model");
const qrCodeService = require("./qrCode.service");
const { sendNotification } = require("./notificationService");


// Define normalizeKey globally for reuse
function normalizeKey(obj) {
  return [
    String(obj.article ?? "").trim().toLowerCase(),
    String(obj.categoryCode ?? "").trim().toLowerCase(),
    String(obj.color ?? "").trim().toLowerCase(),
    String(obj.size ?? "").trim().toLowerCase(),
    String(obj.type ?? "").trim().toLowerCase(),
    String(obj.quality ?? "").trim().toLowerCase(),
  ].join("-");
}

// Enrich order/cart/wishlist items with article/category details resolved
// from productId + categoryId (items no longer store the hard keys). Accepts an
// array of plain objects (use .lean() or .toObject()) and mutates them in place.
async function enrichOrdersWithProductDetails(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return orders;
  const ids = new Set();
  const collect = (arr) =>
    (arr || []).forEach((it) => {
      const pid = it?.productId?._id || it?.productId;
      if (pid) ids.add(String(pid));
    });
  orders.forEach((o) => {
    collect(o.items);
    collect(o.originalItems);
    collect(o.WishList);
  });
  if (ids.size === 0) return orders;

  const products = await Product.find({ _id: { $in: [...ids] } }).select("article category");
  const pmap = {};
  products.forEach((p) => { pmap[String(p._id)] = p; });

  const enrichItem = (it) => {
    if (!it) return it;
    const pid = it.productId?._id || it.productId;
    if (!pid) return it;

    const prod = pmap[String(pid)];
    const cat = prod?.category?.find((c) => String(c._id) === String(it.categoryId?._id || it.categoryId));

    const enriched = {
      ...it,
      productId: prod ? { _id: prod._id, article: prod.article } : it.productId,
      categoryId: cat || it.categoryId,
      article: prod?.article || it.article,
      categoryCode: cat?.categoryCode || it.categoryCode,
      color: cat?.color || it.color,
      size: cat?.size || it.size,
      type: cat?.type ? (Array.isArray(cat.type) ? cat.type[0] : cat.type) : it.type,
      quality: cat?.quality ? (Array.isArray(cat.quality) ? cat.quality[0] : cat.quality) : it.quality,
      image: it.image && it.image.length ? it.image : cat?.image || [],
    };

    return enriched;
  };

  orders.forEach((o) => {
    if (o.items) o.items = o.items.map(enrichItem);
    if (o.originalItems) o.originalItems = o.originalItems.map(enrichItem);
    if (o.WishList) o.WishList = o.WishList.map(enrichItem);
  });
  return orders;
}
exports.enrichOrdersWithProductDetails = enrichOrdersWithProductDetails;

// The five stock sources (warehouse, production, unscanned sell-orders, cart,
// wishlist) unioned and merged into one row per productId+categoryId carrying
// the five raw quantities. No product lookup, no sort, no pagination. Shared by
// getAggregatedStock (paginated display) and getStockAvailabilityMap (point
// availability lookup for order/cart creation). Pass productIds to restrict the
// whole scan to only those articles.
function buildMergedStockPipeline(excludeWishlistId = null, productIds = null) {
  // Zero-filled quantity fields so every source contributes the same shape into
  // the $unionWith stream (each source overrides only the field it owns).
  const zeros = {
    stockQty: { $literal: 0 },
    productionQty: { $literal: 0 },
    orderQty: { $literal: 0 },
    cartQty: { $literal: 0 },
    wishlistQty: { $literal: 0 },
  };

  const hasIds = Array.isArray(productIds) && productIds.length > 0;
  // When productIds is supplied, restrict to them; otherwise keep the original
  // "not null" behaviour.
  const idFilter = (field) =>
    hasIds ? { [field]: { $in: productIds } } : { [field]: { $ne: null } };

  // Wishlist reservation filter. When converting a wishlist INTO an order, that
  // wishlist's own reserved qty must not count against availability.
  const wishlistMatch = {
    isActive: true,
    wishlistStockTime: { $ne: null },
    ...(excludeWishlistId
      ? { _id: { $ne: new mongoose.Types.ObjectId(excludeWishlistId) } }
      : {}),
    ...(hasIds ? { "WishList.productId": { $in: productIds } } : {}),
  };

  return [
    /* 1️⃣ WAREHOUSE STOCK (base collection) */
    { $match: { isActive: { $ne: false } } },
    { $unwind: "$stockdata" },
    { $match: idFilter("stockdata.productId") },
    {
      $group: {
        _id: { productId: "$stockdata.productId", categoryId: "$stockdata.categoryId" },
        stockQty: {
          $sum: { $cond: [{ $eq: ["$stockdata.dispatched", false] }, "$stockdata.quantity", 0] },
        },
      },
    },
    { $match: { stockQty: { $gt: 0 } } },
    { $project: { _id: 1, ...zeros, stockQty: "$stockQty" } },

    /* 2️⃣ PRODUCTION STOCK (scanned) */
    {
      $unionWith: {
        coll: Production.collection.name,
        pipeline: [
          { $match: { isActive: { $ne: false }, ...idFilter("productId") } },
          {
            $group: {
              _id: { productId: "$productId", categoryId: "$categoryId" },
              totalProduction: { $sum: { $ifNull: ["$stockinQuantity", 0] } },
              totalDispatched: { $sum: { $ifNull: ["$dispatchedQuantity", 0] } },
            },
          },
          { $project: { _id: 1, productionQty: { $subtract: ["$totalProduction", "$totalDispatched"] } } },
          { $match: { productionQty: { $gt: 0 } } },
          { $project: { _id: 1, ...zeros, productionQty: "$productionQty" } },
        ],
      },
    },

    /* 3️⃣ SELLORDER (unscanned only) */
    {
      $unionWith: {
        coll: SellOrder.collection.name,
        pipeline: [
          {
            $match: {
              isActive: true,
              deliveryStatus: { $nin: ["DELIVERED", "PARTIALLY_DELIVERED", "COMPLETED"] },
              accountSectionApproval: { $in: ["PENDING", "APPROVED"] },
              inventoryManagerApproval: { $in: ["PENDING", "APPROVED"] },
            },
          },
          { $unwind: "$items" },
          ...(hasIds ? [{ $match: { "items.productId": { $in: productIds } } }] : []),
          {
            $addFields: {
              itemQuantity: {
                $cond: [
                  { $gt: [{ $size: { $ifNull: ["$items.warehouses", []] } }, 0] },
                  {
                    $sum: {
                      $map: {
                        input: "$items.warehouses",
                        as: "w",
                        in: { $cond: [{ $eq: ["$$w.ScanByorder", "UNSCANNED"] }, "$$w.quantity", 0] },
                      },
                    },
                  },
                  "$items.quantity",
                ],
              },
            },
          },
          {
            $group: {
              _id: { productId: "$items.productId", categoryId: "$items.categoryId" },
              orderQty: { $sum: "$itemQuantity" },
            },
          },
          { $project: { _id: 1, ...zeros, orderQty: "$orderQty" } },
        ],
      },
    },

    /* 4️⃣ CART RESERVED QTY */
    {
      $unionWith: {
        coll: Cart.collection.name,
        pipeline: [
          { $match: { isActive: true } },
          { $unwind: { path: "$items" } },
          { $match: idFilter("items.productId") },
          {
            $group: {
              _id: { productId: "$items.productId", categoryId: "$items.categoryId" },
              cartQty: { $sum: { $ifNull: ["$items.quantity", 0] } },
            },
          },
          { $project: { _id: 1, ...zeros, cartQty: "$cartQty" } },
        ],
      },
    },

    /* 5️⃣ WISHLIST RESERVED QTY */
    {
      $unionWith: {
        coll: Wishlist.collection.name,
        pipeline: [
          { $match: wishlistMatch },
          { $unwind: "$WishList" },
          { $match: idFilter("WishList.productId") },
          {
            $group: {
              _id: { productId: "$WishList.productId", categoryId: "$WishList.categoryId" },
              wishlistQty: { $sum: { $ifNull: ["$WishList.quantity", 0] } },
            },
          },
          { $project: { _id: 1, ...zeros, wishlistQty: "$wishlistQty" } },
        ],
      },
    },

    /* MERGE all five sources by product + category */
    {
      $group: {
        _id: "$_id",
        stockQty: { $sum: "$stockQty" },
        productionQty: { $sum: "$productionQty" },
        orderQty: { $sum: "$orderQty" },
        cartQty: { $sum: "$cartQty" },
        wishlistQty: { $sum: "$wishlistQty" },
      },
    },
  ];
}

// Availability (Total_Available) for the given productIds only, returned as a
// fast map keyed by `${productId}_${categoryId}`. Used by order/cart creation to
// check specific articles' stock without paginating the whole catalog, so no
// article is ever hidden on a later "page".
exports.getStockAvailabilityMap = async (productIds = null, excludeWishlistId = null) => {
  const pipeline = [
    ...buildMergedStockPipeline(excludeWishlistId, productIds),
    {
      $project: {
        _id: 1,
        Total_Available: {
          $max: [
            {
              $subtract: [
                { $add: ["$stockQty", "$productionQty"] },
                { $add: ["$orderQty", "$cartQty", "$wishlistQty"] },
              ],
            },
            0,
          ],
        },
      },
    },
  ];

  const rows = await Stock.aggregate(pipeline).allowDiskUse(true);
  const map = {};
  for (const r of rows) {
    map[`${r._id.productId}_${r._id.categoryId}`] = r.Total_Available || 0;
  }
  return map;
};

exports.getAggregatedStock = async (page = 1, limit = 10, search = "", excludeWishlistId = null, groupByArticle = false) => {
  const skip = (page - 1) * limit;
  const isGroup = groupByArticle === "true" || groupByArticle === true;
  const searchTerm = search ? String(search).trim() : "";

  // Case-insensitive regex test against a (possibly non-string) field, run
  // inside $expr so search executes in the engine instead of Node memory.
  const regexOn = (field) => ({
    $regexMatch: {
      input: { $toString: { $ifNull: [field, ""] } },
      regex: searchTerm,
      options: "i",
    },
  });

  // Attach product/category display fields and compute per-category availability.
  const displayStage = [
    {
      $lookup: {
        from: Product.collection.name,
        localField: "_id.productId",
        foreignField: "_id",
        as: "product",
      },
    },
    { $addFields: { product: { $first: "$product" } } },
    {
      $addFields: {
        category: {
          $first: {
            $filter: {
              input: { $ifNull: ["$product.category", []] },
              as: "c",
              cond: { $eq: ["$$c._id", "$_id.categoryId"] },
            },
          },
        },
      },
    },
    {
      $addFields: {
        productId: "$_id.productId",
        categoryId: "$_id.categoryId",
        article: "$product.article",
        categoryCode: "$category.categoryCode",
        color: "$category.color",
        size: "$category.size",
        type: {
          $cond: [{ $isArray: "$category.type" }, { $first: "$category.type" }, "$category.type"],
        },
        quality: {
          $cond: [{ $isArray: "$category.quality" }, { $first: "$category.quality" }, "$category.quality"],
        },
        articleCode: { $ifNull: ["$category.articleCode", ""] },
        image: { $ifNull: ["$category.image", []] },
        Total_Available: {
          $max: [
            {
              $subtract: [
                { $add: ["$stockQty", "$productionQty"] },
                { $add: ["$orderQty", "$cartQty", "$wishlistQty"] },
              ],
            },
            0,
          ],
        },
      },
    },
  ];

  // Group-by-article / search / final projection stages differ by mode.
  let tail;
  if (isGroup) {
    tail = [
      {
        $group: {
          _id: "$article",
          article: { $first: "$article" },
          Warehouse_Qty: { $sum: "$stockQty" },
          Production_Qty: { $sum: "$productionQty" },
          Order_Qty: { $sum: "$orderQty" },
          Cart_Qty: { $sum: "$cartQty" },
          Wishlist_Qty: { $sum: "$wishlistQty" },
          Total_Available: { $sum: "$Total_Available" },
          image: { $first: "$image" },
        },
      },
      ...(searchTerm ? [{ $match: { $expr: regexOn("$article") } }] : []),
      {
        $project: {
          _id: 0,
          article: 1,
          Warehouse_Qty: 1,
          Production_Qty: 1,
          Order_Qty: 1,
          Cart_Qty: 1,
          Wishlist_Qty: 1,
          Total_Available: 1,
          image: 1,
        },
      },
    ];
  } else {
    tail = [
      ...(searchTerm
        ? [
            {
              $match: {
                $expr: {
                  $or: [
                    regexOn("$article"),
                    regexOn("$categoryCode"),
                    regexOn("$color"),
                    regexOn("$size"),
                    regexOn("$type"),
                    regexOn("$quality"),
                    regexOn("$articleCode"),
                  ],
                },
              },
            },
          ]
        : []),
      {
        $project: {
          _id: 0,
          productId: 1,
          categoryId: 1,
          article: 1,
          categoryCode: 1,
          color: 1,
          size: 1,
          type: 1,
          quality: 1,
          articleCode: 1,
          Warehouse_Qty: "$stockQty",
          Production_Qty: "$productionQty",
          Order_Qty: "$orderQty",
          Cart_Qty: "$cartQty",
          Wishlist_Qty: "$wishlistQty",
          Total_Available: 1,
          image: 1,
        },
      },
    ];
  }

  // One server-side pipeline: shared source union/merge, then enrich, search,
  // sort and paginate in the engine. Only one page ever crosses the wire.
  const pipeline = [
    ...buildMergedStockPipeline(excludeWishlistId),

    /* Enrich with product/category details + availability */
    ...displayStage,

    /* Group-by-article / search / project */
    ...tail,

    /* Sort + paginate in the engine; one page + total count in a single pass */
    { $sort: { Total_Available: -1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: "count" }],
      },
    },
  ];

  const [agg] = await Stock.aggregate(pipeline).allowDiskUse(true);
  const data = agg?.data || [];
  const totalItems = agg?.totalCount?.[0]?.count || 0;

  return {
    data,
    pagination: {
      currentPage: page,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

//Add to Cart
// exports.AddOrdertoCart = async ({ customer, location, items, schemesId, createdBy}) => {
//   // 1. Validate customer exists
//   const existingCustomer = await Customer.findOne({ name: customer });
//   if (!existingCustomer) {
//     throw new Error("Customer not found");
//   }

//   let scheme = null;
//   if (schemesId) {
//     scheme = await Schemes.findById(schemesId);
//     if (!scheme) throw new Error("Scheme not found");
//   }

//   // 2. Get stock aggregation
//   const { data: aggregatedStock } = await exports.getAggregatedStock();
//   console.log("aggregatedStock", aggregatedStock)
//   // 3. Build stock lookup map
//   const stockMap = {};
//   aggregatedStock.forEach(stock => {
//     const key = `${stock.article}_${stock.categoryCode}`;
//     stockMap[key] = stock.Total_Available || 0;
//   });


//   // 🔹 Get the last sales order number from BOTH Cart and SellOrder
//   const lastCartOrder = await Cart.findOne().sort({ createdAt: -1 });
//   const lastSellOrder = await SellOrder.findOne().sort({ createdAt: -1 });

//   let lastCartNo = lastCartOrder
//     ? parseInt(lastCartOrder.salesOrderNo.split("/")[1])
//     : 0;

//   let lastSellNo = lastSellOrder
//     ? parseInt(lastSellOrder.salesOrderNo.split("/")[1])
//     : 0;

//   // Pick the higher one → then increment
//   let nextNo = Math.max(lastCartNo, lastSellNo) + 1;
//   let salesOrderNo = `SO/${nextNo}`;

//   let confirmedOrderItems = [];
//   let wishlistItems = [];

//   // 4. Loop through each item → collect under SAME order no
//   for (const item of items) {
//     // Validate quantity >= 5
//     if (
//       !item.quantity ||
//       typeof item.quantity !== "number" ||
//       item.quantity < 5
//     ) {
//       throw new Error(
//         `Quantity for article ${item.article}, categoryCode ${item.categoryCode} must be at least 5`
//       );
//     }

//     const key = `${item.article}_${item.categoryCode}`;
//     const availableQty = stockMap[key] ?? 0;
//     console.log("Avalable stock", availableQty)

//     if (availableQty > 0 && item.quantity <= availableQty) {
//       confirmedOrderItems.push(item);
//     } else {
//       wishlistItems.push({
//         ...item,
//         message: `Move to Wishlist: Requested quantity (${item.quantity}) for article ${item.article}, categoryCode ${item.categoryCode} exceeds available stock (${availableQty})`
//       });
//     }
//   }

//   // 🔹 Create and save ONE cart entry for all items
//   const newOrderData = {
//     salesOrderNo,
//     customer: existingCustomer._id,
//     Location: location,
//     items: confirmedOrderItems,
//     WishList: wishlistItems,
//     createdBy: createdBy,
//     isActive: true
//   };

//   if (scheme) {
//     newOrderData.scheme = scheme._id; // only add scheme if exists
//   }

//   const newOrder = new Cart(newOrderData);
//   const savedOrder = await newOrder.save();

//   // 8. Populate scheme and customer if applicable
//   let populateQuery = Cart.findById(savedOrder._id).populate("customer");
//   if (scheme) populateQuery = populateQuery.populate("scheme").populate("createdBy");

//   const populatedOrder = await populateQuery;

//   return populatedOrder;
// };

//Cart 
exports.AddOrdertoCart = async ({ customer, location, items, schemesId, createdBy, note }) => {
  // 1️⃣ Validate customer
  const existingCustomer = await Customer.findOne({ name: customer });
  if (!existingCustomer) throw new Error("Customer not found");

  // 2️⃣ Validate optional scheme
  let scheme = null;
  if (schemesId) {
    scheme = await Schemes.findById(schemesId);
    if (!scheme) throw new Error("Scheme not found");
  }

  // Stock availability is resolved AFTER the ordered variants are known, via a
  // targeted lookup for only those productIds (see below). This replaces the old
  // paginated aggregate (limit 10), which hid any article past the first page
  // and made it wrongly look out of stock.

  // 5️⃣ Generate sales order number
  const lastCartOrder = await Cart.findOne().sort({ createdAt: -1 });
  const lastSellOrder = await SellOrder.findOne().sort({ createdAt: -1 });
  const nextNo = Math.max(
    lastCartOrder ? parseInt(lastCartOrder.salesOrderNo.split("/")[1]) : 0,
    lastSellOrder ? parseInt(lastSellOrder.salesOrderNo.split("/")[1]) : 0
  ) + 1;
  const salesOrderNo = `SO/${nextNo}`;

  // 6️⃣ Resolve every ordered variant to concrete (product, category) pairs and
  //    collect the productIds so availability can be looked up in ONE targeted
  //    query instead of a paginated catalog scan.
  const resolvedItems = [];
  const productIdMap = new Map();

  for (const item of items) {
    // STRICT variant match. article + categoryCode + color + size + type +
    // quality must ALL be present and matched. A single color+size+categoryCode
    // can have multiple sub-documents differing only by type/quality
    // (Soft/Hard/Common x A/B). If type/quality are not enforced we resolve the
    // FIRST such variant and store the wrong categoryId, which then mismatches
    // production/stock/QR and makes the order impossible to dispatch.
    if (
      !item.article || !item.categoryCode || !item.color ||
      !item.size || !item.type || !item.quality
    ) {
      throw new Error(
        `Incomplete product details for article ${item.article || "?"}: ` +
          `article, categoryCode, color, size, type and quality are all required.`
      );
    }

    // The same article (e.g. MOZDI) can exist in more than one Product document,
    // each possibly carrying a subdoc matching this combination. Resolve ALL
    // matching (product, category) pairs and later pick the one that actually
    // has stock, rather than an arbitrary findOne().
    const productRecords = await Product.find({
      article: item.article,
      category: {
        $elemMatch: {
          categoryCode: item.categoryCode,
          color: { $regex: new RegExp(`^${item.color}$`, "i") }, // case-insensitive
          size: { $regex: new RegExp(`^${item.size}$`, "i") },
          type: { $regex: new RegExp(`^${item.type}$`, "i") },
          quality: { $regex: new RegExp(`^${item.quality}$`, "i") }
        }
      }
    });

    // Collect every (product, category) pair whose full combination matches.
    const candidates = [];
    for (const product of productRecords) {
      const matchedCategory = (product.category || []).find(cat =>
        cat.categoryCode === item.categoryCode &&
        cat.color?.toLowerCase() === item.color.toLowerCase() &&
        cat.size?.toLowerCase() === item.size.toLowerCase() &&
        (cat.type || []).some(t => t?.toLowerCase() === item.type.toLowerCase()) &&
        (cat.quality || []).some(q => q?.toLowerCase() === item.quality.toLowerCase())
      );
      if (!matchedCategory) continue;

      candidates.push({
        product,
        matchedCategory,
        key: `${product._id}_${matchedCategory._id}`,
      });
      productIdMap.set(String(product._id), product._id);
    }

    // Never create an order line with an unresolved / wrong variant.
    if (candidates.length === 0) {
      throw new Error(
        `No matching product variant for article ${item.article}, ` +
          `categoryCode ${item.categoryCode}, color ${item.color}, size ${item.size}, ` +
          `type ${item.type}, quality ${item.quality}.`
      );
    }

    resolvedItems.push({ item, candidates });
  }

  // 7️⃣ Targeted availability lookup for ONLY the ordered articles. No
  //    pagination, so an article is never hidden on a later "page".
  const stockMap = await exports.getStockAvailabilityMap([...productIdMap.values()]);

  // 8️⃣ Choose the fulfilling variant per item and validate the quantity.
  const confirmedOrderItems = [];

  for (const { item, candidates } of resolvedItems) {
    const withQty = candidates.map(c => ({ ...c, availableQty: stockMap[c.key] ?? 0 }));

    // Prefer the duplicate that can fulfil the requested quantity; otherwise the
    // one with the most stock (for an accurate "available" figure in the error).
    const chosen =
      withQty.find(c => c.availableQty >= item.quantity && item.quantity > 0) ||
      withQty.slice().sort((a, b) => b.availableQty - a.availableQty)[0];

    const { matchedCategory } = chosen;
    const productRecord = chosen.product;
    const matchedCategoryId = matchedCategory._id;
    const imageUrl = matchedCategory.image?.[0] || null;
    const dbarticleocode = matchedCategory.articleCode;
    const availableQty = chosen.availableQty;

    // No Wishlist fallback: if the requested quantity cannot be fulfilled from
    // available stock, reject the whole request with a product/quantity-specific
    // error so the sales person adjusts the order.
    if (!(availableQty > 0) || item.quantity > availableQty) {
      throw new Error(
        `Insufficient stock for ${item.article} ` +
          `(${item.color}, ${item.size}, ${item.type} ${item.quality}): ` +
          `requested ${item.quantity}, available ${availableQty}.`
      );
    }

    confirmedOrderItems.push({
      ...item,
      productId: productRecord._id,
      categoryId: matchedCategoryId,
      articleCode: dbarticleocode,
      image: imageUrl ? [imageUrl] : [],
    });
  }

  // 7️⃣ Create Cart entry
  const newOrderData = {
    salesOrderNo,
    customer: existingCustomer._id,
    Location: location,
    items: confirmedOrderItems,
    createdBy,
    isActive: true,
    note: note ? [{ text: note, by: "SALES_PERSON" }] : []
  };

  if (scheme) newOrderData.scheme = scheme._id;

  const newOrder = new Cart(newOrderData);
  const savedOrder = await newOrder.save();

  // 8️⃣ Populate before returning
  let populateQuery = Cart.findById(savedOrder._id)
    .populate("customer")
    .populate("createdBy");

  if (scheme) populateQuery = populateQuery.populate("scheme");

  const populatedOrder = await populateQuery.lean();

  // Resolve article/category on items + WishList from productId/categoryId
  await enrichOrdersWithProductDetails([populatedOrder]);

  // ✅ Return only data
  return populatedOrder;
};

exports.DeleteCartitems = async (id) => {
  return await Cart.findByIdAndDelete(id);
};

//Get all cart items
exports.getOrdersatCart = async (filter = {}, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const query = {
    isActive: true,
    ...filter,
  };

  const [sellorder, totalItems] = await Promise.all([
    Cart.find(query)
      .populate("customer", "name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(), // 🔥 important for formatting
    Cart.countDocuments(query),
  ]);

  await enrichOrdersWithProductDetails(sellorder);

  // ✅ Add created date & time (hours)
  const formattedOrders = sellorder.map(order => {
    const createdAt = new Date(order.createdAt);

    return {
      ...order,
      createdDate: createdAt.toISOString().split("T")[0], // YYYY-MM-DD
      createdTime: createdAt.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }), // HH:MM AM/PM
    };
  });

  return {
    sellorder: formattedOrders,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
    },
  };
};

//Process To checkout
exports.SelectProductforCheckout = async (cartId) => {
  // 1. Find the cart document
  const cartDoc = await Cart.findById(cartId);
  if (!cartDoc) {
    throw new Error("Cart item not found");
  }
  // console.log("cartDoc",cartDoc)

  // If cart is empty, stop
  if ((!cartDoc.items || cartDoc.items.length === 0) && (!cartDoc.WishList || cartDoc.WishList.length === 0)) {
    throw new Error("No items available in this cart to checkout");
  }

  // 2. Create SellOrder using the SAME salesOrderNo from Cart
  const newOrder = await SellOrder.create({
    salesOrderNo: cartDoc.salesOrderNo, 
    customer: cartDoc.customer,
    Location: cartDoc.Location,
    items: cartDoc.items,
    WishList: cartDoc.WishList,
    scheme: cartDoc.scheme,
    createdBy: cartDoc.createdBy,
    note: cartDoc.note,
    isActive: true,
  });
  // console.log("newOrder",newOrder)
   await newOrder.populate("createdBy", "name");
  // 3. Remove cart after checkout
  await Cart.findByIdAndDelete(cartId);

  const notifications = []
  //send Notification
  const Notification = {
      message: `Order ${newOrder.salesOrderNo} placed by ${newOrder.createdBy.name}. Please review.`,
      data: newOrder,
    };
   
    sendNotification("SalesPersonGenearated", Notification);
    notifications.push(Notification);
    
  return {
    success: true,
    message: "Checkout completed successfully",
    order: newOrder,
    notifications
  };
};

//Get all Orders
exports.getOrders = async (filter = {}, page = 1, limit = 10, search = "") => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  // Pull the date range out of the raw query params so they are not spread
  // into the Mongo query as bogus fields.
  const { startDate, endDate, ...restFilter } = filter;

  // Base query
  const query = { isActive: true, ...restFilter };

  // Optional inclusive date range on order creation date (YYYY-MM-DD).
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
  }

  // ✅ Add search directly into Mongo query
  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");

    query.$or = [
      { salesOrderNo: { $regex: regex } },
      { "customer.name": { $regex: regex } },
    ];
  }

  // Fetch orders with pagination
  const [sellorder, totalItems] = await Promise.all([
    SellOrder.find(query)
      .populate("customer scheme createdBy", "email phone role name schemesName schemesDescription schemesType")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum),
    SellOrder.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalItems / limitNum);

  // Attach scan/dispatch progress per order (same calc as the warehouse view):
  // orderTotalQty falls back to the sum of warehouse allocations when
  // item.quantity is missing/zero, and scanPercent is dispatched / total.
  const enrichedOrders = sellorder.map((doc) => {
    const order = doc.toObject();
    const orderTotalQty = (order.items || []).reduce((sum, it) => {
      const itemQty = Number(it.quantity) || 0;
      const allocatedQty = (it.warehouses || []).reduce(
        (s, w) => s + (Number(w.quantity) || 0),
        0
      );
      return sum + Math.max(itemQty, allocatedQty);
    }, 0);
    const scannedQty = Number(order.numOfDispatchedQty) || 0;
    const scanPercent =
      orderTotalQty > 0
        ? Math.min(100, Math.round((scannedQty / orderTotalQty) * 100))
        : 0;

    return { ...order, orderTotalQty, numOfDispatchedQty: scannedQty, scanPercent };
  });

  await enrichOrdersWithProductDetails(enrichedOrders);

  return {
    sellorder: enrichedOrders,
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalItems,
    },
  };
};

//Get Approved Orders
exports.getApprovedOrders = async (filter = {}, page, limit) => {
  console.log("getApprovedOrders workedd...")
  const skip = (page - 1) * limit;
  //Check first which api is wording...
  let inventoryManagerApproval = "APPROVED"
  let accountSectionApproval = "APPROVED"

  const query = { isActive: true, inventoryManagerApproval, accountSectionApproval, ...filter }; // only active orders
  console.log("query",query);
  
  const [sellorder, totalItems] = await Promise.all([
    SellOrder.find(query).populate("customer", "name").skip(skip).limit(limit).lean(),
    SellOrder.countDocuments(query),
  ]);
  await enrichOrdersWithProductDetails(sellorder);
  const totalPages = Math.ceil(totalItems / limit);
  return {
    sellorder,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
    },
  };
};

//get customer order by id
exports.getCustomerWithOrders = async (customerId, page = 1, limit = 10, search = "") => {
  if (!customerId) throw new Error("Customer ID is required");

  // ✅ Validate ObjectId
  if (!customerId.match(/^[0-9a-fA-F]{24}$/)) throw new Error("Invalid Customer ID");

  // ✅ Fetch customer
  const customer = await Customer.findById(customerId)
    .select("name phone email location salesPersonId")
    .populate("salesPersonId", "name email phone")
    .lean();
  if (!customer) throw new Error("Customer not found");

  // ✅ Pagination values
  page = Number(page) || 1;
  limit = Number(limit) || 10;
  const skip = (page - 1) * limit;

  // ✅ Build search filter
  const searchFilter = {};
  if (search.trim()) {
    searchFilter.$or = [
      { status: { $regex: search, $options: "i" } },
      { deliveryStatus: { $regex: search, $options: "i" } }
    ];
  }

  // ✅ Fetch orders with pagination + search
  const [orders, totalOrders] = await Promise.all([
    SellOrder.find({ customer: customer._id, ...searchFilter })
      .select("items totalAmount status accountSectionApproval inventoryManagerApproval ScannedByWarehouseManager deliveryStatus")
      .skip(skip)
      .limit(limit)
      .lean(),

    SellOrder.countDocuments({ customer: customer._id, ...searchFilter })
  ]);

  await enrichOrdersWithProductDetails(orders);

  return {
    ...customer,
    orders,
    pagination: {
      total: totalOrders,
      page,
      limit,
      pages: Math.ceil(totalOrders / limit)
    }
  };
};


//Get single Order by ID
exports.getOrderById = async (id) => {
  const order = await SellOrder.findById(id).populate("customer","name").lean();
  if (order) await enrichOrdersWithProductDetails([order]);
  return order;
};

//Update Order by ID
exports.updateOrder = async (id, updateData) => {
  return await SellOrder.findByIdAndUpdate(id, updateData, { new: true });
};

//soft Delete Order
exports.softDeleteOrder = async (id) => {
  return await SellOrder.findByIdAndUpdate(id, { isActive: false });
};

//Get Data By Wishlist
exports.getWishlistItems = async (filter = {}, page = 1, limit = 10, search = "") => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;

  // Base query: only documents with non-empty WishList
  const query = { 
    isActive: true,
    ...filter,
    WishList: { $exists: true, $ne: [] }
  };

  // Fetch Cart wishlist items
  let cartOrders = await Cart.find(query)
    .select("salesOrderNo customer WishList createdBy createdAt")
    .populate("customer", "name")
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 })
    .lean();

  // Fetch SellOrder wishlist items
  let sellOrders = await SellOrder.find(query)
    .select("salesOrderNo customer WishList createdBy createdAt")
    .populate("customer", "name")
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 })
    .lean();

  // --- Merge both ---
  let allOrders = [...cartOrders, ...sellOrders];

  // Resolve article/category on WishList items from productId/categoryId
  await enrichOrdersWithProductDetails(allOrders);

  // --- Single Search Function ---
  const applySearch = (items, searchText) => {
    if (!searchText || searchText.trim() === "") return items;
    const regex = new RegExp(searchText.trim(), "i");
    return items.filter(order =>
      regex.test(order.salesOrderNo || "") ||
      regex.test(order.article || "") ||
      regex.test(order.customer?.name || "") ||
      regex.test(order.createdBy?.name || "") ||
      (order.WishList && order.WishList.some(item => regex.test(item.article || "")))
    );
  };

  // Apply search
  const filteredOrders = applySearch(allOrders, search);

  // Sort merged list by createdAt (newest first)
  filteredOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pagination
  const totalItems = filteredOrders.length;
  const totalPages = Math.ceil(totalItems / limitNum);
  const skip = (pageNum - 1) * limitNum;
  const paginatedOrders = filteredOrders.slice(skip, skip + limitNum);

  return {
    sellorder: paginatedOrders,
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalItems,
    },
  };
};

exports.applySchemeToOrder = async ({ salesOrderNo, customerId, schemesId, isUpdate = false }) => {
  console.log("Received params:", { salesOrderNo, customerId, schemesId, isUpdate });

  // Find order
  const order = await SellOrder.findOne({ salesOrderNo, customer: customerId });
  console.log("Order found:", order);
  if (!order) throw new Error("Order not found");

  // Check if scheme already applied
  if (order.scheme && !isUpdate) {
    throw new Error("Scheme already applied, for chnaging please update it.");
  }

  // Validate scheme
  const scheme = await Schemes.findById(schemesId);
  console.log("Scheme found:", scheme);
  if (!scheme) throw new Error("Scheme not found");

  // Assign scheme
  order.scheme = schemesId;
  await order.save();
  console.log("Order updated with scheme:", order);

  // Populate before returning
  const populatedOrder = await SellOrder.findById(order._id)
    .populate("customer", "name")
    .populate("scheme", "schemesName schemesType schemesDescription");

  console.log("Populated order:", populatedOrder);
  return populatedOrder;
};

//Delete whislist
exports.deleteWishlist = async (id) => {
  // Try to find in SellOrder first
  const order = await SellOrder.findById(id);

  if (order) {
    // Found in SellOrder → clear wishlist if it exists
    if (order.WishList && order.WishList.length > 0) {
      const clearedData = [...order.WishList];
      order.WishList = [];
      await order.save();

      return {
        success: true,
        message: "Wishlist removed successfully",
        clearedData,
      };
    }

    return { success: false, message: "This wishlist is already empty" };
  }

  // Not found in SellOrder → check Cart
  const cartDoc = await Cart.findById(id);
  if (!cartDoc) {
    return { success: false, message: "Wishlist not found" };
  }

  const itemsEmpty = !cartDoc.items || cartDoc.items.length === 0;
  const wishlistExists = cartDoc.WishList && cartDoc.WishList.length > 0;

  if (itemsEmpty && wishlistExists) {
    // Delete entire Cart entry
    const deletedCart = await Cart.findByIdAndDelete(id);
    return {
      success: true,
      message: "Wishlist removed successfully",
      deletedData: deletedCart,
    };
  } else if (!itemsEmpty && wishlistExists) {
    // Clear wishlist in Cart without deleting the document
    const clearedData = [...cartDoc.WishList];
    cartDoc.WishList = [];
    await cartDoc.save();

    return {
      success: true,
      message: "Wishlist removed successfully",
      clearedData,
    };
  }

  return { success: false, message: "This wishlist is already empty" };
};

//move wishlist to cart
// exports.moveWishlistToCart = async (cartId) => {
//   // 1. Find the cart document
//   const cartDoc = await Cart.findById(cartId);
//   if (!cartDoc) {
//     throw new Error("Cart item not found");
//   }

//   // 2. Get aggregated stock
//   const { data: aggregatedStock } = await exports.getAggregatedStock();

//   // 3. Build stock lookup map
//   const stockMap = {};
//   aggregatedStock.forEach((stock) => {
//     const key = `${stock.article}_${stock.categoryCode}`;
//     stockMap[key] = stock.Total_Available || 0;
//   });

//   // 4. Get the last sales order number from BOTH Cart and SellOrder
//   const lastCartOrder = await Cart.findOne().sort({ createdAt: -1 });
//   const lastSellOrder = await SellOrder.findOne().sort({ createdAt: -1 });

//   let lastCartNo = lastCartOrder
//     ? parseInt(lastCartOrder.salesOrderNo.split("/")[1])
//     : 0;

//   let lastSellNo = lastSellOrder
//     ? parseInt(lastSellOrder.salesOrderNo.split("/")[1])
//     : 0;

//   // Pick the higher one → then increment
//   let nextNo = Math.max(lastCartNo, lastSellNo) + 1;
//   let salesOrderNo = `SO/${nextNo}`;

//   let confirmedOrderItems = [];
//   let wishlistItems = [];

//   // 5. Loop through each item → check stock
//   for (const item of cartDoc.WishList) {
//     const key = `${item.article}_${item.categoryCode}`;
//     const availableQty = stockMap[key] ?? 0;

//     if (availableQty > 0 && item.quantity <= availableQty) {
//       confirmedOrderItems.push(item);
//     } else {
//       wishlistItems.push({
//         ...item,
//         message: `Move to Wishlist: Requested quantity (${item.quantity}) for article ${item.article}, categoryCode ${item.categoryCode} exceeds available stock (${availableQty})`,
//       });
//     }
//   }

//   if (confirmedOrderItems.length === 0) {
//     throw new Error(
//       "No items from wishlist can be moved to cart due to insufficient stock"
//     );
//   }

//   // 6. Prepare order data (common for Cart + SellOrder)
//   const newOrderData = {
//     salesOrderNo,
//     customer: cartDoc.customer,
//     Location: cartDoc.Location,
//     items: confirmedOrderItems,
//     WishList: wishlistItems, // ⬅️ if some items couldn’t be moved, still keep in wishlist
//     createdBy: cartDoc.createdBy,
//     isActive: true,
//   };

//   if (cartDoc.scheme) {
//     newOrderData.scheme = cartDoc.scheme; // only add scheme if exists
//   }

//   // 7. Create new Cart entry
//   const newCartOrder = new Cart(newOrderData);
//   const savedCartOrder = await newCartOrder.save();

//   // 8. Create matching SellOrder entry
//   const newSellOrder = new SellOrder(newOrderData);
//   const savedSellOrder = await newSellOrder.save();

//   // 9. Populate scheme and customer if applicable
//   let populateQuery = Cart.findById(savedCartOrder._id).populate("customer");
//   if (cartDoc.scheme)
//     populateQuery = populateQuery
//       .populate("scheme")
//       .populate("createdBy");

//   const populatedOrder = await populateQuery;

//   return {
//     cartOrder: populatedOrder,
//     sellOrder: savedSellOrder,
//   };
// };      

exports.Deleteitems = async (id) => {
  return await SellOrder.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true } 
  );
};

//Reverce Deliver Process
exports.reverseDelivery = async (id, payload) => {
  const {
    article,
    categoryCode,
    color,
    size,
    type,
    quality,
    quantity: returnQuantity,
    factory,
    productionDate,
    reason,
  } = payload || {};

  if (!article || !categoryCode || !color || !size || !type || !quality) {
    throw new Error(
      "Article details are incomplete. Provide article, categoryCode, color, size, type and quality."
    );
  }
  if (!returnQuantity || typeof returnQuantity !== "number" || returnQuantity <= 0) {
    throw new Error("Return quantity must be a positive number");
  }
  if (!factory) {
    throw new Error("Factory is required to create return production");
  }

  const order = await SellOrder.findById(id);
  if (!order) {
    throw new Error("Order not found");
  }
  if (order.deliveryStatus !== "DELIVERED") {
    throw new Error("Only orders with DELIVERED status can be reversed");
  }

  // Resolve the catalog product + category combo from the payload
  const productByArticle = await Product.findOne({ article });
  if (!productByArticle) {
    throw new Error(`Article '${article}' not found in product catalog.`);
  }
  const matchedCategory = (productByArticle.category || []).find(
    (cat) =>
      String(cat.categoryCode) === String(categoryCode) &&
      String(cat.color).toLowerCase() === String(color).toLowerCase() &&
      String(cat.size).toLowerCase() === String(size).toLowerCase() &&
      (cat.type || []).some(t => String(t).toLowerCase() === String(type).toLowerCase()) &&
      (cat.quality || []).some(q => String(q).toLowerCase() === String(quality).toLowerCase())
  );
  if (!matchedCategory) {
    throw new Error("Matching category combination not found in product catalog.");
  }
  const productId = productByArticle._id;
  const categoryId = matchedCategory._id;
  const selectedImage =
    Array.isArray(matchedCategory.image) && matchedCategory.image.length > 0
      ? matchedCategory.image[0]
      : null;

  const itemIndex = order.items.findIndex(
    (it) =>
      String(it.productId) === String(productId) &&
      String(it.categoryId) === String(categoryId)
  );
  if (itemIndex === -1) {
    throw new Error("Matching product not found in this order");
  }

  const item = order.items[itemIndex];
  const orderedQty = Number(item.quantity) || 0;
  if (returnQuantity > orderedQty) {
    throw new Error(
      `Return quantity (${returnQuantity}) cannot exceed order quantity (${orderedQty})`
    );
  }

  order.items[itemIndex].quantity = orderedQty - returnQuantity;

  order.reverceHistory.push({
    status: "RETURN",
    reason,
    article,
    categoryCode,
    color,
    size,
    type,
    quality,
    quantity: returnQuantity,
  });

  await order.save();

  // Generate next RPN_XX (RPN_01, RPN_02, ... padded to 2 digits, grows past 99)
  const getNextReturnProductionNumber = async () => {
    const last = await Production.aggregate([
      { $match: { productionNo: { $regex: /^RPN_/ } } },
      {
        $addFields: {
          numericNo: {
            $toInt: {
              $replaceOne: { input: "$productionNo", find: "RPN_", replacement: "" },
            },
          },
        },
      },
      { $sort: { numericNo: -1 } },
      { $limit: 1 },
    ]);
    const next = last.length ? last[0].numericNo + 1 : 1;
    return `RPN_${String(next).padStart(2, "0")}`;
  };

  const productionNo = await getNextReturnProductionNumber();

  const production = await Production.create({
    factory,
    productionNo,
    productId,
    categoryId,
    productionDate: productionDate || new Date(),
    productionQuantity: returnQuantity,
  });

  // Generate QR + bypass factory scans so warehouse can scan directly
  const warehouseId =
    Array.isArray(item.warehouses) && item.warehouses[0]?.warehouse
      ? item.warehouses[0].warehouse
      : null;
  if (!warehouseId) {
    throw new Error(
      "Cannot determine warehouse for return QR. Order item has no warehouse association."
    );
  }

  const { qrDoc, production: updatedProduction } =
    await qrCodeService.generateReturnQrAndBypassFactoryScan({
      factory,
      productionNo,
      warehouse: warehouseId,
      article,
      category: { categoryCode, color, size, type, quality },
      quantity: returnQuantity,
    });

  return { order, production: updatedProduction, qrDoc };
};

// Orders still waiting to be scanned/dispatched by THIS warehouse manager.
// An order can have its items split across multiple warehouses (e.g. WH1 = 5,
// WH2 = 5). Each warehouse manager only scans the quantity allocated to their
// own warehouse(s), so we scope all the totals to `warehouseIds` and only
// return orders that still have allocated-but-not-yet-dispatched quantity for
// those warehouses.
exports.getOrdersForWarehouseScan = async (warehouseIds = []) => {
  // No assigned warehouses => nothing to scan.
  if (!warehouseIds.length) return [];

  const whObjectIds = warehouseIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  // Sums a numeric field over the warehouse allocations that belong to this
  // manager's warehouse(s), across every item in the order.
  const sumForMyWarehouses = (field) => ({
    $sum: {
      $map: {
        input: { $ifNull: ["$items", []] },
        as: "item",
        in: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ["$$item.warehouses", []] },
                  as: "w",
                  cond: { $in: ["$$w.warehouse", whObjectIds] },
                },
              },
              as: "w",
              in: { $ifNull: [`$$w.${field}`, 0] },
            },
          },
        },
      },
    },
  });

  // Sums a numeric field over a single item's warehouse allocations that belong
  // to this manager's warehouse(s).
  const itemScopedSum = (field) => ({
    $sum: {
      $map: {
        input: {
          $filter: {
            input: { $ifNull: ["$$item.warehouses", []] },
            as: "w",
            cond: { $in: ["$$w.warehouse", whObjectIds] },
          },
        },
        as: "w",
        in: { $ifNull: [`$$w.${field}`, 0] },
      },
    },
  });

  const orders = await SellOrder.aggregate([
    {
      $match: {
        isActive: true,
        deliveryStatus: "PENDING",
      },
    },
    {
      $addFields: {
        // Quantity allocated to this manager's warehouse(s)
        warehouseAllocatedQty: sumForMyWarehouses("quantity"),
        // Quantity already dispatched/scanned for this manager's warehouse(s)
        warehouseScannedQty: sumForMyWarehouses("scanqtyatdispatch"),
      },
    },
    // Keep orders that are allocated to this warehouse AND still have qty left
    // (e.g. WH1 allocated 5, scanned 4 => 1 left).
    {
      $match: {
        $expr: {
          $gt: ["$warehouseAllocatedQty", "$warehouseScannedQty"],
        },
      },
    },
    {
      $project: {
        _id: 1,
        salesOrderNo: 1,
        // Totals scoped to this manager's warehouse(s)
        totalQuantity: "$warehouseAllocatedQty",
        numOfDispatchedQty: "$warehouseScannedQty",
        remainingQty: {
          $subtract: ["$warehouseAllocatedQty", "$warehouseScannedQty"],
        },
        // Per-item breakdown scoped to this manager's warehouse(s) so the UI can
        // show which articles (and how many) remain to dispatch on the order.
        items: {
          $map: {
            input: { $ifNull: ["$items", []] },
            as: "item",
            in: {
              productId: "$$item.productId",
              categoryId: "$$item.categoryId",
              articleCode: "$$item.articleCode",
              image: "$$item.image",
              quantity: itemScopedSum("quantity"),
              scannedQty: itemScopedSum("scanqtyatdispatch"),
            },
          },
        },
      },
    },
  ]);

  // Drop items that are not allocated to this warehouse and compute per-item
  // remaining qty.
  orders.forEach((o) => {
    o.items = (o.items || [])
      .filter((it) => (it.quantity ?? 0) > 0)
      .map((it) => ({
        ...it,
        remainingQty: (it.quantity ?? 0) - (it.scannedQty ?? 0),
      }));
  });

  // Resolve article name / category details from productId + categoryId.
  await enrichOrdersWithProductDetails(orders);

  return orders;
};

exports.stopOrder = async (orderId) => {
  const order = await SellOrder.findById(orderId);
  if (!order) throw new Error("Order not found");

  if (!order.originalItems || order.originalItems.length === 0) {
    // Save a deep clone of the original items before we mutate them below.
    // Use JSON deep clone because items are plain data from Mongo and this
    // prevents `originalItems` from being mutated when we change `order.items`.
    order.originalItems = JSON.parse(JSON.stringify(order.items || []));
    // Persist immediately so the original snapshot is stored before changes.
    await order.save();
  }

  let finalItems = [];

  for (let i = 0; i < order.items.length; i++) {
    const item = order.items[i];
    let newWarehouses = [];
    let newItemTotalQty = 0;

    if (item.warehouses && Array.isArray(item.warehouses)) {
      for (let j = 0; j < item.warehouses.length; j++) {
        const wh = item.warehouses[j];
        const scannedQty = Number(wh.scanqtyatdispatch) || 0;
        if (scannedQty > 0) {
          wh.quantity = scannedQty;
          wh.ScanByorder = "SCANNED";
          newWarehouses.push(wh);
          newItemTotalQty += scannedQty;
        }
      }
    }

    item.warehouses = newWarehouses;
    item.quantity = newItemTotalQty;

    if (item.quantity > 0) {
      finalItems.push(item);
    }
  }

  order.items = finalItems;
  order.ScannedByWarehouseManager = "SCANNED";
  order.deliveryStatus = "PARTIALLY_DELIVERED";

  // Reconcile warehouse quantities per item using scanned dispatch values
  if (Array.isArray(order.items)) {
    order.items.forEach((item) => {
      if (Array.isArray(item.warehouses)) {
        let totalScanned = 0;
        item.warehouses.forEach((wh) => {
          const scanned = Number(wh.scanqtyatdispatch) || 0;
          // Set the warehouse allocation to the scanned dispatch amount
          wh.quantity = scanned;
          if (scanned > 0) wh.ScanByorder = "SCANNED";
          totalScanned += scanned;
        });
        // Set the item quantity to the total of scanned quantities across warehouses
        item.quantity = totalScanned;
      }
    });
  }

  // Total dispatched quantity for the whole order
  order.numOfDispatchedQty = order.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  await order.save();

  return order;
};

/* ============================================================
   GET ALL DISTINCT ARTICLE NAMES (for dropdown)
   ============================================================ */
exports.getArticleNames = async () => {
  try {
    const products = await Product.find({ isActive: true }).select("article").lean();
    const names = [...new Set(products.map(p => String(p.article)).filter(Boolean))].sort();
    return { success: true, data: names };
  } catch (error) {
    console.error("Error fetching article names:", error);
    return { success: false, message: "Failed to fetch article names", error: error.message };
  }
};

/* ============================================================
   GET ARTICLE DETAILS BY NAME (all category variants + quantities)
   ============================================================ */
exports.getArticleDetailsByName = async (articleName) => {
  try {
    if (!articleName) {
      return { success: false, message: "Article name is required" };
    }

    const cleanArticleName = String(articleName).trim();
    const escapedArticleName = cleanArticleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const articleRegex = new RegExp(`^\\s*${escapedArticleName}\\s*$`, "i");

    // Find all products matching the article name
    const products = await Product.find({
      article: { $regex: articleRegex },
      isActive: { $ne: false },
    }).lean();

    if (!products || products.length === 0) {
      return { success: false, message: "Article not found" };
    }

    const productIds = products.map(p => p._id);

    // Aggregate warehouse stock for these products
    const stockAgg = await Stock.aggregate([
      { $match: { isActive: { $ne: false } } },
      { $unwind: "$stockdata" },
      { $match: { "stockdata.productId": { $in: productIds }, "stockdata.dispatched": false } },
      {
        $group: {
          _id: "$stockdata.categoryId",
          stockQty: { $sum: "$stockdata.quantity" },
        },
      },
    ]);

    // Aggregate production stock for these products
    const prodAgg = await Production.aggregate([
      { $match: { isActive: { $ne: false }, productId: { $in: productIds } } },
      {
        $group: {
          _id: "$categoryId",
          totalProduction: { $sum: { $ifNull: ["$stockinQuantity", 0] } },
          totalDispatched: { $sum: { $ifNull: ["$dispatchedQuantity", 0] } },
        },
      },
      {
        $project: {
          _id: 1,
          productionQty: { $subtract: ["$totalProduction", "$totalDispatched"] },
        },
      },
    ]);

    // Aggregate order qty for these products
    const orderAgg = await SellOrder.aggregate([
      {
        $match: {
          isActive: true,
          deliveryStatus: { $nin: ["DELIVERED", "PARTIALLY_DELIVERED", "COMPLETED"] },
          accountSectionApproval: { $in: ["PENDING", "APPROVED"] },
          inventoryManagerApproval: { $in: ["PENDING", "APPROVED"] },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.productId": { $in: productIds } } },
      {
        $addFields: {
          itemQuantity: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$items.warehouses", []] } }, 0] },
              {
                $sum: {
                  $map: {
                    input: "$items.warehouses",
                    as: "w",
                    in: {
                      $cond: [{ $eq: ["$$w.ScanByorder", "UNSCANNED"] }, "$$w.quantity", 0],
                    },
                  },
                },
              },
              "$items.quantity",
            ],
          },
        },
      },
      {
        $group: {
          _id: "$items.categoryId",
          orderQty: { $sum: "$itemQuantity" },
        },
      },
    ]);

    // Aggregate cart qty for these products
    const cartAgg = await Cart.aggregate([
      { $match: { isActive: true } },
      { $unwind: { path: "$items" } },
      { $match: { "items.productId": { $in: productIds } } },
      {
        $group: {
          _id: "$items.categoryId",
          cartQty: { $sum: { $ifNull: ["$items.quantity", 0] } },
        },
      },
    ]);

    // Aggregate wishlist qty for these products
    const wishlistAgg = await Wishlist.aggregate([
      {
        $match: {
          isActive: true,
          wishlistStockTime: { $ne: null },
        },
      },
      { $unwind: "$WishList" },
      { $match: { "WishList.productId": { $in: productIds } } },
      {
        $group: {
          _id: "$WishList.categoryId",
          wishlistQty: { $sum: { $ifNull: ["$WishList.quantity", 0] } },
        },
      },
    ]);

    // Build lookup maps keyed by categoryId string
    const stockMap = {};
    stockAgg.forEach(s => { if (s._id) stockMap[String(s._id)] = (stockMap[String(s._id)] || 0) + (s.stockQty || 0); });
    const prodMap = {};
    prodAgg.forEach(p => { if (p._id) prodMap[String(p._id)] = (prodMap[String(p._id)] || 0) + (p.productionQty || 0); });
    const orderMap = {};
    orderAgg.forEach(o => { if (o._id) orderMap[String(o._id)] = (orderMap[String(o._id)] || 0) + (o.orderQty || 0); });
    const cartMap = {};
    cartAgg.forEach(c => { if (c._id) cartMap[String(c._id)] = (cartMap[String(c._id)] || 0) + (c.cartQty || 0); });
    const wishlistMap = {};
    wishlistAgg.forEach(w => { if (w._id) wishlistMap[String(w._id)] = (wishlistMap[String(w._id)] || 0) + (w.wishlistQty || 0); });

    // Build response with all active category variants from all matched products
    const seenCategoryIds = new Set();
    const variants = [];

    products.forEach(productDoc => {
      (productDoc.category || [])
        .filter(cat => cat && cat.isActive !== false)
        .forEach(cat => {
          const catId = String(cat._id);
          if (seenCategoryIds.has(catId)) return;
          seenCategoryIds.add(catId);

          const stockQty = stockMap[catId] || 0;
          const productionQty = prodMap[catId] || 0;
          const orderQty = orderMap[catId] || 0;
          const cartQty = cartMap[catId] || 0;
          const wishlistQty = wishlistMap[catId] || 0;
          const total = Math.max(stockQty + productionQty - orderQty - cartQty - wishlistQty, 0);

          variants.push({
            categoryId: cat._id,
            categoryCode: cat.categoryCode,
            size: cat.size,
            color: cat.color,
            type: Array.isArray(cat.type) ? cat.type.join(", ") : (cat.type || ""),
            quality: Array.isArray(cat.quality) ? cat.quality.join(", ") : (cat.quality || ""),
            articleCode: cat.articleCode || "",
            image: cat.image || [],
            Warehouse_Qty: stockQty,
            Production_Qty: productionQty,
            Order_Qty: orderQty,
            Cart_Qty: cartQty,
            Wishlist_Qty: wishlistQty,
            Total_Available: total,
          });
        });
    });

    return {
      success: true,
      data: {
        articleName: products[0].article,
        productId: products[0]._id,
        variants,
      },
    };
  } catch (error) {
    console.error("Error fetching article details by name:", error);
    return { success: false, message: "Failed to fetch article details", error: error.message };
  }
};

/**
 * Review List – Carton Quantity Verification (Factory -> Warehouse)
 * Reconciles carton quantities by Production Number (PN Number) generated at Factory
 * comparing Total Cartons Produced vs Factory Dispatched vs Warehouse Received.
 */
exports.getReviewListOrders = async ({
  page = 1,
  limit = 10,
  search = "",
  startDate = "",
  endDate = "",
  status = "ALL",
  type = "",
} = {}) => {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // 1️⃣ Match stage for QRCODE collection
    const qrMatch = {};
    if (type === "RPN") {
      qrMatch.productionNo = { $regex: "^RPN_", $options: "i" };
    } else if (type === "PN") {
      qrMatch.productionNo = { $regex: "^PN_", $options: "i" };
    }

    if (startDate || endDate) {
      qrMatch.createdAt = {};
      if (startDate) qrMatch.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) qrMatch.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    // 2️⃣ Aggregate QRCODE documents grouped by productionNo
    const qrAgg = await QRCODE.aggregate([
      { $match: qrMatch },
      { $unwind: "$qrCodes" },
      {
        $group: {
          _id: {
            productionNo: "$productionNo",
            productId: "$qrCodes.productId",
            categoryId: "$qrCodes.categoryId",
          },
          productionNo: { $first: "$productionNo" },
          factory: { $first: "$factory" },
          warehouse: { $first: "$warehouse" },
          firstCreatedAt: { $min: "$createdAt" },
          totalCartons: { $sum: 1 },
          factoryDispatchedCartons: {
            $sum: {
              $cond: [{ $eq: ["$qrCodes.factoryScan", true] }, 1, 0],
            },
          },
          warehouseReceivedCartons: {
            $sum: {
              $cond: [{ $eq: ["$qrCodes.warehouseinScan", true] }, 1, 0],
            },
          },
          warehouseDispatchedCartons: {
            $sum: {
              $cond: [{ $eq: ["$qrCodes.warehouseDispatch", true] }, 1, 0],
            },
          },
          qrSample: {
            $push: {
              qrId: "$qrCodes.qrId",
              factoryScan: "$qrCodes.factoryScan",
              warehouseinScan: "$qrCodes.warehouseinScan",
              warehouseDispatch: "$qrCodes.warehouseDispatch",
              ordNumScanFor: "$qrCodes.ordNumScanFor",
            },
          },
        },
      },
    ]);

    // Group the aggregated data by productionNo
    const pnMap = {};
    const productIdsSet = new Set();

    qrAgg.forEach((entry) => {
      const pn = entry.productionNo;
      if (!pn) return;

      if (!pnMap[pn]) {
        pnMap[pn] = {
          productionNo: pn,
          factory: entry.factory,
          warehouses: new Set(),
          createdAt: entry.firstCreatedAt,
          totalCartons: 0,
          factoryDispatchedCartons: 0,
          warehouseReceivedCartons: 0,
          warehouseDispatchedCartons: 0,
          items: [],
        };
      }

      if (entry.warehouse) {
        pnMap[pn].warehouses.add(String(entry.warehouse));
      }

      pnMap[pn].totalCartons += entry.totalCartons || 0;
      pnMap[pn].factoryDispatchedCartons += entry.factoryDispatchedCartons || 0;
      pnMap[pn].warehouseReceivedCartons += entry.warehouseReceivedCartons || 0;
      pnMap[pn].warehouseDispatchedCartons += entry.warehouseDispatchedCartons || 0;

      if (entry._id?.productId) {
        productIdsSet.add(String(entry._id.productId));
      }

      pnMap[pn].items.push({
        productId: entry._id?.productId,
        categoryId: entry._id?.categoryId,
        totalCartons: entry.totalCartons || 0,
        factoryDispatched: entry.factoryDispatchedCartons || 0,
        warehouseReceived: entry.warehouseReceivedCartons || 0,
        difference: (entry.factoryDispatchedCartons || 0) - (entry.warehouseReceivedCartons || 0),
        qrCodes: (entry.qrSample || []).slice(0, 50),
      });
    });

    // 3️⃣ Also check Production records in case any PN was created but no QR code yet or to enrich details
    const productionDocs = await Production.find({
      isActive: true,
      ...(qrMatch.productionNo ? { productionNo: qrMatch.productionNo } : {}),
      ...(qrMatch.createdAt ? { createdAt: qrMatch.createdAt } : {}),
    })
      .populate("factory", "name location")
      .lean();

    productionDocs.forEach((prod) => {
      const pn = prod.productionNo;
      if (!pn) return;

      if (prod.productId) productIdsSet.add(String(prod.productId));

      if (!pnMap[pn]) {
        pnMap[pn] = {
          productionNo: pn,
          factory: prod.factory?._id || prod.factory,
          factory_name: prod.factory?.name || "Factory",
          warehouses: new Set(),
          createdAt: prod.createdAt || prod.productionDate,
          totalCartons: prod.productionQuantity || 0,
          factoryDispatchedCartons: prod.dispatchedQuantity || 0,
          warehouseReceivedCartons: prod.stockinQuantity || 0,
          warehouseDispatchedCartons: 0,
          status: prod.status,
          items: [
            {
              productId: prod.productId,
              categoryId: prod.categoryId,
              totalCartons: prod.productionQuantity || 0,
              factoryDispatched: prod.dispatchedQuantity || 0,
              warehouseReceived: prod.stockinQuantity || 0,
              difference: (prod.dispatchedQuantity || 0) - (prod.stockinQuantity || 0),
              qrCodes: [],
            },
          ],
        };
      }
    });

    // 4️⃣ Populate Factories and Warehouses
    const { Factory, Warehouse } = require("../models");
    const [factories, allWarehouses, products] = await Promise.all([
      Factory.find({}).lean(),
      Warehouse.find({}).lean(),
      Product.find({ _id: { $in: [...productIdsSet] } }).lean(),
    ]);

    const factoryMap = {};
    factories.forEach((f) => {
      factoryMap[String(f._id)] = f.name;
    });

    const warehouseMap = {};
    allWarehouses.forEach((w) => {
      warehouseMap[String(w._id)] = w.name;
    });

    const productMap = {};
    products.forEach((p) => {
      productMap[String(p._id)] = p;
    });

    // 5️⃣ Format and compute carton reconciliation per Production Number
    const allFormattedList = Object.values(pnMap).map((pnData) => {
      const factory_name =
        factoryMap[String(pnData.factory)] || pnData.factory_name || "Factory";
      const warehouseNames = Array.from(pnData.warehouses)
        .map((wId) => warehouseMap[wId] || "Warehouse")
        .filter(Boolean);

      const cartonDifference =
        pnData.factoryDispatchedCartons - pnData.warehouseReceivedCartons;

      // Status determination
      let verificationStatus = "PENDING_DISPATCH";
      let statusLabel = "Pending Factory Dispatch";
      let statusType = "pending";

      if (
        pnData.factoryDispatchedCartons === 0 &&
        pnData.warehouseReceivedCartons === 0
      ) {
        verificationStatus = "PENDING_DISPATCH";
        statusLabel = "Pending Factory Dispatch";
        statusType = "pending";
      } else if (
        pnData.factoryDispatchedCartons > 0 &&
        pnData.warehouseReceivedCartons === 0
      ) {
        verificationStatus = "IN_TRANSIT";
        statusLabel = "In Transit";
        statusType = "in_transit";
      } else if (cartonDifference === 0) {
        verificationStatus = "MATCHED";
        statusLabel = "Fully Matched";
        statusType = "matched";
      } else if (cartonDifference > 0) {
        verificationStatus = "SHORTAGE";
        statusLabel = `${cartonDifference} Cartons Shortage`;
        statusType = "shortage";
      } else {
        verificationStatus = "EXCESS";
        statusLabel = `${Math.abs(cartonDifference)} Cartons Excess`;
        statusType = "excess";
      }

      // Enrich item breakdown
      const enrichedItems = (pnData.items || []).map((it) => {
        const prod = productMap[String(it.productId)];
        const cat = prod?.category?.find(
          (c) => String(c._id) === String(it.categoryId)
        );

        const itemDiff = it.factoryDispatched - it.warehouseReceived;
        let itemStatusLabel = "Pending Dispatch";
        let itemStatusType = "pending";

        if (it.factoryDispatched === 0 && it.warehouseReceived === 0) {
          itemStatusLabel = "Pending Dispatch";
          itemStatusType = "pending";
        } else if (it.factoryDispatched > 0 && it.warehouseReceived === 0) {
          itemStatusLabel = "In Transit";
          itemStatusType = "in_transit";
        } else if (itemDiff === 0) {
          itemStatusLabel = "Fully Matched";
          itemStatusType = "matched";
        } else if (itemDiff > 0) {
          itemStatusLabel = `${itemDiff} Shortage`;
          itemStatusType = "shortage";
        } else {
          itemStatusLabel = `${Math.abs(itemDiff)} Excess`;
          itemStatusType = "excess";
        }

        return {
          article: prod?.article || "Article",
          categoryCode: cat?.categoryCode || "",
          color: cat?.color || "",
          size: cat?.size || "",
          type: cat?.type ? (Array.isArray(cat.type) ? cat.type[0] : cat.type) : "",
          quality: cat?.quality
            ? Array.isArray(cat.quality)
              ? cat.quality[0]
              : cat.quality
            : "",
          image: cat?.image || [],
          totalCartons: it.totalCartons,
          factoryDispatched: it.factoryDispatched,
          warehouseReceived: it.warehouseReceived,
          difference: itemDiff,
          statusLabel: itemStatusLabel,
          statusType: itemStatusType,
          qrCodes: it.qrCodes || [],
        };
      });

      // Primary article names for quick display
      const articleNames = Array.from(
        new Set(enrichedItems.map((it) => it.article).filter(Boolean))
      );

      return {
        productionNo: pnData.productionNo,
        createdAt: pnData.createdAt,
        factory_name,
        warehouses: warehouseNames.length ? warehouseNames : ["Warehouse"],
        articleNames,
        totalCartons: pnData.totalCartons,
        factoryDispatchedCartons: pnData.factoryDispatchedCartons,
        warehouseReceivedCartons: pnData.warehouseReceivedCartons,
        warehouseDispatchedCartons: pnData.warehouseDispatchedCartons,
        cartonDifference,
        verificationStatus,
        statusLabel,
        statusType,
        items: enrichedItems,
      };
    });

    // 6️⃣ Sort by createdAt descending
    allFormattedList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 7️⃣ Apply Search filter (by PN Number, factory, warehouse, article)
    let filteredList = allFormattedList;
    if (search && search.trim() !== "") {
      const q = search.trim().toLowerCase();
      filteredList = filteredList.filter(
        (entry) =>
          entry.productionNo.toLowerCase().includes(q) ||
          entry.factory_name.toLowerCase().includes(q) ||
          entry.warehouses.some((w) => w.toLowerCase().includes(q)) ||
          entry.articleNames.some((a) => a.toLowerCase().includes(q))
      );
    }

    // 8️⃣ Compute summary KPI statistics
    const summary = {
      totalPNCount: filteredList.length,
      totalOrderCartons: filteredList.reduce((sum, o) => sum + o.totalCartons, 0),
      totalFactoryDispatched: filteredList.reduce(
        (sum, o) => sum + o.factoryDispatchedCartons,
        0
      ),
      totalWarehouseReceived: filteredList.reduce(
        (sum, o) => sum + o.warehouseReceivedCartons,
        0
      ),
      totalDifference: filteredList.reduce(
        (sum, o) => sum + o.cartonDifference,
        0
      ),
      fullyMatchedCount: filteredList.filter(
        (o) => o.verificationStatus === "MATCHED"
      ).length,
      shortageCount: filteredList.filter(
        (o) => o.verificationStatus === "SHORTAGE"
      ).length,
      excessCount: filteredList.filter((o) => o.verificationStatus === "EXCESS")
        .length,
      inTransitCount: filteredList.filter(
        (o) => o.verificationStatus === "IN_TRANSIT"
      ).length,
      pendingCount: filteredList.filter(
        (o) => o.verificationStatus === "PENDING_DISPATCH"
      ).length,
    };

    // 9️⃣ Apply Status filter
    if (status && status !== "ALL") {
      filteredList = filteredList.filter(
        (o) =>
          o.verificationStatus === status ||
          o.statusType === status.toLowerCase()
      );
    }

    // 🔟 Paginate
    const totalItems = filteredList.length;
    const totalPages = Math.ceil(totalItems / limitNum) || 1;
    const paginatedData = filteredList.slice(skip, skip + limitNum);

    return {
      success: true,
      data: paginatedData,
      summary,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems,
        limit: limitNum,
      },
    };
  } catch (error) {
    console.error("Error in getReviewListOrders service:", error);
    throw error;
  }
};


