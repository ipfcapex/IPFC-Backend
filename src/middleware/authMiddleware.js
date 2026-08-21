const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // Try Authorization header with Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        console.log("⚠️ Access token expired for route:", req.originalUrl);
        return res.status(401).json({ message: 'Token expired', expired: true });
      }
      console.log("❌ Invalid token for route:", req.originalUrl, err.message);
      return res.status(401).json({ message: 'Invalid token' });
    }
  }
  console.log("user", req.user)

  return res.status(401).json({ message: 'Unauthorized' });
};

module.exports = authMiddleware;
