const mongoose = require("mongoose");

const qrCodeEntrySchema = new mongoose.Schema({
  productionNo: { type: String, required: true },
  article: { type: mongoose.Schema.Types.Mixed,  required: true},
  categoryCode: { type: mongoose.Schema.Types.Mixed,  required: true},
  color: { type: String,  required: true},
  size: { type: String,  required: true},
  type: { type: String,  required: true},
  quality: { type: String,  required: true},
  quantity: { type: Number, default: 0 },
  qrData: { type: String}, // Base64 image,
  dispatched: { type: Boolean, default: false }, 

}, { _id: false });

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
