const { User } = require("../models");
const { AdminToken }  = require("../models");
const bcrypt = require("bcrypt");

exports.resetAdminAuth = async (email, phone, token) => {
  if (!token) {
    throw new Error("Admin token is required.");
  }

  const adminToken = await AdminToken.findOne({ token });
  if (!adminToken) {
    throw new Error("Invalid admin token. Please provide a valid token.");
  }

  if (!email && !phone) {
    throw new Error("Please provide at least email or phone.");
  }

  const query = { role: "Admin", $or: [] };
  if (email) query.$or.push({ email: { $regex: `^${email}$`, $options: "i" } }); // case-insensitive
  if (phone) query.$or.push({ phone: phone });

  const user = await User.findOne(query);

  if (!user) {
  throw new Error(
    "Admin authentication failed. Please ensure at least one of email or phone is correct."
  );
}

    return {
    message: "Admin authenticated for reset.",
    userId: user._id,
    email: user.email,
    phone: user.phone
    };
};

exports.updateUser = async (id, updateData) => {
  const user = await User.findById(id);
  if (!user) throw new Error("User not found");

  if (updateData.phone) {
    const existingPhoneUser = await User.findOne({ phone: updateData.phone });
    if (
      existingPhoneUser &&
      existingPhoneUser._id.toString() !== id.toString()
    ) {
      throw new Error("Phone number already in use by another user");
    }
  }

 if (updateData.password) {
    // Run schema validator manually before hashing
    const tempUser = new User({ ...user.toObject(), password: updateData.password });

    try {
      await tempUser.validate(); 
    } catch (validationError) {
      throw new Error(validationError.errors.password.message);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(updateData.password, 10);

    // Check if another user has same hashed password (optional but uncommon)
    const existingPassword = await User.findOne({ password: hashedPassword });
    if (existingPassword && existingPassword._id.toString() !== id.toString()) {
      throw new Error("Password already in use by another user");
    }

    updateData.password = hashedPassword;
  }

  if (updateData.email) {
    const existingEmailUser = await User.findOne({ email: updateData.email });
    if (
      existingEmailUser &&
      existingEmailUser._id.toString() !== id.toString()
    ) {
      throw new Error("Email already in use by another user");
    }
  }

  const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });
  return updatedUser;
};