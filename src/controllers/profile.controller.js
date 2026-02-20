const { User } = require("../models");

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    let user = await User.findById(userId)
      .select("name phone email role location profileImage warehouses")
      .populate("warehouses", "name location");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Convert to plain object with virtuals
    const userObj = user.toJSON({ virtuals: true });

    // Ensure profileImage always exists
    if (!userObj.profileImage) {
      userObj.profileImage = null;
    }

    // Ensure location always exists
    if (!userObj.location) {
      userObj.location = null;
    }

    return res.status(200).json({
      success: true,
      data: userObj,
    });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

