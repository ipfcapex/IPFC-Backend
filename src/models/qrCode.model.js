const mongoose = require("mongoose");

const qrCodeEntrySchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    categoryId: { type: mongoose.Schema.Types.ObjectId },
    quantity: { type: String, default: "1" },
    factoryScan: { type: Boolean, default: false },
    factoryinScan: { type: Boolean, default: false },
    warehouseinScan: { type: Boolean, default: false },
    warehouseDispatch: { type: Boolean, default: false },
    qrData: { type: String, required: true },
    qrId: {
      type: String,
      required: true,
    },
    ordNumScanFor: { type: String },
    lastScanAt: { type: Date },
  },
  { _id: false },
);

const qrCodeSchema = new mongoose.Schema(
  {
    factory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Factory",
      required: true,
    },
    productionNo: { type: String },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },
    status: {
      type: String,
      enum: ["Inprocess", "Dispatch", "Completed"],
      default: "Dispatch",
    },
    qrString: { type: String },
    qrCodes: [qrCodeEntrySchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("QRCODE", qrCodeSchema);
