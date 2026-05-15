const mongoose = require("mongoose");


const qrCodeEntrySchema = new mongoose.Schema({
  productionNo: { type: mongoose.Schema.Types.Mixed, unique: true, required: true },
  categoryCode: { type: mongoose.Schema.Types.Mixed, required: true },
  color: { type: String, required: true },
  size: { type: String, required: true },
  type: { type: String, required: true },
  quality: { type: String, required: true },
  image: { type: [String] },
}, { _id: false });

const productSchema = new mongoose.Schema(
  {
    factory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Factory",
      required: true,
    },
    productionNo: {
      type: String,
      required: true,
    },
    article: {
      type: String,
      ref: "Article",
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
    category: {
      type: mongoose.Schema.Types.Mixed,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Production", productSchema);
