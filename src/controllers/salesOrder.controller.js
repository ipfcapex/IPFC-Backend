const { parseString } = require('fast-csv');
const { orderService } = require('../services');
const { Cart } = require('../models')
const { SellOrder } = require('../models')
const { User } = require('../models')

exports.getAggregatedStocks = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search?.trim() || "";
    // Optional: when the order is created from a wishlist, exclude that
    // wishlist's own reserved qty from the availability calculation.
    const excludeWishlistId = req.query.excludeWishlistId?.trim() || null;

    const aggregatedStock = await orderService.getAggregatedStock(page, limit, search, excludeWishlistId);

    return res.status(200).json({
      success: true,
      ...aggregatedStock,
    });
  } catch (error) {
    console.error("Error fetching aggregated stock:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve aggregated stock",
      error: error.message,
    });
  }
};

exports.AddOrdertoCartContorller = async (req, res) => {
  console.log("Sell order")
  try {
    const { customer, location, items, schemesId, note } = req.body;
    const createdBy = req.user.id || req.user._id;

    if (!customer || !location || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid input. Please provide customer, location, and items."
      });
    }

    const order = await orderService.AddOrdertoCart({ customer, location, items, schemesId, createdBy, note });

    // Build dynamic message
    let message = "Order created successfully";
    
    if (order.items && order.items.length > 0 && order.WishList && order.WishList.length > 0) {
      const wishlistDetails = order.WishList
        .map(
          (w) =>
            `${w.article} (${w.color}, ${w.size}, ${w.type} ${w.quality}, Qty: ${w.quantity})`
        )
        .join("; ");

      message = `Order created successfully, but item moved to Wishlist: [${wishlistDetails}]`;
    }else if(order.WishList && order.WishList.length > 0) {
            const wishlistDetails = order.WishList
        .map(
          (w) =>
            `${w.article} (${w.color}, ${w.size}, ${w.type} ${w.quality}, Qty: ${w.quantity})`
        )
        .join("; ");

      message = `Item moved to Wishlist: [${wishlistDetails}]`;
    }

    return res.status(201).json({
      success: true,
      message,
      data: order
    });
  } catch (error) {
    console.error("Error in createOrder:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getAllatCart = async (req, res, next) => {
  try {
    const data = await orderService.getOrdersatCart(req.query, req.query.page, req.query.limit);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.removeCart = async (req, res, next) => {
  try {
    await orderService.DeleteCartitems(req.params.id);
    res.json({ success: true, message: 'Order deleted' });
  } catch (err) {
    next(err);
  }
};

exports.checkoutProduct = async (req, res) => {
  try {
    const { id } = req.params; // cart _id from URL

    const result = await orderService.SelectProductforCheckout(id);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getAll = async (req, res, next) => {
  try {
     const { page = 1, limit = 10, search = "", ...filters } = req.query;
     const Search = search.trim();
    const data = await orderService.getOrders(
      filters,
      parseInt(page, 10),
      parseInt(limit, 10),
      Search
    );

    res.status(200).json({
      success: true,
      ...data   // instead of { data }
    });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res) => {
  const stock = await orderService.getOrderById(req.params.id);
  if (!stock)
    return res.status(404).json({ message: "Order not found" });
  res.json(stock);
};

exports.update = async (req, res, next) => {
  try {
    const data = await orderService.updateOrder(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    await orderService.softDeleteOrder(req.params.id);
    res.json({ success: true, message: 'Order soft-deleted' });
  } catch (err) {
    next(err);
  }
};

exports.getApproved = async (req, res, next)=>{
  console.log("getApproved worked");
  
  try{

    
    const data = await orderService.getApprovedOrders();
    console.log("data",data);
    
    res.json({ success: true, data });
  } catch (err) {
      next(err); 
  }
}

exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params; // customer ID from route
    const { page = 1, limit = 10, search = "" } = req.query; // pagination + search from query

    const customerWithOrders = await orderService.getCustomerWithOrders(
      id,
      page,
      limit,
      search
    );

    res.json({
      success: true,
      message: "Customer fetched successfully",
      data: customerWithOrders
    });
  } catch (error) {
    console.error("Error fetching customer:", error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};


exports.getWishlistData = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = String(req.query.search || "").trim();

    // Clone and clean filters
    const filters = { ...req.query };
    delete filters.page;
    delete filters.limit;
    delete filters.search;

    const data = await orderService.getWishlistItems(filters, page, limit, search);

    return res.status(200).json({
      message: "All wishlist data retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error in getWishlistData:", error);
    return res.status(400).json({ error: error.message });
  }
};

exports.applyScheme = async (req, res) => {
  try {
    const { salesOrderNo, customerId, schemesId } = req.body;

    // Call service to apply applySchemeToOrder
    const updatedOrder = await orderService.applySchemeToOrder({ salesOrderNo, customerId, schemesId });

    res.status(200).json({
      success: true,
      data: updatedOrder
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  }
};

exports.deleWishlist = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await orderService.deleteWishlist(id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    return res.status(200).json({
      ...result,
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.error("Error in softUpdateWishlist:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
};

//Get cart items that is creted by Sales Person( Note it does not have service code)
exports.getCartdatabySalesperson = async (req, res) => {
  try {
    if (!req.user || (!req.user.id && !req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in request"
      });
    }

    const userId = req.user.id || req.user._id;

    // Pagination params (default: page=1, limit=10)
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Total count for this user
    const total = await Cart.countDocuments({ createdBy: userId });

    // Fetch paginated carts
    const carts = await Cart.find({ createdBy: userId })
      .populate("createdBy", "name email phone role location")
      .populate("customer", "name email phone role location ")
      .sort({ createdAt: -1 }) // latest first
      .skip(skip)
      .limit(limit);

    if (!carts || carts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No carts found for this user"
      });
    }
    // console.log("order",carts)
    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: carts
    });
  } catch (err) {
    console.error("Error fetching cart by salesperson:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Server error"
    });
  }
};

//Wishlist for Cart and Sellorder model(order)
exports.getWishlistItemsbySalesperson = async (req, res) => {
  try {
    // Ensure logged-in user exists
    if (!req.user || (!req.user.id && !req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in request",
      });
    }

    const userId = req.user.id || req.user._id;

    // Pagination setup
    const pageNum = parseInt(req.query.page, 10) || 1;
    const limitNum = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || "";

    // Query: wishlist must exist & createdBy = logged in user
    const query = {
      isActive: true,
      createdBy: userId,
      WishList: { $exists: true, $ne: [] },
    };

    // --- Search function ---
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

    // Fetch Cart wishlist items
    let cartOrders = await Cart.find(query)
      .select("salesOrderNo customer article WishList createdBy createdAt")
      .populate("customer", "name")
      .populate("createdBy", "name email")
      .lean();

    // Mark source
    cartOrders = cartOrders.map(o => ({ ...o, source: "Cart" }));

    // Fetch SellOrder wishlist items
    let sellOrders = await SellOrder.find(query)
      .select("salesOrderNo customer article WishList createdBy createdAt")
      .populate("customer", "name")
      .populate("createdBy", "name email")
      .lean();

    // Mark source
    sellOrders = sellOrders.map(o => ({ ...o, source: "SellOrder" }));

    // Merge both
    let allOrders = [...cartOrders, ...sellOrders];

    // Apply search
    const filteredOrders = applySearch(allOrders, search);

    // Sort by createdAt (newest first)
    filteredOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const totalItems = filteredOrders.length;
    const totalPages = Math.ceil(totalItems / limitNum);
    const skip = (pageNum - 1) * limitNum;
    const paginatedOrders = filteredOrders.slice(skip, skip + limitNum);

    return res.status(200).json({
      success: true,
      data: paginatedOrders,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems,
      },
    });

  } catch (err) {
    console.error("Error fetching wishlist items:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

//Get all order by salesperson
exports.getAllbySalesperson = async (req, res) => {
  try {
    if (!req.user || (!req.user.id && !req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in request",
      });
    }
    const userId = req.user.id || req.user._id;

    // Pagination setup
    const pageNum = parseInt(req.query.page, 10) || 1;
    const limitNum = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || "";
    const startDate = req.query.startDate || "";
    const endDate = req.query.endDate || "";

    // Query: wishlist must exist & createdBy = logged in user
    const query = {
      isActive: true,
      createdBy: userId,
      items: { $exists: true, $ne: [] },
    };

    // Optional inclusive date range on order creation date (YYYY-MM-DD).
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const applySearch = (items, searchText) => {
      if (!searchText || searchText.trim() === "") return items;
      const regex = new RegExp(searchText.trim(), "i");
      return items.filter(order =>
        regex.test(order.salesOrderNo || "") ||
        regex.test(order.article || "") ||
        regex.test(order.customer?.name || "") ||
        regex.test(order.createdBy?.name || "") ||
        (order.items && order.items.some(item => regex.test(item.article || "")))
      );
    };
    let cartOrders = await SellOrder.find(query)
      .select("salesOrderNo customer article items createdBy createdAt numOfDispatchedQty scheme")
      .populate("customer", "name")
      .populate("createdBy", "name email")
      .populate("scheme", "schemesName schemesType schemesQuantity schemesDescription")
      .populate({
        path: "items.productId",
        model: "Product"
      })
      .lean();

    // Apply search
    const filteredOrders = applySearch(cartOrders, search);

    filteredOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const totalItems = filteredOrders.length;
    const totalPages = Math.ceil(totalItems / limitNum);
    const skip = (pageNum - 1) * limitNum;
    const paginatedOrders = filteredOrders.slice(skip, skip + limitNum);

    // Attach scan/dispatch progress per order (same calc as the warehouse view):
    // orderTotalQty falls back to the sum of warehouse allocations when
    // item.quantity is missing/zero, and scanPercent is dispatched / total.
    const enrichedOrders = paginatedOrders.map((order) => {
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

      const formattedItems = (order.items || []).map((it) => {
        const product = it.productId;
        let category = null;
        if (product && Array.isArray(product.category) && it.categoryId) {
          category = product.category.find(
            (c) => c._id.toString() === it.categoryId.toString()
          );
        }
        return {
          ...it,
          article: product?.article || order.article || "N/A",
          categoryCode: category?.categoryCode || "N/A",
          color: category?.color || "N/A",
          size: category?.size || "N/A",
          type: category?.type || "N/A",
          quality: category?.quality || "N/A",
        };
      });

      return {
        ...order,
        items: formattedItems,
        orderTotalQty,
        numOfDispatchedQty: scannedQty,
        scanPercent,
      };
    });

    return res.status(200).json({
      success: true,
      data: enrichedOrders,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems,
      },
    });

  } catch (err) {
    console.error("Error fetching wishlist items:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

exports.deletessItem = async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete the cart item
    const updatedCart = await orderService.Deleteitems(id);

    if (!updatedCart) {
      return res.status(404).json({
        message: "Order item not found or already inactive"
      });
    }

    return res.status(200).json({
      message: "Order item successfully deactivated",
      cart: updatedCart
    });
  } catch (error) {
    console.error("Error in deleteCartItem:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};

exports.reverseDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await orderService.reverseDelivery(id, req.body);

    return res.status(200).json({
      success: true,
      message: "Delivery reversed successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error in reverseDelivery:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Orders pending warehouse scan/dispatch (total item qty != numOfDispatchedQty)
exports.getOrdersForWarehouseScan = async (req, res) => {
  try {
    // Identify the logged-in warehouse manager and their assigned warehouse(s),
    // so the dropdown only lists orders that still need scanning at THEIR
    // warehouse(s) (orders can be split across multiple warehouses).
    const managerId = req.user?.id || req.user?._id;
    const manager = await User.findById(managerId).select("warehouses");
    const warehouseIds = (manager?.warehouses || []).map((w) => w.toString());

    const orders = await orderService.getOrdersForWarehouseScan(warehouseIds);

    return res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error("Error fetching orders for warehouse scan:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve orders for warehouse scan",
      error: error.message,
    });
  }
};

exports.stopOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await orderService.stopOrder(id);

    return res.status(200).json({
      success: true,
      message: "Order stopped and partially delivered items prepared successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error in stopOrder:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};