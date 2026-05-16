const QRCode = require("qrcode");
const QRCODE = require("../models/qrCode.model");
// const Production = require('../models/production.model');
const Product = require("../models/production.model");
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

    // Fetch all products
    const products = await Product.find({
      article: { $in: productIds },
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

    // Fetch products from DB to get actual productionQuantity
    const productArticles = productsInput.map(p => p.article);
    const productsFromDB = await Product.find({
      article: { $in: productArticles },
      productionNo,
      factory
    });

    if (!productsFromDB.length) {
      throw new Error("No matching products found for this production number.");
    }

    // Generate QR codes
    for (const inputProduct of productsInput) {
      const dbProduct = productsFromDB.find(p => p.article === inputProduct.article);
      if (!dbProduct) {
        throw new Error(`Product ${inputProduct.article} not found in this production.`);
      }

      const quantity = dbProduct.productionQuantity || 0;

      if (quantity <= 0) {
        throw new Error(`Product ${inputProduct.article} has zero production quantity.`);
      }

      for (let i = 0; i < quantity; i++) {
        const qrId = "QR-" + uuidv4();

        const qrPayload = {
          article: inputProduct.article,
          factory_name,
          warehouse: warehouses._id,
          warehouseName: warehouses.name,
          productionNo,
          serial: i + 1,
          qrId,
          category: {
            categoryCode: inputProduct.categoryCode,
            color: inputProduct.color,
            size: inputProduct.size,
            type: inputProduct.type,
            quality: inputProduct.quality
          }
        };

        const qrBase64 = await QRCode.toDataURL(JSON.stringify(qrPayload));

        allQrCodes.push({
          article: inputProduct.article,
          categoryCode: inputProduct.categoryCode || "NA",
          color: inputProduct.color || "NA",
          size: inputProduct.size || "NA",
          type: inputProduct.type || "NA",
          quality: inputProduct.quality || "NA",
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
      category: productsInput.map(p => ({
        categoryCode: p.categoryCode,
        color: p.color,
        size: p.size,
        type: p.type,
        quality: p.quality
      })),
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
      article,
      factory_name: factoryDoc.name,
      warehouse: warehouseDoc._id,
      warehouseName: warehouseDoc.name,
      productionNo,
      serial: i + 1,
      qrId,
      quantity: 1,
      category: categoryData,
      factoryScan: true,
      factoryinScan: true,
    };
    const qrBase64 = await QRCode.toDataURL(JSON.stringify(qrPayload));

    allQrCodes.push({
      article,
      categoryCode: categoryData.categoryCode || "NA",
      color: categoryData.color || "NA",
      size: categoryData.size || "NA",
      type: categoryData.type || "NA",
      quality: categoryData.quality || "NA",
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
    category: [categoryData],
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

  // 1️⃣ Check stock in source warehouse
  const fromStock = await Stock.findOne({
    warehouse: fromWarehouse,
    "stockdata.article": article,
    "stockdata.productionNo": productionNo,
  });

  if (!fromStock) {
    throw new Error(
      "No stock found in the source warehouse for the given article and production number."
    );
  }

  const stockItemIndex = fromStock.stockdata.findIndex(
    (s) => s.article === article && s.productionNo === productionNo
  );
  if (stockItemIndex === -1) throw new Error("No matching stock item found.");

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
    products: article,
  }).populate("warehouse", "name location");
  if (!qrDoc) throw new Error("No QR document found for given productionNo and article.");

  const qrToDelete = qrDoc.qrCodes.slice(0, quantity);
  qrDoc.qrCodes = qrDoc.qrCodes.slice(quantity);
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
      article,
      factory_name,
      warehouse: toWarehouseDoc._id,
      warehouseName: toWarehouseDoc.name,
      productionNo,
      serial: i + 1,
      qrId,
      category: categoryData, // ✅ use input directly
      factoryScan: true,
    };
    // console.log("qrPayload", qrPayload)
    const qrBase64 = await QRCode.toDataURL(JSON.stringify(qrPayload));

    allQrCodes.push({
      article,
      categoryCode: categoryData.categoryCode,
      color: categoryData.color,
      size: categoryData.size,
      type: categoryData.type,
      quality: categoryData.quality,
      quantity: "1",
      qrId,
      qrData: qrBase64,
      factoryScan: true,
    });
  }

  // 7️⃣ Create or update QR Model entry for toWarehouse
  let qrActionMessage = "";
  let toQrDoc = await QRCODE.findOne({
    warehouse: toWarehouse,
    factory,
    products: article,
    productionNo,
  });

  if (!toQrDoc) {
    // ❌ No document found → create new
    toQrDoc = new QRCODE({
      warehouse: toWarehouse,
      factory,
      factory_name,
      productionNo,
      products: [article],
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

  // 8️⃣ Create or update Stock entry for toWarehouse
  let stockActionMessage = "";

  // 8a. Find existing stock for the same warehouse, factory, article, productionNo
  let toStock = await Stock.findOne({
    warehouse: toWarehouse,
    factory,
    "stockdata.article": article,
    "stockdata.productionNo": productionNo,
  }).populate("warehouse", "name location")

  if (!toStock) {
    // ❌ No stock document exists → create new
    toStock = new Stock({
      warehouse: toWarehouse,
      formwarehouse: fromWarehouse,
      formqunatity: +quantity,
      factory,
      factory_name,
      toatalQuantity: quantity,
      isActive: true,
      stockdata: allQrCodes.map((qr) => ({
        productionNo,
        article,
        categoryCode: qr.categoryCode,
        color: qr.color,
        size: qr.size,
        type: qr.type,
        quality: qr.quality,
        quantity: Number(qr.quantity),
        qrData: qr.qrId,
        dispatched: false,
      })),
      formwarehousedata: [
        {
          fromwarehouse: fromWarehouse,  // source warehouse
          formqunatity: quantity        // transferred quantity
        }
      ],
    });
    stockActionMessage = "New stock document created for destination warehouse.";
  }
  else {
    // formwarehouse: fromWarehouse,
    // formqunatity: quantity,
    // ✅ Stock document exists → append new stockdata
    toStock.stockdata.push(
      ...allQrCodes.map((qr) => ({
        productionNo,
        article,
        categoryCode: qr.categoryCode,
        color: qr.color,
        size: qr.size,
        type: qr.type,
        quality: qr.quality,
        quantity: Number(qr.quantity),
        qrData: qr.qrId,
        dispatched: false,
      }))
    );
    toStock.formwarehousedata.push({
      fromwarehouse: fromWarehouse,  // ObjectId of source warehouse
      formqunatity: quantity          // transferred quantity
    });

    // Update total quantity
    toStock.toatalQuantity += quantity;
    stockActionMessage = "Stock updated: added new items to existing warehouse entry.";
  }

  await toStock.save();
  await toStock.populate("warehouse", "name location");

  return {
    message: `Form ${qrDoc.warehouse.name} to ${toStock.warehouse.name} Stock quantity ${quantity} are Transfer and Qr created Successfully.`,

    // Deleted QR codes from source
    deletedFromSource: qrToDelete.map((q) => ({
      qrId: q.qrId,
      qrData: q.qrData,
    })),

    // Newly created QR codes in destination
    createdInDestination: allQrCodes.map((q) => ({
      qrId: q.qrId,
      qrData: q.qrData,
      article: q.article,
      categoryCode: q.categoryCode,
      productionNo,
      color: q.color,
      size: q.size,
      type: q.type,
      quality: q.quality,
      quantity: q.quantity
    })),

    // Action message for QR model
    qrAction: qrActionMessage,

    // Newly created/added stock items in destination
    stockCreated: toStock
      ? allQrCodes.map((q) => ({
        qrId: q.qrId,
        productionNo,
        article
      }))
      : [],

    // Deleted stock items from source
    stockDeleted: qrToDelete.map((q) => ({
      qrId: q.qrId,
      productionNo,
      article,
    })),
  }
}

// Get all factory-scanned QR codes from QR model, grouped by productionNo.
// Pagination is applied at the productionNo level (e.g. 10 PNs per page).
// Optional filter: productionNo (returns a single group)
exports.getAllFactoryScannedQrCodes = async ({ productionNo, page = 1, limit = 10 } = {}) => {
  page = Number(page) || 1;
  limit = Number(limit) || 10;
  const skip = (page - 1) * limit;

  const docMatch = productionNo ? { productionNo } : {};

  const basePipeline = [
    { $match: docMatch },
    { $unwind: "$qrCodes" },
    { $match: { "qrCodes.factoryScan": true } },
    {
      $group: {
        _id: "$productionNo",
        productionNo: { $first: "$productionNo" },
        factory: { $first: "$factory" },
        factory_name: { $first: "$factory_name" },
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
      $project: {
        _id: 0,
        productionNo: 1,
        factory: 1,
        factory_name: 1,
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
      { $unwind: "$fromWarehouse" }
    ];

    // Apply search after lookup
    if (regex) {
      pipeline.push({
        $match: {
          $or: [
            { productionNo: { $regex: regex } },
            { "stockdata.article": { $regex: regex } },
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
        articles: { $arrayElemAt: ["$stockdata.article", 0] },
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




















