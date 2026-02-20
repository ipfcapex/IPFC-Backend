const { Artical } = require("../models");
const { Warehouse } = require("../models");

// Adds a new article ,
// Checks if all fields match with an existing active article,
// If match → updates the quantity,
// If no match → creates a new article

const addArticle = async (data) => {
  try {
    const {
      articleNumber,
      warehouseId,
      size,
      type,
      color,
      category,
      stockAlertLevel,
      quantity,
      images = [],
    } = data;

    //Fetch factoryIds from warehouse
    const warehouse = await Warehouse.findById(warehouseId).select('factoryIds');
    if (!warehouse || !warehouse.factoryIds || warehouse.factoryIds.length === 0) {
      return {
        success: false,
        message: "Invalid warehouse or no factory linked to this warehouse.",
      };
    }
    const factoryId = warehouse.factoryIds[0];

    //Print the factoryId in console
    console.log("Factory ID linked to warehouse:", factoryId);

    //Check for existing article
    const existing = await Artical.findOne({
      articleNumber,
      warehouseId,
      factoryId,
      size,
      type,
      color,
      category,
      isActive: true,
    });

    if (existing) {
      existing.quantity += quantity;

      if (images && images.length) {
        existing.images = Array.from(new Set([...existing.images, ...images]));
      }

      const updated = await existing.save();

      return {
        success: true,
        message: "Matching article found. Quantity and images updated.",
        data: updated,
      };
    }

    //Create new article with factoryId
    
    const newArticle = await Artical.create({
      articleNumber,
      warehouseId,
      factoryId,
      size,
      type,
      color,
      category,
      stockAlertLevel,
      quantity,
      images,
      isActive: true,
    });
    return {
      success: true,
      message: "New article created successfully.",
      data: newArticle,
    };
    
  } catch (error) {
    console.error("❌ Error creating or updating article:", error);
    return {
      success: false,
      message: "Internal error while adding article.",
      error: error.message,
    };
  }
  
};

//get all artical list
const getAllArticles = async () => {
  return await Artical.find({ isActive: true }).populate("warehouseId");
};

//Get article by ID
const getArticleById = async (id) => {
  return await Artical.findById(id).populate("warehouseId");
};

//Update article by ID
const updateArticle = async (id, updatedData) => {
  const article = await Artical.findByIdAndUpdate(id, updatedData, {
    new: true,
  });
  return article;
};

//Soft delete (set isActive to false)
const softDeleteArticle = async (id) => {
  const article = await Artical.findById(id);
  if (!article) throw new Error("Article not found");
  article.isActive = false;
  return await article.save();
};

module.exports = {
  addArticle,
  getAllArticles,
  getArticleById,
  updateArticle,
  softDeleteArticle,
};
