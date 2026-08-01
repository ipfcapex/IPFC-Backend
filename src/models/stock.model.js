const mongoose = require("mongoose");

const qrCodeEntrySchema = new mongoose.Schema({
  productionNo: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  categoryId: { type: mongoose.Schema.Types.ObjectId },
  quantity: { type: Number, default: 0 },
  qrData: { type: String}, // holds the QR's qrId string (e.g. "QR-...")
  qrId: { type: String }, // explicit qrId; kept in sync with qrData at stock-in
  dispatched: { type: Boolean, default: false },
  stockinAt: { type: Date, default: Date.now },
  dispatchAt: { type: Date }, // only set when dispatched is true
  ordNumScanFor: { type: String },
  lastScanAt: { type: Date }

}, { _id: false});

const formWarehouseSubSchema = new mongoose.Schema({
  fromwarehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  formqunatity: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now } // only creation time
}, { _id: false }); 

const stockSchema = new mongoose.Schema(
  {
    factory: { type: mongoose.Schema.Types.ObjectId, ref: 'Factory', required: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse'},
    formwarehousedata: {
    type: [formWarehouseSubSchema]
    },
    toatalQuantity: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    stockdata: [qrCodeEntrySchema],
    dispatchStock: { type: Number , default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Stock", stockSchema);
