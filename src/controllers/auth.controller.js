const { authService } = require('../services')
const { registerValidation } = require('../validations/auth.validation');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const {changePasswordValidation} = require('../validations/auth.validation')
const { createUserValidation, updateUserValidator } = require('../validations/auth.validation')
const { sendNotification } = require("../services/notificationService");


const register = async (req, res, next) => {
  try {
    //Joi validation
    const { error } = registerValidation.validate(req.body, { abortEarly: false });
    if (error) {
      const messages = error.details.map((detail) => detail.message);
      throw new ApiError(400, messages.join(', '));
    }

    // Register user
    const user = await authService.register(req.body);

    //Return success response
    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user,
    });
  } catch (err) {
    next(err); //Pass to global error handler
  }
};

const LoginUser = async (req, res) => {
  try {
    let { email, password, isdoubleVerifiedchecked, latitude, longitude } = req.body;
    let result = {};
    result = await authService.LoginUser(email, password, latitude, longitude); 

    if (isdoubleVerifiedchecked == true) {
      return res.status(200).json({
        success: true,
        message: 'Login successful ',
        email: result.email,
        phone: result.phone,
        twoFactorRequired: result.twoFactorRequired,
        latitude: result.latitude || null,
        longitude: result.longitude || null,
        ...result
      });
    } else {
      return res.status(500).json({
        Error: 'Enable 2FA'
      });
    }
  } catch (error) {
    return res.status(401).json({
      message: "Login failed",
      reason: error.message,
      code: "AUTH_LOGIN_FAILED"
    });
  }
};

const loginWithOtp = async (req, res, next) => {
  try {
    const { email, otp, latitude, longitude } = req.body;

    // Call the service with lat/lon
    const result = await authService.loginWithOtp(req, email, otp, latitude, longitude);

    console.log("session...", req.session);

    res.status(200).json({
      success: true,
      message: "Login Successful...",
      ...result
    });
  } catch (err) {
    console.log("Login with OTP error:", err);
    next(err);
  }
};

// const loginWithOtpsses = async (req, res, next) => {
//   try {
//     const { phone, otp } = req.body || {};
//     if (!phone || !otp) {
//       return res.status(400).json({ success: false, message: "Phone and OTP are required" });
//     }

//     // Call service to verify OTP
//     const result = await authService.verifyOtping(phone, otp, req);

//     // Only send response once
//     return res.status(200).json(result);

//   } catch (err) {
//     console.error("Login with OTP error:", err);
//     // Only call next(err) if you have an error-handling middleware
//     return res.status(400).json({ success: false, message: err.message });
//   }
// };

// resedn otp
const resendopt = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await authService.reSendOpt(email);
    res.status(200).json({
      success: true,
      message: "OTP Resent Successfully...",
      ...result
    });
  }
  catch (err) {
    console.log("Resend OTP error:", err);
    next(err);
  }
};

const logout = catchAsync(async (req, res) => {
  await authService.Logout(req.body.refreshToken);
  if (req.session) {
    return req.session.destroy((err) => {
      if (err) return res.status(500).json({ success: false, message: 'Could not log out.' });
      return res.status(200).json({ success: true, message: 'Logged out successfully' });
    });
  }
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
});

const refreshToken = catchAsync(async (req, res) => {
  const result = await authService.refreshAuth(req.body.refreshToken);
  res.status(200).json({ success: true, ...result });
});

const handleChangePassword = async (req, res) => {
  try {
    const { error } = changePasswordValidation.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, oldPassword, newPassword } = req.body;
    console.log("email, oldPassword, newPassword ",email, oldPassword, newPassword );
    
    const result = await authService.changePassword(email, oldPassword, newPassword);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { error, value } = createUserValidation.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const profileImage = req.file || null;   // ✅ FIXED

    const { name, email, phone, password, role, location, warehouses, production } = value;

    const newUser = await authService.createUser({
      name,
      email,
      phone,
      password,
      role,
      location,
      profileImage,
      warehouses,
      production
    });

    return res.status(201).json({ success: true, data: newUser });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getUsersbyRoles = async (req, res) => {
  try {
    const { role } = req.params; // or req.query

    const users = await authService.getUsersByRole(role, req);

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const article = await authService.getUserById(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: `User not found` });

    res.json({ success: true, data: article });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    await updateUserValidator.validateAsync(req.body);
    const user = await authService.updateUser(req.params.id, req.body, req.file);
    res.json({ success: true, message: `${user.name} ${user.role} updated Successfully`, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await authService.deleteUser(req.params.id);
    res.json({ success: true, message: "User deactivated", data: user });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

const sendOtps = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.sendOtp(email);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

const verifyOtps = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await authService.verifyOtp(email, otp);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

const changePasswordss = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;
    const result = await authService.changePasswordS(email, newPassword, confirmPassword);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports = {
  register,
  LoginUser,
  loginWithOtp,
  // loginWithOtpsses,
  resendopt,
  logout,
  refreshToken,
  handleChangePassword,
  createUser,
  getUsersbyRoles,
  getUserById, 
  updateUser, 
  deleteUser,
  sendOtps,
  verifyOtps,
  changePasswordss
 };
