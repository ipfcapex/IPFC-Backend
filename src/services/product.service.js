require("dotenv").config();
const { Product } = require('../models')
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const cloudinary = require("../utils/cloudinary")
const { uploadToS3 } = require("../middleware/aws.Middleware"); // your S3 helper
require('dotenv').config();

//Add one Product at a time(Current not in use)
const createProduct = async (data, file) => {
  const { article: rawArticle, category } = data;
  const article = typeof rawArticle === 'string' ? rawArticle.replace(/\s+/g, '') : rawArticle;

  if (!article || !Array.isArray(category) || category.length !== 1) {
    throw new Error("Article and exactly one category are required.");
  }

  const [cat] = category;
  let { categoryCode, color, size, type, quality } = cat;

  if (!categoryCode || !color) {
    throw new Error("Category must have categoryCode and color");
  }

  if (typeof categoryCode === 'string') categoryCode = categoryCode.replace(/\s+/g, '');
  if (typeof color === 'string') color = color.replace(/\s+/g, '');
  if (typeof size === 'string') size = size.replace(/\s+/g, '');

  // Keep size as a string
  size = size || "";

  // Convert type and quality to arrays if not already
  type = Array.isArray(type) ? type : [type || ""];
  quality = Array.isArray(quality) ? quality : [quality || ""];

  cat.categoryCode = categoryCode;
  cat.color = color;
  cat.size = size;
  cat.type = type;
  cat.quality = quality;

  // Image upload handling( insated of this AWS S3 will be used)
  if (file) {
    const backendUrl = "https://apex-api.testsdlc.in";
    const relativePath = `/uploads/${file.filename}`;
    cat.image = [`${backendUrl}${relativePath}`]; // store as array
  }

  console.log("Uploaded image URL:", cat.image);

  // Generate unique SQU code including article
  const typeCode = type.includes("Soft") && type.includes("Hard") ? "SH" :
    type.includes("Soft") ? "S" :
      type.includes("Hard") ? "H" : "X";
  const colorCode = color ? color.toUpperCase().replace(/\s+/g, '') : "X";
  const categoryCodeChar = categoryCode ? categoryCode.substring(0, 5).toUpperCase() : "XXXXX";
  const qualityCode = quality.includes("A") && quality.includes("B") ? "AB" :
    quality.includes("A") ? "A" :
      quality.includes("B") ? "B" : "X";

  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  const SQU = `#${randomNum}${article}${categoryCodeChar}${colorCode}${size}${typeCode}${qualityCode}`;
  cat.SQU = SQU;

  // Check if article exists
  let product = await Product.findOne({ article });

  if (product) {
    const exists = product.category.some(c =>
      c.color === color &&
      c.size === size &&
      c.isActive === true &&
      JSON.stringify(c.type) === JSON.stringify(type) &&
      JSON.stringify(c.quality) === JSON.stringify(quality)
    );

    if (exists) {
      throw new Error("Category with same details already exists for this article.");
    }

    product.category.push(cat);
    await product.save();
    return product;
  } else {
    const newProduct = await Product.create({ article, category: [cat] });
    return newProduct;
  }
};

//Add Multipal Product at a time
// const createProductTypeTwo = async (data) => {
//   const { article, categoryCode, sizes, colors, types, qualities, articleCode, files, pkgs } = data;

//   const selectedTypes = Array.isArray(types) && types.length ? types : ["Soft", "Hard"];
//   const selectedQualities = Array.isArray(qualities) && qualities.length ? qualities : ["A", "B"];
//   const uploadedFiles = Array.isArray(files) ? files : [];// keep as array
//   const pkgsArr = Array.isArray(pkgs) ? pkgs : [];

//   const newCategories = [];

//   for (let i = 0; i < sizes.length; i++) {
//     const size = sizes[i];

//     // 🟢 Normalize color (capitalize first letter, lowercase rest)
//     let color = colors[i] || "";
//     color = color.charAt(0).toUpperCase() + color.slice(1);

//     let pkg = pkgsArr[i] || "";
//     // ✅ Upload image to AWS S3
//     let uploadedImageUrl = [];
//     if (uploadedFiles[i]) {
//       try {
//         const fileUrl = await uploadToS3(uploadedFiles[i]);
//         uploadedImageUrl = [fileUrl];
//       } catch (err) {
//         console.error("AWS S3 upload failed:", err);
//         throw new Error("Failed to upload image to AWS S3");
//       }
//     }

//     const cat = {
//       categoryCode,
//       size,
//       color,
//       type: selectedTypes,
//       quality: selectedQualities,
//       pkg,
//       articleCode: articleCode || undefined,
//       image: uploadedImageUrl,
//       isActive: true,
//     };

//     // 🔢 Generate SQU
//     const typeCode =
//       selectedTypes.includes("Soft") && selectedTypes.includes("Hard")
//         ? "SH"
//         : selectedTypes.includes("Soft")
//           ? "S"
//           : selectedTypes.includes("Hard")
//             ? "H"
//             : "X";

//     const colorCode = color ? color.toUpperCase().replace(/\s+/g, "") : "X";
//     const categoryCodeChar = categoryCode
//       ? categoryCode.substring(0, 5).toUpperCase()
//       : "XXXXX";

//     const qualityCode =
//       selectedQualities.includes("A") && selectedQualities.includes("B")
//         ? "AB"
//         : selectedQualities.includes("A")
//           ? "A"
//           : selectedQualities.includes("B")
//             ? "B"
//             : "X";

//     const randomNum = Math.floor(1000 + Math.random() * 9000);
//     const SQU = `#${randomNum}${article}${categoryCodeChar}${colorCode}${size}${typeCode}${qualityCode}`;
//     cat.SQU = SQU;

//     newCategories.push(cat);
//   }

//   // 🔍 Check if product exists
//   let product = await Product.findOne({ article });

//   if (product) {
//     const existingKeys = new Set(
//       product.category.map(
//         (cat) =>
//           `${cat.categoryCode}-${cat.size}-${cat.color.toLowerCase()}-${cat.type.join(",")}-${cat.quality.join(",")}`
//       )
//     );

//     const duplicates = [];
//     const filteredCategories = [];

//     for (const cat of newCategories) {
//       const key = `${cat.categoryCode}-${cat.size}-${cat.color.toLowerCase()}-${cat.type.join(",")}-${cat.quality.join(",")}`;
//       if (existingKeys.has(key)) {
//         duplicates.push({ size: cat.size, color: cat.color });
//       } else {
//         filteredCategories.push(cat);
//       }
//     }

//     if (duplicates.length > 0) {
//       const duplicateList = duplicates
//         .map((d) => `Size: ${d.size}, Color: ${d.color}`)
//         .join("; ");
//       throw new Error(
//         `Article ${article} already has the following size-color combinations: ${duplicateList}`
//       );
//     }

//     if (filteredCategories.length > 0) {
//       product.category.push(...filteredCategories);
//     } else {
//       throw new Error(`No new categories to add for article "${article}".`);
//     }
//   } else {
//     product = new Product({
//       article,
//       category: newCategories,
//       isActive: true,
//     });
//   }

//   await product.save();
//   return product;
// }; 

// const createProductTypeTwo = async (data) => {
//   const { article, categoryCode, sizes, colors, types, qualities, articleCode, files, pkgs } = data;

//   if (!sizes || !Array.isArray(sizes) || sizes.length === 0) {
//     throw new Error("sizes must be a non-empty array");
//   }

//   const selectedTypes = Array.isArray(types) && types.length ? types : ["Soft", "Hard"];
//   const selectedQualities = Array.isArray(qualities) && qualities.length ? qualities : ["A", "B"];
//   const uploadedFiles = Array.isArray(files) ? files : [];
//   const pkgsArr = Array.isArray(pkgs) ? pkgs : [];

//   const newCategories = [];

//   for (let i = 0; i < sizes.length; i++) {
//     const size = sizes[i] || "";
//     const colorRaw = colors && colors[i] ? colors[i] : "";
//     const color = colorRaw.charAt(0).toUpperCase() + colorRaw.slice(1);

//     const pkg = pkgsArr[i] || "";
//     const file = uploadedFiles[i] || null;

//     // Upload file if exists
//     let uploadedImageUrl = [];
//     if (file) {
//       try {
//         const fileUrl = await uploadToS3(file);
//         uploadedImageUrl = [fileUrl];
//       } catch (err) {
//         console.error("AWS S3 upload failed:", err);
//         throw new Error("Failed to upload image to AWS S3");
//       }
//     }

//     // Create category object
//     const cat = {
//       categoryCode,
//       size,
//       color,
//       type: selectedTypes,
//       quality: selectedQualities,
//       pkg,
//       articleCode: articleCode || undefined,
//       image: uploadedImageUrl,
//       isActive: true,
//     };

//     // Generate SQU
//     const typeCode =
//       selectedTypes.includes("Soft") && selectedTypes.includes("Hard")
//         ? "SH"
//         : selectedTypes.includes("Soft")
//           ? "S"
//           : selectedTypes.includes("Hard")
//             ? "H"
//             : "X";

//     const colorCode = color ? color.toUpperCase().replace(/\s+/g, "") : "X";
//     const categoryCodeChar = categoryCode
//       ? categoryCode.substring(0, 5).toUpperCase()
//       : "XXXXX";

//     const qualityCode =
//       selectedQualities.includes("A") && selectedQualities.includes("B")
//         ? "AB"
//         : selectedQualities.includes("A")
//           ? "A"
//           : selectedQualities.includes("B")
//             ? "B"
//             : "X";

//     const randomNum = Math.floor(1000 + Math.random() * 9000);
//     const SQU = `#${randomNum}${article}${categoryCodeChar}${colorCode}${size}${typeCode}${qualityCode}`;
//     cat.SQU = SQU;

//     newCategories.push(cat);
//   }

//   // Check if product exists
//   let product = await Product.findOne({ article });

//   if (product) {
//     const existingKeys = new Set(
//       product.category.map(
//         (cat) =>
//           `${cat.categoryCode}-${cat.size}-${cat.color.toLowerCase()}-${cat.type.join(",")}-${cat.quality.join(",")}`
//       )
//     );

//     const duplicates = [];
//     const filteredCategories = [];

//     for (const cat of newCategories) {
//       const key = `${cat.categoryCode}-${cat.size}-${cat.color.toLowerCase()}-${cat.type.join(",")}-${cat.quality.join(",")}`;
//       if (existingKeys.has(key)) {
//         duplicates.push({ size: cat.size, color: cat.color });
//       } else {
//         filteredCategories.push(cat);
//       }
//     }

//     if (duplicates.length > 0) {
//       const duplicateList = duplicates
//         .map((d) => `Size: ${d.size}, Color: ${d.color}`)
//         .join("; ");
//       throw new Error(
//         `Article ${article} already has the following size-color combinations: ${duplicateList}`
//       );
//     }

//     if (filteredCategories.length > 0) {
//       product.category.push(...filteredCategories);
//     } else {
//       throw new Error(`No new categories to add for article "${article}".`);
//     }
//   } else {
//     product = new Product({
//       article,
//       category: newCategories,
//       isActive: true,
//     });
//   }

//   await product.save();
//   return product;
// };

//Get all product
const createProductTypeTwo = async (data) => {
  const { article: rawArticle, categoryCode, sizes, colors, types, qualities, articleCode, files, pkgs } = data;
  const article = typeof rawArticle === 'string' ? rawArticle.replace(/\s+/g, '') : rawArticle;

  if (!sizes || !Array.isArray(sizes) || sizes.length === 0) {
    throw new Error("sizes must be a non-empty array");
  }

  const selectedTypes = Array.isArray(types) && types.length ? types : ["Soft", "Hard"];
  const selectedQualities = Array.isArray(qualities) && qualities.length ? qualities : ["A", "B"];
  const uploadedFiles = Array.isArray(files) ? files : [];
  const pkgsArr = Array.isArray(pkgs) ? pkgs : [];

  const cleanCategoryCode = typeof categoryCode === 'string' ? categoryCode.replace(/\s+/g, '') : categoryCode;
  const newCategories = [];

  for (let i = 0; i < sizes.length; i++) {
    const rawSize = sizes[i] || "";
    const size = typeof rawSize === 'string' ? rawSize.replace(/\s+/g, '') : rawSize;
    const colorRaw = colors && colors[i] ? colors[i] : "";
    const colorClean = typeof colorRaw === 'string' ? colorRaw.replace(/\s+/g, '') : colorRaw;
    const color = colorClean.charAt(0).toUpperCase() + colorClean.slice(1);

    const rawPkg = pkgsArr[i] || "";
    const pkg = typeof rawPkg === 'string' ? rawPkg.replace(/\s+/g, '') : rawPkg;
    const file = uploadedFiles[i] || null;

    // Upload file if exists
    let uploadedImageUrl = [];
    if (file) {
      try {
        const fileUrl = await uploadToS3(file);
        uploadedImageUrl = [fileUrl];
      } catch (err) {
        console.error("AWS S3 upload failed:", err);
        throw new Error("Failed to upload image to AWS S3");
      }
    }

    // Create category object
    const cat = {
      categoryCode: cleanCategoryCode,
      size,
      color,
      type: selectedTypes,
      quality: selectedQualities,
      pkg,
      articleCode: articleCode || undefined,
      image: uploadedImageUrl,
      isActive: true,
    };

    // Generate SQU
    const typeCode =
      selectedTypes.includes("Soft") && selectedTypes.includes("Hard")
        ? "SH"
        : selectedTypes.includes("Soft")
          ? "S"
          : selectedTypes.includes("Hard")
            ? "H"
            : "X";

    const colorCode = color ? color.toUpperCase().replace(/\s+/g, "") : "X";
    const categoryCodeChar = categoryCode
      ? categoryCode.substring(0, 5).toUpperCase()
      : "XXXXX";

    const qualityCode =
      selectedQualities.includes("A") && selectedQualities.includes("B")
        ? "AB"
        : selectedQualities.includes("A")
          ? "A"
          : selectedQualities.includes("B")
            ? "B"
            : "X";

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const SQU = `#${randomNum}${article}${categoryCodeChar}${colorCode}${size}${typeCode}${qualityCode}`;
    cat.SQU = SQU;

    newCategories.push(cat);
  }

  // Check if product exists
  let product = await Product.findOne({ article });

  if (product) {
    const reactivated = [];
    const duplicates = [];
    const filteredCategories = [];

    for (const newCat of newCategories) {
      // ✅ Find existing category with same key
      const existingCategory = product.category.find(
        (cat) =>
          cat.categoryCode === newCat.categoryCode &&
          cat.size === newCat.size &&
          cat.color.toLowerCase() === newCat.color.toLowerCase() &&
          cat.type.join(",") === newCat.type.join(",") &&
          cat.quality.join(",") === newCat.quality.join(",")
      );

      if (existingCategory) {
        // ✅ Category exists - check if active
        if (existingCategory.isActive === true) {
          // Already active - skip
          duplicates.push({ size: newCat.size, color: newCat.color });
        } else {
          // ✅ Inactive - reactivate it
          existingCategory.isActive = true;
          existingCategory.pkg = newCat.pkg; // Update pkg
          existingCategory.articleCode = newCat.articleCode; // Update articleCode
          
          // Update image if new one provided
          if (newCat.image && newCat.image.length > 0) {
            existingCategory.image = newCat.image;
          }
          
          reactivated.push({ size: newCat.size, color: newCat.color });
          console.log(`🔄 Reactivated category: Size ${newCat.size}, Color ${newCat.color}`);
        }
      } else {
        // ✅ Category doesn't exist - add new
        filteredCategories.push(newCat);
      }
    }

    // Handle results
    if (duplicates.length > 0) {
      const duplicateList = duplicates
        .map((d) => `Size: ${d.size}, Color: ${d.color}`)
        .join("; ");
      throw new Error(
        `Article ${article} already has active categories: ${duplicateList}`
      );
    }

    if (filteredCategories.length > 0) {
      product.category.push(...filteredCategories);
      console.log(`➕ Added ${filteredCategories.length} new categories`);
    }

    if (reactivated.length === 0 && filteredCategories.length === 0) {
      throw new Error(`No new categories to add for article "${article}". All categories are already active.`);
    }

  } else {
    // ✅ Product doesn't exist - create new
    product = new Product({
      article,
      category: newCategories,
      isActive: true,
    });
    console.log(`🆕 Created new product: ${article}`);
  }

  await product.save();
  return product;
};

const getProducts = async (page = 1, limit = 10, search = "") => {
  const skip = (page - 1) * limit;

  const pipeline = [];

  // Step 1: Unwind categories
  pipeline.push({ $unwind: "$category" });

  // Step 2: Only keep active categories
  pipeline.push({ $match: { "category.isActive": true } });

  // Step 3: Apply search if provided
  if (search && search.trim() !== "") {
    const searchTerm = search.trim();
    const regex = new RegExp(searchTerm, "i");
    
    // Check if search term is a number
    const isNumber = !isNaN(searchTerm);
    const searchNumber = isNumber ? Number(searchTerm) : null;
    
    const searchConditions = [
      { "category.categoryCode": { $regex: regex } },
      { "category.color": { $regex: regex } },
      { "category.size": { $regex: regex } },
      { "category.type": { $regex: regex } },
      { "category.quality": { $regex: regex } },
    ];
    
    // Add article search conditions based on type
    if (isNumber) {
      // If search is a number, match both exact number and string containing the number
      searchConditions.push(
        { article: searchNumber },           // Exact number match
        { article: { $regex: regex } }       // String match (e.g., "5011" in string)
      );
    } else {
      // If search is not a number, only do string regex match
      searchConditions.push(
        { article: { $regex: regex } }       // String match only
      );
    }
    
    pipeline.push({
      $match: {
        $or: searchConditions
      }
    });
  }

  // Step 4: Group back to product level with only active categories
  pipeline.push({
    $group: {
      _id: "$_id",
      article: { $first: "$article" },
      category: { $push: "$category" },
      articleCode: { $first: "$articleCode" },
      updatedAt: { $first: "$updatedAt" }
    }
  });

  // Step 5: Sort, skip & limit
  pipeline.push({ $sort: { updatedAt: -1 } });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // Fetch products
  const products = await Product.aggregate(pipeline);

  // Count total items (without skip & limit)
  const countPipeline = pipeline.slice(0, -3).concat([
    { $count: "totalItems" }
  ]);
  const countResult = await Product.aggregate(countPipeline);
  const totalItems = countResult[0]?.totalItems || 0;
  const totalPages = Math.ceil(totalItems / limit);

  return {
    products,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems
    }
  };
};

//get by id also get article code 
const getProductById2 = async (id) => {
  try {
    console.log('🔍 Searching for category ID:', id);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error('Invalid category ID format');
    }
    
    const objectId = new mongoose.Types.ObjectId(id);
    
    // Use aggregation to search ALL products efficiently
    const results = await Product.aggregate([
      // Stage 1: Match products that have this category
      {
        $match: {
          $or: [
            { 'category._id': objectId },
            { 'category._id': id }
          ]
        }
      },
      // Stage 2: Unwind the category array
      { $unwind: '$category' },
      // Stage 3: Match the specific category
      {
        $match: {
          $or: [
            { 'category._id': objectId },
            { 'category._id': id }
          ]
        }
      },
      // Stage 4: Limit to 1 result
      { $limit: 1 },
      // Stage 5: Project the fields we want
      {
        $project: {
          productId: '$_id',
          article: 1,
          isActive: 1,
          category: 1
        }
      }
    ]);
    
    if (!results || results.length === 0) {
      throw new Error(`Category ID ${id} not found in any product`);
    }
    
    const result = results[0];
    
    console.log('✅ Found product:', result.article);
    console.log('✅ Found category:', result.category.SQU);
    
    return {
      productId: result.productId,
      article: result.article,
      isActive: result.isActive,
      category: result.category
    };
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
};

//get product by id on Article page
const getProductById = async (id) => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid product ID format");
  }

  return await Product.findById(id);
};

//Update Produt by category
const updateProductByCategoryId = async (categoryId, updateData, file) => {
  // Find the product containing the category with this _id
  const product = await Product.findOne({ "category._id": categoryId });
  if (!product) throw new Error("Category with given ID not found");
  if (!product.isActive) throw new Error("Product is deleted");

  // Find the category index
  const catIndex = product.category.findIndex(c => c._id.equals(categoryId));
  if (catIndex === -1) throw new Error("Category with given ID not found");

  const category = product.category[catIndex];

  // ✅ Update allowed fields
  // NOTE: article, categoryCode, articleCode and pkg are Schema.Types.Mixed.
  // Mongoose does not auto-detect in-place changes to Mixed fields, so each
  // mutated Mixed path must be flagged with markModified() or save() skips it.
  if (updateData.article) {
    let cleanArticle = updateData.article;
    if (typeof cleanArticle === 'string') cleanArticle = cleanArticle.replace(/\s+/g, '');
    product.article = cleanArticle;
    product.markModified('article');
  }
  if (updateData.categoryCode) {
    let cleanCategoryCode = updateData.categoryCode;
    if (typeof cleanCategoryCode === 'string') cleanCategoryCode = cleanCategoryCode.replace(/\s+/g, '');
    category.categoryCode = cleanCategoryCode;
    product.markModified(`category.${catIndex}.categoryCode`);
  }
  if (updateData.color) {
    let cleanColor = updateData.color;
    if (typeof cleanColor === 'string') cleanColor = cleanColor.replace(/\s+/g, '');
    category.color = cleanColor;
  }
  if (updateData.size) {
    let cleanSize = updateData.size;
    if (typeof cleanSize === 'string') cleanSize = cleanSize.replace(/\s+/g, '');
    category.size = cleanSize;
  }
  if (updateData.articleCode) {
    let cleanArticleCode = updateData.articleCode;
    if (typeof cleanArticleCode === 'string') cleanArticleCode = cleanArticleCode.replace(/\s+/g, '');
    category.articleCode = cleanArticleCode;
    product.markModified(`category.${catIndex}.articleCode`);
  }
  if (updateData.pkg) {
    let cleanPkg = updateData.pkg;
    if (typeof cleanPkg === 'string') cleanPkg = cleanPkg.replace(/\s+/g, '');
    category.pkg = cleanPkg;
    product.markModified(`category.${catIndex}.pkg`);
  }

  // ✅ Handle file upload exactly like createProduct
  if (file) {
    try {
      const fileUrl = await uploadToS3(file); // ⬅️ Upload to AWS
      category.image = [fileUrl]; // store as array, same as your old logic
    } catch (err) {
      console.error("AWS S3 upload failed:", err);
      throw new Error("Failed to upload image to AWS S3");
    }
  }
  else if (updateData.image) {
    category.image = updateData.image; // keep/update existing URL
  }

  // Save changes
  product.category[catIndex] = category;
  const updatedProduct = await product.save();

  return updatedProduct;
};

//Delete Product by Category
const deleteProduct = async (categoryId) => {
  // Find the product containing the category
  const product = await Product.findOne({ "category._id": categoryId });
  if (!product) {
    throw new Error("Category with given ID not found");
  }

  // Find the category index
  const catIndex = product.category.findIndex(c => c._id.equals(categoryId));
  if (catIndex === -1) {
    throw new Error("Category with given ID not found");
  }

  // Soft-delete only the category, not the whole product
  product.category[catIndex].isActive = false;

  // Save the product
  await product.save();

  return {
    message: "Article deleted successfully",
    product,
  };
};

//part -1 Upload Article's using CSV
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const articlesMap = {};

    fs.createReadStream(filePath)
      .on("error", reject)
      .pipe(csv())
      .on("data", (row) => {
        try {
          const categoryCodeRaw = row.categoryCode || row.category;
          if (!row.article || !categoryCodeRaw) return;

          const articleNumber = row.article.replace(/\s+/g, '');

          // Helper function to normalize color casing
          const normalizeColor = (color) => {
            if (!color) return "";
            return color.charAt(0).toUpperCase() + color.slice(1);
          };

          // Split color by comma and normalize each
          const colors = row.color
            ? row.color
              .split(",")
              .map((c) => normalizeColor(c.replace(/\s+/g, '')))
              .filter(Boolean)
            : [""];

          // Parse other multi-select fields
          const types = row.type
            ? row.type.split(",").map((t) => t.trim()).filter(Boolean)
            : [];
          const qualities = row.quality
            ? row.quality.split(",").map((q) => q.trim()).filter(Boolean)
            : [];

          const size = row.size ? row.size.replace(/\s+/g, '') : "";

          let pkg = null;
          if (row.pkg) {
            try {
              pkg = JSON.parse(row.pkg); // if JSON format
              if (typeof pkg === 'string') pkg = pkg.replace(/\s+/g, '');
            } catch (e) {
              pkg = row.pkg.replace(/\s+/g, ''); // if normal string
            }
          }

          // Initialize article entry if not exists
          if (!articlesMap[articleNumber]) {
            articlesMap[articleNumber] = {
              article: articleNumber,
              category: [],
            };
          }

          const categoryCodeClean = categoryCodeRaw ? categoryCodeRaw.replace(/\s+/g, '') : "";

          // Create a category entry for each color
          colors.forEach((color) => {
            const category = {
              categoryCode: categoryCodeClean,
              color,
              size,
              type: types,
              quality: qualities,
              pkg,
            };

            articlesMap[articleNumber].category.push(category);
          });
        } catch (err) {
          reject(err);
        }
      })
      .on("end", () => {
        resolve(Object.values(articlesMap));
      });
  });
};

//part-2 Upload Data to DB
const uploadToDB = async (parsedData) => { 
  if (!Array.isArray(parsedData) || parsedData.length === 0) { 
    throw new Error("Uploaded CSV is empty or invalid."); 
  } 
 
  for (const item of parsedData) { 
    const article = item.article.trim(); 
    const categories = item.category; 
 
    if (!article || !categories || !Array.isArray(categories)) { 
      console.warn("⚠️ Skipping invalid item:", item); 
      continue; 
    } 
 
    const articleVariants = [article.toString(), Number(article)].filter(v => !isNaN(v) || typeof v === 'string'); 
 
    let product = await Product.findOne({  
      article: { $in: articleVariants }  
    }); 
 
    // ✅ If product doesn't exist, create new product
    if (!product) { 
      // Generate SQU for each category 
      for (const cat of categories) { 
        const { categoryCode, color, size } = cat; 
 
        const typeCode = cat.type.includes("Soft") && cat.type.includes("Hard") ? "SH" : 
          cat.type.includes("Soft") ? "S" : 
            cat.type.includes("Hard") ? "H" : "X"; 
 
        const qualityCode = cat.quality.includes("A") && cat.quality.includes("B") ? "AB" : 
          cat.quality.includes("A") ? "A" : 
            cat.quality.includes("B") ? "B" : "X"; 
 
        const colorCode = color ? color.toUpperCase().replace(/\s+/g, '') : "X"; 
        const categoryCodeChar = categoryCode ? categoryCode.substring(0, 5).toUpperCase() : "XXXXX"; 
        const randomNum = Math.floor(1000 + Math.random() * 9000); 
 
        cat.SQU = `#${randomNum}${article}${categoryCodeChar}${colorCode}${size}${typeCode}${qualityCode}`; 
        cat.isActive = true; // ✅ Set as active
      } 
 
      product = await Product.create({ article, category: categories, isActive: true }); 
      console.log(`🆕 Created new product: ${article}`); 
      continue; 
    } 
 
    // ✅ Product exists - check each new category
    for (const newCat of categories) { 
      const { categoryCode, color, size, pkg } = newCat; 
 
      // ✅ Check if this exact category combination (size + color + categoryCode) already exists
      const existingCategory = product.category.find(c => 
        c.categoryCode === categoryCode && 
        c.color.toLowerCase() === color.toLowerCase() && 
        c.size === size
      ); 
 
      if (existingCategory) {
        // ✅ Category combination exists - check if it's active
        if (existingCategory.isActive === true) {
          console.warn(`⚠️ Active category already exists for article ${article}: categoryCode=${categoryCode}, color=${color}, size=${size}. Skipping.`); 
          continue; // ✅ Skip if already active
        } else {
          // ✅ Category exists but is inactive - reactivate it
          console.log(`🔄 Reactivating inactive category for article ${article}: categoryCode=${categoryCode}, color=${color}, size=${size}`);
          existingCategory.isActive = true;
          
          // Update other fields from CSV
          existingCategory.type = newCat.type;
          existingCategory.quality = newCat.quality;
          existingCategory.pkg = newCat.pkg;
          existingCategory.articleCode = newCat.articleCode;
          existingCategory.image = newCat.image || existingCategory.image;
          
          continue;
        }
      }
 
      // ✅ Category combination doesn't exist - create new entry
      console.log(`➕ Adding new category for article ${article}: categoryCode=${categoryCode}, color=${color}, size=${size}`);
      
      // Generate SQU 
      const typeCode = newCat.type.includes("Soft") && newCat.type.includes("Hard") ? "SH" : 
        newCat.type.includes("Soft") ? "S" : 
          newCat.type.includes("Hard") ? "H" : "X"; 
 
      const qualityCode = newCat.quality.includes("A") && newCat.quality.includes("B") ? "AB" : 
        newCat.quality.includes("A") ? "A" : 
          newCat.quality.includes("B") ? "B" : "X"; 
 
      const colorCode = newCat.color ? newCat.color.toUpperCase().replace(/\s+/g, '') : "X"; 
      const categoryCodeChar = newCat.categoryCode ? newCat.categoryCode.substring(0, 5).toUpperCase() : "XXXXX"; 
      const randomNum = Math.floor(1000 + Math.random() * 9000); 
 
      newCat.SQU = `#${randomNum}${article}${categoryCodeChar}${colorCode}${newCat.size}${typeCode}${qualityCode}`; 
      newCat.isActive = true; // ✅ Set as active
 
      product.category.push(newCat); 
    } 
 
    await product.save(); 
    console.log(`✅ Updated product: ${article}`); 
  } 
 
  console.log("✅ Upload completed successfully!"); 
};

//part-3 Main process function
const processCSV = async (file) => {
  if (!file || !file.path) {
    throw new Error('No file uploaded');
  }

  const uploadedFilePath = file.path;
  console.log('Processing file:', uploadedFilePath);

  try {
    // 1. Parse newly uploaded file
    const newParsedData = await parseCSV(uploadedFilePath);
    if (!Array.isArray(newParsedData) || newParsedData.length === 0) {
      throw new Error('Uploaded CSV is empty or invalid');
    }
    // 3. Merge both new and old by article
    const articleMap = new Map();
    for (const item of newParsedData) {
      articleMap.set(item.article, item);
    }

    const mergedData = Array.from(articleMap.values());

    // 4. Validate and upload to DB FIRST
    await uploadToDB(mergedData);

  } catch (err) {
    console.error('Error while processing CSV:', err.message);
    throw err;
  } finally {
    // 6. Clean up: remove uploaded temp file
    if (fs.existsSync(uploadedFilePath)) {
      fs.unlink(uploadedFilePath, (err) => {
        if (err) console.error('Failed to delete temp file:', err.message);
        else console.log('Temp uploaded file deleted');
      });
    }
  }
};

// <------- upoload article code and PKG -------->
// upload articlecode by catgory Part-1
// const parseCSVforcode = (filePath) => {
//   return new Promise((resolve, reject) => {
//     const results = [];
//     fs.createReadStream(filePath)
//       .pipe(csv())
//       .on('data', (data) => results.push(data))
//       .on('end', () => resolve(results))
//       .on('error', (err) => reject(err));
//   });
// };

// /**
//  * part-2 DB Logic: Matches based on Article + CategoryCode + Specs
//  */
// const uploadToDBForArticleCode = async (mergedData) => {
//   if (!Array.isArray(mergedData) || mergedData.length === 0) {
//     throw new Error("No data found to process.");
//   }

//   const log = {
//     timestamp: new Date().toISOString(),
//     summary: { totalArticles: mergedData.length, updated: 0, skipped: 0, errors: 0 },
//     details: []
//   };

//   for (const item of mergedData) {
//     const { article, category: incomingCategories } = item;

//     try {
//       let product = await Product.findOne({
//         $or: [
//           { article: article.trim() },
//           { article: Number(article.trim()) }
//         ]
//       });

//       if (!product) {
//         console.error(`❌ Article NOT FOUND: ${article}`);
//         log.details.push({ article, status: "FAILED", reason: "Article not found" });
//         log.summary.errors++;
//         continue;
//       }

//       let articleUpdateCount = 0;

//       for (const catInput of incomingCategories) {
//         const { categoryCode, color, size, articleCode, pkg } = catInput;

//         const existingCategory = product.category.find(c =>
//           String(c.categoryCode).trim() === String(categoryCode).trim() &&
//           String(c.color).trim().toLowerCase() === String(color).trim().toLowerCase() &&
//           String(c.size).trim().toLowerCase() === String(size).trim().toLowerCase()
//         );

//         if (existingCategory) {

//           // ✅ UPDATE ONLY
//           if (articleCode) {
//             existingCategory.articleCode = String(articleCode).trim();
//           }

//           if (pkg !== undefined && pkg !== null && pkg !== "") {
//             existingCategory.pkg = Number(pkg);
//           }

//           articleUpdateCount++;
//           console.log(`✅ UPDATED → ${article} | ${categoryCode}`);

//         } else {

//           // Optional: If you do NOT want to create new categories, remove this block
//           console.log(`⚠️ Category NOT FOUND → ${article} | ${categoryCode}`);
//         }
//       }

//       if (articleUpdateCount > 0) {
//         await product.save();
//         log.summary.updated += articleUpdateCount;
//       }

//     } catch (err) {
//       log.summary.errors++;
//       log.details.push({ article, status: "ERROR", message: err.message });
//     }
//   }

//   return log;
// };


// /**
//  * part-3 Main Controller: Grouping and Mapping
//  */
// const processCSVForArticleCode = async (file) => {
//   if (!file || !file.path) throw new Error('No file uploaded');

//   try {
//     const rawData = await parseCSVforcode(file.path);
//     const articleMap = new Map();

//     for (const row of rawData) {
//       // Robust helper to get value regardless of header case/spaces
//       const getVal = (target) => {
//         const key = Object.keys(row).find(k => k.trim().replace(/\s+/g, '').toLowerCase() === target.toLowerCase());
//         return key ? row[key]?.trim() : undefined;
//       };

//       const article = getVal('article');
//       if (!article) continue;

//       if (!articleMap.has(article)) {
//         articleMap.set(article, { article, category: [] });
//       }

//       // DATA MAPPING: Applying the swap for Color/Size based on your CSV input
//       articleMap.get(article).category.push({
//         categoryCode: getVal('categorycode'), // Logged categoryCode
//         color: getVal('size'),      // Swapped: Taking "BlueRed"
//         size: getVal('color'),       // Swapped: Taking "6X9"
//         type: getVal('type') || "",
//         quality: getVal('quality') || "",
//         articleCode: getVal('articlecode'),
//         pkg: getVal('pkg')
//       });
//     }

//     const mergedData = Array.from(articleMap.values());

//     // Final check to prevent 'undefined' in logs
//     if (mergedData.length > 0) {
//       const first = mergedData[0].category[0];
//       console.log(`📊 Map Verification -> Article: ${mergedData[0].article}, Category: ${first.categoryCode}, Color: ${first.color}, Size: ${first.size}`);
//     }

//     return await uploadToDBForArticleCode(mergedData);

//   } catch (err) {
//     throw err;
//   } finally {
//     if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
//   }
// }; 



//article code by sub time

const parseCSVforcode = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

/**
 * part-2 DB Logic: ONLY UPDATE - Skip if not found
 */
const uploadToDBForArticleCode = async (mergedData) => {
  if (!Array.isArray(mergedData) || mergedData.length === 0) {
    throw new Error("No data found to process.");
  }

  const log = {
    timestamp: new Date().toISOString(),
    summary: { totalArticles: mergedData.length, updated: 0, skipped: 0, errors: 0 },
    details: []
  };

  for (const item of mergedData) {
    const { article, category: incomingCategories } = item;

    try {
      // Find product by article
      let product = await Product.findOne({
        $or: [
          { article: article.trim() },
          { article: Number(article.trim()) }
        ]
      });

      // ❌ Article not found - SKIP
      if (!product) {
        console.log(`⏭️ SKIPPED - Article NOT FOUND: ${article}`);
        log.summary.skipped++;
        log.details.push({ article, status: "SKIPPED", reason: "Article not found" });
        continue;
      }

      let articleUpdateCount = 0;

      for (const catInput of incomingCategories) {
        const { categoryCode, color, size, articleCode, pkg } = catInput;

        // Find matching category in the product
        const existingCategory = product.category.find(c =>
          String(c.categoryCode).trim() === String(categoryCode).trim() &&
          String(c.color).trim().toLowerCase() === String(color).trim().toLowerCase() &&
          String(c.size).trim().toLowerCase() === String(size).trim().toLowerCase()
        );

        // ❌ Category not found - SKIP this category
        if (!existingCategory) {
          console.log(`⏭️ SKIPPED - Category NOT FOUND → Article: ${article} | CategoryCode: ${categoryCode} | Color: ${color} | Size: ${size}`);
          continue; // Skip to next category
        }

        // ✅ Category FOUND - UPDATE articleCode and pkg
        let wasUpdated = false;

        if (articleCode !== undefined && articleCode !== null && articleCode !== "") {
          existingCategory.articleCode = String(articleCode).trim();
          wasUpdated = true;
          console.log(`✅ Updated articleCode: ${articleCode}`);
        }

        if (pkg !== undefined && pkg !== null && pkg !== "") {
          existingCategory.pkg = Number(pkg);
          wasUpdated = true;
          console.log(`✅ Updated pkg: ${pkg}`);
        }

        if (wasUpdated) {
          articleUpdateCount++;
          console.log(`✅ UPDATED → Article: ${article} | CategoryCode: ${categoryCode}`);
        }
      }

      // Save product if any category was updated
      if (articleUpdateCount > 0) {
        await product.save();
        log.summary.updated++;
        log.details.push({ article, status: "SUCCESS", categoriesUpdated: articleUpdateCount });
      } else {
        log.summary.skipped++;
        log.details.push({ article, status: "SKIPPED", reason: "No matching categories found" });
      }

    } catch (err) {
      console.error(`❌ Error processing article ${article}:`, err.message);
      log.summary.errors++;
      log.details.push({ article, status: "ERROR", message: err.message });
    }
  }

  console.log('\n📊 Final Summary:');
  console.log(`✅ Updated: ${log.summary.updated}`);
  console.log(`⏭️ Skipped: ${log.summary.skipped}`);
  console.log(`❌ Errors: ${log.summary.errors}`);

  return log;
};

/**
 * part-3 Main Controller: NO SWAP - Direct mapping
 */
const processCSVForArticleCode = async (file) => {
  if (!file || !file.path) throw new Error('No file uploaded');

  try {
    const rawData = await parseCSVforcode(file.path);
    
    if (rawData.length === 0) {
      throw new Error('CSV file is empty');
    }

    console.log('📋 CSV Headers:', Object.keys(rawData[0]));
    
    const articleMap = new Map();

    for (const row of rawData) {
      const getVal = (target) => {
        const key = Object.keys(row).find(k => 
          k.trim().replace(/\s+/g, '').toLowerCase() === target.toLowerCase()
        );
        const value = key ? row[key] : undefined;
        return value ? value.trim() : undefined;
      };

      const article = getVal('article');
      if (!article) {
        console.log('⚠️ Skipping row - no article found');
        continue;
      }

      if (!articleMap.has(article)) {
        articleMap.set(article, { article, category: [] });
      }

      // ✅ NO SWAP - Direct mapping
      const categoryData = {
        categoryCode: getVal('categorycode'),
        color: getVal('color'),          // Direct mapping
        size: getVal('size'),            // Direct mapping
        type: getVal('type') || "",
        quality: getVal('quality') || "",
        articleCode: getVal('articlecode'),
        pkg: getVal('pkg')
      };

      articleMap.get(article).category.push(categoryData);
    }

    const mergedData = Array.from(articleMap.values());

    console.log(`\n📦 Total articles to process: ${mergedData.length}`);

    return await uploadToDBForArticleCode(mergedData);

  } catch (err) {
    console.error('❌ Error in processCSVForArticleCode:', err);
    throw err;
  } finally {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
};

const addArticleCodetoProductbysubtype = async ({ article, category }) => {
  const product = await Product.findOne({ article });

  if (!product) {
    throw new Error(`Article '${article}' not found`);
  }

  category.forEach((catInput) => {
    const { categoryCode, color, size, type, quality, articleCode } = catInput;

    if (!categoryCode || !color || !size || !type || !quality || !articleCode) {
      throw new Error(
        "Each category must have categoryCode, color, size, type, quality, and articleCode"
      );
    }

    // Find the exact category in the product that matches all fields
    const existingCategory = product.category.find((cat) => {
      const typeMatch =
        Array.isArray(cat.type) &&
        Array.isArray(type) &&
        cat.type.length === type.length &&
        cat.type.every((t) => type.includes(t));

      const qualityMatch =
        Array.isArray(cat.quality) &&
        Array.isArray(quality) &&
        cat.quality.length === quality.length &&
        cat.quality.every((q) => quality.includes(q));

      return (
        cat.categoryCode === categoryCode &&
        cat.color.toLowerCase() === color.toLowerCase() &&
        cat.size === size &&
        typeMatch &&
        qualityMatch
      );
    });

    if (existingCategory) {
      // Update only the articleCode
      existingCategory.articleCode = articleCode;
    } else {
      throw new Error(
        `No existing category found matching categoryCode=${categoryCode}, color=${color}, size=${size}, type=${JSON.stringify(
          type
        )}, quality=${JSON.stringify(quality)}`
      );
    }
  });

  await product.save();
  return product;
};

const addArticleCodetoProduct = async ({ article, articleCode }) => {
  const product = await Product.findOne({ article });

  if (!product) {
    throw new Error(`Article '${article}' not found`);
  }

  if (product.articleCode) {
    throw new Error(`Article '${article}' already has an articleCode: '${product.articleCode}'`);
  }

  // Set articleCode at product level
  product.articleCode = articleCode;

  await product.save();

  return product;
};

// const updatearticlecode= async (id, updateData) => {
//   // Find the product containing the category with this _id
//   const product = await Product.findById(id);
//   if (!product.isActive) throw new Error("Product is deleted");

//   // ✅ Update allowed fields
//   if (updateData.articleCode) 
//      product.articleCode = updateData.articleCode;

//   const updatedProduct = await product.save();

//   return updatedProduct;
// };

const updatearticlecode = async (id, updateData) => {
  // 1. Find the product and ensure it's active
  const product = await Product.findOne({ "category._id": id });

  if (!product) throw new Error("Product not found");
  if (!product.isActive) throw new Error("Product is deleted/inactive");

  // 2. Find the specific category item inside the array
  const categoryItem = product.category.id(id);

  if (!categoryItem) throw new Error("Category item not found");

  // 3. Update the field
  if (updateData.articleCode) {
    categoryItem.articleCode = updateData.articleCode;
  }

  // 4. Save the parent document
  const updatedProduct = await product.save();

  return updatedProduct;
};

const deleteArticleCode = async (id) => {
  const product = await Product.findByIdAndUpdate(
    id,
    { $unset: { articleCode: 1 } }, // removes the key completely
    { new: true }
  );

  if (!product) throw new Error("Product not found");
  return product;
};

const deleteArticleCodeByCategory = async (id) => {
  const updatedProduct = await Product.findOneAndUpdate(
    { "category._id": id }, // Find the product containing the specific category
    { $unset: { "category.$.articleCode": "" } }, // Remove articleCode from the matched element
    { new: true } // Return the document after the update
  );

  if (!updatedProduct) {
    throw new Error("Category item not found within any active product");
  }

  return updatedProduct;
};

module.exports = {
  createProduct,
  createProductTypeTwo,
  getProductById2,
  getProducts,
  getProductById,
  updateProductByCategoryId,
  deleteProduct,
  processCSV,
  processCSVForArticleCode,
  addArticleCodetoProductbysubtype,
  addArticleCodetoProduct,
  updatearticlecode,
  deleteArticleCode,
  deleteArticleCodeByCategory
}