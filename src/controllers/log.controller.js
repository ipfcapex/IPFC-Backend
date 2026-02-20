// controllers/logController.js
const { LogService } = require("../services");

exports.getLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || ""; // get search string from query

    const recentUsers = await LogService.getRecentUpdates(page, limit, search); // pass search
    res.json({
      success: true,
      ...recentUsers
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};
//   try {
//     const tokenValue = req.headers.authorization?.split(" ")[1];
//     if (!tokenValue) return res.status(401).json({ success: false, message: "No token provided" });

//     const warehouses = await LogService.getRecentWarehouseUpdates(tokenValue, 20);
//     res.json({ success: true, data: warehouses });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: err.message });
//   }
// };