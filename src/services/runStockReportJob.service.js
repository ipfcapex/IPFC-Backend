const cron = require("node-cron");
const { Order } = require("../models");
const { SellEmailService } = require("../services");
const { sendStockEmail } = require("../utils/awsOTPservice");

const runStockReportJob = async () => {
  try {
    console.log("Stock report cron started:", new Date().toISOString());

    const pipeline = SellEmailService.getStockReports();
    const result = await Order.aggregate(pipeline);
    const data = result[0];

    const monthName = data?.TallyTotal?.[0]?.month || "Unknown";

    await sendStockEmail(data, monthName);

    console.log(`Stock report sent for ${monthName}`);
  } catch (error) {
    console.error("Stock report cron failed:", error.message);
  }
};

// cron.schedule("* * * * *", runStockReportJob);

cron.schedule("0 0 1 * *", runStockReportJob);

module.exports = { runStockReportJob };