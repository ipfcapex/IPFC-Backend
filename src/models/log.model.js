// models/UserLog.js
const mongoose = require("mongoose");

const userLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  action: String, // description of what changed
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Log", userLogSchema);
