const { factoryService } = require("../services");
const {
  createFactorySchema,
  updateFactorySchema,
  idParamSchema,
  deleteQuerySchema,
} = require("../validations/factory.validation");

//add factory
const createFactory = async (req, res) => {
  try {
    // await createFactorySchema.validateAsync(req.body);
    // const { name, location } = req.body;
    console.log("req.body",req.body);
    
    const factory = await factoryService.addFactory(req.body);
    res.status(201).json({  success: true, message: "Factory created successfully", data: factory });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//get all factories
const getAllFactories = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search ? req.query.search.trim() : "";
  const factories = await factoryService.getAllFactories(page, limit, search);
// console.log("factories",factories);

  res.json({
    success: true,
    data: factories,
    pagination: factories.pagination
  });
};

//get factory
const getFactoryById = async (req, res) => {
  try {
    await idParamSchema.validateAsync(req.params);
    const factory = await factoryService.getFactoryById(req.params.id);
    if (!factory)
      return res
        .status(404)
        .json({ success: false, message: "Factory not found" });
    res.json({ success: true, data: factory });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//update name and location
const updateFactoryById = async (req, res) => {
  try {
    // await idParamSchema.validateAsync(req.params);
    // await updateFactorySchema.validateAsync(req.body);
    const factory = await factoryService.updateFactoryById(
      req.params.id,
      req.body
    );
    res.json({ success: true, data: factory });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// soft delete
const deleteFactoryById = async (req, res) => {
  try {
    // Validate the `id` parameter
    await idParamSchema.validateAsync(req.params);

    //Only soft delete (set isActive: false)
    const factory = await factoryService.softDeleteFactoryById(req.params.id);

    res.json({
      success: true,
      message: 'Factory soft-deleted (isActive: false)',
      data: factory
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//reactive factory isActive == true
const reactiveFactory = async (req, res) => {
  try {
    const factory = await factoryService.reactiveFactoryById(req.params.id);
    res.json({ success: true, message: "Factory reactivated", data: factory });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

//filter get factories by name
const getFactoryByName = async (req, res) => {
  try {
    const { name } = req.params;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Factory name is required",
      });
    }

    const factory = await factoryService.getFactoryByName(name);

    if (!factory) {
      return res.status(404).json({
        success: false,
        message: "Factory not found",
      });
    }

    res.status(200).json({
      success: true,
      data: factory,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createFactory,
  getAllFactories,
  getFactoryById,
  updateFactoryById,
  deleteFactoryById,
  getFactoryByName,
  reactiveFactory,
};
