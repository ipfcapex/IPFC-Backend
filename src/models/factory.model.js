const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema({
  address: { type: String, required: true },
  country: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
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
}, { _id: false });

const factorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    location: locationSchema, // Multiple shops per customer
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Factory", factorySchema);
