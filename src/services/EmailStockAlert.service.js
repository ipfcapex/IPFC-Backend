const { SellOrder } = require("../models");
const { Production } = require("../models");
const { Stock } = require("../models");
const { User } = require("../models");
const { Cart } = require("../models");

exports.getStockReports = ({ name = [] } = {}) => {
  const searchList = Array.isArray(name) ? name : [name].filter(Boolean);

  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fromDate = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
  const toDate = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthName = prevMonth.toLocaleString("default", { month: "long" });

  const match = {
    inventoryManagerApproval: "APPROVED",
    deliveryStatus: "DELIVERED",
    createdAt: { $gte: fromDate, $lte: toDate },
    ...(searchList.length > 0 && { "items.article": { $in: searchList } }),
  };

  const pipeline = [
    { $match: match },
    { $unwind: "$items" },
    ...(searchList.length > 0 ? [{ $match: { "items.article": { $in: searchList } } }] : []),
    {
      $facet: {
        articleSummary: [
          {
            $group: {
              _id: "$items.article",
              totalQuantitySold: { $sum: "$items.quantity" },
              totalOrders: { $sum: 1 },
            },
          },
          { $sort: { totalQuantitySold: -1 } },
          { $addFields: { month: monthName } },
        ],
        colorSizeSummary: [
          {
            $group: {
              _id: { article: "$items.article", color: "$items.color", size: "$items.size" },
              totalQuantitySold: { $sum: "$items.quantity" },
            },
          },
          {
            $project: {
              _id: 0,
              articleOrCategory: "$_id.article",
              color: "$_id.color",
              size: "$_id.size",
              totalQuantitySold: 1,
              month: { $literal: monthName },
            },
          },
          { $sort: { articleOrCategory: 1, color: 1, size: 1 } },
        ],
        cumulativeTotalByArticle: [
          {
            $group: {
              _id: "$items.article",
              grandTotalQuantity: { $sum: "$items.quantity" },
              categoryCode: { $first: "$items.categoryCode" },
              totalOrderLines: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              categoryCode: 1,
              articleOrCategory: "$_id",
              grandTotalQuantity: 1,
              totalOrderLines: 1,
              month: { $literal: monthName },
            },
          },
        ],
        TallyTotal: [
          { $group: { _id: null, total: { $sum: "$items.quantity" } } },
          { $project: { _id: 0, totalSales: "$total", month: { $literal: monthName } } },
        ],
      },
    },
  ];

  return pipeline;
};