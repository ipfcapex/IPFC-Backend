require("dotenv").config(); // Load environment variables at the top
const { SNSClient } = require("@aws-sdk/client-sns");

console.log("AWS Region:", process.env.AWS_REGION);

const sns = new SNSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

module.exports = { sns };