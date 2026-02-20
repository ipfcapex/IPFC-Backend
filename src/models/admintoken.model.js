// models/UserLog.js
const mongoose = require("mongoose");

const AdmintokenSchema= new mongoose.Schema({
  token: { type: String},
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AdminToken", AdmintokenSchema);
