const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: false
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  pincode: {
  type: Number,
      required: [true, 'Pincode is required'],
      match: [
        /^[1-6]\d{5}$/,
        'Pincode must be a valid 6-digit Indian postal code',
      ],
},
}, {
  _id: false
});

const qrCodeEntrySchema = new mongoose.Schema({
  article: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  categoryCode: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  color: {
    type: String,
    required: true
  },
  size: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  quality: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    default: 0
  },
  image: { type: [String] },
  articleCode: {
   type: mongoose.Schema.Types.Mixed,
    default: ""
  },
}, {
  _id: false
});
const Wishlistitems = new mongoose.Schema({
  article: {
    type: mongoose.Schema.Types.Mixed,

  },
  categoryCode: {
    type: mongoose.Schema.Types.Mixed,

  },
  color: {
    type: String,

  },
  size: {
    type: String,

  },
  type: {
    type: String,

  },
  quality: {
    type: String,

  },
  quantity: {
    type: Number,
    default: 0
  },
  image: { type: [String] },
  articlecode: { 
    type: mongoose.Schema.Types.Mixed, 
    default: ""
  },
}, {
  _id: false
});
const CartSchema = new mongoose.Schema({
  salesOrderNo: {
    type: String,
    required: true
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  Location: [locationSchema],
  items: [qrCodeEntrySchema],
  WishList: [Wishlistitems],
  isActive: {
    type: Boolean,
    default: true
  },
  note: [{
    _id: false,
    text: String,
    accountSectionApproval: {
      type: String,
      enum: ["APPROVED", "REJECTED", "PENDING"],
      default: "PENDING"
    },
    date: {
      type: String,
      default: () =>
        new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
    }
  }],
  scheme: { type: mongoose.Schema.Types.ObjectId, ref: "Schemes" }

}, {
  timestamps: true
});

CartSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 }); //

module.exports = mongoose.model("Cart", CartSchema);