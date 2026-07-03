const mongoose = require("mongoose");


const roles = [
  'Admin',
  'Administrator',
  'Packing Reporter',
  'Warehouse Manager',
  'Inventory Manager',
  'Sales Person',
  'Account Section',
  "Annoucement For All"
];
const AnnouncementSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      default: () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`; // Format: YYYY-MM-DD
      },
    },
    time: {
      type: String,
      default: () =>
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
    },
    title: {
      type: String,
      require: true,
    },
    description: {
      type: String,
      require: true,
    },
    role: {
      type: [String],          // array of strings
      enum: roles,             // allowed values
      default: ["Annoucement For All"],       // default role
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    pinned: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Announcements", AnnouncementSchema);
