const jwt = require("jsonwebtoken");
const { User } = require("../models/user.model");

const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token"});
  }
};

const requireAdminRoles = (...roles) => {
  return (req, res, next) => {
    console.log("Checking user role:", req.user?.role);
    if (!req.user) {
      return res.status(403).json({ message: "Access denied You have limited access" });
    }

    const userRole = req.user.role;
    const allowedRoles = new Set(roles);

    // If any admin role is specified in allowed roles, expand access to all admin role aliases ('Admin', 'Administrator', 'Super Admin')
    if (roles.some((r) => ["Admin", "Administrator", "Super Admin"].includes(r))) {
      allowedRoles.add("Admin");
      allowedRoles.add("Administrator");
      allowedRoles.add("Super Admin");
    }

    if (!allowedRoles.has(userRole)) {
      return res.status(403).json({ message: "Access denied You have limited access" });
    }
    next();
  };
};

module.exports = { requireAuth, requireAdminRoles };
