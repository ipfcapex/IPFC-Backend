require("dotenv").config(); // Load environment variables at the top
const { S3Client } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION_S3,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_S3,
    secretAccessKey: process.env.AWS_SECRET_KEY_S3
  }
});

module.exports = s3;