const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://hargunn2000_db_user:1c05v1wz2ILH3n5i@apex.jsbyqmb.mongodb.net/testing-prod";

const productSchema = new mongoose.Schema(
  {
    productionNo: String,
    productionQuantity: Number,
    stockinQuantity: Number,
    assignwishlistprod: [
      {
        wishlistId: mongoose.Schema.Types.ObjectId,
        assignedQuantity: Number,
        requiredQuantity: Number,
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { collection: "productions" }
);

const Production = mongoose.model("Production", productSchema);

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  const productions = await Production.find({
    isActive: true,
    assignwishlistprod: { $exists: true, $not: { $size: 0 } },
  });

  console.log(`Found ${productions.length} productions with wishlist assignments to process.`);

  let updatedCount = 0;

  for (const prod of productions) {
    let remaining = prod.productionQuantity;
    let modified = false;

    console.log(`\nProcessing Production ${prod.productionNo} (Qty: ${prod.productionQuantity}):`);

    for (let i = 0; i < prod.assignwishlistprod.length; i++) {
      const assignment = prod.assignwishlistprod[i];
      const required = assignment.requiredQuantity || 0;
      const expectedAssigned = Math.min(required, remaining);
      remaining -= expectedAssigned;

      if (assignment.assignedQuantity !== expectedAssigned) {
        console.log(
          ` - Assignment ${i + 1}: required ${required}, assigned was ${assignment.assignedQuantity}, updating to ${expectedAssigned}`
        );
        assignment.assignedQuantity = expectedAssigned;
        modified = true;
      } else {
        console.log(
          ` - Assignment ${i + 1}: required ${required}, assigned is correct (${assignment.assignedQuantity})`
        );
      }
    }

    if (modified) {
      await prod.save();
      console.log(`✅ Production ${prod.productionNo} updated.`);
      updatedCount++;
    } else {
      console.log(`ℹ️ Production ${prod.productionNo} had correct allocations.`);
    }
  }

  console.log(`\nMigration completed. Updated ${updatedCount} production records.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
