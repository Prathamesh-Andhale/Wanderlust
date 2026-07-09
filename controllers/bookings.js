const mongoose = require("mongoose");
const Booking = require("../models/booking");
const Listing = require("../models/listing");
const logger = require("../utils/logger");
const { sendEmail } = require("../utils/email");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "mock_key");

const isStripeConfigured = () => {
  return (
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_SECRET_KEY !== "mock_key"
  );
};

module.exports.createBooking = async (req, res, next) => {
  let session = null;
  try {
    const { id } = req.params;
    const { checkIn, checkOut, numberOfGuests } = req.body.booking;

    const listing = await Listing.findById(id);
    if (!listing) {
      req.flash("error", "Listing not found.");
      return res.redirect("/listings");
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Validation: Date bounds
    if (checkInDate < today) {
      req.flash("error", "Check-in date cannot be in the past.");
      return res.redirect(`/listings/${id}`);
    }
    if (checkOutDate <= checkInDate) {
      req.flash("error", "Check-out date must be after check-in date.");
      return res.redirect(`/listings/${id}`);
    }

    const timeDiff = checkOutDate.getTime() - checkInDate.getTime();
    const nights = Math.ceil(timeDiff / (1000 * 3600 * 24));
    if (nights < 1) {
      req.flash("error", "Minimum stay is 1 night.");
      return res.redirect(`/listings/${id}`);
    }

    // Validation: Guests count
    if (numberOfGuests < 1 || numberOfGuests > (listing.maxGuests || 2)) {
      req.flash(
        "error",
        `Guest count must be between 1 and ${listing.maxGuests || 2}.`
      );
      return res.redirect(`/listings/${id}`);
    }

    const totalPrice = listing.price * nights;

    // Overlap validation within a session transaction (if supported)
    let isOverlapping = false;
    let fallbackPerformed = false;

    try {
      session = await mongoose.startSession();
      session.startTransaction();

      // Force a write conflict on Listing to guarantee transaction serialization
      await Listing.findByIdAndUpdate(id, { $inc: { __v: 1 } }).session(
        session
      );

      const overlappingBookings = await Booking.find({
        listing: id,
        status: { $in: ["pending", "confirmed"] },
        $or: [
          { checkIn: { $lt: checkOutDate }, checkOut: { $gt: checkInDate } },
        ],
      }).session(session);

      if (overlappingBookings.length > 0) {
        isOverlapping = true;
      } else {
        // Save booking temporarily in pending state
        const newBooking = new Booking({
          listing: id,
          guest: req.user._id,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          numberOfGuests,
          pricePerNight: listing.price,
          totalPrice,
          status: "pending",
          paymentStatus: "unpaid",
        });
        await newBooking.save({ session });
        req.session.lastCreatedBookingId = newBooking._id.toString();
      }

      await session.commitTransaction();
    } catch (transError) {
      if (session) await session.abortTransaction();
      fallbackPerformed = true;
      logger.warn(
        "Transaction failed or not supported. Performing standard overlap validation fallback.",
        transError
      );
    } finally {
      if (session) session.endSession();
    }

    // Fallback if transaction was aborted or not supported
    if (fallbackPerformed) {
      const overlappingBookings = await Booking.find({
        listing: id,
        status: { $in: ["pending", "confirmed"] },
        $or: [
          { checkIn: { $lt: checkOutDate }, checkOut: { $gt: checkInDate } },
        ],
      });

      if (overlappingBookings.length > 0) {
        isOverlapping = true;
      } else {
        const newBooking = new Booking({
          listing: id,
          guest: req.user._id,
          checkIn: checkInDate,
          checkOut: checkOutDate,
          numberOfGuests,
          pricePerNight: listing.price,
          totalPrice,
          status: "pending",
          paymentStatus: "unpaid",
        });
        await newBooking.save();
        req.session.lastCreatedBookingId = newBooking._id.toString();
      }
    }

    if (isOverlapping) {
      req.flash(
        "error",
        "These dates are already booked. Please choose other dates."
      );
      return res.redirect(`/listings/${id}`);
    }

    const bookingId = req.session.lastCreatedBookingId;

    // Payment step
    if (isStripeConfigured()) {
      const stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "inr",
              product_data: {
                name: listing.title,
                description: `Booking for ${nights} night(s) at ${listing.title}`,
              },
              unit_amount: totalPrice * 100, // Stripe expects paise
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${req.protocol}://${req.get("host")}/bookings/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get("host")}/listings/${id}`,
        metadata: {
          bookingId: bookingId,
        },
      });

      await Booking.findByIdAndUpdate(bookingId, {
        stripeSessionId: stripeSession.id,
      });
      return res.redirect(stripeSession.url);
    } else {
      // Stripe not configured: Redirect to Mock Payment Simulator
      return res.redirect(`/bookings/${bookingId}/mock-payment`);
    }
  } catch (err) {
    logger.error("Create booking error:", err);
    next(err);
  }
};

module.exports.renderMockPayment = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId).populate("listing");
    if (!booking) {
      req.flash("error", "Booking not found.");
      return res.redirect("/listings");
    }
    res.render("bookings/mock-payment.ejs", { booking });
  } catch (err) {
    next(err);
  }
};

module.exports.processMockPayment = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId)
      .populate("listing")
      .populate("guest");
    if (!booking) {
      req.flash("error", "Booking not found.");
      return res.redirect("/listings");
    }

    booking.status = "confirmed";
    booking.paymentStatus = "paid";
    await booking.save();

    logger.info(`Booking confirmed via Mock Payment: ID=${booking._id}`);

    // Send confirmation email
    await sendEmail({
      to: booking.guest.email,
      subject: `Booking Confirmed: ${booking.listing.title}`,
      text: `Hi ${booking.guest.username},\n\nYour booking at ${booking.listing.title} is confirmed!\nDates: ${booking.checkIn.toDateString()} to ${booking.checkOut.toDateString()}\nTotal Price: Rs. ${booking.totalPrice}\n\nThank you for choosing Wanderlust!`,
      html: `<h3>Booking Confirmed!</h3><p>Hi ${booking.guest.username},</p><p>Your booking at <b>${booking.listing.title}</b> has been successfully confirmed.</p><p><b>Check-in:</b> ${booking.checkIn.toDateString()}<br><b>Check-out:</b> ${booking.checkOut.toDateString()}<br><b>Total Price:</b> Rs. ${booking.totalPrice}</p>`,
    });

    req.flash("success", "Payment simulated successfully! Booking confirmed.");
    res.redirect("/bookings/history");
  } catch (err) {
    next(err);
  }
};

module.exports.bookingSuccess = async (req, res, next) => {
  try {
    const { session_id } = req.query;
    if (!session_id) {
      req.flash("error", "Missing payment session ID.");
      return res.redirect("/listings");
    }

    const booking = await Booking.findOne({ stripeSessionId: session_id })
      .populate("listing")
      .populate("guest");
    if (!booking) {
      req.flash("error", "Booking transaction not found.");
      return res.redirect("/listings");
    }

    if (booking.status === "confirmed") {
      return res.redirect("/bookings/history");
    }

    // Verify session in Stripe
    if (isStripeConfigured()) {
      const stripeSession = await stripe.checkout.sessions.retrieve(session_id);
      if (stripeSession.payment_status === "paid") {
        booking.status = "confirmed";
        booking.paymentStatus = "paid";
        await booking.save();

        logger.info(`Booking confirmed via Stripe Redirect: ID=${booking._id}`);

        await sendEmail({
          to: booking.guest.email,
          subject: `Booking Confirmed: ${booking.listing.title}`,
          text: `Hi ${booking.guest.username},\n\nYour booking at ${booking.listing.title} is confirmed!\nDates: ${booking.checkIn.toDateString()} to ${booking.checkOut.toDateString()}\nTotal Price: Rs. ${booking.totalPrice}\n\nThank you!`,
          html: `<h3>Booking Confirmed!</h3><p>Hi ${booking.guest.username},</p><p>Your booking at <b>${booking.listing.title}</b> has been successfully confirmed.</p><p><b>Check-in:</b> ${booking.checkIn.toDateString()}<br><b>Check-out:</b> ${booking.checkOut.toDateString()}<br><b>Total Price:</b> Rs. ${booking.totalPrice}</p>`,
        });

        req.flash("success", "Payment successful! Booking confirmed.");
      } else {
        req.flash("error", "Payment verification failed.");
      }
    } else {
      req.flash("error", "Stripe payment config is unavailable.");
    }

    res.redirect("/bookings/history");
  } catch (err) {
    next(err);
  }
};

module.exports.cancelBooking = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body; // Host cancel reason (optional)
    const booking = await Booking.findById(bookingId)
      .populate("listing")
      .populate("guest")
      .populate({ path: "listing", populate: { path: "owner" } });

    if (!booking) {
      req.flash("error", "Booking not found.");
      return res.redirect("back");
    }

    const today = new Date();
    const timeDiff = booking.checkIn.getTime() - today.getTime();
    const hoursToCheckIn = timeDiff / (1000 * 3600);

    let refundStatus = "none";
    let isGuest = booking.guest._id.equals(req.user._id);

    if (isGuest) {
      if (hoursToCheckIn >= 48) {
        refundStatus = "full";
        booking.paymentStatus = "refunded";
        booking.status = "cancelled";
        req.flash(
          "success",
          "Booking cancelled successfully. A full refund has been initiated."
        );
      } else {
        booking.status = "cancelled";
        req.flash(
          "warning",
          "Booking cancelled. No refund is issued under 48 hours notice."
        );
      }
    } else {
      // Host cancelling
      booking.status = "cancelled";
      booking.paymentStatus = "refunded";
      refundStatus = "full";
      req.flash(
        "success",
        "Booking cancelled by host. Guest is fully refunded."
      );
    }

    await booking.save();
    logger.info(
      `Booking cancelled: ID=${bookingId}, refundStatus=${refundStatus}`
    );

    // Send emails
    const cancelReasonText = reason ? `\nReason: ${reason}` : "";
    await sendEmail({
      to: booking.guest.email,
      subject: `Booking Cancelled: ${booking.listing.title}`,
      text: `Hi ${booking.guest.username},\n\nYour booking at ${booking.listing.title} from ${booking.checkIn.toDateString()} to ${booking.checkOut.toDateString()} has been cancelled.${cancelReasonText}\nRefund status: ${refundStatus}.\n\nRegards,\nWanderlust`,
      html: `<h3>Booking Cancelled</h3><p>Your booking at <b>${booking.listing.title}</b> has been cancelled.</p>${reason ? `<p><b>Reason:</b> ${reason}</p>` : ""}<p><b>Refund status:</b> ${refundStatus}</p>`,
    });

    res.redirect("back");
  } catch (err) {
    next(err);
  }
};

module.exports.renderBookingHistory = async (req, res, next) => {
  try {
    const guestBookings = await Booking.find({ guest: req.user._id })
      .populate("listing")
      .sort({ checkIn: -1 });

    // As a host, fetch bookings for listings owned by this user
    const userListings = await Listing.find({ owner: req.user._id });
    const listingIds = userListings.map((l) => l._id);
    const hostReservations = await Booking.find({
      listing: { $in: listingIds },
    })
      .populate("listing")
      .populate("guest")
      .sort({ checkIn: -1 });

    res.render("bookings/history.ejs", { guestBookings, hostReservations });
  } catch (err) {
    next(err);
  }
};
