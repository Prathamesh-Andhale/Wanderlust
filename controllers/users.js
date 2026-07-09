const User = require("../models/user");
const OTP = require("../models/otp");
const Listing = require("../models/listing");
const crypto = require("crypto");
const logger = require("../utils/logger.js");
const { sendEmail } = require("../utils/email");

// Helper function to send and redirect for OTP
async function sendAndRedirectOTP(email, req, res) {
  // Clear any existing OTPs for this email
  await OTP.deleteMany({ email });

  // Generate 6-digit OTP
  const otpVal = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = crypto.createHash("sha256").update(otpVal).digest("hex");

  // Save to database
  await OTP.create({ email, otp: hashedOtp });

  // Send Email (never log the actual OTP value in our winston/app logger)
  await sendEmail({
    to: email,
    subject: "Verify your Wanderlust Account",
    text: `Your OTP is: ${otpVal}. It is valid for 5 minutes.`,
    html: `<h3>Welcome to Wanderlust!</h3><p>Your verification OTP is: <b>${otpVal}</b></p><p>This OTP will expire in 5 minutes.</p>`,
  });

  logger.info(`OTP generated and sent to: ${email}`);
  req.flash("success", "A verification OTP has been sent to your email.");
  return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
}

module.exports.renderSignupForm = (req, res) => {
  res.render("./users/signup.ejs");
};

module.exports.signup = async (req, res, next) => {
  try {
    let { username, email, password, confirmPassword } = req.body;
    if (password !== confirmPassword) {
      req.flash("error", "Passwords do not match.");
      return res.redirect("/signup");
    }

    // Password Strength Check
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
    if (!passwordRegex.test(password)) {
      req.flash("error", "Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, one number, and one special character.");
      return res.redirect("/signup");
    }

    let existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.isVerified) {
        req.flash("error", "A user with the given email is already registered.");
        return res.redirect("/signup");
      } else {
        // Unverified user - update username/password and resend OTP
        existingUser.username = username;
        await existingUser.setPassword(password);
        await existingUser.save();
        return await sendAndRedirectOTP(existingUser.email, req, res);
      }
    }

    const newUser = new User({ email, username, isVerified: false });
    const registeredUser = await User.register(newUser, password);
    logger.info(`User registered unverified: username=${username}, email=${email}`);
    
    return await sendAndRedirectOTP(registeredUser.email, req, res);
  } catch (e) {
    req.flash("error", e.message);
    res.redirect("/signup");
    logger.error("Signup error:", e);
  }
};

module.exports.renderLoginForm = (req, res) => {
  res.render("./users/login.ejs");
};

module.exports.login = async (req, res) => {
  req.flash("success", "Welcome back to Wanderlust!");
  let redirectUrl = res.locals.redirectUrl || "/listings";
  res.redirect(redirectUrl);
};

module.exports.logout = (req, res, next) => {
  req.logOut((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "You are logged out!");
    res.redirect("/listings");
  });
};

// OTP Verification Controllers
module.exports.renderVerifyOtpForm = (req, res) => {
  res.render("users/verify-otp.ejs", { email: req.query.email || "" });
};

module.exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      req.flash("error", "Email and OTP are required.");
      return res.redirect("/signup");
    }

    const otpRecord = await OTP.findOne({ email });
    if (!otpRecord) {
      req.flash("error", "OTP has expired or does not exist. Please request a new one.");
      return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
    }

    if (otpRecord.attempts >= 5) {
      await OTP.deleteMany({ email });
      req.flash("error", "Too many failed attempts. Please request a new OTP.");
      return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
    }

    const hashedInput = crypto.createHash("sha256").update(otp.trim()).digest("hex");
    if (otpRecord.otp !== hashedInput) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      req.flash("error", `Invalid OTP. ${5 - otpRecord.attempts} attempts remaining.`);
      return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
    }

    const user = await User.findOne({ email });
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/signup");
    }

    user.isVerified = true;
    await user.save();
    await OTP.deleteOne({ _id: otpRecord._id });

    logger.info(`User activated via OTP: email=${email}`);

    // Send Welcome Email
    await sendEmail({
      to: user.email,
      subject: "Welcome to Wanderlust!",
      text: `Hi ${user.username},\n\nWelcome to Wanderlust! Your account has been successfully verified.\n\nHappy travels,\nThe Wanderlust Team`,
      html: `<h3>Welcome to Wanderlust!</h3><p>Hi ${user.username},</p><p>Your account has been successfully verified. You can now list properties, message hosts, and book trips!</p>`
    });

    req.login(user, (err) => {
      if (err) return next(err);
      req.flash("success", "Your account has been successfully verified! Welcome to Wanderlust.");
      res.redirect("/listings");
    });
  } catch (e) {
    logger.error("OTP verification error:", e);
    req.flash("error", e.message);
    res.redirect("/signup");
  }
};

module.exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      req.flash("error", "Email is required.");
      return res.redirect("/signup");
    }
    const user = await User.findOne({ email });
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/signup");
    }
    if (user.isVerified) {
      req.flash("success", "Account is already verified. Please log in.");
      return res.redirect("/login");
    }

    await sendAndRedirectOTP(email, req, res);
  } catch (e) {
    logger.error("Resend OTP error:", e);
    req.flash("error", e.message);
    res.redirect("/signup");
  }
};

// Password Reset Flow Controllers
module.exports.renderForgotPasswordForm = (req, res) => {
  res.render("users/forgot-password.ejs");
};

module.exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      req.flash("success", "If that email matches an account, we have sent a reset link.");
      return res.redirect("/forgot-password");
    }

    const token = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `${req.protocol}://${req.get("host")}/reset-password/${token}`;
    await sendEmail({
      to: email,
      subject: "Wanderlust Password Reset Request",
      text: `You requested a password reset. Please click on the link to reset your password: ${resetUrl}`,
      html: `<h3>Password Reset Request</h3><p>You requested a password reset. Please click the link below to set a new password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link is valid for 1 hour.</p>`,
    });

    logger.info(`Password reset link sent to: ${email}`);
    req.flash("success", "A password reset link has been sent to your email.");
    res.redirect("/forgot-password");
  } catch (e) {
    logger.error("Forgot password error:", e);
    req.flash("error", e.message);
    res.redirect("/forgot-password");
  }
};

module.exports.renderResetPasswordForm = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
      req.flash("error", "Password reset token is invalid or has expired.");
      return res.redirect("/forgot-password");
    }
    res.render("users/reset-password.ejs", { token });
  } catch (e) {
    logger.error("Render reset password form error:", e);
    req.flash("error", e.message);
    res.redirect("/forgot-password");
  }
};

module.exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;
    if (password !== confirmPassword) {
      req.flash("error", "Passwords do not match.");
      return res.redirect("back");
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
    if (!passwordRegex.test(password)) {
      req.flash("error", "Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, one number, and one special character.");
      return res.redirect("back");
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      req.flash("error", "Password reset token is invalid or has expired.");
      return res.redirect("/forgot-password");
    }

    await user.setPassword(password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.isVerified = true; // Auto-verify if they successfully reset password
    await user.save();

    logger.info(`Password reset successfully for: ${user.email}`);

    req.login(user, (err) => {
      if (err) return next(err);
      req.flash("success", "Your password has been successfully reset, and you have been logged in.");
      res.redirect("/listings");
    });
  } catch (e) {
    logger.error("Reset password error:", e);
    req.flash("error", e.message);
    res.redirect("/forgot-password");
  }
};

module.exports.renderProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate("wishlist");
    const userListings = await Listing.find({ owner: req.user._id });
    res.render("users/profile.ejs", { user, userListings });
  } catch (err) {
    next(err);
  }
};

module.exports.updateProfile = async (req, res, next) => {
  try {
    const { username, email } = req.body.profile;
    const user = await User.findById(req.user._id);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/listings");
    }

    if (email !== user.email) {
      const emailCheck = await User.findOne({ email });
      if (emailCheck) {
        req.flash("error", "Email is already taken.");
        return res.redirect("/profile");
      }
      user.email = email;
    }

    if (username !== user.username) {
      const usernameCheck = await User.findOne({ username });
      if (usernameCheck) {
        req.flash("error", "Username is already taken.");
        return res.redirect("/profile");
      }
      user.username = username;
    }

    if (req.file) {
      user.profileImage = {
        url: req.file.path,
        filename: req.file.filename,
      };
    }

    await user.save();
    logger.info(`User profile updated: ID=${user._id}`);
    req.flash("success", "Profile updated successfully!");
    res.redirect("/profile");
  } catch (err) {
    logger.error("Update profile error:", err);
    next(err);
  }
};

module.exports.addToWishlist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/listings");
    }
    if (!user.wishlist.includes(id)) {
      user.wishlist.push(id);
      await user.save();
    }
    req.flash("success", "Listing added to wishlist!");
    res.redirect("back");
  } catch (err) {
    next(err);
  }
};

module.exports.removeFromWishlist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/listings");
    }
    user.wishlist.pull(id);
    await user.save();
    req.flash("success", "Listing removed from wishlist!");
    res.redirect("back");
  } catch (err) {
    next(err);
  }
};
