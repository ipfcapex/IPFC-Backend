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
      enum: ["Accepted", "Partial", "Rejected", "Timeout", "Not Fulfilled", "Expired"],
      required: true,
    },
    // When the action happened.
    actionAt: { type: Date, default: Date.now },
    // Preserve the original document's timestamps for reporting.
    originalCreatedAt: { type: Date },
    originalUpdatedAt: { type: Date },

    // --- partial order metadata ---
    // Total quantity originally requested across all items.
    requestedQuantity: { type: Number, default: 0 },
    // Quantity that was accepted / ordered.
    acceptedQuantity: { type: Number, default: 0 },
    // Quantity remaining after partial fulfillment.
    remainingQuantity: { type: Number, default: 0 },
    // Whether the order placed was partial (acceptedQty < requestedQty).
    isPartialOrder: { type: Boolean, default: false },
    // Mandatory reason when partial. Null / absent for full orders.
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
    partialOrderExplanation: {
      type: String,
      default: null,
    },
    partialOrderReason: {
      type: String,
      default: null,
    },

    // --- Rejection Metadata ---
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
    rejectionOrderExplanation: {
      type: String,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    // When the order was created from this wishlist (for waiting-time calc).
    fulfillmentDate: { type: Date, default: null },
    // Pre-computed waiting time in days (creation → fulfillment).
    waitingTimeDays: { type: Number, default: null },
  },
  {
    timestamps: true,
  }
);

wishlistHistorySchema.index({ wishAction: 1, actionAt: -1 });
wishlistHistorySchema.index({ customer: 1 });
wishlistHistorySchema.index({ createdBy: 1 });

module.exports = mongoose.model("WishlistHistory", wishlistHistorySchema);
