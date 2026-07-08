const { SellOrder } = require("../models");
const { Production } = require("../models");
const { Stock } = require("../models");
const { User } = require("../models");
const { Cart } = require("../models");
const { Product } = require("../models");

// Get sells Report
exports.getsellReport = async (filter = {}, page = 1, limit = 10, search = "") => {
  const query = {
    isActive: true,
    accountSectionApproval: "APPROVED",
    inventoryManagerApproval: "APPROVED",
    deliveryStatus: { $in: ["DELIVERED", "PARTIALLY_DELIVERED"] },
    ...filter,
  };

  // 1. Get all matching orders and populate customer + items.productId
  const sellorder = await SellOrder.find(query)
    .populate("customer", "name")
    .populate("items.productId", "article category")
    .sort({ createdAt: -1 });

  function timeDMY(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // 2. Flatten items and resolve article + category details
  let allItems = sellorder.flatMap((order) =>
    order.items.map((item) => {
      const product = item.productId || {};
      const articleName = product.article || "N/A";

      // Match the category subdocument by categoryId
      const matchedCategory = Array.isArray(product.category)
        ? product.category.find(
            (cat) => cat._id && item.categoryId && cat._id.toString() === item.categoryId.toString()
          )
        : null;

      return {
        salesOrderNo: order.salesOrderNo,
        article: articleName,
        categoryCode: matchedCategory?.categoryCode || "N/A",
        color: matchedCategory?.color || "N/A",
        size: matchedCategory?.size || "N/A",
        type: Array.isArray(matchedCategory?.type) ? matchedCategory.type.join(", ") : (matchedCategory?.type || "N/A"),
        quality: Array.isArray(matchedCategory?.quality) ? matchedCategory.quality.join(", ") : (matchedCategory?.quality || "N/A"),
        customer: order.customer?.name || "N/A",
        quantity: item.quantity,
        orderDate: timeDMY(order.createdAt),
      };
    })
  );

  // 3. Apply search
  if (search && search.trim() !== "") {
    const regex = new RegExp(search, "i");
    allItems = allItems.filter(
      (item) =>
        regex.test(item.article) ||
        regex.test(item.salesOrderNo) ||
        regex.test(item.customer) ||
        regex.test(item.categoryCode) ||
        regex.test(item.color) ||
        regex.test(item.orderDate)
    );
  }

  // 4. Paginate at item level
  const totalItems = allItems.length;
  const totalPages = Math.ceil(totalItems / limit);
  const skip = (page - 1) * limit;
  const paginatedItems = allItems.slice(skip, skip + limit);

  return {
    report: paginatedItems,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
    },
  };
};


//Get Customer Report
exports.getCustomerReport = async (page, limit, search = "") => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const basePipeline = [
    {
      $match: {
        customer: { $ne: null },
        isActive: true,
        accountSectionApproval: "APPROVED",
        inventoryManagerApproval: "APPROVED",
      },
    },
    { $unwind: "$items" },
    // Lookup product to get article name
    {
      $lookup: {
        from: "products",
        localField: "items.productId",
        foreignField: "_id",
        as: "productDetails",
      },
    },
    {
      $addFields: {
        articleName: { $arrayElemAt: ["$productDetails.article", 0] },
      },
    },
    // Group by customer + article name
    {
      $group: {
        _id: {
          customer: "$customer",
          article: "$articleName",
        },
        totalQuantity: { $sum: "$items.quantity" },
      },
    },
    // Lookup customer details
    {
      $lookup: {
        from: "customers",
        localField: "_id.customer",
        foreignField: "_id",
        as: "customerDetails",
      },
    },
    { $unwind: "$customerDetails" },
    {
      $project: {
        _id: 0,
        customer: "$customerDetails.name",
        article: "$_id.article",
        city: { $arrayElemAt: ["$customerDetails.location.city", 0] },
        totalQuantity: 1,
      },
    },
    { $sort: { totalQuantity: -1 } },
  ];

  // Apply search filter before skip/limit
  const searchStage = search && search.trim() !== ""
    ? [{
        $match: {
          $or: [
            { customer: { $regex: search, $options: "i" } },
            { article: { $regex: search, $options: "i" } },
            { city: { $regex: search, $options: "i" } },
          ],
        },
      }]
    : [];

  const [data, totalResult] = await Promise.all([
    SellOrder.aggregate([...basePipeline, ...searchStage, { $skip: skip }, { $limit: limitNum }]),
    SellOrder.aggregate([...basePipeline, ...searchStage, { $count: "total" }]),
  ]);

  const totalItems = totalResult.length > 0 ? totalResult[0].total : 0;
  const totalPages = Math.ceil(totalItems / limitNum);

  return {
    success: true,
    data: data.map((item) => ({
      customer: item.customer,
      article: item.article,
      city: item.city,
      totalQuantity: item.totalQuantity,
    })),
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalItems,
    },
  };
};


//stock Report By Warehouse
exports.getStockbyWarehouse = async (filter = {}, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const matchStage = { isActive: true, ...filter };

  // Aggregation pipeline
  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          warehouse: "$warehouse",
        },
        totalQuantity: { $sum: "$toatalQuantity" },
      },
    },
    {
      $lookup: {
        from: "warehouses",
        localField: "_id.warehouse",
        foreignField: "_id",
        as: "warehouseDetails",
      },
    },
    { $unwind: "$warehouseDetails" },
    {
      $project: {
        _id: 0,
        warehouseName: "$warehouseDetails.name",
        warehouseLocation: "$warehouseDetails.location.address",
        totalQuantity: 1,
      },
    },
    { $sort: { totalQuantity: -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  const stockSummary = await Stock.aggregate(pipeline)

  // Count pipeline for pagination
  const countPipeline = [
    { $match: matchStage },
    { $group: { _id: { warehouse: "$warehouse" } } },
    { $count: "total" },
  ];

  const countResult = await Stock.aggregate(countPipeline);
  const totalItems = countResult[0]?.total || 0;
  const totalPages = Math.ceil(totalItems / limit);

  return {
    data: stockSummary.map((items) => ({
      warehouseName: items.warehouseName,
      warehouseLocation: items.warehouseLocation,
      totalQuantity: items.totalQuantity,
    })),
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
    },
  };
};

//Dashbord Sales Summary
exports.getsellReportatAdmin = async () => {
  const summary = await SellOrder.aggregate([
    {
      $match: {
        isActive: true,
        accountSectionApproval: "APPROVED",
        inventoryManagerApproval: "APPROVED",
        deliveryStatus: { $in: ["DELIVERED", "PARTIALLY_DELIVERED"] },
      }
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.article",
        totalQuantity: { $sum: "$items.quantity" },
      },
    },
    {
      $group: {
        _id: null,
        numberOfArticles: { $sum: 1 },
        totalQuantity: { $sum: "$totalQuantity" },
      },
    },
    {
      $project: {
        _id: 0,
        numberOfArticles: 1,
        totalQuantity: 1,
      },
    },
  ]);

  return summary[0] || { numberOfArticles: 0, totalQuantity: 0 };
};

//Total Production till data Summary
exports.getTotalProduction = async () => {
  const summary = await Production.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$article",
        totalQuantity: { $sum: "$productionQuantity" },
      },
    },
    {
      $group: {
        _id: null,
        numberOfArticles: { $sum: 1 },
        totalQuantity: { $sum: "$totalQuantity" },
      },
    },
    {
      $project: {
        _id: 0,
        numberOfArticles: 1,
        totalQuantity: 1,
      },
    },
  ]);

  return summary[0] || { numberOfArticles: 0, totalQuantity: 0 };
};

//Inventory summery
exports.getTotalInventory = async () => {
  // 1. Get Production totals (stock-in minus dispatched from production)
  const summaryProduction = await Production.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        productionStock: {
          $sum: {
            $subtract: [
              { $ifNull: ["$stockinQuantity", 0] },
              { $ifNull: ["$dispatchedQuantity", 0] }
            ]
          }
        }
      }
    },
    { $project: { _id: 0, productionStock: 1 } }
  ]);
  console.log("production", summaryProduction)
  // 2. Get Stock totals (stock still in warehouse = total - dispatched)

  const summaryStock = await Stock.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        stockStock: {
          $sum: {
            $subtract: [
              { $ifNull: ["$toatalQuantity", 0] },
              { $ifNull: ["$dispatchStock", 0] }
            ]
          }
        },
        deliverables: { $sum: { $ifNull: ["$dispatchStock", 0] } },
      },
    },
    { $project: { _id: 0, stockStock: 1, deliverables: 1 } },
  ]);
  console.log("s stoc", summaryStock)

  const approvedOrdersSummary = await SellOrder.aggregate([
    {
      $match: {
        isActive: true,
        accountSectionApproval: "APPROVED",
        inventoryManagerApproval: "APPROVED",
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: null,
        totalQuantity: {
          $sum: {
            $convert: {
              input: "$items.quantity",
              to: "int",
              onError: 0,
              onNull: 0,
            },
          },
        },
        totalOrders: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        totalQuantity: 1,
        totalOrders: 1,
      },
    },
  ]);
  console.log("approvedOrdersSummary:", approvedOrdersSummary);
  // Defaults if no data
  const production = summaryProduction[0] || { productionStock: 0 };
  const stock = summaryStock[0] || { stockStock: 0, deliverables: 0 };
  const approved = approvedOrdersSummary[0] || {
    totalQuantity: 0,
    totalOrders: 0,
  };

  return {
    totalStock: production.productionStock + stock.stockStock,
    deliverables: stock.deliverables,
    totalOrder: approved.totalOrders,
    totalQuantity: approved.totalQuantity,
  };
};

//get Account Section Approval Summery
exports.getAccountSectionApprovalSummary = async () => {
  const summary = await SellOrder.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalApproved: {
          $sum: {
            $cond: [{ $eq: ["$accountSectionApproval", "APPROVED"] }, 1, 0],
          },
        },
        totalRejected: {
          $sum: {
            $cond: [{ $eq: ["$accountSectionApproval", "REJECTED"] }, 1, 0],
          },
        },
        totalPending: {
          $sum: {
            $cond: [{ $eq: ["$accountSectionApproval", "PENDING"] }, 1, 0],
          },
        },
        totalOrders: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        totalApproved: 1,
        totalPending: 1,
        totalRejected: 1,
        totalOrders: 1,
      },
    },
  ]);
  return summary[0] || { totalApproved: 0, totalPending: 0, totalRejected: 0 };
};

//Total Warehouse Summery
exports.getTotalWarehouseSummary = async () => {
  const summary = await Stock.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalStock: { $sum: "$toatalQuantity" },
        totalWarehouses: { $addToSet: "$warehouse" },
        totalDeliverables: { $sum: "$dispatchStock" },
      },
    },
    {
      $project: {
        _id: 0,
        totalStock: 1,
        totalWarehouses: { $size: "$totalWarehouses" },
        totalDeliverables: 1,
      },
    },
  ]);
  const NumberofWarehousesManager = await User.countDocuments({
    role: "Warehouse Manager",
    isActive: true,
  });
  const result = summary[0] || {
    totalStock: 0,
    totalWarehouses: 0,
    totalDeliverables: 0,
  };
  return { ...result, NumberofWarehousesManager };
};

//Production Summary for Dashboard
exports.getProductionSummery = async () => {
  const summery = await Production.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalProduction: { $sum: "$productionQuantity" },
        totalDispatched: { $sum: "$dispatchedQuantity" },
        articles: { $addToSet: "$article" },
        todayProduction: {
          $sum: {
            $cond: [
              {
                $eq: [
                  { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                  new Date().toISOString().split("T")[0],
                ],
              },
              "$productionQuantity",
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalProduction: 1,
        totalDispatched: 1,
        NumberofArticles: { $size: "$articles" },
        todayProduction: 1,
      },
    },
  ]);
  return (
    summery[0] || {
      totalProduction: 0,
      totalDispatched: 0,
      NumberofArticles: 0,
    }
  );
};

//Graphical Represendattion for Stock detail from Prodution and Stock collection for Administor Dashboard
exports.getStockGraphData = async () => {
  // 1. Get total production by factory
  const productionData = await Production.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$factory",
        totalProductionStock: {
          $sum: { $subtract: ["$productionQuantity", "$dispatchedQuantity"] }
        }
      }
    },
    {
      $lookup: {
        from: "factories",
        localField: "_id",
        foreignField: "_id",
        as: "factoryDetails"
      }
    },
    { $unwind: "$factoryDetails" },
    {
      $project: {
        _id: 0,
        factoryId: "$_id",
        factoryName: "$factoryDetails.name",
        totalProductionStock: 1
      }
    }
  ]);

  // 2. Get total stock by warehouse
  const warehouseData = await Stock.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$warehouse",
        totalWarehouseStock: {
          $sum: { $subtract: ["$toatalQuantity", "$dispatchStock"] }
        }
      }
    },
    {
      $lookup: {
        from: "warehouses",
        localField: "_id",
        foreignField: "_id",
        as: "warehouseDetails"
      }
    },
    { $unwind: "$warehouseDetails" },
    {
      $project: {
        _id: 0,
        warehouseId: "$_id",
        warehouseName: "$warehouseDetails.name",
        totalWarehouseStock: 1
      }
    }
  ]);

  return { productionData, warehouseData };
};

//Graphical representation of Production by Month 
exports.getMonthlyProductionTotals = async () => {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  try {
    const monthlyData = await Production.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalProduction: { $sum: "$stockinQuantity" },
        },
      },

      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 }, // take latest 12
      { $sort: { "_id.year": 1, "_id.month": 1 } }, // re-sort ascending
    ]);

    // Find latest month from DB (or fallback to current date)
    let latestYear, latestMonth;
    if (monthlyData.length > 0) {
      const last = monthlyData[monthlyData.length - 1];
      latestYear = last._id.year;
      latestMonth = last._id.month;
    } else {
      const now = new Date();
      latestYear = now.getFullYear();
      latestMonth = now.getMonth() + 1;
    }

    // Generate last 12 months range
    const last12Months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(latestYear, latestMonth - 1 - i, 1);
      last12Months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        monthName: monthNames[d.getMonth()],
      });
    }

    // Create lookup from DB data
    const map = {};
    monthlyData.forEach(p => {
      map[`${p._id.year}-${p._id.month}`] = p.totalProduction;
    });

    // Final result array
    const result = last12Months.map(({ year, month, monthName }) => ({
      year,
      month: monthName,
      totalProduction: map[`${year}-${month}`] || 0,
    }));

    return result;
  } catch (error) {
    throw new Error("Error fetching monthly production totals: " + error.message);
  }
};

//sales Graphical representation by month display only 10 recent months only 
exports.getSalesGraph = async () => {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  try {
    const SalesData = await SellOrder.aggregate([
      { $match: { isActive: true, accountSectionApproval: "APPROVED", inventoryManagerApproval: "APPROVED", deliveryStatus: { $in: ["DELIVERED", "PARTIALLY_DELIVERED"] } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          totalSales: { $sum: { $sum: "$items.quantity" } }
        }
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 10 }, // take latest 10
      { $sort: { "_id.year": 1, "_id.month": 1 } }, // re-sort ascending
    ]);
    let lastyear, lastmonths;
    if (SalesData.length > 0) {
      const last = SalesData[SalesData.length - 1];
      lastyear = last._id.year;
      lastmonths = last._id.month;
    } else {
      const now = new Date();
      lastyear = now.getFullYear();
      lastmonths = now.getMonth() + 1;
    }

    const last12Months = [];
    for (let i = 9; i >= 0; i--) {
      const d = new Date(lastyear, lastmonths - 1 - i, 1);
      last12Months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        monthName: monthNames[d.getMonth()]
      });
    }

    const map = {};;
    SalesData.forEach(s => {
      map[`${s._id.year}-${s._id.month}`] = s.totalSales;
    }
    )

    const result = last12Months.map(({ year, month, monthName }) => ({
      year,
      month: monthName,
      totalSales: map[`${year}-${month}`] || 0
    }))
    return result;
  } catch (error) {
    throw new Error("Error fetching monthly production totals: " + error.message);
  }

}

//Top product sell 
exports.getTopsales = async (filter = {}, page = 1, limit = 10) => {
  const query = {
    isActive: true,
    accountSectionApproval: "APPROVED",
    inventoryManagerApproval: "APPROVED",
    deliveryStatus: { $in: ["DELIVERED", "PARTIALLY_DELIVERED"] },
    ...filter,
  };

  // 1. Get all matching orders with populated productId
  const sellorder = await SellOrder.find(query)
    .select("items")
    .populate({ path: "items.productId", model: "Product", select: "article category" });

  // 2. Flatten items - resolve flat fields from productId/categoryId refs
  const allItems = sellorder.flatMap((order) =>
    order.items.map((item) => {
      const prod = item.productId;
      const cat = prod?.category?.find((c) => String(c._id) === String(item.categoryId));
      return {
        productId: prod?._id || item.productId,
        categoryId: cat?._id || item.categoryId,
        article: prod?.article,
        categoryCode: cat?.categoryCode,
        color: cat?.color,
        size: cat?.size,
        type: Array.isArray(cat?.type) ? cat.type[0] : cat?.type,
        quality: Array.isArray(cat?.quality) ? cat.quality[0] : cat?.quality,
        quantity: item.quantity,
      };
    })
  );

  // 3. Group by productId + categoryId for accurate matching
  const grouped = allItems.reduce((acc, item) => {
    const key = `${item.productId}-${item.categoryId}`;
    if (!acc[key]) {
      acc[key] = {
        productId: item.productId,
        categoryId: item.categoryId,
        article: item.article,
        categoryCode: item.categoryCode,
        color: item.color,
        size: item.size,
        type: item.type,
        quality: item.quality,
        totalQuantity: 0,
      };
    }
    acc[key].totalQuantity += item.quantity;
    return acc;
  }, {});

  // 4. Convert back to array
  let aggregatedItems = Object.values(grouped);

  // 5. Sort by totalQuantity (highest first)
  aggregatedItems.sort((a, b) => b.totalQuantity - a.totalQuantity);

  // 6. Paginate
  const totalItems = aggregatedItems.length;
  const totalPages = Math.ceil(totalItems / limit);
  const skip = (page - 1) * limit;
  const paginatedItems = aggregatedItems.slice(skip, skip + limit);

  return {
    report: paginatedItems,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      itemsOnCurrentPage: paginatedItems.length,
    },
  };
};

// Helper to extract flat fields from a populated item's productId/categoryId refs
function resolveItemFields(item) {
  const prod = item.productId;
  const cat = prod?.category?.find((c) => String(c._id) === String(item.categoryId));
  return {
    productId: prod?._id || item.productId,
    categoryId: cat?._id || item.categoryId,
    article: prod?.article,
    categoryCode: cat?.categoryCode,
    color: cat?.color,
    size: cat?.size,
    type: Array.isArray(cat?.type) ? cat.type[0] : cat?.type,
    quality: Array.isArray(cat?.quality) ? cat.quality[0] : cat?.quality,
  };
}

//Low Stock
exports.lowstockAlert = async (page = 1, limit = 5) => {
  try {
    // 1️⃣ Approved Sell Orders - populate productId for items and WishList
    const sellOrderQuery = {
      isActive: true,
      accountSectionApproval: "APPROVED",
    };

    const orderstock = await SellOrder.find(sellOrderQuery)
      .select("items WishList")
      .populate({ path: "items.productId", model: "Product", select: "article category" })
      .populate({ path: "WishList.productId", model: "Product", select: "article category" });

    // Flatten SellOrder items (OrderedQuantity)
    const allItems = orderstock.flatMap(order =>
      (order.items || []).map(item => {
        const fields = resolveItemFields(item);
        return { ...fields, quantity: item.quantity };
      })
    );

    const groupedOrders = allItems.reduce((acc, item) => {
      const key = `${item.productId}-${item.categoryId}`;
      if (!acc[key]) acc[key] = { ...item, totalQuantity: 0 };
      acc[key].totalQuantity += item.quantity;
      return acc;
    }, {});

    // SellOrder WishList
    const allWishlist = orderstock.flatMap(order =>
      (order.WishList || []).map(item => {
        const fields = resolveItemFields(item);
        return { ...fields, quantity: item.quantity };
      })
    );

    const groupedWishlist = allWishlist.reduce((acc, item) => {
      const key = `${item.productId}-${item.categoryId}`;
      if (!acc[key]) acc[key] = { ...item, totalQuantity: 0 };
      acc[key].totalQuantity += item.quantity;
      return acc;
    }, {});

    // Cart WishList - populate productId
    const cartData = await Cart.find({ isActive: true })
      .select("WishList")
      .populate({ path: "WishList.productId", model: "Product", select: "article category" });

    const cartWishlist = cartData.flatMap(cart =>
      (cart.WishList || []).map(item => {
        const fields = resolveItemFields(item);
        return { ...fields, quantity: item.quantity };
      })
    );

    const groupedCartWishlist = cartWishlist.reduce((acc, item) => {
      const key = `${item.productId}-${item.categoryId}`;
      if (!acc[key]) acc[key] = { ...item, totalQuantity: 0 };
      acc[key].totalQuantity += item.quantity;
      return acc;
    }, {});

    // 2️⃣ Stock - populate stockdata.productId to resolve flat fields
    const stockDocs = await Stock.find({ isActive: true })
      .select("stockdata")
      .populate({ path: "stockdata.productId", model: "Product", select: "article category" });

    const allStock = stockDocs.flatMap(doc =>
      (doc.stockdata || []).filter(item => item.dispatched === false).map(item => {
        const fields = resolveItemFields(item);
        return { ...fields, available: item.quantity };
      })
    );

    // Production stock keeps productId/categoryId (article/category live on Product).
    // Populate productId and resolve flat fields so it keys the same way as orders/stock.
    const productionDocs = await Production.find({ isActive: true })
      .select("productId categoryId productionQuantity dispatchedQuantity")
      .populate({ path: "productId", model: "Product", select: "article category" });

    const allProductionStock = productionDocs.map(doc => {
      const availableQty = (doc.productionQuantity || 0) - (doc.dispatchedQuantity || 0);
      if (availableQty <= 0) return null;
      const fields = resolveItemFields(doc);
      return { ...fields, available: availableQty };
    }).filter(Boolean);

    const combinedStock = [...allStock, ...allProductionStock];

    const groupedStock = combinedStock.reduce((acc, item) => {
      // Use productId+categoryId key for stock items; fall back to flat article key for production
      const key = item.productId
        ? `${item.productId}-${item.categoryId}`
        : `article:${item.article}-${item.categoryCode}-${item.color}-${item.size}`;
      if (!acc[key]) acc[key] = { ...item, available: 0 };
      acc[key].available += item.available;
      return acc;
    }, {});

    // 3️⃣ Compare requiredQuantity vs availableQty
    const allKeys = new Set([
      ...Object.keys(groupedOrders),
      ...Object.keys(groupedWishlist),
      ...Object.keys(groupedCartWishlist),
    ]);

    const lowStockAlerts = [];

    for (const key of allKeys) {
      const orderedQty = groupedOrders[key]?.totalQuantity || 0;
      const wishlistQty =
        (groupedWishlist[key]?.totalQuantity || 0) +
        (groupedCartWishlist[key]?.totalQuantity || 0);

      const requiredQuantity = orderedQty + wishlistQty;
      const availableQty = groupedStock[key]?.available || 0;

      if (requiredQuantity > availableQty) {
        const base = groupedOrders[key] || groupedWishlist[key] || groupedCartWishlist[key];
        lowStockAlerts.push({
          productId: base.productId,
          categoryId: base.categoryId,
          article: base.article,
          categoryCode: base.categoryCode,
          color: base.color,
          size: base.size,
          type: base.type,
          quality: base.quality,
          WishListQuantity: wishlistQty,
          OrderedQuantity: orderedQty,
          requiredQuantity,
          availableQty,
        });
      }
    }

    // 4️⃣ Pagination
    const total = lowStockAlerts.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginated = lowStockAlerts.slice(startIndex, endIndex);

    return {
      success: true,
      data: paginated,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    };
  } catch (err) {
    console.error("Low Stock Alert Error:", err);
    throw err;
  }
};

// exports.getStockReportWithMoreFilters = ({ type = "category", name = [], filter = {} } = {}) => {
//   const searchList = Array.isArray(name) ? name : [name].filter(Boolean);

//   let matchBase = {
//     inventoryManagerApproval: "APPROVED",
//     deliveryStatus: "DELIVERED",
//   };

//   const pipelines = [];
//   const financialYear = filter?.year || null;
//   const [startYear, endYear] = financialYear
//     ? financialYear.split("-").map(Number)
//     : [null, null];

//   const quarterToMonths = {
//     1: [4, 5, 6],
//     2: [7, 8, 9],
//     3: [10, 11, 12],
//     4: [1, 2, 3],
//   };

//   let monthList = [];
//   let quarterList = [];

//   if (filter?.month) {
//     monthList = Array.isArray(filter.month) ? filter.month.map(Number) : [Number(filter.month)];
//   } else if (filter?.quarter) {
//     quarterList = Array.isArray(filter.quarter) ? filter.quarter.map(Number) : [Number(filter.quarter)];
//   } else if (financialYear) {
//     monthList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
//   } else {
//     monthList = [null];
//   }

//   const filterField = type === "category" ? "items.categoryCode" : "items.article";
//   const reportGroupField = "$items.article";

//   // Reusable function to build the pipeline stages for each period
//   const buildPipeline = (match, fyMonth = null, q = null) => [
//     { $match: match },
//     { $unwind: "$items" },
//     ...(searchList.length > 0 ? [{ $match: { [filterField]: { $in: searchList } } }] : []),
//     {
//       $facet: {
//         articleSummary: [
//           {
//             $group: {
//               _id: reportGroupField,
//               totalQuantitySold: { $sum: "$items.quantity" },
//               totalOrders: { $sum: 1 },
//             },
//           },
//           { $sort: { totalQuantitySold: -1 } },
//           {
//             $addFields: {
//               ...(financialYear && { financialYear }),
//               ...(fyMonth && { month: fyMonth }),
//               ...(q && { quarter: q }),
//             },
//           },
//         ],
//         colorSizeSummary: [
//           {
//             $group: {
//               _id: { article: "$items.article", color: "$items.color", size: "$items.size" },
//               totalQuantitySold: { $sum: "$items.quantity" },
//             },
//           },
//           {
//             $project: {
//               _id: 0,
//               articleOrCategory: "$_id.article",
//               color: "$_id.color",
//               size: "$_id.size",
//               totalQuantitySold: 1,
//               ...(financialYear && { financialYear }),
//             },
//           },
//           { $sort: { articleOrCategory: 1, color: 1, size: 1 } },
//         ],
//         cumulativeTotalByArticle: [
//           {
//             $group: {
//               _id: type === "category" ? "$items.categoryCode" : reportGroupField,
//               grandTotalQuantity: { $sum: "$items.quantity" },
//               categoryCode: { $first: "$items.categoryCode" },
//               totalOrderLines: { $sum: 1 },
//             },
//           },
//           {
//             $project: {
//               _id: 0,
//               categoryCode: 1,
//               articleOrCategory: "$_id",
//               grandTotalQuantity: 1,
//               totalOrderLines: 1,
//               ...(financialYear && { financialYear }),
//             },
//           },
//         ],
//         TallyTotal: [
//           { $group: { _id: null, total: { $sum: "$items.quantity" } } },
//           { $project: { _id: 0, totalSales: "$total" } }
//         ]
//       },
//     },
//   ];

//   // Logic for Monthly/Yearly iterations
//   for (const fyMonth of monthList) {
//     let fromDate = null, toDate = null;
//     if (fyMonth && financialYear) {
//       let calendarMonth = fyMonth <= 9 ? fyMonth + 3 : fyMonth - 9;
//       let year = fyMonth <= 9 ? startYear : endYear;
//       fromDate = new Date(year, calendarMonth - 1, 1);
//       toDate = new Date(year, calendarMonth, 0, 23, 59, 59, 999);
//     }
//     let match = { ...matchBase };
//     if (fromDate && toDate) match.createdAt = { $gte: fromDate, $lte: toDate };
//     if (searchList.length > 0) match[filterField] = { $in: searchList };

//     pipelines.push(buildPipeline(match, fyMonth));
//   }

//   // Logic for Quarterly iterations
//   for (const q of quarterList) {
//     const months = quarterToMonths[q];
//     const fromYear = months[0] >= 4 ? startYear : endYear;
//     const toYear = months[2] >= 4 ? startYear : endYear;
//     const fromDate = new Date(fromYear, months[0] - 1, 1);
//     const toDate = new Date(toYear, months[2], 0, 23, 59, 59, 999);

//     let match = { ...matchBase, createdAt: { $gte: fromDate, $lte: toDate } };
//     if (searchList.length > 0) match[filterField] = { $in: searchList };

//     pipelines.push(buildPipeline(match, null, q));
//   }

//   return pipelines; // Returns an array of arrays (pipelines)
// };

exports.getStockReportWithMoreFilters = ({ type = "category", name = [], filter = {} } = {}) => {
  const searchList = Array.isArray(name) ? name : [name].filter(Boolean);

  let matchBase = {
    inventoryManagerApproval: "APPROVED",
    deliveryStatus: { $in: ["DELIVERED", "PARTIALLY_DELIVERED"] },
  };

  const pipelines = [];
  const financialYear = filter?.year || null;
  const [startYear, endYear] = financialYear
    ? financialYear.split("-").map(Number)
    : [null, null];

  const quarterToMonths = {
    1: [4, 5, 6],
    2: [7, 8, 9],
    3: [10, 11, 12],
    4: [1, 2, 3],
  };

  let monthList = [];
  let quarterList = [];

  if (filter?.month) {
    monthList = Array.isArray(filter.month) ? filter.month.map(Number) : [Number(filter.month)];
  } else if (filter?.quarter) {
    quarterList = Array.isArray(filter.quarter) ? filter.quarter.map(Number) : [Number(filter.quarter)];
  } else if (financialYear) {
    monthList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  } else {
    monthList = [null];
  }

  const filterField = type === "category" ? "items.categoryCode" : "items.article";
  // ✅ FIX 1: reportGroupField now respects type
  const reportGroupField = type === "category" ? "$items.categoryCode" : "$items.article";

  const buildPipeline = (match, fyMonth = null, q = null) => [
    { $match: match },
    { $unwind: "$items" },
    // Resolve article name and category details from products collection
    {
      $lookup: {
        from: "products",
        localField: "items.productId",
        foreignField: "_id",
        as: "productDetails"
      }
    },
    { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        "items.article": "$productDetails.article",
        "items.matchedCategory": {
          $filter: {
            input: "$productDetails.category",
            as: "cat",
            cond: { $eq: ["$$cat._id", "$items.categoryId"] }
          }
        }
      }
    },
    {
      $addFields: {
        "items.matchedCategory": { $arrayElemAt: ["$items.matchedCategory", 0] }
      }
    },
    {
      $addFields: {
        "items.categoryCode": "$items.matchedCategory.categoryCode",
        "items.color": "$items.matchedCategory.color",
        "items.size": "$items.matchedCategory.size",
        "items.type": "$items.matchedCategory.type",
        "items.quality": "$items.matchedCategory.quality"
      }
    },
    ...(searchList.length > 0 ? [{ $match: { [filterField]: { $in: searchList } } }] : []),
    // Derive the Indian financial year (Apr -> Mar) for each order from its date,
    // so the report can show the real year even when no year filter is applied.
    {
      $addFields: {
        _fy: {
          $let: {
            vars: { m: { $month: "$createdAt" }, y: { $year: "$createdAt" } },
            in: {
              $cond: [
                { $gte: ["$$m", 4] },
                { $concat: [{ $toString: "$$y" }, "-", { $toString: { $add: ["$$y", 1] } }] },
                { $concat: [{ $toString: { $subtract: ["$$y", 1] } }, "-", { $toString: "$$y" }] },
              ],
            },
          },
        },
      },
    },
    {
      $facet: {
        articleSummary: [
          {
            $group: {
              _id: reportGroupField, // ✅ Now groups by category or article based on type
              totalQuantitySold: { $sum: "$items.quantity" },
              totalOrders: { $sum: 1 },
            },
          },
          { $sort: { totalQuantitySold: -1 } },
          {
            $addFields: {
              ...(financialYear && { financialYear }),
              ...(fyMonth && { month: fyMonth }),
              ...(q && { quarter: q }),
            },
          },
        ],
        colorSizeSummary: [
          {
            $group: {
              // ✅ FIX 2: group by categoryCode or article based on type
              _id: {
                articleOrCategory: type === "category" ? "$items.categoryCode" : "$items.article",
                color: "$items.color",
                size: "$items.size",
              },
              totalQuantitySold: { $sum: "$items.quantity" },
            },
          },
          {
            $project: {
              _id: 0,
              articleOrCategory: "$_id.articleOrCategory", // ✅ FIX 3: matches new _id key
              color: "$_id.color",
              size: "$_id.size",
              totalQuantitySold: 1,
              ...(financialYear && { financialYear }),
            },
          },
          { $sort: { articleOrCategory: 1, color: 1, size: 1 } },
        ],
        cumulativeTotalByArticle: [
          {
            $group: {
              _id: type === "category" ? "$items.categoryCode" : reportGroupField,
              grandTotalQuantity: { $sum: "$items.quantity" },
              categoryCode: { $first: "$items.categoryCode" },
              totalOrderLines: { $sum: 1 },
              financialYears: { $addToSet: "$_fy" },
            },
          },
          {
            $project: {
              _id: 0,
              categoryCode: 1,
              articleOrCategory: "$_id",
              grandTotalQuantity: 1,
              totalOrderLines: 1,
              // Real financial year(s) for this row, e.g. "2025-2026" or
              // "2024-2025, 2025-2026" when it spans years (All Years view).
              financialYear: {
                $reduce: {
                  input: "$financialYears",
                  initialValue: "",
                  in: {
                    $cond: [
                      { $eq: ["$$value", ""] },
                      "$$this",
                      { $concat: ["$$value", ", ", "$$this"] },
                    ],
                  },
                },
              },
            },
          },
        ],
        TallyTotal: [
          { $group: { _id: null, total: { $sum: "$items.quantity" } } },
          { $project: { _id: 0, totalSales: "$total" } },
        ],
      },
    },
  ];

  // Logic for Monthly/Yearly iterations
  for (const fyMonth of monthList) {
    let fromDate = null, toDate = null;
    if (fyMonth && financialYear) {
      let calendarMonth = fyMonth <= 9 ? fyMonth + 3 : fyMonth - 9;
      let year = fyMonth <= 9 ? startYear : endYear;
      fromDate = new Date(year, calendarMonth - 1, 1);
      toDate = new Date(year, calendarMonth, 0, 23, 59, 59, 999);
    }
    let match = { ...matchBase };
    if (fromDate && toDate) match.createdAt = { $gte: fromDate, $lte: toDate };
    if (searchList.length > 0) match[filterField] = { $in: searchList };

    pipelines.push(buildPipeline(match, fyMonth));
  }

  // Logic for Quarterly iterations
  for (const q of quarterList) {
    const months = quarterToMonths[q];
    const fromYear = months[0] >= 4 ? startYear : endYear;
    const toYear = months[2] >= 4 ? startYear : endYear;
    const fromDate = new Date(fromYear, months[0] - 1, 1);
    const toDate = new Date(toYear, months[2], 0, 23, 59, 59, 999);

    let match = { ...matchBase, createdAt: { $gte: fromDate, $lte: toDate } };
    if (searchList.length > 0) match[filterField] = { $in: searchList };

    pipelines.push(buildPipeline(match, null, q));
  }

  return pipelines;
};