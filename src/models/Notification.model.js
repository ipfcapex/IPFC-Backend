const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  orderNo: {
    type: String,
    required: false
  },
  userRole: {
    type: String,
    enum: ['Administrator', 'Packing Reporter', 'Warehouse Staff', 'Factory Personnel'],
    default: 'Administrator',
    required: true
  },
  productionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Production',
    required: true
  },
  article: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  category: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Notification', NotificationSchema);