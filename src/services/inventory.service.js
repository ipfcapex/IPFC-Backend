
const { orderService } = require(".");
const mongoose = require("mongoose");
const { Production } = require("../models");

const { Stock } = require("../models");
const { Order } = require("../models");
const { User } = require("../models");
const { Product } = require("../models");
const { sendNotification } = require("./notificationService");

exports.getAllStockQuantities = async () => {
  try {
    // Service to get total available quantity for each unique combination of article + category info
    const stockData = await Stock.aggregate([
      // Breaks each element in the 'stockdata' array into individual documents
      { $unwind: "$stockdata" },
      { $match: { "stockdata.productId": { $ne: null } } },
      {
        // Group by the product + category combination ids
        $group: {
          _id: {
            productId: "$stockdata.productId",
            categoryId: "$stockdata.categoryId"
          },
          availableQuantity: { $sum: "$stockdata.quantity" }
        }
      }
    ]);

    // Resolve article/category details from Product for display
    const ids = [
      ...new Set(stockData.map(s => s._id.productId && String(s._id.productId)).filter(Boolean)),
    ];
    const products = await Product.find({ _id: { $in: ids } }).select("article category");
    const pmap = {};
    products.forEach(p => { pmap[String(p._id)] = p; });

    return stockData.map(s => {
      const prod = pmap[String(s._id.productId)];
      const cat = prod?.category?.find(c => String(c._id) === String(s._id.categoryId));
      return {
        productId: s._id.productId,
        categoryId: s._id.categoryId,
        article: prod?.article,
        categoryCode: cat?.categoryCode,
        color: cat?.color,
        size: cat?.size,
        type: Array.isArray(cat?.type) ? cat.type[0] : cat?.type,
        quality: Array.isArray(cat?.quality) ? cat.quality[0] : cat?.quality,
        availableQuantity: s.availableQuantity
      };
    });
  } catch (error) {
    console.error("Error aggregating stock:", error);
    return { success: false, error: "Error fetching stock data" };
  }
};

// exports.verifyStockAndApprove = async (req, res) => {
//   try {
//     const { id } = req.params; // Order ID
//     const note = req.body.notes;
//     const approvalStatus = req.body.approvalStatus;

//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({ success: false, message: "Invalid order ID" });
//     }

//     const order = await Order.findById(id).populate("items.article");
//     if (!order) {
//       throw new Error("Order not found");
//     }

//     // ✅ Pre-checks
//     if (order.accountSectionApproval === "REJECTED") {
//       return res.status(400).json({
//         success: false,
//         message: "Order already rejected by accounts section",
//       });
//     }
//     if (
//       order.accountSectionApproval === "PENDING" ||
//       order.accountSectionApproval === "Pending"
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Need first approval from Account Manager",
//       });
//     }

//     let fulfillmentPlan = [];
//     let factoryFallback = [];

//     // ✅ Process each item in the order
//     for (const item of order.items) {
//       let neededQty = item.quantity;

//       // 🔹 Fetch warehouse stock for this article
//       const stockEntries = await Stock.find({
//         "stockdata.article": item.article,
//         isActive: true,
//       }).populate("warehouse", "name");
//       console.log("stockEntres",stockEntries);


//       // 🔹 Convert and sort by available stock (descending)
//       const sortedStocks = stockEntries
//         .map((stock) => {
//           const stockItem = stock.stockdata.find((s) => s.article === item.article);
//           return stockItem
//             ? {
//                 stockId: stock._id,
//                 warehouseId: stock.warehouse._id,
//                 warehouseName: stock.warehouse.name,
//                 warehouseName: stock.warehouse.name,
//                 article: item.article,
//                 available: stockItem.quantity,
//               }
//             : null;
//         })
//         .filter(Boolean)
//         .sort((a, b) => b.available - a.available);

//       let allocation = [];

//       // 🔹 Case 1: Single warehouse can fulfill entire qty
//       const singleWarehouse = sortedStocks.find((s) => s.available >= neededQty);
//       if (singleWarehouse) {
//         allocation.push({
//           ...singleWarehouse,
//           allocatedQty: neededQty,
//           needed: item.quantity,
//         });
//         neededQty = 0;
//       } else {
//         // 🔹 Case 2: Split across warehouses
//         for (const stock of sortedStocks) {
//           if (neededQty <= 0) break;
//           const takeQty = Math.min(stock.available, neededQty);
//           if (takeQty > 0) {
//             allocation.push({
//               ...stock,
//               allocatedQty: takeQty,
//               needed: item.quantity,
//             });
//             neededQty -= takeQty;
//           }
//         }
//       }

//       // 🔹 Case 3: Still short → notify admin (check factories)
//       if (neededQty > 0) {
//         const factories = await Production.find({
//           article: item.article,
//         }).populate("factory", "name");

//         factoryFallback.push({
//           article: item.article,
//           shortBy: neededQty,
//           message: `Insufficient in warehouses. Please transfer from factories.`,
//           factories: factories.map((f) => ({
//             factoryId: f.factory._id,
//             factoryName: f.factory.name,
//             available:
//               f.quantity || 0, // assuming Production has `quantity`
//           })),
//         });
//       }

//       fulfillmentPlan = fulfillmentPlan.concat(allocation);
//     }

//     // ✅ Add Inventory Manager note
//     const newNote = {
//       text: note,
//       by: "INVENTORY_MANAGER",
//     };
//     order.inventoryManagerApproval = approvalStatus;
//     order.note[1] = newNote;
//     await order.save();

//     // ✅ Notifications
//     if (order.inventoryManagerApproval === "APPROVED") {
//        if (factoryFallback.length > 0) {
//       // Build dynamic message
//       let factoryMessages = factoryFallback.map(fallback => {
//         const factoriesInfo = fallback.factories
//           .map(f => `${f.factoryName} (Available: ${f.available})`)
//           .join(", ");
//         return `Article ${fallback.article}: Short by ${fallback.shortBy}. Factories: ${factoriesInfo}`;
//       }).join(" | ");

//       // Administrator notification: Need stock from factory to warehouse
//       sendNotification("adminFactoryRequest", {
//         message: `Some stock must be transferred from factories to warehouses before dispatch. Details: ${factoryMessages}`,
//         data: factoryFallback,
//       });
//       // if (factoryFallback.length > 0) {
//       //   //Administrator notification Need stock from factory to warehouse
//       //   sendNotification("adminFactoryRequest", {
//       //     message: `Some stock must be transferred from ${factoryFallback.factories.factoryName}factories to warehouses before dispatch.`,
//       //     data: factoryFallback,
//       //   });
//       } else {
//         //Fullfill items Warehouse manager notification
//         sendNotification("warehouseFulfillment", {
//           message: `Order ${order._id} approved. Fulfill from these warehouses:`,
//           data: fulfillmentPlan,
//         });
//       }
//     } else {
//       //Order Rejected Notification Sales person
//       sendNotification("inventoryRejected", {
//         message: `Order ${order._id} rejected, please review.`,
//         data: order,
//       });
//     }

//     res.json({
//       success: true,
//       data: order,
//       fulfillmentPlan,
//       factoryFallback,
//       message: `Order ${order.inventoryManagerApproval}`,
//     });
//   } catch (err) {
//     console.error("verifyStockAndApprove Error:", err.message);
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.getStockByWarehouseAndFactory = async (page = 1, limit = 10, search = "") => {
  const stockData = await Stock.find()
    .populate("factory")
    .populate("warehouse")
    .populate({
      path: "stockdata.productId",
      model: "Product"
    });

  const productionData = await Production.find()
    .populate("factory")
    .populate({
      path: "productId",
      model: "Product"
    });

  // Map warehouse stock
  const stockList = stockData.map(s => {
    const firstStockItem = s.stockdata?.[0];
    const product = firstStockItem?.productId;
    
    let category = null;
    if (product && Array.isArray(product.category) && firstStockItem?.categoryId) {
      category = product.category.find(
        (c) => c._id.toString() === firstStockItem.categoryId.toString()
      );
    }

    return {
      article: product?.article || "N/A",
      categoryCode: category?.categoryCode || "N/A",
      color: category?.color || "N/A",
      size: category?.size || "N/A",
      type: category?.type || "N/A",
      quality: category?.quality || "N/A",
      factory: s.factory?.name || "N/A",
      warehouse: s.warehouse?.name || "N/A",
      stockAtFactory: 0,
      stockAtWarehouse:
        s.dispatchStock != null && s.dispatchStock !== undefined
          ? Math.max(s.toatalQuantity - s.dispatchStock, 0)
          : s.toatalQuantity || 0,
    };
  });

  // Map factory stock
  const productionList = productionData.map(p => {
    const product = p.productId;
    let category = null;
    if (product && Array.isArray(product.category) && p.categoryId) {
      category = product.category.find(
        (c) => c._id.toString() === p.categoryId.toString()
      );
    }

    return {
      article: product?.article || p.article || "N/A",
      categoryCode: category?.categoryCode || "N/A",
      color: category?.color || "N/A",
      size: category?.size || "N/A",
      type: category?.type || "N/A",
      quality: category?.quality || "N/A",
      factory: p.factory?.name || "N/A",
      warehouse: "N/A",
      stockAtFactory:
        p.dispatchedQuantity != null && p.dispatchedQuantity !== undefined
          ? Math.max(p.stockinQuantity - p.dispatchedQuantity, 0)
          : p.stockinQuantity,
      stockAtWarehouse: 0,
    };
  });

  // ✅ Merge both lists
  const mergedMap = {};

  [...stockList, ...productionList].forEach(item => {
    const key = `${item.article}_${item.factory}_${item.warehouse}`;
    if (!mergedMap[key]) {
      mergedMap[key] = {
        article: item.article,
        categoryCode: item.categoryCode,
        color: item.color,
        size: item.size,
        type: item.type,
        quality: item.quality,
        factory: item.factory,
        stockAtFactory: 0,
        warehouse: item.warehouse,
        stockAtWarehouse: 0,
        totalQuantity: 0,
      };
    }

    mergedMap[key].stockAtFactory += item.stockAtFactory;
    mergedMap[key].stockAtWarehouse += item.stockAtWarehouse;
    mergedMap[key].totalQuantity = mergedMap[key].stockAtFactory + mergedMap[key].stockAtWarehouse;
  });

  let finalList = Object.values(mergedMap).filter(
    item => item.totalQuantity > 0
  );

  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");
    finalList = finalList.filter(item =>
      regex.test(item.article || "") ||
      regex.test(item.factory || "") ||
      regex.test(item.warehouse || "")
    );
  }


  // Pagination
  const total = finalList.length;
  const start = (page - 1) * limit;
  const paginatedData = finalList.slice(start, start + limit);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    data: paginatedData,
  };
};

exports.assignStockToWarehouse = async (id, data) => {
  console.log("ID received:", id, typeof id);
  const {
    salesorderNO,
    customer,
    notes,
    inventoryManagerApproval,
    items,
  } = data;
  const orderId = id._id || id;
 let notifications = []
  //Find order and populate warehouse info for response
  let order = await Order.findById(orderId).populate({
    path: "items.warehouses.warehouse",
    select: "name location",
  });

  if (!order) throw new Error("Order not found");

  //a Check accountSectionApproval
  if (!order.accountSectionApproval || !["APPROVED", "Approved"].includes(order.accountSectionApproval)) {
    throw new Error("Cannot approve/reject. Account Section approval is not yet approved.");
  }

  //Validate sales order number and customer
  if (order.salesOrderNo !== salesorderNO || order.customer.toString() !== customer.toString()) {
    throw new Error("Sales Order Number or Customer does not match.");
  }

  //Reject flow
  if (inventoryManagerApproval === "REJECTED") {
    order.inventoryManagerApproval = "REJECTED";
    order.note = { message: notes || "Rejected by Inventory Manager", createdAt: new Date() };
    await order.save();

    // Populate warehouse again for consistent response
    order = await Order.findById(id).populate({
      path: "items.warehouses.warehouse",
      select: "name location",
    });
    // Notify Reject
    const notification = {
  message: `Order ${order.salesOrderNo} rejected, please review.`,
  data: order
};

// Send notification
sendNotification("inventoryRejected", notification);

    // Re-populate warehouse names for response
    order = await Order.findById(id).populate({
      path: "items.warehouses.warehouse",
      select: "name location",
    });

    return { order, notification};
  }

  //Approve flow
  if (inventoryManagerApproval === "APPROVED") {
    if (!items || items.length === 0) {
      throw new Error("Warehouse assignment is required for approval.");
    }

    // Validate required fields for each item
    items.forEach((item, index) => {
      const requiredFields = [
        "article",
        "quantity",
        "quality",
        "type",
        "size",
        "color",
        "categoryCode",
        "warehouses",
      ];

      requiredFields.forEach((field) => {
        if (item[field] === undefined || item[field] === null) {
          throw new Error(`Item ${index} missing required field: ${field}`);
        }
      });

      // Validate total warehouse quantity
      const totalWarehouseQty = item.warehouses.reduce((sum, w) => sum + w.quantity, 0);
      if (totalWarehouseQty !== item.quantity) {
        throw new Error(
          `Please fill warehouse Detail, Mismatch in quantities for article ${item.article}. Total warehouses qty = ${totalWarehouseQty}, required = ${item.quantity}`
        );
      }
    });

    // Resolve and assign productId & categoryId for each item before saving
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const productRecord = await Product.findOne({
        article: item.article,
        "category.categoryCode": item.categoryCode,
        "category.color": { $regex: new RegExp(`^${item.color}$`, "i") },
        "category.size": { $regex: new RegExp(`^${item.size}$`, "i") },
      });

      let matchedCategoryId = null;
      let dbarticleocode = null;
      let imageUrl = null;
      if (productRecord && productRecord.category?.length > 0) {
        const matchedCategory = productRecord.category.find(cat =>
          cat.categoryCode === item.categoryCode &&
          cat.color.toLowerCase() === item.color.toLowerCase() &&
          cat.size.toLowerCase() === item.size.toLowerCase()
        );

        if (matchedCategory) {
          imageUrl = matchedCategory.image?.[0] || null;
          dbarticleocode = matchedCategory.articleCode;
          matchedCategoryId = matchedCategory._id;
        }
      }

      item.productId = productRecord?._id || item.productId;
      item.categoryId = matchedCategoryId || item.categoryId;
      if (dbarticleocode) item.articleCode = dbarticleocode;
      if (imageUrl && (!item.image || item.image.length === 0)) {
        item.image = [imageUrl];
      }
    }

    // Save order with warehouse assignment
    order.items = items;
    order.inventoryManagerApproval = "APPROVED";
    order.note = { message: notes || "Approved by Inventory Manager", createdAt: new Date() };
    await order.save();

    // Send notifications to warehouse managers
    //   const warehouseMap = {};
    //   items.forEach((item) => {
    //     item.warehouses.forEach((w) => {
    //       if (!warehouseMap[w.warehouse]) warehouseMap[w.warehouse] = [];
    //       warehouseMap[w.warehouse].push({ article: item.article, quantity: w.quantity });
    //     });
    //   });

    //   await notifications.Promise.all(
    //     Object.keys(warehouseMap).map(async (warehouseId) => {
    //       const manager = await User.findOne({ warehouseId, role: "WarehouseManager" });
    //       if (!manager) return;
    //       console.log("manager", manager)
    //       const products = warehouseMap[warehouseId]
    //         .map((p) => `Article ${p.article}, Qty: ${p.quantity}`)
    //         .join("; ");
    //         console.log("manager",manager)
    //         console.log("products",products)
    //       if(manager && products){
    //       sendNotification({
    //         // userId: manager._id,
    //         message: `Order ${order.salesOrderNo} has been approved. Assigned products: ${products}`,
    //         type: "ORDER_ASSIGNMENT",
    //       });
    //       }
    //     })
    //   );

    //   // Re-populate warehouse names for response
    //   order = await Order.findById(id).populate({
    //     path: "items.warehouses.warehouse",
    //     select: "name location",
    //   });

    //   return { order, notifications };
    // }



    // array to hold notifications
    const warehouseMap = {};
    items.forEach((item) => {
      item.warehouses.forEach((w) => {
        const wid = w.warehouse._id ? w.warehouse._id.toString() : w.warehouse.toString();
        if (!warehouseMap[wid]) warehouseMap[wid] = [];
        warehouseMap[wid].push({
          article: item.article,
          quantity: w.quantity,
        });
      });
    });

    let notifications = [];

    // Just create notifications for each warehouse
    Object.keys(warehouseMap).forEach((warehouseId) => {
      const products = warehouseMap[warehouseId]
        .map((p) => `Article ${p.article}, Qty: ${p.quantity}`)
        .join("; ");

      const notification = {
        warehouseId,
        message: `Order ${order.salesOrderNo} has been approved. Assigned products: ${products}`,
        type: "warehouseFulfillment",
      };
      
      sendNotification(`warehouseFulfillment:${warehouseId}`,notification);
      console.log("Notify", notification) 
      notifications.push(notification); 
    });

    // Re-populate warehouse names for response
    order = await Order.findById(id).populate({
      path: "items.warehouses.warehouse",
      select: "name location",
    });

    return { order, notifications };
  }

  // 6️⃣ Default → pending
  order.inventoryManagerApproval = "PENDING";
  order.note = { message: notes || "Pending inventory approval", createdAt: new Date() };
  await order.save();

  // Re-populate warehouse names for response
  order = await Order.findById(id).populate({
    path: "items.warehouses.warehouse",
    select: "name location",
  });

  return { order, notifications };
};

exports.getStockByWarehouseAndFactory2 = async (page = 1, limit = 5, search = "") => {
  const stockData = await Stock.find()
    .populate("factory")
    .populate("warehouse")
    .populate({
      path: "stockdata.productId",
      model: "Product"
    });

  const productionData = await Production.find()
    .populate("factory")
    .populate({
      path: "productId",
      model: "Product"
    });

  // Map warehouse stock
  const stockList = stockData.map(s => {
    const firstStockItem = s.stockdata?.[0];
    const product = firstStockItem?.productId;
    
    let category = null;
    if (product && Array.isArray(product.category) && firstStockItem?.categoryId) {
      category = product.category.find(
        (c) => c._id.toString() === firstStockItem.categoryId.toString()
      );
    }

    return {
      article: product?.article || "N/A",
      categoryCode: category?.categoryCode || "N/A",
      color: category?.color || "N/A",
      size: category?.size || "N/A",
      type: category?.type || "N/A",
      quality: category?.quality || "N/A",
      factory: s.factory?.name || "N/A",
      warehouse: s.warehouse?.name || "N/A",
      stockAtFactory: 0,
      stockAtWarehouse:
        s.dispatchStock != null && s.dispatchStock !== undefined
          ? Math.max(s.toatalQuantity - s.dispatchStock, 0)
          : s.toatalQuantity || 0,
    };
  });

  // Map factory stock
  const productionList = productionData.map(p => {
    const product = p.productId;
    let category = null;
    if (product && Array.isArray(product.category) && p.categoryId) {
      category = product.category.find(
        (c) => c._id.toString() === p.categoryId.toString()
      );
    }

    return {
      article: product?.article || p.article || "N/A",
      categoryCode: category?.categoryCode || "N/A",
      color: category?.color || "N/A",
      size: category?.size || "N/A",
      type: category?.type || "N/A",
      quality: category?.quality || "N/A",
      factory: p.factory?.name || "N/A",
      warehouse: "N/A",
      stockAtFactory:
        p.dispatchedQuantity != null && p.dispatchedQuantity !== undefined
          ? Math.max(p.stockinQuantity - p.dispatchedQuantity, 0)
          : p.stockinQuantity,
      stockAtWarehouse: 0,
    };
  });

  // ✅ Merge both lists
  const mergedMap = {};
  [...stockList, ...productionList].forEach(item => {
    const key = `${item.article}_${item.factory}_${item.warehouse}`;
    if (!mergedMap[key]) {
      mergedMap[key] = {
        article: item.article,
        categoryCode: item.categoryCode,
        color: item.color,
        size: item.size,
        type: item.type,
        quality: item.quality,
        factory: item.factory,
        stockAtFactory: 0,
        warehouse: item.warehouse,
        stockAtWarehouse: 0,
        totalQuantity: 0,
      };
    }

    mergedMap[key].stockAtFactory += item.stockAtFactory;
    mergedMap[key].stockAtWarehouse += item.stockAtWarehouse;
    mergedMap[key].totalQuantity =
      mergedMap[key].stockAtFactory + mergedMap[key].stockAtWarehouse;
  });

  let finalList = Object.values(mergedMap).filter(
    item => item.totalQuantity > 0
  );

  // 🔍 Apply regex search
  if (search) {
    const regex = new RegExp(search, "i"); // case-insensitive
    finalList = finalList.filter(
      item =>
        regex.test(item.article) ||
        regex.test(item.factory) ||
        regex.test(item.warehouse)
    );
  }

  // Pagination
  const total = finalList.length;
  const start = (page - 1) * limit;
  const paginatedData = finalList.slice(start, start + limit);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    data: paginatedData,
  };
};


