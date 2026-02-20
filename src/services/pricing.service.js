const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { Product } = require('../models');

//Correct: uploads folder in project root (not inside /services)
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('uploads/ folder created automatically');
}

const DEFAULT_CSV_PATH = path.join(uploadsDir, 'default.csv');

// Encode price using digits → letters (e.g. 123 → bcd)
function encodePrice(price) {
  const digitToChar = ['a','b','c','d','e','f','g','h','i','j'];
  const priceStr = price.toString();
  let encoded = '';
  for (let digit of priceStr) {
    encoded += digitToChar[parseInt(digit)];
  }
  return encoded;
}

// Parse a CSV file and encode prices
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)
      .on('error', reject)
      .pipe(csv())
      .on('data', (row) => {
        try {
          const rawPrice = parseInt(row.price);
          const encoded = encodePrice(rawPrice);

          results.push({
            productId: row.productId,
            name: row.name,
            price: rawPrice,
            encodedPrice: encoded,
          });
        } catch (err) {
          reject(err);
        }
      })
      .on('end', () => resolve(results));
  });
};

// 📝 Write data to default.csv
const writeCSV = async (filePath, data) => {
  const csvWriter = createCsvWriter({
    path: filePath,
    header: Object.keys(data[0]).map(field => ({ id: field, title: field })),
  });
  await csvWriter.writeRecords(data);
};

const processCSV = async (file) => {
  if (!file || !file.path) {
    throw new Error('No file uploaded');
  }

  console.log('📂 Processing file:', file.path);

  let uploadedData = await parseCSV(file.path);
  if (!Array.isArray(uploadedData) || uploadedData.length === 0) {
    throw new Error('Uploaded CSV is empty or invalid');
  }

  // Parse existing default.csv
  let existingData = [];
  if (fs.existsSync(DEFAULT_CSV_PATH)) {
    existingData = await parseCSV(DEFAULT_CSV_PATH);
  }

  // Create map using product name as key
  const nameMap = new Map();
  for (const item of existingData) {
    nameMap.set(item.name.trim().toLowerCase(), item);
  }

  for (const [index, row] of uploadedData.entries()) {
    const nameKey = row.name.trim().toLowerCase();
    const existing = nameMap.get(nameKey);

    if (existing) {
      // If same name exists → update price/encodedPrice, keep productId
      const updatedRow = {
        ...existing,
        ...row,
        productId: existing.productId || `PROD${Date.now()}_${index}`,
      };
      nameMap.set(nameKey, updatedRow);
    } else {
      // New product → assign productId if missing
      row.productId = row.productId && row.productId.trim() !== ''
        ? row.productId
        : `PROD${Date.now()}_${index}`;
      nameMap.set(nameKey, row);
    }
  }

  const finalData = Array.from(nameMap.values());

// ✅ Write back to default.csv
await writeCSV(DEFAULT_CSV_PATH, finalData);

// ✅ Save final merged JSON to a file
const finalJsonPath = path.join(uploadsDir, 'finalProducts.json');
fs.writeFileSync(finalJsonPath, JSON.stringify(finalData, null, 2));

// ✅ Upsert to MongoDB
await Product.bulkWrite(
  finalData.map(product => ({
    updateOne: {
      filter: { productId: product.productId },
      update: { $set: product },
      upsert: true,
    },
  }))
);

// ✅ Clean up uploaded file
if (fs.existsSync(file.path)) {
  fs.unlinkSync(file.path);
}

// ✅ Return success with info
return {
  success: true,
  message: 'CSV processed: merged, saved to default.csv and finalProducts.json, and uploaded to DB.',
  savedJson: finalJsonPath,
};
};

module.exports = {
  processCSV,
};
