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

exports.getAggregatedStock = async (page = 1, limit = 10, search = "", excludeWishlistId = null) => {
  const skip = (page - 1) * limit;

  /* ===============================
     1️⃣ WAREHOUSE STOCK
     =============================== */
  const stockAgg = await Stock.aggregate([
    { $match: { isActive: { $ne: false } } },
    { $unwind: "$stockdata" },
    { $match: { "stockdata.productId": { $ne: null } } },
    {
      $group: {
        _id: {
          productId: "$stockdata.productId",
          categoryId: "$stockdata.categoryId",
        },
        stockQty: {
          $sum: {
            $cond: [
              { $eq: ["$stockdata.dispatched", false] },
              "$stockdata.quantity",
              0,
            ],
          },
        },
      },
    },
    { $match: { stockQty: { $gt: 0 } } },
  ]);

  /* ===============================
     2️⃣ PRODUCTION STOCK (Scanned QR Codes only)
     =============================== */
const prodAgg = await Production.aggregate([
    { $match: { isActive: { $ne: false }, productId: { $ne: null } } },
    {
      $group: {
        _id: {
          productId: "$productId",
          categoryId: "$categoryId",
        },
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
    { $match: { productionQty: { $gt: 0 } } },
  ]);

  /* ===============================
     3️⃣ SELLORDER (UNSCANNED ONLY)
     =============================== */
  const orderAgg = await SellOrder.aggregate([
  {
    $match: {
      isActive: true,
      // 1️⃣ Filter by Order Status to exclude DELIVERED/COMPLETED orders
      deliveryStatus: { $nin: ["DELIVERED", "PARTIALLY_DELIVERED", "COMPLETED"] }, 
      accountSectionApproval: { $in: ["PENDING", "APPROVED"] },
      inventoryManagerApproval: { $in: ["PENDING", "APPROVED"] },
    },
  },
  { $unwind: "$items" },
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
                  $cond: [
                    // 2️⃣ Only count if UNSCANNED (not yet picked/dispatched)
                    { $eq: ["$$w.ScanByorder", "UNSCANNED"] },
                    "$$w.quantity",
                    0,
                  ],
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
      _id: {
        productId: "$items.productId",
        categoryId: "$items.categoryId",
      },
      orderQty: { $sum: "$itemQuantity" },
    },
  },
]);

  /* ===============================
     4️⃣ CART RESERVED QTY
     =============================== */
  const cartAgg = await Cart.aggregate([
    { $match: { isActive: true } },
    { $unwind: { path: "$items"} },
    { $match: { "items.productId": { $ne: null } } },
    {
      $group: {
        _id: {
          productId: "$items.productId",
          categoryId: "$items.categoryId",
        },
        cartQty: { $sum: { $ifNull: ["$items.quantity", 0] } },
      },
    },
  ]);

  /* ===============================
    5️⃣ Wishlist Reserve QTY
     =============================== */

const wishlistAgg = await Wishlist.aggregate([
  {
    $match: {
      isActive: true,
      // The Wishlist collection only holds pending wishlists now (accepted /
      // rejected / timed-out ones are archived to WishlistHistory and removed),
      // so every remaining wishlist with stock applied is a live reservation.
      wishlistStockTime: { $ne: null}, // only valid wishlist
      // When creating an order FROM a wishlist, that wishlist's own reserved
      // qty must NOT be counted against availability (the salesperson is
      // converting it into an order). For a normal order excludeWishlistId is
      // null and every pending wishlist keeps reserving.
      ...(excludeWishlistId
        ? { _id: { $ne: new mongoose.Types.ObjectId(excludeWishlistId) } }
        : {})
    }
  },
  { $unwind: "$WishList" },
  { $match: { "WishList.productId": { $ne: null } } },
  {
    $group: {
      _id: {
        productId: "$WishList.productId",
        categoryId: "$WishList.categoryId",
      },
      wishlistQty: { $sum: { $ifNull: ["$WishList.quantity", 0] } }
    }
  }
]);



  /* ===============================
    MERGE ALL DATA
     =============================== */
  const combinedMap = {};
  // Group everything by the product + category combination ids
  const normalizeKey = o => `${String(o.productId)}_${String(o.categoryId)}`;

  const addToMap = (item, field) => {
    const key = normalizeKey(item._id);
    combinedMap[key] ??= { _id: item._id, stockQty: 0, productionQty: 0, orderQty: 0, cartQty: 0, wishlistQty: 0, image: [] };
    combinedMap[key][field] = item[field] || 0;
  };

  stockAgg.forEach(i => addToMap(i, "stockQty"));
  prodAgg.forEach(i => addToMap(i, "productionQty"));
  orderAgg.forEach(i => addToMap(i, "orderQty"));
  cartAgg.forEach(i => addToMap(i, "cartQty"));
  wishlistAgg.forEach(i => addToMap(i, "wishlistQty"));

  /* ===============================
     6️⃣ PRODUCT / CATEGORY DETAILS (for display)
     =============================== */
  const productIds = [
    ...new Set(
      Object.values(combinedMap)
        .map(q => q._id.productId && String(q._id.productId))
        .filter(Boolean)
    ),
  ];
  const products = await Product.find({ _id: { $in: productIds } }).select("article category");
  const productMap = {};
  products.forEach(p => { productMap[String(p._id)] = p; });

  Object.values(combinedMap).forEach(q => {
    const prod = productMap[String(q._id.productId)];
    const cat = prod?.category?.find(c => String(c._id) === String(q._id.categoryId));
    q.article = prod?.article;
    q.categoryCode = cat?.categoryCode;
    q.color = cat?.color;
    q.size = cat?.size;
    q.type = Array.isArray(cat?.type) ? cat.type[0] : cat?.type;
    q.quality = Array.isArray(cat?.quality) ? cat.quality[0] : cat?.quality;
    q.image = cat?.image || [];
    q.articleCode = cat?.articleCode || "";
  });


  /* ===============================
     7️⃣ FINAL RESPONSE
     =============================== */
  const result = Object.values(combinedMap).map(q => {
    const total = q.stockQty + q.productionQty - q.orderQty - q.cartQty - q.wishlistQty;
    return {
      productId: q._id.productId,
      categoryId: q._id.categoryId,
      article: q.article,
      categoryCode: q.categoryCode,
      color: q.color,
      size: q.size,
      type: q.type,
      quality: q.quality,
      articleCode: q.articleCode,
      Warehouse_Qty: q.stockQty,
      Production_Qty: q.productionQty,
      Order_Qty: q.orderQty,
      Cart_Qty: q.cartQty,
      Wishlist_Qty: q.wishlistQty,
      Total_Available: Math.max(total, 0),
      image: q.image,
    };
  });

  const filtered = search
    ? result.filter(r => Object.values(r).some(v => new RegExp(search, "i").test(String(v))))
    : result;

  filtered.sort((a, b) => b.Total_Available - a.Total_Available);

  return {
    data: filtered.slice(skip, skip + limit),
    pagination: {
      currentPage: page,
      totalItems: filtered.length,
      totalPages: Math.ceil(filtered.length / limit),
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

  // 3️⃣ Get aggregated stock
  const { data: aggregatedStock } = await exports.getAggregatedStock();
  if (!aggregatedStock || aggregatedStock.length === 0) throw new Error("No stock data found");

  // 4️⃣ Stock lookup map
  const stockMap = {};
  aggregatedStock.forEach(stock => {
    const key = `${stock.productId}_${stock.categoryId}`;
    stockMap[key] = stock.Total_Available || 0;
  });

  // 5️⃣ Generate sales order number
  const lastCartOrder = await Cart.findOne().sort({ createdAt: -1 });
  const lastSellOrder = await SellOrder.findOne().sort({ createdAt: -1 });
  const nextNo = Math.max(
    lastCartOrder ? parseInt(lastCartOrder.salesOrderNo.split("/")[1]) : 0,
    lastSellOrder ? parseInt(lastSellOrder.salesOrderNo.split("/")[1]) : 0
  ) + 1;
  const salesOrderNo = `SO/${nextNo}`;

  // 6️⃣ Process items
  const confirmedOrderItems = [];
  const wishlistItems = [];

  for (const item of items) {
    // if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 5) {
    //   throw new Error(
    //     `Quantity for article ${item.article}, categoryCode ${item.categoryCode} must be at least 5`
    //   );
    // }

// STRICT variant match. article + categoryCode + color + size + type + quality
// must ALL be present and matched. A single color+size+categoryCode can have
// multiple sub-documents differing only by type/quality (Soft/Hard/Common x
// A/B). If type/quality are not enforced we resolve the FIRST such variant and
// store the wrong categoryId, which then mismatches the production/stock/QR and
// makes the order impossible to dispatch.
if (
  !item.article || !item.categoryCode || !item.color ||
  !item.size || !item.type || !item.quality
) {
  throw new Error(
    `Incomplete product details for article ${item.article || "?"}: ` +
      `article, categoryCode, color, size, type and quality are all required.`
  );
}

const productRecord = await Product.findOne({
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

let imageUrl = null;
let dbarticleocode = null;
let matchedCategoryId = null;
if (productRecord && productRecord.category?.length > 0) {
  // Find the exact category within the array (all six fields must match)
  const matchedCategory = productRecord.category.find(cat =>
    cat.categoryCode === item.categoryCode &&
    cat.color?.toLowerCase() === item.color.toLowerCase() &&
    cat.size?.toLowerCase() === item.size.toLowerCase() &&
    (cat.type || []).some(t => t?.toLowerCase() === item.type.toLowerCase()) &&
    (cat.quality || []).some(q => q?.toLowerCase() === item.quality.toLowerCase())
  );

  if (matchedCategory) {
    imageUrl = matchedCategory.image[0];
    dbarticleocode = matchedCategory.articleCode;
    matchedCategoryId = matchedCategory._id;
  }
}

// Never create an order line with an unresolved / wrong variant.
if (!matchedCategoryId) {
  throw new Error(
    `No matching product variant for article ${item.article}, ` +
      `categoryCode ${item.categoryCode}, color ${item.color}, size ${item.size}, ` +
      `type ${item.type}, quality ${item.quality}.`
  );
}

const itemWithImage = {
  ...item,
  productId: productRecord?._id,
  categoryId: matchedCategoryId,
  articleCode: dbarticleocode,
  image: imageUrl ? [imageUrl] : [],
};


    const key = `${productRecord?._id}_${matchedCategoryId}`;
    const availableQty = stockMap[key] ?? 0;
    if (availableQty > 0 && item.quantity <= availableQty) {
      confirmedOrderItems.push(itemWithImage);
    } else {
      wishlistItems.push(itemWithImage);
    }
  }

  // 7️⃣ Create Cart entry
  const newOrderData = {
    salesOrderNo,
    customer: existingCustomer._id,
    Location: location,
    items: confirmedOrderItems,
    WishList: wishlistItems,
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
    // Find the product matching the article name
    const product = await Product.findOne({
      article: { $regex: new RegExp(`^${articleName}$`, "i") },
      isActive: true,
    }).lean();

    if (!product) {
      return { success: false, message: "Article not found" };
    }

    const productId = product._id;

    // Aggregate warehouse stock for this product
    const stockAgg = await Stock.aggregate([
      { $match: { isActive: { $ne: false } } },
      { $unwind: "$stockdata" },
      { $match: { "stockdata.productId": productId, "stockdata.dispatched": false } },
      {
        $group: {
          _id: "$stockdata.categoryId",
          stockQty: { $sum: "$stockdata.quantity" },
        },
      },
    ]);

    // Aggregate production stock for this product
    const prodAgg = await Production.aggregate([
      { $match: { isActive: { $ne: false }, productId: productId } },
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

    // Aggregate order qty for this product
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
      { $match: { "items.productId": productId } },
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

    // Aggregate cart qty for this product
    const cartAgg = await Cart.aggregate([
      { $match: { isActive: true } },
      { $unwind: { path: "$items" } },
      { $match: { "items.productId": productId } },
      {
        $group: {
          _id: "$items.categoryId",
          cartQty: { $sum: { $ifNull: ["$items.quantity", 0] } },
        },
      },
    ]);

    // Aggregate wishlist qty for this product
    const wishlistAgg = await Wishlist.aggregate([
      {
        $match: {
          isActive: true,
          wishlistStockTime: { $ne: null },
        },
      },
      { $unwind: "$WishList" },
      { $match: { "WishList.productId": productId } },
      {
        $group: {
          _id: "$WishList.categoryId",
          wishlistQty: { $sum: { $ifNull: ["$WishList.quantity", 0] } },
        },
      },
    ]);

    // Build lookup maps keyed by categoryId string
    const stockMap = {};
    stockAgg.forEach(s => { stockMap[String(s._id)] = s.stockQty || 0; });
    const prodMap = {};
    prodAgg.forEach(p => { prodMap[String(p._id)] = p.productionQty || 0; });
    const orderMap = {};
    orderAgg.forEach(o => { orderMap[String(o._id)] = o.orderQty || 0; });
    const cartMap = {};
    cartAgg.forEach(c => { cartMap[String(c._id)] = c.cartQty || 0; });
    const wishlistMap = {};
    wishlistAgg.forEach(w => { wishlistMap[String(w._id)] = w.wishlistQty || 0; });

    // Build response with one row per active category variant
    const variants = (product.category || [])
      .filter(cat => cat.isActive !== false)
      .map(cat => {
        const catId = String(cat._id);
        const stockQty = stockMap[catId] || 0;
        const productionQty = prodMap[catId] || 0;
        const orderQty = orderMap[catId] || 0;
        const cartQty = cartMap[catId] || 0;
        const wishlistQty = wishlistMap[catId] || 0;
        const total = Math.max(stockQty + productionQty - orderQty - cartQty - wishlistQty, 0);

        return {
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
        };
      });

    return {
      success: true,
      data: {
        articleName: product.article,
        productId: product._id,
        variants,
      },
    };
  } catch (error) {
    console.error("Error fetching article details by name:", error);
    return { success: false, message: "Failed to fetch article details", error: error.message };
  }
};
