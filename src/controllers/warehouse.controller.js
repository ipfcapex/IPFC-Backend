const warehouseService = require('../services/warehouse.service');
const { User } = require("../models")
const { Warehouse } = require("../models")
const { Customer } = require("../models")
const { SellOrder } = require("../models")
const { enrichOrdersWithProductDetails } = require("../services/salesOrder.service")


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
    const pageNum = parseInt(req.query.page, 10);
    const limitNum = parseInt(req.query.limit, 10);
    const page = !isNaN(pageNum) && pageNum > 0 ? pageNum : 1;
    const limit = !isNaN(limitNum) && limitNum > 0 ? limitNum : 10;

    // Force search into a clean string
    let search = "";
    if (typeof req.query.search === "string") {
      search = req.query.search.trim();
      if (search === "undefined" || search === "null") search = "";
    } else if (req.query.search && typeof req.query.search === "object") {
      // if client mistakenly sends ?search[name]=value
      search = Object.values(req.query.search)[0] || "";
      if (search === "undefined" || search === "null") search = "";
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

    // Admin/Administrator/Warehouse Manager can see orders across every
    // warehouse; all other roles are scoped to the warehouses assigned to
    // their account.
    const canSeeAllWarehouses = ["Admin", "Administrator", "Warehouse Manager"].includes(req.user.role);

    // Get user's assigned warehouses
    const user = await User.findById(WHid).lean();
    const assignedWarehouses = (user.warehouses || []).map(id => id.toString());

    console.log("Assigned warehouses:", assignedWarehouses, "canSeeAllWarehouses:", canSeeAllWarehouses);

    // Pagination is order-level: skip/limit and the totalItems count below all
    // operate on SellOrder documents, not on the flattened rows returned in
    // `data`. Each order fans out into one row per item-per-warehouse below, so
    // a page of `limit` orders can emit more than `limit` rows. totalPages
    // therefore counts orders, not table rows -- keep this in mind on the client.
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Dispatch Scanner passes ?pending=true to get only orders still pending
    // dispatch (delivered, not yet scanned by the warehouse manager). The Stock
    // Verify table omits the flag and keeps seeing every order/status.
    const pendingOnly = req.query.pending === "true" || req.query.pending === "1";

    // Build base query. Privileged roles are not restricted to assigned warehouses.
    const query = canSeeAllWarehouses
      ? {}
      : { "items.warehouses.warehouse": { $in: assignedWarehouses } };

    if (pendingOnly) {
      query.isActive = true;
      query.deliveryStatus = "DELIVERED";
      query.ScannedByWarehouseManager = { $ne: "SCANNED" };
    }

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
    { "items.warehouses.warehouse": { $in: warehouseIds } },
    { customer: { $in: Customerids } }
  ];

  // Numeric fields
  if (numericSearch !== null) {
    query.$or.push({ "items.warehouses.quantity": numericSearch });
  }
}

    // Optional inclusive date range on order creation date (YYYY-MM-DD).
    const { startDate, endDate } = req.query;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    // Fetch orders with pagination
    const [orders, totalItems] = await Promise.all([
      SellOrder.find(query)
        .populate("items.warehouses.warehouse customer createdBy", "name location")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SellOrder.countDocuments(query)
    ]);

    // Resolve article/category on items from productId/categoryId
    await enrichOrdersWithProductDetails(orders);

    // Flatten the items
    const flattened = [];
    orders.forEach(order => {
      // Total ordered quantity for the whole order = scan cap denominator.
      // Fall back to the sum of warehouse allocations when item.quantity is
      // missing/zero (some records only carry the qty on the warehouse sub-doc).
      const orderTotalQty = order.items.reduce((sum, it) => {
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

      // For the dispatch dropdown, drop orders already fully dispatched.
      if (pendingOnly && scannedQty >= orderTotalQty) {
        return;
      }

      order.items.forEach(item => {
        item.warehouses.forEach(wh => {
          const whId = wh.warehouse?._id?.toString() || wh.warehouse?.toString();
          if (whId && (canSeeAllWarehouses || assignedWarehouses.includes(whId))) {
            // Per-warehouse-allocation scan progress:
            // how much of THIS warehouse's allocated quantity has been
            // scanned/dispatched (wh.scanqtyatdispatch out of wh.quantity).
            const allocatedQty = Number(wh.quantity) || 0;
            const allocScannedQty = Number(wh.scanqtyatdispatch) || 0;
            const whScanPercent =
              allocatedQty > 0
                ? Math.min(100, Math.round((allocScannedQty / allocatedQty) * 100))
                : 0;

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
              ScanByorder: wh.ScanByorder,
              // Per-warehouse allocation scan progress
              scanqtyatdispatch: allocScannedQty,
              scanPercent: whScanPercent,
              // Order-level totals kept for backward compatibility
              numOfDispatchedQty: scannedQty,
              orderTotalQty,
              orderScanPercent: scanPercent
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




