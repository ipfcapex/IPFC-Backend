const mongoose = require('mongoose');

const billingOfficeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: String,
  warehouseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' }],
  isDeleted: { type: Boolean, default: false } 
}, { timestamps: true });

module.exports = mongoose.model('BillingOffice', billingOfficeSchema);
