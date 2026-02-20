const express = require('express');
const router = express.Router();
const { authController } = require('../controllers');
const multer = require("multer");
const { requireAuth, requireAdminRoles } = require("../middleware/auth.authorization");
const upload = require('../config/upload');
const imageuploads = require("../middleware/imageUpload.Middleware");


router.post('/register', authController.register);
//Operation with all role type
router.post('/login', authController.LoginUser);
router.post('/login-with-otp', authController.loginWithOtp);
// router.post('/otp', authController.loginWithOtpsses);
router.post('/resend-otp', authController.resendopt);
router.post('/logout', authController.logout);
router.post('/change-password', authController.handleChangePassword);

//Only Admin and Administrator can C-R-U-D users 
router.post('/create-new-account',imageuploads.single("profilePic"),requireAuth,requireAdminRoles('Admin', 'Administrator'),authController.createUser
);router.get('/:role', requireAuth, requireAdminRoles('Admin', 'Administrator'), authController.getUsersbyRoles);
router.get('/:id/get-user', requireAuth,requireAdminRoles('Admin', 'Administrator'), authController.getUserById);
router.put('/:id/update', imageuploads.single('profileImage'), authController.updateUser);
router.delete('/:id/action', requireAuth, requireAdminRoles('Admin', 'Administrator'), authController.deleteUser);

//Forget Password for all Roles
router.post("/send-otp", authController.sendOtps);
router.post("/VerifyOTP", authController.verifyOtps);
router.post("/new-Password", authController.changePasswordss);

module.exports = router;
