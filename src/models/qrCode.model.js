const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  categoryCode: { type: mongoose.Schema.Types.Mixed, required: true },
  color: { type: String, required: true },
  size: { type: String, required: true },
  type: { type: String, required: true },
  quality: { type: String, required: true },
  quantity: { type: String, default:1 }
}, { _id: false });

const qrCodeEntrySchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.Mixed },
  categoryCode: { type: mongoose.Schema.Types.Mixed, required: true },
  color: { type: String, required: true },
  size: { type: String, required: true },
  type: { type: String, required: true },
  quality: { type: String, required: true },
  quantity: { type: String, default: "1" },
  factoryScan:{type: Boolean, default: false},
  factoryinScan:{type: Boolean, default: false},
  qrData: { type: String, required: true }, 
  qrId: {
    type: String,
    required: true
  },
}, { _id: false });

const qrCodeSchema = new mongoose.Schema({
  factory_name: { type: String, required: true },
  factory: { type: mongoose.Schema.Types.ObjectId, ref: 'Factory', required: true },
  productionNo: { type: String},
  products: [{ type: String, ref: 'Production' }],
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  status: {
    type: String,
    enum: ['Inprocess', 'Dispatch', 'Completed'],
    default: 'Dispatch'
  },
  qrString: { type: String},
  category: [categorySchema],
  qrCodes: [qrCodeEntrySchema] 

}, { timestamps: true });



module.exports = mongoose.model('QRCODE', qrCodeSchema);
