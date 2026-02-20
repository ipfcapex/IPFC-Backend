const Warehouse = require('../models/warehouse.model');
const Factory = require('../models/factory.model');
const { Stock } = require("../models")
const mongoose = require("mongoose");

exports.createWarehouse = async (data) => {
  console.log("data",data);
  

  if (!data) {
    throw new Error("Warehouse data is required to create a warehouse");
  }
  const existingWarehouse = await Warehouse.findOne({
    name: { $regex: new RegExp(`^${data.name}$`, "i") } // case-insensitive match
  });

  if (existingWarehouse) {
    throw new Error(`Warehouse name '${data.name}' already exists`);
  }
  
  // const factoryExists = await Factory.findById(data.factoryIds);
  // if (!factoryExists) {
  //   throw new Error("Factory does not exist");
  // }
  const newWarehouse = await Warehouse.create(data);
  return newWarehouse;
};

exports.getWarehouses = async (page, limit, search = "") => {
  const skip = (page - 1) * limit;
  const query = { isDeleted: false };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } }
    ];
  }

  const [warehouses, totalItems] = await Promise.all([
    Warehouse.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }),
    Warehouse.countDocuments(query)
  ]);

  const totalPages = Math.ceil(totalItems / limit);

  return {
    warehouses,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems
    }
  };
};

exports.getWarehouseById =  async (id) => {
//  let result =await Warehouse.findById(id);
 let result =await  Warehouse.findOne({ _id: id, isDeleted: false });
 console.log("result",result);
 
  return result;
};

//get stock by warehouse id 
exports.getAggregatedStockByWarehouse = async (warehouse, page = 1, limit = 10, search = "") => {
  try {
    page = Number(page);
    limit = Number(limit);

    // Convert warehouse to ObjectId if valid
    let warehouseMatch = warehouse;
    if (mongoose.Types.ObjectId.isValid(warehouse)) {
      warehouseMatch = new mongoose.Types.ObjectId(warehouse);
    }

    // Build search filter
    let searchFilter = {};
    if (search && search.trim() !== "") {
      const regex = new RegExp(search.trim(), "i"); // case-insensitive
      searchFilter = {
        $or: [
          { "stockdata.article": regex },
          { "stockdata.color": regex },
          { "stockdata.size": regex },
          { "stockdata.quality": regex },
          { "stockdata.type": regex }
        ]
      };
    }

const pipeline = [
  { $match: { warehouse: warehouseMatch } },
  { $unwind: "$stockdata" },
  ...(search ? [{ $match: searchFilter }] : []),

  // Lookup warehouse details
  {
    $lookup: {
      from: "warehouses",
      localField: "warehouse",
      foreignField: "_id",
      as: "warehouseDetails"
    }
  },
  { $unwind: "$warehouseDetails" },

  // Group by article + category
  {
    $group: {
      _id: {
        article: "$stockdata.article",
        categoryCode: "$stockdata.categoryCode",
        color: "$stockdata.color",
        size: "$stockdata.size",
        quality: "$stockdata.quality",
        type: "$stockdata.type"
      },
      totalQuantity: {
        $sum: {
          $cond: [{ $eq: ["$stockdata.dispatched", false] }, "$stockdata.quantity", 0]
        }
      },
      dispatchStock: {
        $sum: {
          $cond: [{ $eq: ["$stockdata.dispatched", true] }, "$stockdata.quantity", 0]
        }
      },
      warehouseId: { $first: "$warehouse" },
      warehouseName: { $first: "$warehouseDetails.name" },
      warehouseLocation: { $first: "$warehouseDetails.location" } // nested object
    }
  },

  // Sort & paginate
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

const result = await Stock.aggregate(pipeline);

const warehouseDetails = await Warehouse.findById(warehouseMatch).select("name location");

// Handle no aggregation result
if (!result.length || result[0].data.length === 0) {
  return {
    warehouse: warehouseDetails
      ? {
          warehouseId: warehouseDetails._id,
          warehouseName: warehouseDetails.name,
          warehouseLocation: warehouseDetails.location
        }
      : null,
    aggregatedStock: [],
    pagination: { currentPage: page, totalPages: 0, totalCount: 0 }
  };
}

const aggregatedStock = result[0].data.map(item => ({
  article: item._id.article,
  categoryCode: item._id.categoryCode,
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

const warehouseDetail = {
  warehouseId: result[0].data[0].warehouseId,
  warehouseName: result[0].data[0].warehouseName,
  warehouseLocation: result[0].data[0].warehouseLocation // nested object
};

return {
  warehouse: warehouseDetail,
  aggregatedStock,
  pagination: { currentPage: page, totalPages, totalCount }
};
  } catch (err) {
    console.error("Error in getAggregatedStockByWarehouse:", err);
    throw { message: "Internal server error", error: err.message };
  }
};

exports.updateWarehouse = async (id, data) => {
  console.log("id, data",id, data);
  
 let result = Warehouse.findByIdAndUpdate(id, data, { new: true });
  return result
};

// exports.deleteWarehouse = (id) => Warehouse.findByIdAndDelete(id);
exports.deleteWarehouse = async (id) => {
  return await Warehouse.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
};

