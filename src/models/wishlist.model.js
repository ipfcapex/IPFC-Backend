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
