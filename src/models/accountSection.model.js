const mongoose = require("mongoose");

const qrCodeEntrySchema = new mongoose.Schema({
  article: { type: String},
  categoryCode: { type: Number },
  color: { type: String},
  size: { type: String, },
  type: { type: String,},
  quality: { type: String},
  quantity: { type: Number, default: 0 },
}, { _id: false });

const AccountSchema = new mongoose.Schema(
  {
    salesOrderNo: {type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: [qrCodeEntrySchema],
    isActive: { type: Boolean, default: true },
    note:{ type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Account", AccountSchema);
