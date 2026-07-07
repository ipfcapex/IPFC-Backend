const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: false,
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    pincode: {
      type: Number,
      required: [true, "Pincode is required"],
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

const qrCodeEntrySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    quantity: {
      type: Number,
      default: 0,
    },
       warehouses: [
      {
        warehouse: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Warehouse",
        },
        quantity: {
          type: Number,
          min: 1,
        },
        scanqtyatdispatch: {
          type: Number,
          default: 0,
        },
        ScanByorder: {
         type: String,
        enum: ["SCANNED", "UNSCANNED"],
        default: "UNSCANNED",
    },
      },
    ],
    image: { type: [String] },
    articleCode: {
       type: mongoose.Schema.Types.Mixed,
        default: ""
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
const reverceHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["NOACTION", "RETURN"],
      default: "NOACTION",
    },
    reason: {
      type: String,
    },
    article: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    categoryCode: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    color: {
      type: String,
      required: true,
    },
    size: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    quality: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      default: 0,
    },
    numOfDispatchedQty: {
      type: Number,
      default: 0,
    }
  },
  {
    _id: false,timestamps: true,
  }
);
const orderSchema = new mongoose.Schema(
  {
    salesOrderNo: {
      type: String,
      required: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User"},
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    Location: [locationSchema],
    items: [qrCodeEntrySchema],
    originalItems: [qrCodeEntrySchema],
    WishList: [Wishlistitems],
    isActive: {
      type: Boolean,
      default: true,
    },
    accountSectionApproval: {
      type: String,
      enum: ["APPROVED", "REJECTED", "PENDING"],
      default: "PENDING",
    },
    note: [
      {
        _id: false,
        text: String,
        by: {
          type: String,
          enum: ["ACCOUNT_MANAGER", "INVENTORY_MANAGER","SALES_PERSON"],
          // required: true
        },
        date: {
          type: String,
          default: () =>
            new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }),
        },
      },
    ],
    inventoryManagerApproval: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    deliveryStatus: {
      type: String,
      enum: ["PENDING", "DELIVERED", "HOLD", "PARTIALLY_DELIVERED"],
      default: "PENDING",
    },
    reverceHistory: [reverceHistorySchema],
    ScannedByWarehouseManager: {
    type: String,
    enum: ["SCANNED", "UNSCANNED"],
    default: "UNSCANNED",
    },
    scheme: { type: mongoose.Schema.Types.ObjectId, ref: "Schemes"},
    isTallyCreated: { type: Boolean, default: false },
    numOfDispatchedQty: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);
