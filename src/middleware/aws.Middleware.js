// require("dotenv").config(); // Load environment variables at the top
// const fs = require("fs");
// const { PutObjectCommand } = require("@aws-sdk/client-s3");
// const s3 = require("../utils/awsS3");


// exports.uploadToS3 = async (file) => {
//  if (!file || !file.buffer) {
//     throw new Error("File not uploaded by multer (Memory Buffer missing)");
//   }

//   // const fileBuffer = fs.readFileSync(file.path);

//   const s3Params = {
//     Bucket: process.env.AWS_BUCKET_S3,
//     Key: `${process.env.AWS_FOLDER_S3}/${file.filename}`, // Capital K
//     Body: fileBuffer,
//     ContentType: file.mimetype
//   };

//   await s3.send(new PutObjectCommand(s3Params));
//   const s3Url = `https://${process.env.AWS_BUCKET_S3}.s3.${process.env.AWS_REGION_S3}.amazonaws.com/${process.env.AWS_FOLDER_S3}/${file.filename}`;
//   return s3Url;
// };

require("dotenv").config();
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../utils/awsS3");

// Detect the real image type from the file's magic bytes. Returns a safe,
// server-chosen mime for known raster formats, or null for anything else
// (including SVG/HTML/scripts), which callers must reject. Never trust
// file.mimetype for this decision -- it is copied from the client request.
const sniffImageMime = (buffer) => {
  const startsWith = (bytes) =>
    buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);

  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "image/gif"; // GIF8
  if (startsWith([0x42, 0x4d])) return "image/bmp";             // BM
  // WEBP: "RIFF"...."WEBP"
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
};

exports.uploadToS3 = async (file) => {
  // 1. Check for buffer instead of path
  if (!file || !file.buffer) {
    throw new Error("File not uploaded by multer (Memory Buffer missing)");
  }

  // 1b. Verify the actual bytes are a known raster image and derive the
  // Content-Type from them. This rejects SVG/HTML disguised with a spoofed
  // image mimetype, which is the stored-XSS vector.
  const safeContentType = sniffImageMime(file.buffer);
  if (!safeContentType) {
    throw new Error("Invalid image file: content is not a recognized raster image");
  }

  // 2. Memory storage doesn't give a 'filename', so we make one
  const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;

  const s3Params = {
    Bucket: process.env.AWS_BUCKET_S3,
    Key: `${process.env.AWS_FOLDER_S3}/${fileName}`,
    Body: file.buffer, // 3. Use the buffer directly
    ContentType: safeContentType // server-chosen, not client-supplied
  };

  await s3.send(new PutObjectCommand(s3Params));

  // 4. Return the new URL
  return `https://${process.env.AWS_BUCKET_S3}.s3.${process.env.AWS_REGION_S3}.amazonaws.com/${process.env.AWS_FOLDER_S3}/${fileName}`;
};

