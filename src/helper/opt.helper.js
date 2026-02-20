const crypto = require("crypto");

/**
 * Generate a numeric OTP
 * @param {number} digits - number of digits (default 6)
 * @returns {string} OTP
 */
const generateOtp = (digits = 6) => {
  const max = 10 ** digits;
  const num = Math.floor(Math.random() * (max - 10 ** (digits - 1))) + 10 ** (digits - 1);
  return String(num);
};

/**
 * Hash an OTP using PBKDF2
 * @param {string} otp
 * @returns {object} { otpHash, salt }
 */
const hashOtp = (otp) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const otpHash = crypto.pbkdf2Sync(otp, salt, 100000, 64, "sha512").toString("hex");
  return { otpHash, salt };
};

/**
 * Verify OTP hash
 * @param {string} otp - OTP provided by user
 * @param {string} salt - salt stored in DB
 * @param {string} storedHash - hash stored in DB
 * @returns {boolean} true if match, false otherwise
 */
const verifyHash = (otp, salt, storedHash) => {
  const hash = crypto.pbkdf2Sync(otp, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
};

// Export functions for Node.js (CommonJS)
module.exports = {
  generateOtp,
  hashOtp,
  verifyHash,
};
