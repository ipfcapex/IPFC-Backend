const fs = require('fs');
const csv = require('csv-parser');

  // Get the next productId number
  let currentId = 1;

  // Collect all used productIds
  const usedIds = new Set(existingData.map(p => parseInt(p.productId)).filter(Boolean));

  // Function to get next available ID
  const getNextProductId = () => {
    while (usedIds.has(currentId)) {
      currentId++;
    }
    usedIds.add(currentId);
    return currentId.toString();
  };

  for (const row of uploadedData) {
    const nameKey = row.name.trim().toLowerCase();
    const existing = nameMap.get(nameKey);

    if (existing) {
      // Update existing product
      const updatedRow = {
        ...existing,
        ...row,
        productId: existing.productId,
      };
      nameMap.set(nameKey, updatedRow);
    } else {
      // New product → assign next productId if missing or empty
      row.productId = row.productId?.trim() !== ''
        ? row.productId
        : getNextProductId();

      nameMap.set(nameKey, row);
    }
  }



module.exports = { parseCSV };
