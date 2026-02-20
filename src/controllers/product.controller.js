const { productService } = require('../services');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const mongoose = require('mongoose');
//Creata Prduct for Single type
exports.createProduct = async (req, res) => {
  try {
    // If category is JSON string (from form-data), parse it
    let parsedData = { ...req.body };

    if (typeof parsedData.category === "string") {
      parsedData.category = JSON.parse(parsedData.category);
    }

    const product = await productService.createProduct(parsedData, req.file);

    res.status(201).json({
      success: true,
      message: "Article created successfully.",
      product,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

//type two for adding product with multiple color and size in single request
// exports.createProductTypeTwoController = async (req, res) => {
//   try {
//     const data = req.body;
//     const files = req.files || []; // Multer files array

//     if (!data.article || !data.categoryCode) {
//       return res.status(400).json({
//         success: false,
//         message: "Article and categoryCode are required",
//       });
//     }

//     // Parse arrays safely
//     let sizes = [];
//     let colors = [];
//     let types = [];
//     let qualities = [];
//     let pkg = [];

//     try {
//       sizes = data.sizes ? JSON.parse(data.sizes) : [];
//       colors = data.colors ? JSON.parse(data.colors) : [];
//       pkg = data.pkg ? JSON.parse(data.pkgs) : [];
//       types = data.types ? JSON.parse(data.types) : ["Soft", "Hard"];
//       qualities = data.qualities ? JSON.parse(data.qualities) : ["A", "B"];
//     } catch (err) {
//       return res.status(400).json({
//         success: false,
//         message: "sizes, colors, types, qualities must be valid JSON arrays",
//       });
//     }

//     const productData = {
//       article: data.article,
//       categoryCode: data.categoryCode,
//       sizes,
//       colors,
//       types,
//       qualities,
//       pkg,
//       articleCode: data.articleCode || undefined,
//       files,
//     };

//     const product = await productService.createProductTypeTwo(productData);

//     return res.status(201).json({
//       success: true,
//       message: "Article created successfully",
//       data: product.toObject({ getters: true, virtuals: false, versionKey: false })
//     });
//   } catch (err) {
//     console.error("Create ProductTypeTwo Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Internal Server Error",
//       error: err.message,
//     });
//   }
// };

exports.createProductTypeTwoController = async (req, res) => {
  try {
    const data = req.body;
    const files = req.files || []; // multer files

    if (!data.article || !data.categoryCode) {
      return res.status(400).json({
        success: false,
        message: "Article and categoryCode are required",
      });
    }

    function parseFormArray(field) {
  if (!field) return [];
  try {
    const parsed = JSON.parse(field);
    if (Array.isArray(parsed)) return parsed;
    return [parsed]; // single value fallback
  } catch {
    // fallback: comma-separated string
    return field.split(',').map(f => f.trim());
  }
}

    // Parse arrays safely
    let sizes = [];
    let colors = [];
    let types = [];
    let qualities = [];
    let pkgs = [];

    try {
      sizes = data.sizes ? JSON.parse(data.sizes) : [];
      colors = data.colors ? JSON.parse(data.colors) : [];
      pkgs = parseFormArray(data.pkgs);
      types = data.types ? JSON.parse(data.types) : ["Soft", "Hard"];
      qualities = data.qualities ? JSON.parse(data.qualities) : ["A", "B"];
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "sizes, colors, types, qualities must be valid JSON arrays",
      });
    }

    if (!sizes.length) {
      return res.status(400).json({
        success: false,
        message: "sizes array cannot be empty",
      });
    }

    const productData = {
      article: data.article,
      categoryCode: data.categoryCode,
      sizes,
      colors,
      types,
      qualities,
      pkgs,
      articleCode: data.articleCode || undefined,
      files,
    };

    const product = await productService.createProductTypeTwo(productData);

    return res.status(201).json({
      success: true,
      message: "Article created successfully",
      data: product.toObject({ getters: true, virtuals: false, versionKey: false }),
    });
  } catch (err) {
    console.error("Create ProductTypeTwo Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search ? req.query.search.trim() : "";
    const result = await productService.getProducts(page, limit, search);

    res.json({
      success: true,
      data: result.products,
      pagination: result.pagination
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

//get product types 
exports.getProductByIds2 = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Fetching product with category ID:', id);
    
    // Validate if it's a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID format'
      });
    }
    
    const product = await productService.getProductById2(id);
    
    res.status(200).json({
      success: true,
      data: product
    });
    
  } catch (error) {
    console.error('Error in getProductByCategoryId:', error);
    res.status(404).json({
      success: false,
      message: error.message || 'Product not found'
    });
  }
};

exports.getProductByIds = async (req, res) => {
  try {
    const product = await productService.getProductById(req.params.id);
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params; // categoryId
    const updateData = req.body;
    const file = req.file; // multer file

    // Update product by category ID
    const updatedProduct = await productService.updateProductByCategoryId(id, updateData, file);

    // Determine message
    let message = 'Product updated successfully';
    if (updateData.articleCode) {
      message += ' (articleCode updated)';
    }

    return res.status(200).json({
      success: true,
      message,
      data: updatedProduct,
    });

  } catch (err) {
    console.error('❌ Error updating product:', err.message);
    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to update product',
    });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const categoryId = req.params.id; // ID of the category to delete
    const deleted = await productService.deleteProduct(categoryId);

    return res.status(200).json({
      success: true,
      message: deleted.message,
      data: deleted.product,
    });
  } catch (err) {
    console.error("❌ Error deleting category:", err.message);
    return res.status(404).json({
      success: false,
      message: err.message || "Failed to delete category",
    });
  }
};

// Uploading Article data in CSV Format 
exports.uploadCSVController = async (req, res) => {
  try {
    await productService.processCSV(req.file); // Multer gives req.file
    res.status(200).json({
      success: true,
      message: "CSV uploaded and processed successfully",
    });
  } catch (err) {
    console.error("CSV upload error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
// add article cod to Product
exports.addArticleCodeToProduct = async (req, res) => {
  try {
    const { article, articleCode } = req.body;

    if (!article || !articleCode) {
      return res.status(400).json({
        success: false,
        message: "Both 'article' and 'articleCode' are required"
      });
    }

    const product = await productService.addArticleCodetoProduct({
      article,
      articleCode
    });

    return res.status(200).json({
      success: true,
      message: 'Article code added successfully',
      data: product,
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

//add adticle codd to produtc subtype
exports.addArticleCodetoSub = async(req, res) => {
  try {
    const { article, category } = req.body;

    // 1. Basic validation to ensure required fields are present in the request
    if (!article || !category || !Array.isArray(category)) {
      return res.status(400).json({
        success: false,
        message: "Missing 'article' or 'category' array in request body.",
      });
    }

    // 2. Call the service function
    const updatedProduct = await productService.addArticleCodetoProductbysubtype({
      article,
      category,
    });

    // 3. Send successful response
    return res.status(200).json({
      success: true,
      message: "Article codes updated successfully",
      data: updatedProduct,
    });

  } catch (error) {
    // 4. Handle errors (like 'Article not found' or validation errors from the service)
    console.error("Error in addArticleCodeController:", error.message);
    
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updatearticlecode = async (req, res) => {
  try {
    const { id } = req.params; // categoryId
    const updateData = req.body;

    // Update product by category ID
    const updatedProduct = await productService.updatearticlecode(id, updateData);

    return res.status(200).json({
      success: true,
      message: "Article code updated successfully",
      data: updatedProduct,
    });

  } catch (err) {
    console.error('❌ Error updating product:', err.message);
    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to update product',
    });
  }
};

exports.uploadarticlecodeCSVController = async (req, res) => {
  try {
    await productService.processCSVForArticleCode(req.file); // multer provides req.file
    res.status(200).json({ success: true, message: 'CSV uploaded and processed successfully' });
  } catch (err) {
    console.error('CSV upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteArticleCodesss = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await productService.deleteArticleCode(id);

    res.status(200).json({
      success: true,
      message: "ArticleCode removed successfully",
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteArticleCode = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await productService.deleteArticleCodeByCategory(id);

    res.status(200).json({
      success: true,
      message: "ArticleCode removed successfully",
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};