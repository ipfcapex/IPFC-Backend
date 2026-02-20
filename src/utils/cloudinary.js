// utils/cloudinary.js
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djfln2qji',
  api_key: process.env.CLOUDINARY_API_KEY || '938282769713611',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'Tz7vsEDXDRH9rlX7jhrX5djP_jw',
  secure: true,
});

module.exports = cloudinary;
