const QRCode = require("qrcode");
const QRCODE = require("../models/qrCode.model");
// const Production = require('../models/production.model');
const Product = require("../models/production.model");
const { Product: RealProduct } = require("../models");
const { log } = require("winston");
const { v4: uuidv4 } = require("uuid"); // for unique QR ID
const { Warehouse } = require("../models");
const { Factory } = require("../models");
const { sendNotification } = require("./notificationService");
const { User } = require("../models");
const { Stock } = require("../models");

exports.addQrCodesByArticle = async ({ factory, productIds, productionNo, warehouse }) => {
  try {
    const allQrCodes = [];

    // Fetch all products (Production is identified by productionNo; article is no longer stored on it)
    const products = await Product.find({
      factory: factory,
      productionNo: productionNo
    });

    console.log("p,products", products);


    if (!products.length) {
      throw new Error(
        "No matching products found for selected factory and product IDs."
      );
    }

    return products;
  } catch (error) {
    console.error("QR generation error:", error);
    throw error;
  }
};

// exports.generateQrCodesByArticle = async ({  factory,  factory_name,  productIds,  productionNo, warehouse}) => {
//   try {
//     const allQrCodes = [];

//     // Check if productionNo is already used
//     const existingQR = await QRCODE.findOne({ productionNo });


//     if (existingQR) {
//       throw new Error(
//         `QR already generated for productionNo: ${productionNo}, we can process QR Generation.`
//       );
//     }

//     // Fetch all products
//     const products = await Product.find({
//       article: { $in: productIds },
//       factory: factory,
//       productionNo: productionNo
//     });

//     console.log("products",products);


//     if (!products.length) {
//       throw new Error(
//         "No matching products found for selected factory and product IDs."
//       );
//     }
//     const warehouses = await Warehouse.findById(warehouse);
//     console.log("warehouse",warehouses);

//     if (!warehouses) {
//       throw new Error("Warehouse not found for the given ID");
//     }
//     // Generate QR codes for each Production entry
//     for (const product of products) {
//       const { article, productionQuantity, category } = product;

//       // Repeat based on production quantity
//       for (let i = 0; i < productionQuantity; i++) {
//         let qrIds = "QR-" + uuidv4();
//         const qrPayload = {
//           article,
//           factory_name,
//           warehouse: warehouses._id,
//           warehouseName: warehouses.name,
//           productionNo: productionNo,
//           serial: i + 1,
//           qrId : qrIds,
//           category,
//         };
//         const qrBase64 = await QRCode.toDataURL(JSON.stringify(qrPayload));

//         allQrCodes.push({
//           article,
//           categoryCode: category[0]?.categoryCode,
//           color: category[0]?.color,
//           size: category[0]?.size,
//           type: category[0]?.type,
//           quality: category[0]?.quality,
//           quantity: "1",
//           qrId : qrIds,
//           qrData: qrBase64,
//         });
//       }
//     }

//     // Save single QRCODE document with array of QR codes
//     const qrDoc = new QRCODE({
//       factory,
//       factory_name,
//       productionNo,
//       warehouse,
//       products: productIds,
//       status: "Dispatch",
//       category: products.flatMap((p) => p.category),
//       qrCodes: allQrCodes,
//     });

//     // After qrDoc creation, before saving
//     const warehouseManager = await User.findOne({
//       role: "Warehouse Manager",
//       warehouses: warehouse, // warehouse is already your selected warehouse ID
//       isActive: true
//     });

//     if (!warehouseManager) {
//       throw new Error("No Warehouse Manager assigned for this warehouse.");
//     }

//     // Send notification specifically to this manager
//     sendNotification("qrgeneratedRequest", {
//       message: `QR codes generated for warehouse: ${warehouses.name}. Please collect.`,
//       recipient: {
//         id: warehouseManager._id,
//         name: warehouseManager.name,
//         email: warehouseManager.email,
//         phone: warehouseManager.phone
//       },
//       data: qrDoc,
//     });
//     const saved = await qrDoc.save();
//     return saved;
//   } catch (error) {
//     console.error("QR generation error:", error);
//     throw error;
//   }
// };

exports.generateQrCodesByArticle = async ({
  factory,
  factory_name,
  productsInput, 
  productionNo,
  warehouse
}) => {
  try {
    const allQrCodes = [];

    // Check if productionNo is already used
    const existingQR = await QRCODE.findOne({ productionNo });
    if (existingQR) {
      throw new Error(`QR already generated for productionNo: ${productionNo}`);
    }

    // Validate warehouse
    const warehouses = await Warehouse.findById(warehouse);
    if (!warehouses) {
      throw new Error("Warehouse not found for the given ID");
    }

    // Fetch products from DB to get actual productionQuantity.
    // Production is uniquely identified by productionNo (article is no longer stored on it).
    const productsFromDB = await Product.find({
      productionNo,
      factory
    });

    if (!productsFromDB.length) {
      throw new Error("No matching products found for this production number.");
    }

    // Generate QR codes
    for (const inputProduct of productsInput) {
      const dbProduct =
        productsFromDB.find(p => p.productionNo === productionNo) ||
        productsFromDB[0];
      if (!dbProduct) {
        throw new Error(`Production ${productionNo} not found.`);
      }

      const quantity = dbProduct.productionQuantity || 0;

      if (quantity <= 0) {
        throw new Error(`Product ${inputProduct.article} has zero production quantity.`);
      }

      for (let i = 0; i < quantity; i++) {
        const qrId = "QR-" + uuidv4();

        const qrPayload = {
          factory,
          warehouse: warehouses._id,
          productId: dbProduct.productId,
          categoryId: dbProduct.categoryId,
          productionNo,
          serial: i + 1,
          qrId
        };

        const qrBase64 = await QRCode.toDataURL(JSON.stringify(qrPayload));

        allQrCodes.push({
          productId: dbProduct.productId,
          categoryId: dbProduct.categoryId,
          quantity: "1", // each QR represents 1 unit
          qrId,
          qrData: qrBase64
        });
      }
    }

    // Save QRCODE document
    const qrDoc = new QRCODE({
      factory,
      factory_name,
      productionNo,
      warehouse,
      products: productsInput.map(p => p.article),
      status: "Dispatch",
      qrCodes: allQrCodes
    });

    // Find Warehouse Manager
    const warehouseManager = await User.findOne({
      role: "Warehouse Manager",
      warehouses: warehouse,
      isActive: true
    });

    if (!warehouseManager) {
      throw new Error("No Warehouse Manager assigned for this warehouse.");
    }

    // Send notification
    sendNotification("qrgeneratedRequest", {
      message: `QR codes generated for warehouse: ${warehouses.name}. Please collect.`,
      recipient: {
        id: warehouseManager._id,
        name: warehouseManager.name,
        email: warehouseManager.email,
        phone: warehouseManager.phone
      },
      data: qrDoc
    });

    const saved = await qrDoc.save();
    return saved;

  } catch (error) {
    console.error("QR generation error:", error);
    throw error;
  }
};

// Generate QR codes for a Return Production (RPN_xx) and bypass the
// factory in-scan + factory dispatch-scan stages so the goods can be
// scanned directly at the warehouse. The Production's stockinQuantity,
// dispatchedQuantity and status are updated to reflect that bypass.
exports.generateReturnQrAndBypassFactoryScan = async ({
  factory,
  productionNo,
  warehouse,
  article,
  category,
  quantity,
}) => {
  if (!factory) throw new Error("factory is required");
  if (!productionNo) throw new Error("productionNo is required");
  if (!warehouse) throw new Error("warehouse is required");
  if (!article) throw new Error("article is required");
  if (!category) throw new Error("category is required");
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new Error("quantity must be a positive number");

  const existingQR = await QRCODE.findOne({ productionNo });
  if (existingQR) {
    throw new Error(`QR already generated for productionNo: ${productionNo}`);
  }

  const [factoryDoc, warehouseDoc, production] = await Promise.all([
    Factory.findById(factory),
    Warehouse.findById(warehouse),
    Product.findOne({ productionNo }),
  ]);
  if (!factoryDoc) throw new Error("Factory not found");
  if (!warehouseDoc) throw new Error("Warehouse not found");
  if (!production) throw new Error("Production not found for this productionNo");

  const categoryData = {
    categoryCode: category.categoryCode,
    color: category.color,
    size: category.size,
    type: category.type,
    quality: category.quality,
  };

  const allQrCodes = [];
  for (let i = 0; i < qty; i++) {
    const qrId = "QR-" + uuidv4();
    const qrPayload = {
      factory,
      warehouse: warehouseDoc._id,
      productId: production.productId,
      categoryId: production.categoryId,
      productionNo,
      serial: i + 1,
      qrId,
      quantity: 1,
      factoryScan: true,
      factoryinScan: true,
    };
    const qrBase64 = await QRCode.toDataURL(JSON.stringify(qrPayload));

    allQrCodes.push({
      productId: production.productId,
      categoryId: production.categoryId,
      quantity: "1",
      qrId,
      qrData: qrBase64,
      factoryScan: true,
      factoryinScan: true,
    });
  }

  const qrDoc = await QRCODE.create({
    factory,
    factory_name: factoryDoc.name,
    productionNo,
    warehouse,
    products: [article],
    status: "Dispatch",
    qrCodes: allQrCodes,
  });

  // Bypass factory scans on the Production itself
  production.stockinQuantity = qty;
  production.dispatchedQuantity = qty;
  production.status = "Dispatch from Factory";
  await production.save();

  // Notify the warehouse manager that goods are ready to be scanned in
  try {
    const warehouseManager = await User.findOne({
      role: "Warehouse Manager",
      warehouses: warehouse,
      isActive: true,
    });
    if (warehouseManager) {
      sendNotification("qrgeneratedRequest", {
        message: `Return QR (${productionNo}) ready at warehouse: ${warehouseDoc.name}. Factory scan bypassed.`,
        recipient: {
          id: warehouseManager._id,
          name: warehouseManager.name,
          email: warehouseManager.email,
          phone: warehouseManager.phone,
        },
        data: qrDoc,
      });
    }
  } catch (e) {
    console.error("Return QR notification failed:", e.message);
  }

  return { qrDoc, production };
};

exports.getQrCodes = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const query = {};

  const [qrcode, totalItems] = await Promise.all([
    QRCODE.find(query)
      .skip(skip)
      .limit(limit),
    QRCODE.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalItems / limit);

  return {
    success: true,
    qrcode: qrcode,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
    },
  };
};

exports.stockTransferWithinWarehouses = async ({
  factory,
  factory_name,
  fromWarehouse,
  toWarehouse,
  productionNo,
  article,
  quantity, 
  category, 
}) => {
  if (!category) {
    throw new Error("Category details must be provided for stock transfer.");
  }

  // Normalize category fields
  const categoryData = {
    categoryCode: category.categoryCode,
    color: category.color,
    size: category.size ,
    type: category.type ,
    quality: category.quality,
  };

  // Resolve Product Document matching the specified article
  const productDoc = await RealProduct.findOne({ article: article });
  if (!productDoc) {
    throw new Error(`No product found matching the article: ${article}`);
  }

  // Production holds the productId/categoryId now stored on each QR entry.
  // These keys must be present so they map correctly onto the destination QR/Stock.
  const productionDoc = await Product.findOne({ productionNo });
  if (!productionDoc) {
    throw new Error(`No production record found for productionNo: ${productionNo}`);
  }
  if (!productionDoc.productId || !productionDoc.categoryId) {
    throw new Error(
      `Production ${productionNo} is missing productId/categoryId mapping; cannot transfer stock.`
    );
  }

  // 1️⃣ Check stock in source warehouse (productionNo uniquely identifies the product)
  const fromStock = await Stock.findOne({
    warehouse: fromWarehouse,
    "stockdata.productionNo": productionNo,
  });

  if (!fromStock) {
    throw new Error(
      "No stock found in the source warehouse for the given production number."
    );
  }

  const stockItemIndex = fromStock.stockdata.findIndex(
    (s) => s.productId.toString() === productDoc._id.toString() && s.productionNo === productionNo
  );
  if (stockItemIndex === -1) throw new Error("No matching stock item found in source stock.");

  const stockItem = fromStock.stockdata[stockItemIndex];

  // 2️⃣ Check available quantity
  const availableQuantity = (fromStock.toatalQuantity || 0) - (fromStock.dispatchStock || 0);
  if (availableQuantity < quantity) {
    throw new Error(
      `Insufficient stock. Available: ${availableQuantity}, Requested: ${quantity}`
    );
  }

  // 3️⃣ Remove QR codes from source warehouse
  const qrDoc = await QRCODE.findOne({
    warehouse: fromWarehouse,
    productionNo,
  }).populate("warehouse", "name location");
  if (!qrDoc) throw new Error("No QR document found for given productionNo and article.");

  // Only stock that has cleared the factory (factory-in + factory-out scan) and
  // has been scanned into the source warehouse (warehouse-in) is transferable.
  // Units already dispatched out (warehouseDispatch) are not eligible.
  const isTransferable = (qr) =>
    qr.factoryScan === true &&
    qr.factoryinScan === true &&
    qr.warehouseinScan === true &&
    qr.warehouseDispatch !== true;

  const eligibleQrCodes = qrDoc.qrCodes.filter(isTransferable);
  if (eligibleQrCodes.length < quantity) {
    throw new Error(
      `Insufficient transferable stock in source warehouse. ` +
      `Eligible (factory-in, factory-out and warehouse-in scanned): ${eligibleQrCodes.length}, Requested: ${quantity}. ` +
      `Ensure the stock is factory-in, factory-out and warehouse-in scanned before transfer.`
    );
  }

  // Pick exactly `quantity` eligible units and remove them from the source doc.
  const qrToDelete = eligibleQrCodes.slice(0, quantity);
  const removedQrIds = new Set(qrToDelete.map((q) => q.qrId));
  qrDoc.qrCodes = qrDoc.qrCodes.filter((q) => !removedQrIds.has(q.qrId));
  await qrDoc.save();

  // 5️⃣ Decrease quantity in source warehouse
  // Decrease stockItem quantity
  let quantityToRemove = quantity; // input quantity to remove

  for (let i = 0; i < fromStock.stockdata.length && quantityToRemove > 0; i++) {
    let item = fromStock.stockdata[i];

    if (item.quantity <= quantityToRemove) {
      // Remove whole item
      quantityToRemove -= item.quantity;
      fromStock.stockdata.splice(i, 1);
      i--; // adjust index because we removed an item
    } else {
      // Remove part of the quantity
      item.quantity -= quantityToRemove;
      quantityToRemove = 0; // done
    }
  }

  // Update totalQuantity
  fromStock.toatalQuantity = Math.max(0, fromStock.toatalQuantity - quantity);

  // Save changes
  await fromStock.save();


  // 6️⃣ Validate destination warehouse
  const toWarehouseDoc = await Warehouse.findById(toWarehouse);
  if (!toWarehouseDoc) throw new Error("Destination warehouse not found");

  const allQrCodes = [];
  for (let i = 0; i < quantity; i++) {
    const qrId = "QR-" + uuidv4();
    const qrPayload = {
      factory,
      warehouse: toWarehouseDoc._id,
      productId: productionDoc.productId,
      categoryId: productionDoc.categoryId,
      productionNo,
      serial: i + 1,
      qrId,
      // Goods already cleared the factory at the source warehouse.
      factoryScan: true,
      factoryinScan: true,
      // Must be re-scanned into the destination warehouse.
      warehouseinScan: false,
      warehouseDispatch: false,
    };
    // console.log("qrPayload", qrPayload)
    const qrBase64 = await QRCode.toDataURL(JSON.stringify(qrPayload));

    allQrCodes.push({
      productId: productionDoc.productId,
      categoryId: productionDoc.categoryId,
      quantity: "1",
      qrId,
      qrData: qrBase64,
      // Factory stages already cleared; carried over from source warehouse.
      factoryScan: true,
      factoryinScan: true,
      // Pending warehouse-in scan at the destination warehouse.
      warehouseinScan: false,
      warehouseDispatch: false,
    });
  }

  // 7️⃣ Create or update QR Model entry for toWarehouse
  let qrActionMessage = "";
  let toQrDoc = await QRCODE.findOne({
    warehouse: toWarehouse,
    factory,
    productionNo,
  });

  if (!toQrDoc) {
    // ❌ No document found → create new
    toQrDoc = new QRCODE({
      warehouse: toWarehouse,
      factory,
      factory_name,
      productionNo,
      qrCodes: allQrCodes,
    });
    qrActionMessage = "New QR document created for this warehouse.";
  } else {
    // ✅ Document exists → append new QR codes
    toQrDoc.qrCodes.push(...allQrCodes);
    qrActionMessage = "QR codes added to existing document for this warehouse.";
  }

  await toQrDoc.save();
  // console.log("toQrDoc", toQrDoc);

  // 8️⃣ Stock is intentionally NOT created here for an internal transfer.
  // The transfer only moves the QR to the destination warehouse with
  // warehouseinScan=false. The destination Stock entry is created only when the
  // QR is scanned in at the destination warehouse (createStockByQr), which also
  // flips warehouseinScan to true ("arrived at warehouse").

  return {
    message: `From ${qrDoc.warehouse.name} to ${toWarehouseDoc.name}: ${quantity} unit(s) transferred. QR created for destination warehouse; scan the QR there to add it to stock.`,

    // Deleted QR codes from source
    deletedFromSource: qrToDelete.map((q) => ({
      qrId: q.qrId,
      qrData: q.qrData,
    })),

    // Newly created QR codes in destination (pending warehouse-in scan)
    createdInDestination: allQrCodes.map((q) => ({
      qrId: q.qrId,
      qrData: q.qrData,
      productId: q.productId,
      categoryId: q.categoryId,
      productionNo,
      quantity: q.quantity,
      article,
      size: categoryData.size,
      color: categoryData.color,
      type: categoryData.type,
      quality: categoryData.quality,
      categoryCode: categoryData.categoryCode,
    })),

    // Action message for QR model
    qrAction: qrActionMessage,

    // Stock is added at scan time, not during the transfer
    stockCreated: [],

    // Deleted stock items from source
    stockDeleted: qrToDelete.map((q) => ({
      qrId: q.qrId,
      productionNo,
      article,
    })),
  };
}

// Get all factory-scanned QR codes from QR model, grouped by productionNo.
// Pagination is applied at the productionNo level (e.g. 10 PNs per page).
// Optional filter: productionNo (returns a single group)
exports.getAllFactoryScannedQrCodes = async ({ productionNo, type, page = 1, limit = 10 } = {}) => {
  page = Number(page) || 1;
  limit = Number(limit) || 10;
  const skip = (page - 1) * limit;

  const docMatch = {};
  if (productionNo) {
    docMatch.productionNo = productionNo;
  } else if (type === "RPN") {
    docMatch.productionNo = { $regex: "^RPN_", $options: "i" };
  } else if (type === "PN") {
    docMatch.productionNo = { $regex: "^PN_", $options: "i" };
  }

  const basePipeline = [
    { $match: docMatch },
    { $unwind: "$qrCodes" },
    { $match: { "qrCodes.factoryScan": true } },
    {
      $group: {
        _id: "$productionNo",
        productionNo: { $first: "$productionNo" },
        factory: { $first: "$factory" },
        warehouses: { $addToSet: "$warehouse" },
        status: { $first: "$status" },
        firstCreatedAt: { $min: "$createdAt" },
        qrCodes: { $push: "$qrCodes" },
        totalQrCodes: { $sum: 1 },
      },
    },
    { $sort: { firstCreatedAt: 1 } },
  ];

  const [countRes] = await QRCODE.aggregate([
    ...basePipeline,
    { $count: "total" },
  ]);
  const totalItems = countRes ? countRes.total : 0;

  const data = await QRCODE.aggregate([
    ...basePipeline,
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "warehouses",
        localField: "warehouses",
        foreignField: "_id",
        as: "warehouseDetails",
      },
    },
    {
      $lookup: {
        from: "factories",
        localField: "factory",
        foreignField: "_id",
        as: "factoryDetails",
      },
    },
    {
      $project: {
        _id: 0,
        productionNo: 1,
        factory: 1,
        factory_name: { $arrayElemAt: ["$factoryDetails.name", 0] },
        warehouses: {
          $map: {
            input: "$warehouseDetails",
            as: "w",
            in: { _id: "$$w._id", name: "$$w.name" },
          },
        },
        status: 1,
        createdAt: "$firstCreatedAt",
        totalQrCodes: 1,
        qrCodes: 1,
      },
    },
  ]);

  const totalPages = Math.ceil(totalItems / limit) || 0;

  return {
    success: true,
    data,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      limit,
    },
  };
};

// Get all warehouse stock-IN scanned QR codes (warehouseinScan: true), grouped by productionNo.
exports.getAllWarehouseScannedQrCodes = async ({ productionNo, page = 1, limit = 10 } = {}) => {
  page = Number(page) || 1;
  limit = Number(limit) || 10;
  const skip = (page - 1) * limit;

  const docMatch = {};
  if (productionNo) docMatch.productionNo = productionNo;

  const basePipeline = [
    { $match: docMatch },
    { $unwind: "$qrCodes" },
    { $match: { "qrCodes.warehouseinScan": true } },
    {
      $group: {
        _id: { productionNo: "$productionNo", warehouse: "$warehouse" },
        productionNo: { $first: "$productionNo" },
        factory: { $first: "$factory" },
        warehouse: { $first: "$warehouse" },
        status: { $first: "$status" },
        firstCreatedAt: { $min: "$createdAt" },
        qrCodes: { $push: "$qrCodes" },
        totalQrCodes: { $sum: 1 },
      },
    },
    { $sort: { firstCreatedAt: -1 } },
  ];

  const [countRes] = await QRCODE.aggregate([...basePipeline, { $count: "total" }]);
  const totalItems = countRes ? countRes.total : 0;

  const data = await QRCODE.aggregate([
    ...basePipeline,
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "warehouses",
        localField: "warehouse",
        foreignField: "_id",
        as: "warehouseDetails",
      },
    },
    {
      $lookup: {
        from: "factories",
        localField: "factory",
        foreignField: "_id",
        as: "factoryDetails",
      },
    },
    {
      $project: {
        _id: 0,
        productionNo: 1,
        factory: 1,
        factory_name: { $arrayElemAt: ["$factoryDetails.name", 0] },
        warehouse: { $arrayElemAt: ["$warehouseDetails", 0] },
        status: 1,
        createdAt: "$firstCreatedAt",
        totalQrCodes: 1,
        qrCodes: 1,
      },
    },
  ]);

  return {
    success: true,
    data,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalItems / limit) || 0,
      totalItems,
      limit,
    },
  };
};

// Get all warehouse dispatch (stock-OUT) scanned QR codes (warehouseDispatch: true), grouped by productionNo + warehouse.
exports.getAllWarehouseDispatchedQrCodes = async ({ productionNo, page = 1, limit = 10 } = {}) => {
  page = Number(page) || 1;
  limit = Number(limit) || 10;
  const skip = (page - 1) * limit;

  const docMatch = {};
  if (productionNo) docMatch.productionNo = productionNo;

  const basePipeline = [
    { $match: docMatch },
    { $unwind: "$qrCodes" },
    { $match: { "qrCodes.warehouseDispatch": true } },
    {
      $group: {
        _id: { productionNo: "$productionNo", warehouse: "$warehouse" },
        productionNo: { $first: "$productionNo" },
        factory: { $first: "$factory" },
        warehouse: { $first: "$warehouse" },
        status: { $first: "$status" },
        firstCreatedAt: { $min: "$createdAt" },
        qrCodes: { $push: "$qrCodes" },
        totalQrCodes: { $sum: 1 },
        orderNos: { $addToSet: "$qrCodes.ordNumScanFor" },
      },
    },
    { $sort: { firstCreatedAt: -1 } },
  ];

  const [countRes] = await QRCODE.aggregate([...basePipeline, { $count: "total" }]);
  const totalItems = countRes ? countRes.total : 0;

  const data = await QRCODE.aggregate([
    ...basePipeline,
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "warehouses",
        localField: "warehouse",
        foreignField: "_id",
        as: "warehouseDetails",
      },
    },
    {
      $lookup: {
        from: "factories",
        localField: "factory",
        foreignField: "_id",
        as: "factoryDetails",
      },
    },
    {
      $project: {
        _id: 0,
        productionNo: 1,
        factory: 1,
        factory_name: { $arrayElemAt: ["$factoryDetails.name", 0] },
        warehouse: { $arrayElemAt: ["$warehouseDetails", 0] },
        status: 1,
        createdAt: "$firstCreatedAt",
        totalQrCodes: 1,
        qrCodes: 1,
      },
    },
  ]);

  return {
    success: true,
    data,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalItems / limit) || 0,
      totalItems,
      limit,
    },
  };
};

//get Internal tranfer Qr code
exports.getInternalTransfersByTime = async (page = 1, limit = 10, search = "") => {
  try {
    page = Number(page);
    limit = Number(limit);

    // 1. Fetch only docs where formwarehouse + formqunatity exist
    const query = {
      formwarehousedata: { $exists: true, $ne: [] }
    };

    // 4. Apply search filter if given
    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { productionNo: { $regex: regex } },
        { "stockdata.article": { $regex: regex } },
        { "warehouseName": { $regex: regex } },
        { "formwarehousedata.fromWarehouseName": { $regex: regex } },
      ];
    }
    const regex = search?.trim() ? new RegExp(search.trim(), "i") : null;

    const pipeline = [
      { $match: { formwarehousedata: { $exists: true, $ne: [] } } },
      { $unwind: "$formwarehousedata" },
      { $lookup: { from: "warehouses", localField: "warehouse", foreignField: "_id", as: "toWarehouse" } },
      { $unwind: "$toWarehouse" },
      { $lookup: { from: "warehouses", localField: "formwarehousedata.fromwarehouse", foreignField: "_id", as: "fromWarehouse" } },
      { $unwind: "$fromWarehouse" },
      // Article is not stored on stockdata; resolve it from the referenced Product.
      { $addFields: { firstProductId: { $arrayElemAt: ["$stockdata.productId", 0] } } },
      { $lookup: { from: "products", localField: "firstProductId", foreignField: "_id", as: "productDetails" } },
      { $addFields: { article: { $arrayElemAt: ["$productDetails.article", 0] } } }
    ];

    // Apply search after lookup
    if (regex) {
      pipeline.push({
        $match: {
          $or: [
            { productionNo: { $regex: regex } },
            { article: { $regex: regex } },
            { "toWarehouse.name": { $regex: regex } },
            { "fromWarehouse.name": { $regex: regex } }
          ]
        }
      });
    }

    // Project only required fields
    pipeline.push({
      $project: {
        _id: 0,
        productionNo: { $arrayElemAt: ["$stockdata.productionNo", 0] },
        fromWarehouse: "$fromWarehouse.name",
        toWarehouse: "$toWarehouse.name",
        quantity: "$formwarehousedata.formqunatity",
        articles: "$article",
        createdAt: "$formwarehousedata.createdAt"
      }
    });

    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });

    const transfers = await Stock.aggregate(pipeline);

    // 5. Pagination metadata
    const totalItems = await Stock.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    return {
      success: true,
      transfers,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems
      }
    };
  } catch (err) {
    console.error("Error in getInternalTransfersByTime:", err);
    return { success: false, message: "Internal server error" };
  }
};




















