const { SellOrder } = require("../models");
const { Stock } = require("../models");
const { Customer } = require("../models");
const { Production } = require("../models");
const { Product } = require("../models");
const { Cart } = require("../models")
const { Schemes } = require("../models")
const { Wishlist } = require("../models")
const QRCODE = require("../models/qrCode.model");
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

exports.getAggregatedStock = async (page = 1, limit = 10, search = "") => {
  const skip = (page - 1) * limit;

  /* ===============================
     1️⃣ WAREHOUSE STOCK
     =============================== */
  const stockAgg = await Stock.aggregate([
    { $match: { isActive: { $ne: false } } },
    { $unwind: "$stockdata" },
    { $match: { "stockdata.article": { $nin: [null, ""] } } },
    {
      $project: {
        article: "$stockdata.article",
        categoryCode: "$stockdata.categoryCode",
        color: "$stockdata.color",
        size: "$stockdata.size",
        type: "$stockdata.type",
        quality: "$stockdata.quality",
        quantity: "$stockdata.quantity",
        dispatched: "$stockdata.dispatched",
      },
    },
    {
      $group: {
        _id: {
          article: "$article",
          categoryCode: "$categoryCode",
          color: "$color",
          size: "$size",
          type: "$type",
          quality: "$quality",
        },
        stockQty: {
          $sum: { $cond: [{ $eq: ["$dispatched", false] }, "$quantity", 0] },
        },
      },
    },
  ]);

  /* ===============================
     2️⃣ PRODUCTION STOCK (Scanned QR Codes only)
     =============================== */
const prodAgg = await Production.aggregate([
    { $match: { isActive: { $ne: false } } },
    { $unwind: "$category" },
    { $match: { article: { $nin: [null, ""] } } },
    {
      $group: {
        _id: {
          article: "$article",
          categoryCode: "$category.categoryCode",
          color: "$category.color",
          size: "$category.size",
          type: "$category.type",
          quality: "$category.quality",
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
      deliveryStatus: { $nin: ["DELIVERED", "CANCELLED", "COMPLETED"] }, 
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
        article: "$items.article",
        categoryCode: "$items.categoryCode",
        color: "$items.color",
        size: "$items.size",
        type: "$items.type",
        quality: "$items.quality",
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
    {
      $project: {
        article: "$items.article",
        categoryCode: "$items.categoryCode",
        color: "$items.color",
        size: "$items.size",
        type: "$items.type",
        quality: "$items.quality",
        quantity: { $ifNull: ["$items.quantity", 0] },
      },
    },
    {
      $group: {
        _id: {
          article: "$article",
          categoryCode: "$categoryCode",
          color: "$color",
          size: "$size",
          type: "$type",
          quality: "$quality",
        },
        cartQty: { $sum: "$quantity" },
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
      wishlistStockTime: { $ne: null} // only valid wishlist
    }
  },
  { $unwind: "$WishList" },
  {
    $project: {
      article: "$WishList.article",
      categoryCode: "$WishList.categoryCode",
      color: "$WishList.color",
      size: "$WishList.size",
      type: "$WishList.type",
      quality: "$WishList.quality",
      quantity: { $ifNull: ["$WishList.quantity", 0] }
    }
  },
  {
    $group: {
      _id: {
        article: "$article",
        categoryCode: "$categoryCode",
        color: "$color",
        size: "$size",
        type: "$type",
        quality: "$quality"
      },
      wishlistQty: { $sum: "$quantity" }
    }
  }
]);



  /* ===============================
    MERGE ALL DATA
     =============================== */
  const combinedMap = {};
  const normalizeKey = o =>
    `${String(o.article).toLowerCase()}_${String(o.categoryCode).toLowerCase()}_${String(o.color).toLowerCase()}_${String(o.size).toLowerCase()}_${o.type}_${o.quality}`;

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
     6️⃣ PRODUCT IMAGES
     =============================== */
  const allKeys = Object.keys(combinedMap);
  const products = await Product.find({}).select("article articleCode category");
allKeys.forEach(key => {
  const q = combinedMap[key];
  const [article, categoryCode, color, size] = key.split("_");
  const prod = products.find(p =>
    String(p.article).toLowerCase() === article &&
    p.category.some(c =>
      String(c.categoryCode).toLowerCase() === categoryCode &&
      String(c.color).toLowerCase() === color &&
      String(c.size).toLowerCase() === size
    )
  );

  const matchedCategory = prod?.category?.find(c =>
    String(c.categoryCode).toLowerCase() === categoryCode &&
    String(c.color).toLowerCase() === color &&
    String(c.size).toLowerCase() === size
  );

  q.image = matchedCategory?.image || [];
  q.articleCode = matchedCategory?.articleCode || "";
});


  /* ===============================
     7️⃣ FINAL RESPONSE
     =============================== */
  const result = Object.values(combinedMap).map(q => {
    const total = q.stockQty + q.productionQty - q.orderQty - q.cartQty - q.wishlistQty;
    return {
      article: q._id.article,
      categoryCode: q._id.categoryCode,
      color: q._id.color,
      size: q._id.size,
      type: q._id.type,
      quality: q._id.quality,
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
    const key = `${stock.article}_${stock.categoryCode}_${stock.color}_${stock.size}_${stock.type}_${stock.quality}`;
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
    if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 5) {
      throw new Error(
        `Quantity for article ${item.article}, categoryCode ${item.categoryCode} must be at least 5`
      );
    }

const productRecord = await Product.findOne({
  article: item.article,
  "category.categoryCode": item.categoryCode,
  "category.color": { $regex: new RegExp(`^${item.color}$`, "i") }, // case-insensitive
  "category.size": { $regex: new RegExp(`^${item.size}$`, "i") },
});

let imageUrl = null;
let dbarticleocode = null;
if (productRecord && productRecord.category?.length > 0) {
  // Find the exact category within the array
  const matchedCategory = productRecord.category.find(cat =>
    cat.categoryCode === item.categoryCode &&
    cat.color.toLowerCase() === item.color.toLowerCase() &&
    cat.size.toLowerCase() === item.size.toLowerCase()
  );

  if (matchedCategory) {
    imageUrl = matchedCategory.image[0];
    dbarticleocode = matchedCategory.articleCode;
  }
}

const itemWithImage = { ...item,articleCode: dbarticleocode, image: imageUrl ? [imageUrl] : [] };


    const key = `${item.article}_${item.categoryCode}_${item.color}_${item.size}_${item.type}_${item.quality}`;
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

  const populatedOrder = await populateQuery;

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

  // Base query
  const query = { isActive: true, ...filter };

  // ✅ Add search directly into Mongo query
  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");

    query.$or = [
      { salesOrderNo: { $regex: regex } },
      { "customer.name": { $regex: regex } }, 
      { "items.article": { $regex: regex } }
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

  return {
    sellorder,
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
    SellOrder.find(query).populate("customer", "name").skip(skip).limit(limit),
    SellOrder.countDocuments(query),
  ]);
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
  return await SellOrder.findById(id).populate("customer","name");
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
    .select("salesOrderNo customer article WishList createdBy createdAt")
    .populate("customer", "name")
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 });

  // Fetch SellOrder wishlist items
  let sellOrders = await SellOrder.find(query)
    .select("salesOrderNo customer article WishList createdBy createdAt")
    .populate("customer", "name")
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 });

  // --- Merge both ---
  let allOrders = [...cartOrders, ...sellOrders];

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
        message: "SellOrder wishlist cleared successfully",
        clearedData,
      };
    }

    return { success: false, message: "SellOrder wishlist is already empty" };
  }

  // Not found in SellOrder → check Cart
  const cartDoc = await Cart.findById(id);
  if (!cartDoc) {
    return { success: false, message: "Document not found in SellOrder or Cart" };
  }

  const itemsEmpty = !cartDoc.items || cartDoc.items.length === 0;
  const wishlistExists = cartDoc.WishList && cartDoc.WishList.length > 0;

  if (itemsEmpty && wishlistExists) {
    // Delete entire Cart entry
    const deletedCart = await Cart.findByIdAndDelete(id);
    return {
      success: true,
      message: "Cart entry deleted successfully (items were empty)",
      deletedData: deletedCart,
    };
  } else if (!itemsEmpty && wishlistExists) {
    // Clear wishlist in Cart without deleting the document
    const clearedData = [...cartDoc.WishList];
    cartDoc.WishList = [];
    await cartDoc.save();

    return {
      success: true,
      message: "Wishlist cleared from Cart (items not empty)",
      clearedData,
    };
  }

  return { success: false, message: "Cart not deleted (items empty or wishlist empty)" };
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