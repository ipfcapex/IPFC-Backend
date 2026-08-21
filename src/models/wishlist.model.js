const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    address: {
      type: String
    },
    country: {
      type: String
    },
    city: {
      type: String
    },
    state: {
      type: String
    },
    pincode: {
      type: Number,
      validate: {
        validator: function (v) {
          return /^[1-9][0-9]{5}$/.test(v.toString());
        },
        message: "Pincode must be a valid 6-digit Indian postal code",
      },
    },
  },
  {
    _id: false,
  }
);

const Wishlistitems = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    categoryId: { type: mongoose.Schema.Types.ObjectId },
    quantity: {
      type: Number,
      default: 0,
    },
    image: { type: [String] },
  },
  {
    _id: false,
  }
);
const wishlistSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User"},
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer"
    },
    Location: [locationSchema],
    WishList: [Wishlistitems],
    isActive: {
      type: Boolean,
      default: true,
    },
    description: { type: String, default: "" },
    scheme: { type: mongoose.Schema.Types.ObjectId, ref: "Schemes"},
    wishlistStockTime: { type: Date, default: null },
    isPartialOrder: { type: Boolean, default: false },
    partialReasonCategory: {
      type: String,
      enum: [
        "By Sales Person mistake",
        "Less stock assigned by Production Manager",
        "Holiday",
        "Weekend",
        "Platform Server Down",
        "Customer Requested Less Quantity",
        "Raw Material / Stock Shortage",
        "Logistics & Transport Constraint",
        "Quality Inspection Rejection",
        "Other",
        null
      ],
      default: null,
    },
    partialOrderExplanation: { type: String, default: null },
    partialOrderReason: { type: String, default: null },
    rejectionReasonCategory: {
      type: String,
      enum: [
        "By Sales Person mistake",
        "Customer Cancelled Order",
        "Customer Requested Different Product / Price",
        "Customer Not Responding",
        "Customer Store Closed / Relocated",
        "Duplicate Wishlist Created",
        "Other",
        null
      ],
      default: null,
    },
    rejectionOrderExplanation: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    requestedQuantity: { type: Number, default: 0 },
    acceptedQuantity: { type: Number, default: 0 },
    remainingQuantity: { type: Number, default: 0 },
    wishAction: {
      type: String,
      enum: ["Accepted", "Partial", "Rejected", "Timeout", "Not Fulfilled", "Expired"],
      default: "Not Fulfilled",
    },
  },
  {
    timestamps: true,
  }
);

// NOTE: the previous TTL index (expireAfterSeconds: 43200) that auto-DELETED
// wishlists 12h after wishlistStockTime has been removed on purpose. This
// collection now holds ONLY pending wishlists. When a wishlist is accepted,
// rejected, or times out, the whole record is copied into WishlistHistory and
// then removed from here (see wishlist.service.js / wishlistTimeout.service.js).
// The legacy TTL index is dropped at startup by the timeout job. This plain
// index keeps the timeout sweep query fast.
wishlistSchema.index({ wishlistStockTime: 1 });

module.exports = mongoose.model("Wishlist", wishlistSchema);
