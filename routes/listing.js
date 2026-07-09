const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapasync.js");
const Listing = require("../models/listing.js");
const { isLoggedin, isOwner, validateListing } = require("../middleware.js");
const listingController = require("../controllers/listings.js");
const userController = require("../controllers/users.js");
const multer = require("multer");
const { storage } = require("../cloudConfig.js");
const upload = multer({ storage });

router
  .route("/")
  .get(wrapAsync(listingController.index))
  .post(
    isLoggedin,
    upload.array("listing[image]", 5),
    validateListing,
    wrapAsync(listingController.createListing)
  );

// NEW ROUTE
router.get("/new", isLoggedin, listingController.renderNewForm);

// SEARCH ROUTE (must come before "/:id")
router.get("/search", wrapAsync(async (req, res) => {
  const rawQuery = (req.query.q || "").trim();
  // Escape special regex characters
  const query = rawQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 9;
  if (page < 1) page = 1;
  if (limit < 1) limit = 9;

  const searchQuery = rawQuery
    ? {
        $or: [
          { title: { $regex: query, $options: "i" } },
          { description: { $regex: query, $options: "i" } },
          { location: { $regex: query, $options: "i" } },
          { country: { $regex: query, $options: "i" } },
        ],
      }
    : {};

  const totalListings = await Listing.countDocuments(searchQuery);
  const totalPages = Math.ceil(totalListings / limit);

  const listings = await Listing.find(searchQuery)
    .skip((page - 1) * limit)
    .limit(limit);

  res.render("listings/searchResults.ejs", { 
    listings, 
    query: rawQuery,
    currentPage: page,
    totalPages,
    limit
  });
}));

router
  .route("/:id")
  .get(wrapAsync(listingController.showListing))
  .put(
    isLoggedin,
    isOwner,
    upload.array("listing[image]", 5),
    validateListing,
    wrapAsync(listingController.updateListing)
  )
  .delete(isLoggedin, isOwner, wrapAsync(listingController.destroyListing));

// EDIT ROUTE
router.get(
  "/:id/edit",
  isLoggedin,
  isOwner,
  wrapAsync(listingController.renderEditForm)
);

// Wishlist routes
router.post("/:id/wishlist", isLoggedin, wrapAsync(userController.addToWishlist));
router.delete("/:id/wishlist", isLoggedin, wrapAsync(userController.removeFromWishlist));

module.exports = router;
