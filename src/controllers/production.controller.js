const { productionService } = require("../services");
const {User, Production} = require("../models");
const QRCode = require("qrcode");

exports.createProduct = async (req, res) => {
  try {
    const result = await productionService.createProduct(req.body);

    // Check the result from service
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    // If success
    return res.status(201).json({
      success: true,
      message: result.message,
      production: result.production,
      notification: result.notification,
    });
  } catch (err) {
    console.error("❌ Controller Error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = ""} = req.query;

    const trimmedSearch = search.trim(); 
    const products = await productionService.getProducts(
      Number(page),
      Number(limit),
      trimmedSearch 
    );
    
    res.status(200).json(products);
  } catch (err) {
    console.error("Get Products Controller Error:", err); 
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch products.",
      error: err.message
    });
  }
};

exports.getProductionDatabyPM = async (req, res) => {
  try {
    console.log("➡️ getProductionDatabyPM API called");

    if (!req.user || (!req.user.id && !req.user._id)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found",
      });
    }

    // 🔐 Logged-in Packing Reporter ID
    const PMid = req.user.id || req.user._id;
    console.log("✅ PM ID:", PMid);

    // 👤 Fetch user
    const user = await User.findById(PMid).lean();
    console.log("👤 User:", user);

    if (!user || user.role !== "Packing Reporter") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // 🏭 FACTORIES ASSIGNED TO PM (IMPORTANT)
    const assignedFactories = (user.production || []).map(id => id.toString());
    console.log("🏭 Assigned factories:", assignedFactories);

    if (!assignedFactories.length) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No factories assigned to this Packing Reporter",
      });
    }

    // 📄 Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // ✅ CORRECT QUERY
    const query = {
      factory: { $in: assignedFactories },
      isActive: true
    };

    // 🔍 Search
    if (req.query.search && req.query.search.trim()) {
      const search = req.query.search.trim();
      const regex = new RegExp(search, "i");
      const numericSearch = !isNaN(search) ? Number(search) : null;

      query.$or = [
        { productionNo: regex },
        { article: regex },
        { status: regex }
      ];

      if (numericSearch !== null) {
        query.$or.push({ productionQuantity: numericSearch });
        query.$or.push({ dispatchedQuantity: numericSearch });
      }
    }

    console.log("🧾 Final Mongo Query:", JSON.stringify(query, null, 2));

    // 📦 Fetch production data
    const [productions, totalItems] = await Promise.all([
      Production.find(query)
        .populate("factory", "name location")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Production.countDocuments(query)
    ]);

    console.log("📦 Productions fetched:", productions.length);

    // 🔁 Flatten response
    const flattened = productions.map(p => ({
      productionId: p._id,
      productionNo: p.productionNo,
      article: p.article,
      productionDate: p.productionDate,
      productionQuantity: p.productionQuantity,
      dispatchedQuantity: p.dispatchedQuantity,
      status: p.status,
      factory: p.factory,
      createdAt: p.createdAt
    }));

    return res.status(200).json({
      success: true,
      data: flattened,
      pagination: {
        currentPage: page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
        totalItems
      }
    });

  } catch (err) {
    console.error("🔥 Error fetching production by PM:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching production",
      error: err.message
    });
  }
};

exports.getProductionsWithoutQR = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const trimmedSearch = search.trim(); 
    const data = await productionService.getproductionDatawithoutQR(
      Number(page),
      Number(limit),
      trimmedSearch 
    );

      return res.status(200).json({
        success: true,
       ...data,
        pagination: data.pagination,
      });


    return res.status(200).json({
      success: true,
      message: "Productions without QR codes retrieved successfully",
      data: data.items,
      pagination: data.pagination,
    });
  } catch (error) {
    console.error("Error in getProductionsWithoutQR:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getProductByIdController = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Production ID is required" });
    }

    const product = await productionService.getProductsById(id);

    if (!product) {
      return res.status(404).json({ error: "Production not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Production fetched successfully",
      data: product,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

exports.getStockByFactoryssss = async (req, res) => {
  try {
    const { factory } = req.params;
    const { page = 1, limit = 10, search = "" } = req.query; // include search

    // Call service with search
    const result = await productionService.getAggregatedStockByFactory(
      factory,
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

exports.updateProduct = async (req, res) => {
  try {
    const product = await productionService.updateProduct(
      req.params.id,
      req.body
    );
    res.status(200).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const deletedProduction = await productionService.deleteProduct(req.params.id);
    res.status(200).json({ message: `Production ${deletedProduction.productionNo} deleted successfully`  });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.TrackProductionbyQr = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: "Missing request body" });
    }

    const qrImage = req.body.qrImage;
    console.log("QR:", req.body)
    const result = await productionService.scanProduct(qrImage );
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({
      message: "QR scanned successfully",
      data: result,
    });

  } catch (error) {
    console.error("Error in TrackProductionbyQr:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};
