const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapasync");
const bookingController = require("../controllers/bookings");
const { isLoggedin, isBookingOwnerOrHost, validateBooking } = require("../middleware");

// Booking history
router.get("/history", isLoggedin, wrapAsync(bookingController.renderBookingHistory));

// Stripe Payment success redirection handler
router.get("/success", isLoggedin, wrapAsync(bookingController.bookingSuccess));

// Book a listing
router.post("/listings/:id/book", isLoggedin, validateBooking, wrapAsync(bookingController.createBooking));

// Mock payment simulation routes
router
  .route("/:bookingId/mock-payment")
  .get(isLoggedin, isBookingOwnerOrHost, wrapAsync(bookingController.renderMockPayment))
  .post(isLoggedin, isBookingOwnerOrHost, wrapAsync(bookingController.processMockPayment));

// Cancel a booking
router.post("/:bookingId/cancel", isLoggedin, isBookingOwnerOrHost, wrapAsync(bookingController.cancelBooking));

// Fetch booked dates for listing availability calendar
router.get("/listings/:id/booked-dates", wrapAsync(async (req, res) => {
  const Booking = require("../models/booking");
  const bookings = await Booking.find({
    listing: req.params.id,
    status: { $in: ["pending", "confirmed"] }
  }, "checkIn checkOut");
  res.json(bookings);
}));

module.exports = router;
