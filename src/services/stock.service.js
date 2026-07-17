const { Stock } = require("../models");
const { User } = require("../models");
const { Production } = require("../models");
const { Product } = require("../models");
const qrCodeModel = require("../models/qrCode.model");
const { decodeBase64Qr } = require("../utils/DecodeQR");
const { Warehouse } = require("../models");
const { SellOrder } = require("../models");
 const mongoose = require("mongoose");

// Main service function
// exports.createStockByQr = async (qrImage) => {
//   try {
//     let QrCode, qrData;

//     if (qrImage) {
//       try {
//         const Qrid = await qrCodeModel.findOne(
//           { "qrCodes.qrId": qrImage }, // Match inside array
//           { "qrCodes.$": 1, factory_name: 1 }
//         );

//         let qrString = Qrid.qrCodes[0].qrData;
//         qrData = await decodeBase64Qr(qrString);
//       } catch (decodeErr) {
//         throw new Error("Failed to decode QR image: " + decodeErr.message);
//       }
//     }

//     let parsedQr;
//     try {
//       parsedQr = typeof qrData === "string" ? JSON.parse(qrData) : qrData;
//     } catch (err) {
//       throw new Error("QR data is not valid JSON");
//     }

//     const { productionNo } = parsedQr;
//     if (!productionNo) throw new Error("Missing productionNo in QR");

//     const production = await Production.findOne({ productionNo }).populate(
//       "factory",
//       "name"
//     );
//     if (!production)
//       throw new Error(
//         "No matching Production found for productionNo: " + productionNo
//       );

//     const { article, factory } = production;
//     const qrCategory = parsedQr.category?.[0] || {};

//     // Check if production is dispatched from factory
//     const factoryStatus = await Production.findOne({
//       productionNo,
//       status: { $in: ["Dispatch from Factory", "Partially Dispatched"] },
//     });

//     if (!factoryStatus) {
//       throw new Error(
//         `Product is not dispatched from factory. Production No: ${production.productionNo}`
//       );
//     }

//     const quantity = qrCategory.quantity || 1;

//     // Check for duplicate QR scan
//     if (qrImage) {
//       const existingStockWithQr = await Stock.findOne({
//         "stockdata.qrData": qrImage,
//       });
//       if (existingStockWithQr) {
//         throw new Error(
//           "This QR image has already been scanned and added to stock."
//         );
//       }
//     }

//     let stockDoc = await Stock.findOne({
//       warehouse: parsedQr.warehouse,
//       stockdata: {
//         $elemMatch: {
//           article: article,
//           categoryCode: qrCategory.categoryCode,
//         },
//       },
//     });

//     if (stockDoc) {
//       // Update existing stock
//       stockDoc.stockdata.push({
//         article: article,
//         categoryCode: qrCategory.categoryCode,
//         color: qrCategory.color || "",
//         size: qrCategory.size || "",
//         type: qrCategory.type || "",
//         quality: qrCategory.quality || "",
//         quantity,
//         qrData: qrImage,
//         productionNo,
//       });

//       stockDoc.toatalQuantity = (stockDoc.toatalQuantity || 0) + quantity;

//       await stockDoc.save();

//       //populate names before returning
//       const populatedStock = await Stock.findById(stockDoc._id)
//         .populate("factory", "name")
//         .populate("warehouse", "name");

//       return populatedStock;
//     } else {
//       // Create new stock document
//       const newStock = await Stock.create({
//         factory,
//         warehouse: parsedQr.warehouse, //keep ObjectId
//         categoryCode: qrCategory.categoryCode,
//         toatalQuantity: quantity,
//         stockdata: [
//           {
//             article: article,
//             categoryCode: qrCategory.categoryCode,
//             color: qrCategory.color || "",
//             size: qrCategory.size || "",
//             type: qrCategory.type || "",
//             quality: qrCategory.quality || "",
//             quantity,
//             qrData: qrImage,
//             productionNo,
//           },
//         ],
//       });

//       await Warehouse.findByIdAndUpdate(
//         parsedQr.warehouse,
//         { $inc: { totalstock: quantity } },
//         { new: true }
//       );

//       // ✅ populate names before returning
//       const populatedStock = await Stock.findById(newStock._id)
//         .populate("factory", "name")
//         .populate("warehouse", "name");

//       return populatedStock;
//     }
//   } catch (error) {
//     console.error("Error in createStockByQr service:", error);
//     throw new Error(
//       error.message || "Something went wrong while creating stock"
//     );
//   }
// };

exports.createStockByQr = async (qrImage) => {
  try {
    if (!qrImage) throw new Error("QR image or QR ID is required");

    // 1️⃣ Fetch the QR document and decode QR data
    const qrDoc = await qrCodeModel.findOne(
      { "qrCodes.qrId": qrImage },
      { "qrCodes.$": 1, factory_name: 1 }
    );

    if (!qrDoc) throw new Error("QR not found in the database");

    if (qrDoc.qrCodes[0].warehouseinScan === true) {
      throw new Error("This QR has already been scanned for warehouse incoming stock.");
    }

    const qrString = qrDoc.qrCodes[0].qrData;
    const qrData = await decodeBase64Qr(qrString);

    let parsedQr;
    try {
      parsedQr = typeof qrData === "string" ? JSON.parse(qrData) : qrData;
    } catch {
      throw new Error("QR data is not valid JSON");
    }

    const { productionNo, warehouse } = parsedQr;
    if (!productionNo) throw new Error("Missing productionNo in QR");

    // 2️⃣ Fetch production record
    const production = await Production.findOne({ productionNo }).populate(
      "factory",
      "name"
    );

    if (!production)
      throw new Error(`No matching Production found for productionNo: ${productionNo}`);

    const { factory } = production;
    const quantity = parsedQr.quantity || 1;

    // 3️⃣ Check if product is dispatched from factory
    const factoryStatus = await Production.findOne({
      productionNo,
      status: { $in: ["Dispatch from Factory", "Partially Dispatched"] },
    });

    if (!factoryStatus)
      throw new Error(
        `Product is not dispatched from factory. Production No: ${production.productionNo}`
      );

    // 4️⃣ Check if QR has already been scanned
    const existingStockWithQr = await Stock.findOne({
      "stockdata.qrData": qrImage,
    });
    if (existingStockWithQr)
      throw new Error("This QR image has already been scanned and added to stock.");

    // Mark warehouseinScan as true in the QR document
    await qrCodeModel.updateOne(
      { "qrCodes.qrId": qrImage },
      { $set: { "qrCodes.$.warehouseinScan": true } }
    );

    // 5️⃣ Check if stock for this warehouse + product/category exists
    let stockDoc = await Stock.findOne({
      warehouse,
      stockdata: {
        $elemMatch: {
          productId: production.productId,
          categoryId: production.categoryId,
        },
      },
    });

    if (stockDoc) {
      // Update existing stock
      stockDoc.stockdata.push({
        productId: production.productId,
        categoryId: production.categoryId,
        quantity,
        qrData: qrImage,
        productionNo,
      });

      stockDoc.toatalQuantity = (stockDoc.toatalQuantity || 0) + quantity;
      await stockDoc.save();
    } else {
      // Create new stock document
      stockDoc = await Stock.create({
        factory,
        warehouse,
        toatalQuantity: quantity,
        stockdata: [
          {
            productId: production.productId,
            categoryId: production.categoryId,
            quantity,
            qrData: qrImage,
            productionNo,
          },
        ],
      });
    }

    // 6️⃣ Increment warehouse total stock
    await Warehouse.findByIdAndUpdate(
      warehouse,
      { $inc: { totalstock: quantity } },
      { new: true }
    );

    // 7️⃣ Populate factory and warehouse names before returning
    const populatedStock = await Stock.findById(stockDoc._id)
      .populate("factory", "name")
      .populate("warehouse", "name")
      .populate({
         path: "stockdata.productId",
         select: "article category"
      });

    const stockObj = populatedStock.toObject();
    if (stockObj.stockdata && Array.isArray(stockObj.stockdata)) {
      stockObj.stockdata = stockObj.stockdata.map((item) => {
        const product = item.productId;
        let matchedCategory = null;
        if (product && Array.isArray(product.category) && item.categoryId) {
          matchedCategory = product.category.find(
            (c) => c._id.toString() === item.categoryId.toString()
          );
        }
        return {
          ...item,
          productId: product ? product._id : item.productId,
          article: product ? product.article : null,
          categoryCode: matchedCategory ? matchedCategory.categoryCode : null,
          color: matchedCategory ? matchedCategory.color : null,
          size: matchedCategory ? matchedCategory.size : null,
          type: matchedCategory ? (Array.isArray(matchedCategory.type) ? matchedCategory.type[0] : matchedCategory.type) : null,
          quality: matchedCategory ? (Array.isArray(matchedCategory.quality) ? matchedCategory.quality[0] : matchedCategory.quality) : null,
        };
      });
    }

    return stockObj;
  } catch (error) {
    console.error("Error in createStockByQr service:", error);
    throw new Error(error.message || "Something went wrong while creating stock");
  }
};

//Get all stock with filters and pagination
exports.getAllStock = async ({ page = 1, limit = 10, ...filters }) => {
  const skip = (page - 1) * limit;
  console.log("Filters applied:", filters);
  const query = {
    isActive: { $ne: false },
  };
  if (filters.warehouse) query.warehouse = filters.warehouse;
  if (filters.factory) query.factory = filters.factory;
  if (filters.productionNo) query.productionNo = filters.productionNo;

  const [stockData, totalItems] = await Promise.all([
    Stock.find(query)
      .populate("warehouse", "name")
      .populate("factory", "name")
      .skip(skip),
    Stock.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalItems / limit);
  const formatted = stockData.map((s) => ({
    _id: s._id,
    warehouse: s.warehouse,
    factory: s.factory,
    totalQuantity: s.toatalQuantity || 0,
    dispatchStock: s.dispatchStock || 0,
    availableQuantity: (s.toatalQuantity || 0) - (s.dispatchStock || 0),
    stockdata: s.stockdata,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
  return {
    success: true,
    stock: formatted,
    pagination: {
      currentPage: Number(page),
      totalPages,
      totalItems,
    },
  };
};

exports.getStockById = async (id) => {
  const query = {
    _id: id, //Use _id, not id
    isActive: { $ne: false }, // Exclude inactive records
  };

  return await Stock.findOne(query)
    .populate("warehouse", "name")
    .populate("factory", "name");
};

//Get warehouse stock 
exports.getAllStockss = async ({ page = 1, limit = 10, search = "", ...filters }) => {
  const skip = (page - 1) * limit;

  // Build query
  const query = { isActive: { $ne: false } };
  if (filters.warehouse) query.warehouse = filters.warehouse;
  if (filters.factory) query.factory = filters.factory;

  // Apply search on productionNo inside stockdata
  if (search) {
    query["stockdata.productionNo"] = { $regex: search, $options: "i" };
  }

  // Fetch data from DB
  const stockData = await Stock.find(query)
    .populate("warehouse", "name")
    .populate("factory", "name")
    .sort({ updatedAt: -1 });

  // Group by productionNo
  const groupedItems = {};

  stockData.forEach(item => {
    const stock = Array.isArray(item.stockdata) ? item.stockdata[0] : item.stockdata;
    if (!stock) return;

    const prodNo = stock.productionNo || "undefined";

    // Initialize
    if (!groupedItems[prodNo]) {
      groupedItems[prodNo] = {
        productionNo: prodNo,
        productId: stock.productId,
        categoryId: stock.categoryId,
        article: null,
        categoryCode: null,
        size: null,
        type: null,
        color: null,
        quality: null,
        factory: item.factory,
        warehouseData: []
      };
    }

    // Add warehouse info
    groupedItems[prodNo].warehouseData.push({
      warehouseId: item.warehouse?._id || null,
      warehouseName: item.warehouse?.name || "Unknown",
      availableQuantity: Math.max((item.toatalQuantity || 0) - (item.dispatchStock || 0), 0)
    });
  });

  // Convert to array for pagination
  const allItemsArray = Object.values(groupedItems);

  // Resolve article/category details from Product for display
  const productIds = [
    ...new Set(allItemsArray.map(g => g.productId && String(g.productId)).filter(Boolean)),
  ];
  const products = await Product.find({ _id: { $in: productIds } }).select("article category");
  const productMap = {};
  products.forEach(p => { productMap[String(p._id)] = p; });
  allItemsArray.forEach(g => {
    const prod = productMap[String(g.productId)];
    const cat = prod?.category?.find(c => String(c._id) === String(g.categoryId));
    g.article = prod?.article;
    g.categoryCode = cat?.categoryCode;
    g.color = cat?.color;
    g.size = cat?.size;
    g.type = Array.isArray(cat?.type) ? cat.type[0] : cat?.type;
    g.quality = Array.isArray(cat?.quality) ? cat.quality[0] : cat?.quality;
  });

  const totalItems = allItemsArray.length;
  const totalPages = Math.ceil(totalItems / limit);
  const paginatedItems = allItemsArray.slice(skip, skip + limit);

  return {
    success: true,
    items: paginatedItems,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems
    }
  };
};

exports.updateStock = async (id, data) => {
  if (data.quantity !== undefined) {
    if (!Number.isInteger(data.quantity) || data.quantity < 0) {
      throw new Error("Invalid quantity: must be a non-negative integer");
    }
  }

  const updated = await Stock.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true, // <-- this ensures Mongoose validations run
  });

  return updated;
};

exports.softDeleteStock = async (id) => {
  return await Stock.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
};

//QR code scanning and dispatching
exports.scanAndDispatch = async (req) => {
  const { qrData, ordNumScanFor } = req.body;

  // ✅ Identify the logged-in warehouse manager from the access token and load
  // their assigned warehouses (scanning is only allowed for those warehouses).
  const managerId = req.user?.id || req.user?._id;
  if (!managerId) {
    throw new Error("Unauthorized: warehouse manager not identified");
  }
  const manager = await User.findById(managerId).select("warehouses role name");
  if (!manager) {
    throw new Error("Warehouse manager not found");
  }
  const managerWarehouseIds = (manager.warehouses || []).map((w) =>
    w.toString()
  );

  // ✅ Populate factory & warehouse to get their names
  const stock = await Stock.findOne({
    "stockdata.qrData": qrData,
  })
    .populate("factory", "name")
    .populate("warehouse", "name");

  if (!stock) {
    throw new Error("QR code invalid or already dispatched");
  }

  // Locate stock item that is not yet dispatched
  const stockItem = stock.stockdata.find(
    (s) => s.qrData === qrData && s.dispatched === false
  );

  if (!stockItem) {
    throw new Error("Stock item already dispatched");
  }

  // ✅ The warehouse this QR's stock belongs to must be assigned to the manager
  const stockWarehouseId = (stock.warehouse?._id || stock.warehouse)?.toString();
  if (!stockWarehouseId) {
    throw new Error("This stock is not linked to any warehouse.");
  }
  if (!managerWarehouseIds.includes(stockWarehouseId)) {
    throw new Error(
      "You are not assigned to the warehouse this stock belongs to."
    );
  }

  // ✅ Find the order this scan is for
  const order = await SellOrder.findOne({ salesOrderNo: ordNumScanFor });
  if (!order) {
    throw new Error(`Order ${ordNumScanFor} not found`);
  }

  // ✅ Locate the order item + its allocation for THIS warehouse that still has
  // remaining quantity to dispatch (scanqtyatdispatch < quantity). Multiple
  // items can share an article, so we pick the next allocation with capacity.
  let productMatched = false;
  let warehouseAllocated = false;
  let targetItem = null;
  let targetWh = null;

  for (const it of order.items) {
    if (
      String(it.productId) !== String(stockItem.productId) ||
      String(it.categoryId) !== String(stockItem.categoryId)
    )
      continue;

    productMatched = true;

    const allocation = (it.warehouses || []).find(
      (w) => w.warehouse?.toString() === stockWarehouseId
    );

    if (allocation) {
      warehouseAllocated = true;
      if ((Number(allocation.scanqtyatdispatch) || 0) < (Number(allocation.quantity) || 0)) {
        targetItem = it;
        targetWh = allocation;
        break;
      }
    }
  }

  if (!productMatched) {
    throw new Error(
      `Product variation is not part of order ${ordNumScanFor}.`
    );
  }

  if (!warehouseAllocated) {
    throw new Error(
      `This product variation is not allocated to this warehouse (${stock.warehouse?.name || "unknown"}) for order ${ordNumScanFor}.`
    );
  }

  if (!targetItem || !targetWh) {
    throw new Error(
      `All allocated units for this product in this warehouse (${stock.warehouse?.name || "unknown"}) are already dispatched for order ${ordNumScanFor}.`
    );
  }

  // ✅ Mark item as dispatched
  const scannedAt = new Date();
  stockItem.dispatched = true;
  stock.dispatchStock += 1;
  stockItem.dispatchAt = scannedAt;
  stockItem.ordNumScanFor = ordNumScanFor;

  await stock.save();

  // ✅ Record which order this QR was scanned for, and when, on the QR doc
  await qrCodeModel.updateOne(
    { "qrCodes.qrId": stockItem.qrId },
    {
      $set: {
        "qrCodes.$.ordNumScanFor": ordNumScanFor,
        "qrCodes.$.lastScanAt": scannedAt,
        "qrCodes.$.warehouseDispatch": true,
      },
    }
  );

  // ✅ One QR scanned = +1 to this warehouse allocation, capped at its quantity.
  // When it reaches the allocated quantity, that allocation is fully SCANNED.
  targetWh.scanqtyatdispatch = (Number(targetWh.scanqtyatdispatch) || 0) + 1;
  if (targetWh.scanqtyatdispatch >= targetWh.quantity) {
    targetWh.scanqtyatdispatch = targetWh.quantity;
    targetWh.ScanByorder = "SCANNED";
  }

  // Keep per-item and per-order dispatched aggregates in sync (+1 per scan)
  targetItem.numOfDispatchedQty = (Number(targetItem.numOfDispatchedQty) || 0) + 1;
  order.numOfDispatchedQty = (Number(order.numOfDispatchedQty) || 0) + 1;

  // Overall scanned status: all allocations across all items must be SCANNED
  const allScanned = order.items.every((it) =>
    (it.warehouses || []).every((w) => w.ScanByorder === "SCANNED")
  );
  order.ScannedByWarehouseManager = allScanned ? "SCANNED" : "UNSCANNED";

  await order.save();

  const product = await Product.findById(stockItem.productId).select("article category");
  let matchedCategory = null;
  if (product && product.category) {
    matchedCategory = product.category.find(c => String(c._id) === String(stockItem.categoryId));
  }

  return {
    factory: stock.factory?.name || "N/A",
    warehouse: stock.warehouse?.name || "N/A",
    productId: stockItem.productId,
    categoryId: stockItem.categoryId,
    article: product ? product.article : null,
    categoryCode: matchedCategory ? matchedCategory.categoryCode : null,
    color: matchedCategory ? matchedCategory.color : null,
    size: matchedCategory ? matchedCategory.size : null,
    type: matchedCategory ? (Array.isArray(matchedCategory.type) ? matchedCategory.type[0] : matchedCategory.type) : null,
    quality: matchedCategory ? (Array.isArray(matchedCategory.quality) ? matchedCategory.quality[0] : matchedCategory.quality) : null,
    quantity: stockItem.quantity,
    qrData: stockItem.qrData,
    dispatched: stockItem.dispatched,
    dispatchAt: stockItem.dispatchAt,
    ordNumScanFor: ordNumScanFor,
    lastScanAt: scannedAt,
    scanqtyatdispatch: targetWh.scanqtyatdispatch,
    allocatedQty: targetWh.quantity,
    ScanByorder: targetWh.ScanByorder,
    numOfDispatchedQty: order.numOfDispatchedQty,
  };
};

//Get Stock by Prefer Warehouse with pagination
exports.getStockByWarehouse = async (warehouseId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  // Count total records for pagination
  const total = await Stock.countDocuments({
    warehouse: warehouseId,
    isActive: true,
  });

  // Fetch paginated stock
  const stockData = await Stock.find({ warehouse: warehouseId, isActive: true })
    .populate("factory", "name location") // populate factory details
    .populate("warehouse", "name location") // populate warehouse details
    .populate({
      path: "stockdata.productId",
      model: "Product"
    })
    .skip(skip)
    .limit(limit);

  if (!stockData || stockData.length === 0) {
    throw new Error("Warehouse not found or no stock available");
  }

  // Format response with availableQuantity
  const formatted = stockData.map((s) => {
    return {
      _id: s._id,
      warehouse: s.warehouse,
      factory: s.factory,
      totalQuantity: s.toatalQuantity || 0,
      dispatchStock: s.dispatchStock || 0,
      availableQuantity: (s.toatalQuantity || 0) - (s.dispatchStock || 0),
      stockdata: s.stockdata.map((item) => {
        const itemObj = item.toObject ? item.toObject() : item;
        const product = itemObj.productId;
        
        let matchedCategory = null;
        if (product && Array.isArray(product.category) && itemObj.categoryId) {
          matchedCategory = product.category.find(
            (c) => c._id.toString() === itemObj.categoryId.toString()
          );
        }

        return {
          ...itemObj,
          productId: product,
          categoryId: itemObj.categoryId,
          category: matchedCategory
        };
      }),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  });

  return {
    data: formatted,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

//Bypass Scan and add stok to warehouse directly
exports.bypassScanAndAddStock = async (productionNo) => {
  // 1. Find QR document
  let qrDoc;
  try {
    qrDoc = await qrCodeModel.findOne({ productionNo });
  } catch (err) {
    throw new Error("Database not reachable, try again later.");
  }

  if (!qrDoc) {
    throw new Error("No QR code found for the given production number");
  }

  // 2. Find stock entry for this productionNo
  let existingStock = await Stock.findOne({
    "stockdata.productionNo": productionNo,
    isActive: true,
  });

  // 3. Get QR codes
  const qrCodes = Array.isArray(qrDoc.qrCodes) ? qrDoc.qrCodes : [];
  let stockQrIds = [];

  if (existingStock && Array.isArray(existingStock.stockdata)) {
    stockQrIds = existingStock.stockdata.map((s) => s.qrId);
  }

  let missingQRCodes = [];
  for (const qr of qrCodes) {
    const alreadyInStock = stockQrIds.includes(qr.qrId);
    if (qr.factoryScan === false && !alreadyInStock) {
      missingQRCodes.push(qr);
    }
  }

  // 4. Case A → Stock exists
  if (existingStock) {
    if (missingQRCodes.length > 0) {
      for (const qr of missingQRCodes) {
        existingStock.stockdata.push({
          productionNo: qrDoc.productionNo,
          productId: qr.productId,
          categoryId: qr.categoryId,
          quantity: parseInt(qr.quantity) || 1,
          qrData: qr.qrId,
          qrId: qr.qrId,
          dispatched: false,
        });
      }

      // Update quantity

      const addedQty = missingQRCodes.reduce(
        (sum, qr) => sum + (parseInt(qr.quantity) || 1),
        0
      );
      existingStock.toatalQuantity += addedQty;

      await existingStock.save();

      // Mark QR as scanned
      for (const qr of qrDoc.qrCodes) {
        if (missingQRCodes.find((m) => m.qrId === qr.qrId)) {
          qr.factoryScan = true;
        }
      }
      await qrDoc.save();

      // Update Production
      const getProduction = await Production.findOneAndUpdate(
        { productionNo },
        {
          $set: { status: "Dispatch from Factory" },
          $inc: { dispatchedQuantity: addedQty },
        },
        { new: true }
      );

      if (!getProduction) {
        return {
          success: false,
          message: "Production number not found for update",
        };
      }

      return {
        success: true,
        message: `${missingQRCodes.length} QR codes from production ${
          qrDoc.productionNo
        } have been successfully synced to stock.`,
      };
    } else {
      return {
        success: false,
        message: "No new QR codes to sync, already updated.",
      };
    }
  }

  // 5. Case B → No Stock exists, but QR exists → Create new stock
  if (!existingStock && qrCodes.length > 0) {
    //Get production to fetch factory + warehouse
    const getProduction = await Production.findOne({ productionNo });
    if (!getProduction) {
      throw new Error("Production not found while creating new stock");
    }

    const newStockData = qrCodes.map((qr) => ({
      warehouse: qrDoc.warehouse,
      productionNo: qrDoc.productionNo,
      productId: qr.productId,
      categoryId: qr.categoryId,
      quantity: parseInt(qr.quantity) || 1,
      qrData: qr.qrId,
      qrId: qr.qrId,
      dispatched: false,
    }));
    console.log(newStockData);
    const totalQty = newStockData.reduce(
      (sum, qr) => sum + (parseInt(qr.quantity) || 1),
      0
    );

   const newStock = new Stock({
        factory: getProduction.factory,
        warehouse: qrDoc.warehouse,
        isActive: true,
        stockdata: newStockData,
        toatalQuantity: totalQty,
      });

    await newStock.save();

    // 3. Update QR scan
    qrDoc.qrCodes.forEach((qr) => (qr.factoryScan = true));
    await qrDoc.save();

    // 4. Get existing production to cap dispatchedQuantity
    const production = await Production.findOne({ productionNo });

    if (!production) {
      throw new Error(`Production not found for ${productionNo}`);
    }

    // Cap dispatchedQuantity so it never exceeds productionQuantity
    const newDispatched = Math.min(
      (production.dispatchedQuantity || 0) + totalQty,
      production.productionQuantity
    );

    // 5. Update Production safely
    const updatedProduction = await Production.findOneAndUpdate(
      { productionNo },
      {
        $set: {
          status: "Dispatch from Factory",
          dispatchedQuantity: newDispatched, // ✅ capped value
        },
      },
      { new: true }
    );

    if (!updatedProduction) {
      return {
        success: false,
        message: "Production number not found for update",
      };
    }

    return {
      success: true,
      message: `New stock created with ${newStockData.length} QR codes.`,
    };
  }

  return {
    success: false,
    message: "No action performed.",
  };
};

//By pass last scan at Out of delivey 
exports.bypassScanAtDelivery = async (productionNo, article, quantity) => {
  try {
    // 1. Find the stock document that contains the productionNo
    // (productionNo uniquely identifies the production's stock items)
    const stockDoc = await Stock.findOne({
      "stockdata.productionNo": productionNo,
      isActive: true,
    });

    if (!stockDoc) {
      return {
        success: false,
        message: "No stock found for the given production number",
      };
    }

    // 2. Ensure stockdata exists
    if (!Array.isArray(stockDoc.stockdata)) {
      return {
        success: false,
        message: "No stockdata found for this productionNo/article",
      };
    }

    // 3. Get pending items (not yet dispatched)
    const pendingItems = stockDoc.stockdata.filter(
      (item) => item.productionNo === productionNo &&
                !item.dispatched
    );

    if (pendingItems.length === 0) {
      return {
        success: false,
        message: "All items for this production number are already dispatched",
      };
    }

    // 4. Take only required quantity
    const itemsToUpdate = pendingItems.slice(0, quantity);

    // 5. Mark selected items as dispatched
    stockDoc.stockdata.forEach((item) => {
      if (
        item.productionNo === productionNo &&
        !item.dispatched &&
        itemsToUpdate.find((up) => up.qrData === item.qrData)
      ) {
        item.dispatched = true;
      }
    });

    // 6. Update dispatchStock count
    stockDoc.dispatchStock = (stockDoc.dispatchStock || 0) + itemsToUpdate.length;

    // 7. Save changes
    await stockDoc.save();

    return {
      success: true,
      message: `${itemsToUpdate.length} items dispatched successfully for ${productionNo}`,
      dispatchCount: stockDoc.dispatchStock,
    };
  } catch (error) {
    return {
      success: false,
      message: "Server error while bypassing scan",
      error: error.message,
    };
  }
};

// Add Delivery 
exports.addDeliveryRecord = async (id, deliveryStatus) => {
  //findById takes just the id, not an object
  const order = await SellOrder.findById(id);

  if (!order) throw new Error("Order not found");

  //check both approvals
  if (
    order.accountSectionApproval === "APPROVED" &&
    order.inventoryManagerApproval === "APPROVED" &&
    order.ScannedByWarehouseManager === "SCANNED"
  ) {
    order.deliveryStatus = deliveryStatus;
    await order.save();
    return order;
  } else {
    throw new Error("Order cannot be delivered. It was not Scanned at Warehouse.");
  }
};

//Changed Status at Scan 
exports.getstockScanedbyWM = async (id, productId, categoryId, ScanByorder, warehouse, quantity) => {


  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid order ID");
  if (!mongoose.Types.ObjectId.isValid(warehouse)) throw new Error("Invalid warehouse ID");

  // 1️ Find the order by ID
  const order = await SellOrder.findById(id);
  if (!order) throw new Error("Order not found");

  // 2️ Find the first product/category + warehouse pair that is still UNSCANNED.
  // Multiple order items can share the same product (different category combos),
  // so we disambiguate by productId + categoryId, then pick the next unscanned row.
  let item = null;
  let wh = null;
  for (const it of order.items) {
    if (
      String(it.productId) !== String(productId) ||
      String(it.categoryId) !== String(categoryId)
    )
      continue;
    const candidate = it.warehouses.find(
      w =>
        w.warehouse.toString() === warehouse.toString() &&
        w.ScanByorder !== "SCANNED"
    );
    if (candidate) {
      item = it;
      wh = candidate;
      break;
    }
  }

  if (!item || !wh) {
    throw new Error(
      "Product/warehouse not found in this order, or already scanned."
    );
  }

  if (quantity !== wh.quantity) {
    throw new Error(
      `Input quantity (${quantity}) must be equal to available quantity (${wh.quantity})`
    );
  }

  // if (wh.ScanByorder === "SCANNED") {
  //   throw new Error("This warehouse item has already been scanned and cannot be updated.");
  // }
  // 4️Check approvals
  if (
    (order.accountSectionApproval || "").trim().toUpperCase() !== "APPROVED" ||
    (order.inventoryManagerApproval || "").trim().toUpperCase() !== "APPROVED"
  ) {
    throw new Error(
      "Cannot mark the order as 'Scanned'. Inventory Manager approval is either pending or rejected."
    );
  }

  // 5 Update warehouse fields
  wh.quantity = quantity;
  wh.ScanByorder = ScanByorder;

  // Update overall order scanned status
  const allScanned = order.items.every(item =>
    item.warehouses.every(wh => wh.ScanByorder === "SCANNED")
  );
  order.ScannedByWarehouseManager = allScanned ? "SCANNED" : "UNSCANNED";

  // 7️Save order
  await order.save();

  return order;
};

//create a stock in and out
// Aggregates stockdata to report stock-in (by stockinAt) and stock-out
// (dispatched items by dispatchAt) for the current day, month and year.
exports.getStockInOutSummary = async ({ warehouseId } = {}) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // Financial year: April 1 to March 31. If current month is Jan-Mar (0-2),
  // FY started in April of the previous calendar year.
  const fyStartYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  const startOfYear = new Date(fyStartYear, 3, 1);

  const sumIn = (from) => ({
    $sum: {
      $cond: [
        { $gte: ["$stockdata.stockinAt", from] },
        { $ifNull: ["$stockdata.quantity", 0] },
        0,
      ],
    },
  });

  const sumOut = (from) => ({
    $sum: {
      $cond: [
        {
          $and: [
            { $eq: ["$stockdata.dispatched", true] },
            { $gte: ["$stockdata.dispatchAt", from] },
          ],
        },
        { $ifNull: ["$stockdata.quantity", 0] },
        0,
      ],
    },
  });

  const variantKey = {
    productId: "$stockdata.productId",
    categoryId: "$stockdata.categoryId",
  };

  const match = { isActive: true };
  let warehouseName = null;
  if (warehouseId) {
    if (!mongoose.Types.ObjectId.isValid(warehouseId)) {
      throw new Error("Invalid warehouseId");
    }
    const warehouse = await Warehouse.findOne({ _id: warehouseId });
    if (!warehouse) {
      throw new Error(`Warehouse not found for id: ${warehouseId}`);
    }
    warehouseName = warehouse.name;
    match.warehouse = new mongoose.Types.ObjectId(warehouseId);
  }

  const [data] = await Stock.aggregate([
    { $match: match },
    { $unwind: "$stockdata" },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              dayIn: sumIn(startOfDay),
              dayOut: sumOut(startOfDay),
              monthIn: sumIn(startOfMonth),
              monthOut: sumOut(startOfMonth),
              yearIn: sumIn(startOfYear),
              yearOut: sumOut(startOfYear),
            },
          },
        ],
        byVariant: [
          {
            $group: {
              _id: variantKey,
              dayIn: sumIn(startOfDay),
              dayOut: sumOut(startOfDay),
              monthIn: sumIn(startOfMonth),
              monthOut: sumOut(startOfMonth),
              yearIn: sumIn(startOfYear),
              yearOut: sumOut(startOfYear),
            },
          },
          {
            $project: {
              _id: 0,
              productId: "$_id.productId",
              categoryId: "$_id.categoryId",
              dayIn: 1,
              dayOut: 1,
              monthIn: 1,
              monthOut: 1,
              yearIn: 1,
              yearOut: 1,
            },
          },
          { $sort: { productId: 1 } },
        ],
      },
    },
  ]);

  const t = (data && data.totals && data.totals[0]) || {};
  const rows = (data && data.byVariant) || [];

  // Resolve article/category details from Product for display
  const variantProductIds = [
    ...new Set(rows.map((r) => r.productId && String(r.productId)).filter(Boolean)),
  ];
  const variantProducts = await Product.find({ _id: { $in: variantProductIds } }).select("article category");
  const variantProductMap = {};
  variantProducts.forEach((p) => { variantProductMap[String(p._id)] = p; });

  const pickVariant = (row) => {
    const prod = variantProductMap[String(row.productId)];
    const cat = prod?.category?.find((c) => String(c._id) === String(row.categoryId));
    return {
      productId: row.productId,
      categoryId: row.categoryId,
      article: prod?.article,
      categoryCode: cat?.categoryCode,
      type: Array.isArray(cat?.type) ? cat.type[0] : cat?.type,
      size: cat?.size,
      color: cat?.color,
      quality: Array.isArray(cat?.quality) ? cat.quality[0] : cat?.quality,
    };
  };

  const byVariant = {
    day: rows
      .filter((r) => (r.dayIn || 0) > 0 || (r.dayOut || 0) > 0)
      .map((r) => ({ ...pickVariant(r), stockIn: r.dayIn || 0, stockOut: r.dayOut || 0 })),
    month: rows
      .filter((r) => (r.monthIn || 0) > 0 || (r.monthOut || 0) > 0)
      .map((r) => ({ ...pickVariant(r), stockIn: r.monthIn || 0, stockOut: r.monthOut || 0 })),
    year: rows
      .filter((r) => (r.yearIn || 0) > 0 || (r.yearOut || 0) > 0)
      .map((r) => ({ ...pickVariant(r), stockIn: r.yearIn || 0, stockOut: r.yearOut || 0 })),
  };

  return {
    range: {
      day: startOfDay,
      month: startOfMonth,
      year: startOfYear,
      financialYear: `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`,
      generatedAt: now,
    },
    warehouseId: warehouseId || null,
    warehouseName: warehouseName,
    day: { stockIn: t.dayIn || 0, stockOut: t.dayOut || 0 },
    month: { stockIn: t.monthIn || 0, stockOut: t.monthOut || 0 },
    year: { stockIn: t.yearIn || 0, stockOut: t.yearOut || 0 },
    byVariant,
  };
};
