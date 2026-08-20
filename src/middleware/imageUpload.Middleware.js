// // middlewares/multer.js
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');

// const uploadDir = path.join(__dirname, '..', 'uploads');
// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, uploadDir),
//   filename: (req, file, cb) => {
//     const safeName = file.originalname.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
//     cb(null, `${Date.now()}-${safeName}`);
//   },
// });

// const upload = multer({ storage });

// module.exports = upload;

const multer = require('multer');
const path = require('path');
const storage = multer.memoryStorage();

// Raster formats only. SVG is intentionally excluded: it is an XML document
// that can carry <script>/onload payloads (stored XSS). The mimetype below is
// client-supplied and spoofable, so this is only a first gate -- the actual
// content is verified by magic bytes in aws.Middleware.js before it is stored.
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const isRasterMime = /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.mimetype);
  if (!ALLOWED_EXT.includes(ext) || !isRasterMime) {
    return cb(new Error('Only PNG, JPG, JPEG, WEBP, GIF or BMP images are allowed'), false);
  }
  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = upload;
