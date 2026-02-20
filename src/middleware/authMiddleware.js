const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // First try session (if using express-session)
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  // Then try Authorization header with Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
  }
  console.log("user",req.user)

  return res.status(401).json({ message: 'Unauthorized' });
};

module.exports = authMiddleware;
