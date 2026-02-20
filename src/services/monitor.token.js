// services/tokenMonitor.service.js

const Token = require('../models/token.model');
const User = require('../models/user.model');
const cron = require('node-cron');

// Store previous tokens in-memory
let lastKnownTokens = new Map(); // token => userId

const monitorTokenExpiry = async () => {
  const tokens = await Token.find({});
  const currentTokenMap = new Map(tokens.map(t => [t.token, t.user.toString()]));

  for (const [oldToken, userId] of lastKnownTokens) {
    if (!currentTokenMap.has(oldToken)) {
      const user = await User.findById(userId);
      if (user) {
        console.log(`⛔ Session expired (TTL) for user: ${user.email}`);
      } else {
        console.log(`⛔ Session expired for unknown user (ID: ${userId})`);
      }
    }
  }

  // Update last known state
  lastKnownTokens = currentTokenMap;
};

// ⏱️ Run every 10 seconds
cron.schedule('*/10 * * * * *', monitorTokenExpiry);

console.log('🟡 Token expiration monitor running...');
