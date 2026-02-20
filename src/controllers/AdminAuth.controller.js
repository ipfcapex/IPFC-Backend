const { AdminAuthService } = require("../services");

exports.resetAdminAuthController = async (req, res, next) => {
  try {
    const { email, phone, token } = req.body;

    // Validate input: at least email or phone must be provided
    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: "Please provide either email or phone to verify admin."
      });
    }

    // Call service to perform admin auth validation
    const result = await AdminAuthService.resetAdminAuth(email, phone, token);

    res.status(200).json({
      success: true,
      message: result.message,
      data: { 
        userId: result.userId,
        email: result.email,
        phone: result.phone
     }
    });
  } catch (error) {
    // Pass error to global error handler
    next(error);
  }
};

exports.updateUserController = async (req, res) => {
  try {
    const { id } = req.params;       // user ID from URL params
    const updateData = req.body;     // new email, phone, password

    // Call service
    const updatedUser = await AdminAuthService.updateUser(id, updateData);

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updatedUser
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};