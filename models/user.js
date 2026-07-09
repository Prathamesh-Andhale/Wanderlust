const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new Schema({
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    trim: true,
    lowercase: true,
  },
  isVerified: {
    type: Boolean,
    default: false, // OTP verification required
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  wishlist: [
    {
      type: Schema.Types.ObjectId,
      ref: "Listing",
    },
  ],
  profileImage: {
    url: {
      type: String,
      default: "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png",
    },
    filename: String,
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
});

userSchema.plugin(passportLocalMongoose, {
  limitAttempts: true,
  maxAttempts: 5,
  unlockInterval: 5 * 60 * 1000, // 5 minutes lockout
});

module.exports = mongoose.model("User", userSchema);
