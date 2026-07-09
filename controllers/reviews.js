const Review = require("../models/review.js");
const Listing = require("../models/listing.js");
const logger = require("../utils/logger.js");

module.exports.createReview = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id).populate("reviews");
  if (!listing) {
    req.flash("error", "Listing not found.");
    return res.redirect("/listings");
  }

  // 1. Prevent self-reviews
  if (listing.owner.equals(req.user._id)) {
    req.flash("error", "You cannot review your own listing.");
    return res.redirect(`/listings/${id}`);
  }

  // 2. Prevent review if no confirmed booking exists
  const Booking = require("../models/booking");
  const userBooking = await Booking.findOne({
    listing: id,
    guest: req.user._id,
    status: { $in: ["confirmed", "completed"] },
  });
  if (!userBooking) {
    req.flash("error", "Only guests who have booked this listing can leave a review.");
    return res.redirect(`/listings/${id}`);
  }

  // 3. Prevent duplicate reviews
  const existingReview = listing.reviews.find(
    (rev) => rev.author.toString() === req.user._id.toString()
  );
  if (existingReview) {
    req.flash("error", "You have already reviewed this listing.");
    return res.redirect(`/listings/${id}`);
  }

  const newReview = new Review(req.body.review);
  newReview.author = req.user._id;
  listing.reviews.push(newReview);

  await newReview.save();
  await listing.save();
  logger.info(`New review created: ID=${newReview._id} on listing ID=${listing._id}`);
  req.flash("success", "New Review Created Successfully!");
  res.redirect(`/listings/${listing._id}`);
};

module.exports.destroyreview = async (req, res) => {
  let { id, reviewId } = req.params;

  await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
  await Review.findByIdAndDelete(reviewId);
  logger.info(`Review deleted: ID=${reviewId} from listing ID=${id}`);
  req.flash("success", "Review Deleted Successfully!");
  res.redirect(`/listings/${id}`);
};
