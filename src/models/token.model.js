const mongoose = require('mongoose');
const tokenTypes = require('../config/tokens');

const tokenSchema = new mongoose.Schema({
  token: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: [
      tokenTypes.REFRESH,
      tokenTypes.RESET_PASSWORD,
      tokenTypes.VERIFY_EMAIL,
      tokenTypes.LOGIN_VERIFY,
      tokenTypes.PHONE_NUMBER_CHANGE,
      tokenTypes.EDITION_PAYMENT,
      tokenTypes.PROFILE_INVITE,
      tokenTypes.SIGN_PROFILE_INVITE,
      tokenTypes.SOCIAL_LOGIN,
    ],
    required: true,
  },
  expires: {
    type: Date,
    required: true,
    index: { expires: 0 },
  },
  blacklisted: { type: Boolean, default: false },
  latitude: { type: String },      // remove required: true
  longitude: { type: String },
  city: { type: String },
  area: { type: String },
  fullAddress: { type: String },
},
{
    timestamps: true,
  }
);

const Token = mongoose.model('Token', tokenSchema);

module.exports = Token; 
