const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  SQU: { type: mongoose.Schema.Types.Mixed, required: false },
  categoryCode: { type: mongoose.Schema.Types.Mixed, required: true },
  color: { type: String, required: true },
  size: { type: String, required: true },
  type: {
    type: [String],
    enum: ["Soft", "Hard"],
    required: true
  },
  quality: {
    type: [String],
    enum: ["A", "B"],
    required: true
  },
  cartonquantity: {
    type: Number
  },
  pkg: { type: mongoose.Schema.Types.Mixed, required: false },
  articleCode: { type: mongoose.Schema.Types.Mixed },
  image: { type: [String], required: false, default: [""] },
  isActive: { type: Boolean, default: true }
}, { _id: true });

const productSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.Mixed, required: true },
  category: {
    type: [categorySchema]
  },
  // articleCode: { type: mongoose.Schema.Types.Mixed },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
