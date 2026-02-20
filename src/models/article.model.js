const mongoose = require("mongoose");

const addArticle = new mongoose.Schema({
  articleNumber: { type: String, required: true },
  size: { type: String, required: true },
  type: { type: String, required: true },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  factoryId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Factory',
    required: true
  },
  quantity: { type: Number, required: true },
  color: { type: String, required: true },
  category: { type: String },
  stockAlertLevel: {
    type: Number,
    min: [5, 'Stock alert level must be at least 5']
  },
  images: {
    type: [String],
    default: []
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("Article", addArticle);
