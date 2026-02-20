const warehouseService = require('../services/warehouse.service');
const { User } = require("../models")
const { Warehouse } = require("../models")
const { Customer } = require("../models")
const { SellOrder } = require("../models")


exports.create = async (req, res, next) => {
  try {
    console.log("req.body",req.body);
    
    const warehouse = await warehouseService.createWarehouse(req.body);
    console.log("warehouse",warehouse);

    //Return success response
    return res.status(201).json({
      success: true,
      message: 'Warehouse Created successfully',
      warehouse,
    });
  } catch (err) {
    next(err);
  }
};

exports.getAll = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Force search into a clean string
    let search = "";
    if (typeof req.query.search === "string") {
      search = req.query.search.trim();
    } else if (req.query.search && typeof req.query.search === "object") {
      // if client mistakenly sends ?search[name]=value
      search = Object.values(req.query.search)[0] || "";
    }

    const result = await warehouseService.getWarehouses(page, limit, search);

    res.json({
      success: true,
      data: result.warehouses,
      pagination: result.pagination,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res, next) => {
  try {
    const warehouse = await warehouseService.getWarehouseById(req.params.id);
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
    // console.log("warehouse",warehouse.factoryIds);
    res.json(warehouse);
  } catch (err) {
    next(err);
  }
};

//get warehouse Stock by id 
exports.getStockByWarehousessss = async (req, res) => {
  try {
    const { warehouse } = req.params;
    const { page = 1, limit = 10, search = "" } = req.query; // include search

    // Call service with search
    const result = await warehouseService.getAggregatedStockByWarehouse(
      warehouse,
      Number(page),
      Number(limit),
      search
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in getStockByWarehousessss:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};

//Get Order By Warehousmanager 
exports.getOrderDatabyWH = async (req, res) => {
  try {
    if (!req.user || (!req.user.id && !req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found",
      });
    }

    const WHid = req.user.id || req.user._id;

    // Get user's assigned warehouses
    const user = await User.findById(WHid).lean();
    const assignedWarehouses = (user.warehouses || []).map(id => id.toString());

    console.log("Assigned warehouses:", assignedWarehouses);

    // Pagination setup
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Build base query
    const query = {
      "items.warehouses.warehouse": { $in: assignedWarehouses }
    };

    // Search handling
  if (req.query.search && req.query.search.trim() !== "") {
  const search = req.query.search.trim();
  const regex = new RegExp(search, "i");
  const numericSearch = !isNaN(search) ? Number(search) : null;

  // Step 1: find warehouse ids matching search name
  const matchingWarehouses = await Warehouse.find({ name: regex }).select("_id").lean();
  const warehouseIds = matchingWarehouses.map(w => w._id);

  const matchingCustomer = await Customer.find({ name: regex }).select("_id").lean();
  const Customerids = matchingCustomer.map(w => w._id);

  query.$or = [
    { salesOrderNo: regex },
    { items: { $elemMatch: { quality: regex } } },
    { items: { $elemMatch: { color: regex } } },
    { items: { $elemMatch: { type: regex } } },
    { items: { $elemMatch: { article: regex } } }, 
    { "items.warehouses.warehouse": { $in: warehouseIds } },
    { customer: { $in: Customerids } }
  ];

  // Numeric fields
  if (numericSearch !== null) {
    query.$or.push({ items: { $elemMatch: { article: numericSearch } } });
    query.$or.push({ items: { $elemMatch: { size: numericSearch } } });
    query.$or.push({ items: { $elemMatch: { categoryCode: numericSearch } } });
    query.$or.push({ "items.warehouses.quantity": numericSearch });
  }
}

    // Fetch orders with pagination
    const [orders, totalItems] = await Promise.all([
      SellOrder.find(query)
        .populate("items.warehouses.warehouse customer createdBy", "name location")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SellOrder.countDocuments(query)
    ]);

    // Flatten the items
    const flattened = [];
    orders.forEach(order => {
      order.items.forEach(item => {
        item.warehouses.forEach(wh => {
          const whId = wh.warehouse?._id?.toString() || wh.warehouse?.toString();
          if (whId && assignedWarehouses.includes(whId)) {
            flattened.push({
              orderId: order._id,
              salesOrderNo: order.salesOrderNo,
              createdBy: order.createdBy,
              customer: order.customer,
              location: order.Location, // lowercase field
              article: item.article,
              categoryCode: item.categoryCode,
              color: item.color,
              size: item.size,
              type: item.type,
              quality: item.quality,
              warehouse: wh.warehouse,
              quantity: wh.quantity,
              ScanByorder: wh.ScanByorder
            });
          }
        });
      });
    });

    const totalPages = Math.ceil(totalItems / limit);

    return res.status(200).json({
      success: true,
      data: flattened,
      pagination: {
        currentPage: page,
        limit,
        totalPages,
        totalItems
      }
    });

  } catch (err) {
    console.error("Error fetching orders by warehouse:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching orders",
      error: err.message
    });
  }
};

exports.update = async (req, res, next) => {
  try {
    console.log("req.body",req.body);
    const updated = await warehouseService.updateWarehouse(req.params.id, req.body);
    console.log("updated",updated);
    
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const deleted = await warehouseService.deleteWarehouse(req.params.id);
    res.json({ message: 'Warehouse deleted', deleted });
  } catch (err) {
    next(err);
  }
};




