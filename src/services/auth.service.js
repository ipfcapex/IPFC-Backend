const { User } = require("../models");
const { Token } = require("../models");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { tokenTypes } = require("../config/tokens");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const { sendNotification } = require("./notificationService");
const path = require("path");
const cloudinary = require("../utils/cloudinary")
const { uploadToS3 } = require("../middleware/aws.Middleware"); // your S3 helper
require('dotenv').config();
const { sns, sendEmailOTP, resendEmailOTP, sendEmailOTPforpasswordchange } = require("../utils/awsOTPservice");
const {generateOtp, hashOtp, verifyHash} = require("../helper/opt.helper");
const OTP = require("../models/otp.model");
const { PublishCommand  } = require("@aws-sdk/client-sns");
const AWS = require("aws-sdk");
require("dotenv").config();
const { getLocationFromCoordinates } = require("../utils/Location");


// register for Admin and Administrator
const register = async (userData) => {
  const { name, email, phone, password, role } = userData;

  // Check if email or phone already exists
  const existingUser = await User.findOne({
    $or: [{ email }, { phone }],
  });

  if (existingUser) {
    if (existingUser.email === email) {
      throw new Error("Email already registered");
    } else if (existingUser.phone === phone) {
      throw new Error("Phone number already registered");
    }
  }

  // Create new user (password will be hashed by Mongoose pre-save hook)
  const newUser = new User({
    name,
    email,
    phone,
    password,
    role,
  });

  await newUser.save();

  //Return minimal public-safe user info
  return {
    id: newUser._id,
    name: newUser.name,
    email: newUser.email,
    phone: newUser.phone,
    role: newUser.role,
    createdAt: newUser.createdAt,
  };
};

// Login for all role type
const LoginUser = async (email, password,latitude, longitude) => {
  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new Error("Invalid email");
  if (!user.password) throw new Error("Password missing in DB");

  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) throw new Error("Invalid password");

  // const otp = generateOtp(); // 6-digit OTP
   const otp = generateOtp(); // 6-digit OTP
  const { otpHash, salt } = hashOtp(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await OTP.create({
    userId: user._id,
    email: user.email,
    otpHash,   // must match schema
    salt,
    expiresAt,
    isVerified: false,
  });

  try {
    await sendEmailOTP(user.email, otp); // ✅ now actually a function

    console.log(`🧪 OTP for dev: ${otp} (User: ${user.email})`);
    // ❌ remove: console.log("SNS Response:", response); — response doesn't exist

    return {
      message: "OTP sent successfully",
      email: user.email,
      latitude,
      longitude,
    };
  } catch (error) {
    console.error("❌ SES Error:", error.message);
    throw new Error(`Failed to send OTP: ${error.message}`); // expose real error
  }
};

/**
 * Convert decimal degrees to DMS format
 * @param {number} decimal 
 * @param {string} type - 'lat' or 'lon'
 * @returns {string} DMS string
 */
const parseDMSString = (dmsStr) => {
  if (!dmsStr) return NaN;
  // Remove non-numeric except dot and minus
  const num = parseFloat(dmsStr.replace(/[^\d.-]/g, ''));
  // Adjust for S/W
  if (dmsStr.toUpperCase().includes('S') || dmsStr.toUpperCase().includes('W')) return -num;
  return num;
};

// Convert decimal number to DMS string
const convertToDMS = (decimal, type) => {
  const deg = Math.floor(decimal);
  const minFloat = (decimal - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(2);
  const direction = type === "lat" ? (decimal >= 0 ? "N" : "S") : decimal >= 0 ? "E" : "W";
  return `${Math.abs(deg)}°${min}'${sec}" ${direction}`;
};

const loginWithOtp = async (req, email, otp, latitude, longitude) => {
  // 1️⃣ Validate user exists
  const user = await User.findOne({ email }).populate("warehouses", "name location");
  if (!user) throw new Error("User not found");

  // 2️⃣ Validate OTP
  const otpRecord = await OTP.findOne({ email, isVerified: false }).sort({ createdAt: -1 });
  if (!otpRecord) throw new Error("No OTP request found for this email");
  if (new Date() > otpRecord.expiresAt) throw new Error("OTP expired");

  const isOtpValid = verifyHash(otp, otpRecord.salt, otpRecord.otpHash);
  if (!isOtpValid) throw new Error("Invalid OTP");

  otpRecord.isVerified = true;
  otpRecord.deleteAt = new Date(Date.now() + 60 * 1000);
  await otpRecord.save();

  // 3️⃣ Parse latitude/longitude if string
  if (typeof latitude === "string") latitude = parseDMSString(latitude);
  if (typeof longitude === "string") longitude = parseDMSString(longitude);

  // 4️⃣ Reverse geocode
  const location = await getLocationFromCoordinates(latitude, longitude);

  // Add DMS
  location.latitudeDMS = convertToDMS(latitude, "lat");
  location.longitudeDMS = convertToDMS(longitude, "lon");

  // 5️⃣ JWT payload
  const payload = {
    id: user._id,
    phone: user.phone,
    email: user.email,
    role: user.role,
    location,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "2h" });
  const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "2h" });

  // 6️⃣ Save refresh token with location info
  const newToken = new Token({
    token: refreshToken,
    user: user._id,
    type: tokenTypes.REFRESH,
    expires: new Date(Date.now() + 2 * 60 * 60 * 1000),
    latitude,
    longitude,
    ...location,
  });

  await newToken.save();

  // 7️⃣ Store session info
  req.session.user = {
    id: user._id,
    phone: user.phone,
    email: user.email,
    role: user.role,
    warehouses: user.warehouses,
    location,
  };

  // 8️⃣ Optional notification
  sendNotification("loginSuccess", { id: user._id, message: "Login Success", data: user });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      warehouses: user.warehouses,
      profileImage: user.profileImage || null,
      location,
    },
  };
};

// Resend Opt 
const reSendOpt = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User not found");

  const lastopt = await OTP.findOne({ email }).sort({ createdAt: -1 });
  if (lastopt && new Date() - lastopt.createdAt < 60000) {
    throw new Error("Please wait form minute before requesting a new OTP");
  }

  // const newopt = generateOtp();
  const otp = generateOtp();
  const { otpHash, salt } = hashOtp(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await OTP.create({
    userId: user._id,
    email,
    otpHash,
    salt,
    expiresAt,
    isVerified: false,
  });

  try {
    await resendEmailOTP(user.email, otp); // ✅ now actually a function
    console.log(`🧪 OTP for dev: ${otp} (User: ${user.email})`);
    return { message: "OTP resent successfully", email };
  } catch (error) {
    console.error("Error resending OTP via SNS:", error);
    throw new Error("Failed to resend OTP. Check SNS configuration and sandbox verification.");
  }
}

// const verifyOtping  = async (phone, otp, req) => {
//   const OTP = "123456";
//   if (otp !== OTP) throw new Error("Invalid OTP");
//   const user = await User.findOne({ phone }).populate("warehouses", "name location");
//   if (!user) throw new Error("User not found");

//   // Generate access token
//   const accessToken = jwt.sign(
//     { id: user._id, phone: user.phone, email: user.email, role: user.role },
//     process.env.JWT_SECRET,
//     { expiresIn: process.env.JWT_EXPIRES_IN || "2h" }
//   );
//   console.log("Access Token:", accessToken);

//   // Generate refresh token
//   const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
//     expiresIn: "2h",
//   });

//   // Save refresh token in DB
//   const newToken = new Token({
//     token: refreshToken,
//     user: user._id,
//     type: tokenTypes.REFRESH,
//     expires: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
//   });
//   await newToken.save();

//   // Store user info in session
//   if (req.session) {
//     req.session.user = {
//       id: user._id,
//       phone: user.phone,
//       email: user.email,
//       role: user.role,
//       warehouses: user.warehouses,
//     };
//     console.log("Session started for", req.session.user);
//   }

//   // Send optional notification
//   if (user) {
//     sendNotification("loginSuccess", {
//       message: "Login Success",
//       data: {
//         id: user._id,
//         name: user.name,
//         phone: user.phone,
//         email: user.email,
//         role: user.role,
//         warehouses: user.warehouses,
//       },
//     });
//   }

//   // Return clean response
//   return {
//     success: true,
//     message: "Login successful",
//     data: {
//       accessToken,
//       refreshToken,
//       user: {
//         id: user._id,
//         name: user.name,
//         phone: user.phone,
//         email: user.email,
//         role: user.role,
//         warehouses: user.warehouses,
//       },
//     },
//   };
// };


// Logout For all Role type

const Logout = async (req, refreshToken) => {
  const refreshTokenDoc = await Token.findOne({
    token: refreshToken,
    type: tokenTypes.REFRESH,
    blacklisted: false,
  });

  if (!refreshTokenDoc) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Refresh token not found or already expired"
    );
  }

  const user = await User.findById(refreshTokenDoc.user);
  if (user) {
    console.log(`⛔ Session manually logged out for user: ${user.email}`);
  }

   if (user) {
    sendNotification("logoutSuccess", {
      id:user.id,
      message: ` ${user.email} Logged Out`,
      data: user,
    });
  }
  await refreshTokenDoc.deleteOne();

  // 🔥 Destroy session here
  if (req.session) {
    req.session.destroy(() => {
      console.log(`🟠 Express session destroyed for manual logout`);
    });
  }
};

const changePassword = async (email, oldPassword, newPassword) => {
  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new Error("User not found");

  const isOldMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isOldMatch) throw new Error("Old password is incorrect");

  const isSame = await bcrypt.compare(newPassword, user.password);
  if (isSame) throw new Error("New password cannot be same as old password");

  user.password = newPassword;
  user.isPasswordChanged = true;
  user.passwordChangedAt = new Date();

  await user.save();

  const updatedUser = await User.findOne({ email }).select("+password");
  const isUpdated = await bcrypt.compare(newPassword, updatedUser.password);

  if (!isUpdated) {
    throw new Error("Failed to update password");
  }

  return {
    message: "Password changed successfully",
    passwordChanged: true,
  };
};

// Can only be created by Admin and Administrator
const createUser = async ({
  name,
  email,
  phone,
  password,
  role,
  profileImage,
  location,
  warehouses,
  production
}) => {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedPhone = phone.trim();

  const existing = await User.findOne({
    $or: [{ email: trimmedEmail }, { phone: trimmedPhone }],
  });
  if (existing && existing.isActive === true) {
    throw new Error("Email or phone already registered");
  }

 // Upload image if provided
  if (profileImage) {
    try {
      uploadedImageUrl = await uploadToS3(profileImage);
    } catch (err) {
      console.error("S3 upload failed:", err);
      throw new Error("Failed to upload profile image");
    }
  }
  

  const user = new User({
    name: name.trim(),
    email: trimmedEmail,
    phone: trimmedPhone,
    password: password.trim(),
    role,
    profileImage: uploadedImageUrl || null,
    location: location?.trim() || null,
    warehouses,
    production
  });

  await user.save();

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    profileImage: user.profileImage,
    location: user.location,
    warehouses,
    production
  };
};

// Get ALL users by role
const getUsersByRole = async (targetRole, req = null) => {
  if (!targetRole) {
    throw new Error("Role is required");
  }

  let users = await User.find({ role: targetRole })
    .sort({ createdAt: -1 }) 
    .lean(); 

  if (req) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    users = users.map((user) => ({
      ...user,
      profileImageUrl: user.profileImage
        ? `${baseUrl}/${user.profileImage}`
        : null,
    }));
  }

  return users;
};

//Get a single user by ID
const getUserById = async (id) => {
  return await User.findById(id);
};

//Update user info (supports image update)
// const updateUser = async (id, updateData, profileImage) => {
//   const user = await User.findById(id);
//   if (!user) throw new Error("User not found");

//   if (updateData.phone) {
//     const existingPhoneUser = await User.findOne({ phone: updateData.phone });
//     if (
//       existingPhoneUser &&
//       existingPhoneUser._id.toString() !== id.toString()
//     ) {
//       throw new Error("Phone number already in use by another user");
//     }
//   }

//  if (updateData.password) {
//     // Run schema validator manually before hashing
//     const tempUser = new User({ ...user.toObject(), password: updateData.password });

//     try {
//       await tempUser.validate(); 
//     } catch (validationError) {
//       throw new Error(validationError.errors.password.message);
//     }

//     // Hash new password
//     const hashedPassword = await bcrypt.hash(updateData.password, 10);

//     // Check if another user has same hashed password (optional but uncommon)
//     const existingPassword = await User.findOne({ password: hashedPassword });
//     if (existingPassword && existingPassword._id.toString() !== id.toString()) {
//       throw new Error("Password already in use by another user");
//     }

//     updateData.password = hashedPassword;
//   }

//   if (updateData.email) {
//     const existingEmailUser = await User.findOne({ email: updateData.email });
//     if (
//       existingEmailUser &&
//       existingEmailUser._id.toString() !== id.toString()
//     ) {
//       throw new Error("Email already in use by another user");
//     }
//   }
//  if (profileImage) {
//     try {
//       const imageUrl = await uploadToS3(profileImage);  // ⬅️ AWS upload
//       updateData.profileImage = imageUrl;
//     } catch (err) {
//       console.error("AWS S3 upload failed:", err);
//       throw new Error("Failed to upload profile image");
//     }
//   }

//   const formatIds = (data) => {
//     if (!data) return undefined; // Don't update if null
//     if (Array.isArray(data)) return data;
//     if (typeof data === 'string') {
//       return data.replace(/[\[\]'\n\r]/g, '').split(',').map(id => id.trim()).filter(id => id);
//     }
//     return undefined;
//   };

// const updateQuery = {};
// const pushQuery = {};

// if (updateData.production) {
//   if(user.role === 'Packing Reporter') {
//   updateQuery.$push = { production: updateData.production };
//   }
// }if (updateData.production) {
//     const cleanedProduction = formatIds(updateData.production);
    
//     if (user.role === 'Packing Reporter') {
//       // Use $push to ADD to existing array
//       pushQuery.$push = { production: { $each: cleanedProduction } };
//       delete finalUpdate.production; // Remove from standard update so it doesn't overwrite
//     } else {
//       finalUpdate.production = cleanedProduction;
//     }
//   }


//   // const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true });
//   const updatedUser = await User.findByIdAndUpdate(
//     id, 
//     { ...finalUpdate, ...pushQuery }, 
//     { new: true, runValidators: true }
//   );
//   return updatedUser;
// }; 

const updateUser = async (id, updateData, profileImage) => {
  const user = await User.findById(id);
  if (!user) throw new Error("User not found");

  // 1. Uniqueness Checks (Email & Phone)
  const uniqueFields = ['email', 'phone'];
  for (const field of uniqueFields) {
    if (updateData[field]) {
      const existing = await User.findOne({ [field]: updateData[field] });
      if (existing && existing._id.toString() !== id.toString()) {
        throw new Error(`${field.charAt(0).toUpperCase() + field.slice(1)} already in use`);
      }
    }
  }

  // 2. Password Handling
  if (updateData.password && String(updateData.password).trim()) {
    // Manual validation if needed, otherwise let the schema handle it
    const hashedPassword = await bcrypt.hash(updateData.password, 10);
    updateData.password = hashedPassword;
  } else {
    // Blank/absent password => keep the existing one (never overwrite with "")
    delete updateData.password;
  }

  // 3. Profile Image Upload
  if (profileImage) {
    try {
      const imageUrl = await uploadToS3(profileImage);
      updateData.profileImage = imageUrl;
    } catch (err) {
      throw new Error("Failed to upload profile image");
    }
  }

  // 4. FIX FOR CAST ERROR (Cleaning the arrays)
  const formatIds = (data) => {
    if (!data) return undefined; // Don't update if null
    // Normalize to an array, then strip any bracket/quote junk from every
    // element (handles "[ '' ]", "['id']", arrays of malformed strings, etc.)
    const arr = Array.isArray(data) ? data : [data];
    return arr
      .flatMap(item => String(item).replace(/[\[\]'"\n\r]/g, '').split(','))
      .map(id => id.trim())
      .filter(id => id);
  };

  // 5. Build the final Update Object
  const finalUpdate = { ...updateData };
  const pushQuery = {};

  // Clean the IDs before updating.
  // NOTE: multipart/form-data sends empty fields as "" (not undefined), so we
  // check presence with `in` and always normalize through formatIds. An empty
  // value becomes [] instead of leaking "" to Mongoose (which would CastError).
  if ('production' in updateData) {
    const cleanedProduction = formatIds(updateData.production) || [];

    if (user.role === 'Packing Reporter') {
      // Use $push to ADD to existing array (skip when nothing to add)
      if (cleanedProduction.length) {
        pushQuery.$push = { production: { $each: cleanedProduction } };
      }
      delete finalUpdate.production; // Remove from standard update so it doesn't overwrite
    } else {
      finalUpdate.production = cleanedProduction;
    }
  }

  if ('warehouses' in updateData) {
    finalUpdate.warehouses = formatIds(updateData.warehouses) || [];
  }

  // 6. Execute Update
  // Combine standard $set (finalUpdate) with any $push (pushQuery)
  const updatedUser = await User.findByIdAndUpdate(
    id, 
    { ...finalUpdate, ...pushQuery }, 
    { new: true, runValidators: true }
  );

  return updatedUser;
};

//Soft delete a user (mark inactive)
const deleteUser = async (id) => {

  const user = await User.findById(id);
  
  // Throw error immediately if the user doesn't exist
  if (!user) throw new Error("User not found");

  const updatedUser = await User.findByIdAndUpdate(
    id,
    { isActive: false,
      email: `deactivated_${Date.now()}_${user.email}`,
      phone: `${Date.now()}00${user.phone}` }, // Anonymize email and phone to prevent conflicts
    { new: true }
  );
  
  return updatedUser;
};

// Send OTP for Forget Password
const sendOtp = async (email) => {
  // 1️⃣ Check if user exists
  const user = await User.findOne({ email });
  if (!user) return { success: false, message: "Email is not registered" };

  // 2️⃣ Generate OTP
  // const otp = generateOtp(); // 6-digit random OTP
  const otp = generateOtp(); // 6-digit random OTP
  const { otpHash, salt } = hashOtp(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

  // 3️⃣ Save OTP in DB
  await OTP.create({
    userId: user._id,
    email,
    otpHash,
    salt,
    expiresAt,
    isVerified: false,
  });

  try {
    await sendEmailOTPforpasswordchange(user.email, otp); // ✅ now actually a function
    console.log(`Email OTP sent: ${otp} to ${user.email}`);

    return { success: true, message: "OTP sent successfully", email };
  } catch (err) {
    console.error("Error sending OTP via SNS:", err);
    return { success: false, message: "Failed to send OTP", error: err.message };
  }
};

// Verify OTP for Forget Password
const verifyOtp = async (email, otp) => {
  try{
    const otpRecord = await OTP.findOne({ email, isVerified: false }).sort({ createdAt: -1 });
   if (!otpRecord) throw new Error("No OTP request found for this email");

   if (new Date() > otpRecord.expiresAt) {
    throw new Error("OTP expired");
  }

  //Pass the user-provided OTP, not the whole object
  const isOtpValid = verifyHash(otp, otpRecord.salt, otpRecord.otpHash);
  if (!isOtpValid) {
    throw new Error("Invalid OTP");
  }

  otpRecord.isVerified = true;
  otpRecord.deleteAt = new Date(Date.now() + 60 * 1000); // auto delete after 1 min
  await otpRecord.save();
  return { success: true, message: "OTP verified successfully" };
  } catch (err) {
    console.error("OTP verification error:", err);
    return { success: false, message: "OTP verification failed", error: err.message };
  }
};

// Change Password
const changePasswordS = async (email, newPassword, confirmPassword) => {
  // Skip OTP verification for testing
  // const record = otpStore[phone];
  // if (!record || !record.verified) return { success: false, message: "OTP not verified" };

  if (newPassword !== confirmPassword) 
    return { success: false, message: "Passwords do not match" };

  const user = await User.findOne({ email });
  if (!user) return { success: false, message: "Email is not registered" };

  const hashedPassword = newPassword;
  user.password = hashedPassword;
  user.isPasswordChanged = true;
  await user.save();

  // delete otpStore[phone]; // cleanup

  return { success: true, data:"Password Changed for user" }; // success
};

module.exports = {
  register,
  LoginUser,
  reSendOpt,
  loginWithOtp,
  Logout,
  changePassword,
  createUser,
  getUsersByRole,
  getUserById,
  updateUser,
  deleteUser,
  sendOtp,
  verifyOtp,
  changePasswordS
};
