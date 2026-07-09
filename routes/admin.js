const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapasync");
const { isLoggedin, isAdmin } = require("../middleware");
const User = require("../models/user");
const Listing = require("../models/listing");
const Booking = require("../models/booking");
const Review = require("../models/review");
const logger = require("../utils/logger");

// Protect all admin routes
router.use(isLoggedin, isAdmin);

// GET /admin - Admin Dashboard
router.get(
  "/",
  wrapAsync(async (req, res) => {
    const users = await User.find();
    const listings = await Listing.find().populate("owner");
    const bookings = await Booking.find().populate("listing").populate("guest");
    const reviews = await Review.find().populate("author");

    res.render("admin/dashboard.ejs", { users, listings, bookings, reviews });
  })
);

// DELETE /admin/users/:id - Delete User
router.delete(
  "/users/:id",
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    logger.info(`Admin deleted user account: ID=${id}`);
    req.flash("success", "User deleted successfully.");
    res.redirect("/admin");
  })
);

// DELETE /admin/listings/:id - Delete Listing
router.delete(
  "/listings/:id",
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndDelete(id);
    logger.info(`Admin deleted listing: ID=${id}`);
    req.flash("success", "Listing deleted successfully.");
    res.redirect("/admin");
  })
);

// DELETE /admin/bookings/:id - Cancel/Delete Booking
router.delete(
  "/bookings/:id",
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    const booking = await Booking.findById(id);
    if (booking) {
      booking.status = "cancelled";
      booking.paymentStatus = "refunded";
      await booking.save();
      logger.info(`Admin cancelled booking: ID=${id}`);
      req.flash("success", "Booking cancelled and refunded successfully.");
    } else {
      req.flash("error", "Booking not found.");
    }
    res.redirect("/admin");
  })
);

// DELETE /admin/reviews/:id - Delete Review
router.delete(
  "/reviews/:id",
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    await Review.findByIdAndDelete(id);
    // Also pull review from any Listing reviews arrays
    await Listing.updateMany({ reviews: id }, { $pull: { reviews: id } });
    logger.info(`Admin deleted review: ID=${id}`);
    req.flash("success", "Review deleted successfully.");
    res.redirect("/admin");
  })
);

module.exports = router;
