const mongoose = require("mongoose");

// Location + item sub-schemas mirror the active Wishlist model so a wishlist can
// be copied here verbatim when it is accepted / rejected / times out.
const locationSchema = new mongoose.Schema(
  {
    address: { type: String },
    country: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: Number },
  },
  { _id: false }
);

const wishlistItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    categoryId: { type: mongoose.Schema.Types.ObjectId },
    quantity: { type: Number, default: 0 },
    image: { type: [String] },
  },
  { _id: false }
);

const wishlistHistorySchema = new mongoose.Schema(
  {
    // Reference back to the original wishlist document (which no longer exists
    // in the Wishlist collection once archived here).
    originalWishlistId: { type: mongoose.Schema.Types.ObjectId },

    // --- copied wishlist data ---
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    Location: [locationSchema],
    WishList: [wishlistItemSchema],
    description: { type: String, default: "" },
    scheme: { type: mongoose.Schema.Types.ObjectId, ref: "Schemes" },
    wishlistStockTime: { type: Date, default: null },

    // --- history metadata ---
    // How the wishlist ended up here.
    wishAction: {
      type: String,
      enum: ["Accepted", "Rejected", "Timeout"],
      required: true,
    },
    // When the action happened.
    actionAt: { type: Date, default: Date.now },
    // Preserve the original document's timestamps for reporting.
    originalCreatedAt: { type: Date },
    originalUpdatedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

wishlistHistorySchema.index({ wishAction: 1, actionAt: -1 });
wishlistHistorySchema.index({ customer: 1 });
wishlistHistorySchema.index({ createdBy: 1 });

module.exports = mongoose.model("WishlistHistory", wishlistHistorySchema);
