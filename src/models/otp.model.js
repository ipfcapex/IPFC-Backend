// models/Otp.js
const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    salt: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    deleteAt: { 
      type: Date, 
      default: null 
    },
  },
  { timestamps: true }
);

otpSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", otpSchema);
