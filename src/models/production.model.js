const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    factory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Factory",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    productionNo: {
      type: String,
      required: true,
    },
    productionDate: {
      type: Date,
      required: true,
    },
    productionQuantity: {
      type: Number,
      required: true,
    },
    dispatchedQuantity: {
      type: Number
    },
    stockinQuantity: { type: Number },
    status: {
      type: String,
      enum: ["Ready","Arrived at factory", "Dispatch from Factory", "Partially Dispatched", "Arrived at Warehouse"],
      default: "Ready",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Production", productSchema);
