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

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: {
    type: Number,
    required: [true, 'Phone number is required'],
    match: [
      /^[6-9]\d{9}$/,
      'Phone number must be a valid 10-digit Indian mobile number',
    ],
  },
  email: { type: String },
  location: [locationSchema],
  note: { type: String },
  salesPersonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Customer", customerSchema);
