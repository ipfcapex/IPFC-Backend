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

wishlistSchema.index(
  { wishlistStockTime: 1 },
  { expireAfterSeconds: 43200 }
);

module.exports = mongoose.model("Wishlist", wishlistSchema);
