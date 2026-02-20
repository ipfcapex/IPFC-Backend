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

exports.uploadToS3 = async (file) => {
  // 1. Check for buffer instead of path
  if (!file || !file.buffer) {
    throw new Error("File not uploaded by multer (Memory Buffer missing)");
  }

  // 2. Memory storage doesn't give a 'filename', so we make one
  const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;

  const s3Params = {
    Bucket: process.env.AWS_BUCKET_S3,
    Key: `${process.env.AWS_FOLDER_S3}/${fileName}`,
    Body: file.buffer, // 3. Use the buffer directly
    ContentType: file.mimetype
  };

  await s3.send(new PutObjectCommand(s3Params));

  // 4. Return the new URL
  return `https://${process.env.AWS_BUCKET_S3}.s3.${process.env.AWS_REGION_S3}.amazonaws.com/${process.env.AWS_FOLDER_S3}/${fileName}`;
};

