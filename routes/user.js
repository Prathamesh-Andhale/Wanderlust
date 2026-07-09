const express = require("express");
const wrapAsync = require("../utils/wrapasync");
const router = express.Router();
const passport = require("passport");
const { saveRedirectUrl, isLoggedin } = require("../middleware");
const userController = require("../controllers/users");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { storage } = require("../cloudConfig.js");
const upload = multer({ storage });

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3, // limit each IP to 3 OTP resend requests per window
  message: "Too many OTP requests from this IP. Please try again after 10 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to check if user is verified after passport authentication
const checkVerified = (req, res, next) => {
  if (req.user && !req.user.isVerified) {
    const email = req.user.email;
    req.logout((err) => {
      if (err) return next(err);
      req.flash("error", "Your account is not verified. We have sent a verification code to your email.");
      return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
    });
  } else {
    next();
  }
};

router
  .route("/signup")
  .get(userController.renderSignupForm)
  .post(wrapAsync(userController.signup));

router
  .route("/login")
  .get(userController.renderLoginForm)
  .post(
    saveRedirectUrl,
    passport.authenticate("local", {
      failureRedirect: "/login",
      failureFlash: true,
    }),
    checkVerified,
    userController.login
  );

router.get("/logout", userController.logout);

// OTP Verification Routes
router
  .route("/verify-otp")
  .get(userController.renderVerifyOtpForm)
  .post(wrapAsync(userController.verifyOtp));

router.post("/resend-otp", otpLimiter, wrapAsync(userController.resendOtp));

// Password Reset Routes
router
  .route("/forgot-password")
  .get(userController.renderForgotPasswordForm)
  .post(wrapAsync(userController.forgotPassword));

router
  .route("/reset-password/:token")
  .get(wrapAsync(userController.renderResetPasswordForm))
  .post(wrapAsync(userController.resetPassword));

// Profile routes
router
  .route("/profile")
  .get(isLoggedin, wrapAsync(userController.renderProfile))
  .put(isLoggedin, upload.single("profileImage"), wrapAsync(userController.updateProfile));

module.exports = router;
