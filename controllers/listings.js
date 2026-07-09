const Listing = require("../models/listing.js");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken });
const logger = require("../utils/logger.js");

module.exports.index = async (req, res) => {
  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 9;
  if (page < 1) page = 1;
  if (limit < 1) limit = 9;

  // Build dynamic filters query
  const filterQuery = {};
  if (req.query.category) {
    filterQuery.category = req.query.category;
  }
  if (req.query.priceMin || req.query.priceMax) {
    filterQuery.price = {};
    if (req.query.priceMin)
      filterQuery.price.$gte = parseInt(req.query.priceMin);
    if (req.query.priceMax)
      filterQuery.price.$lte = parseInt(req.query.priceMax);
  }
  if (req.query.location) {
    filterQuery.location = {
      $regex: req.query.location.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"),
      $options: "i",
    };
  }

  const totalListings = await Listing.countDocuments(filterQuery);
  const totalPages = Math.ceil(totalListings / limit);

  const allListings = await Listing.find(filterQuery)
    .skip((page - 1) * limit)
    .limit(limit);

  res.render("listings/index.ejs", {
    allListings,
    currentPage: page,
    totalPages,
    limit,
    selectedCategory: req.query.category || "",
    priceMin: req.query.priceMin || "",
    priceMax: req.query.priceMax || "",
    locationFilter: req.query.location || "",
  });
};

module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs");
};

module.exports.showListing = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id)
    .populate({
      path: "reviews",
      populate: {
        path: "author",
      },
    })
    .populate("owner");
  if (!listing) {
    req.flash("error", "Listing you requested for does not exist!");
    return res.redirect("/listings");
  }
  // console.log(listing);
  res.render("listings/show.ejs", { listing });
};

module.exports.createListing = async (req, res, next) => {
  let geometry = { type: "Point", coordinates: [77.209, 28.613] }; // Default coordinates: New Delhi
  try {
    const queryText = `${req.body.listing.location}, ${req.body.listing.country || ""}`;
    let response = await geocodingClient
      .forwardGeocode({
        query: queryText,
        limit: 1,
      })
      .send();
    if (
      response &&
      response.body &&
      response.body.features &&
      response.body.features.length > 0
    ) {
      geometry = response.body.features[0].geometry;
    } else {
      logger.warn(
        `Geocoding failed for location: "${req.body.listing.location}". Using default coordinates.`
      );
    }
  } catch (err) {
    logger.error("Mapbox geocoding client error:", err);
  }

  let images = [];
  if (req.files && req.files.length > 0) {
    images = req.files.map((file) => ({
      url: file.path,
      filename: file.filename,
    }));
    logger.info(`Uploading ${images.length} image(s) for new listing.`);
  }

  const newListing = new Listing(req.body.listing);
  newListing.owner = req.user._id;
  newListing.image = images;
  newListing.geometry = geometry;

  let savedListing = await newListing.save();
  logger.info(
    `New listing created: ID=${savedListing._id}, title="${savedListing.title}"`
  );
  req.flash("success", "New Listing Created Successfully!");
  res.redirect("/listings");
};

module.exports.renderEditForm = async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing you requested for does not exist!");
    return res.redirect("/listings");
  }

  let originalImages = [];
  if (listing.image && listing.image.length > 0) {
    originalImages = listing.image.map((img) => {
      let url = img.url;
      if (url && url.includes("/upload")) {
        url = url.replace("/upload", "/upload/w_250");
      }
      return { url, filename: img.filename };
    });
  }

  res.render("listings/edit.ejs", { listing, originalImages });
};

module.exports.updateListing = async (req, res) => {
  let { id } = req.params;

  let geometry;
  if (req.body.listing && req.body.listing.location) {
    try {
      const queryText = `${req.body.listing.location}, ${req.body.listing.country || ""}`;
      let response = await geocodingClient
        .forwardGeocode({
          query: queryText,
          limit: 1,
        })
        .send();
      if (
        response &&
        response.body &&
        response.body.features &&
        response.body.features.length > 0
      ) {
        geometry = response.body.features[0].geometry;
      }
    } catch (err) {
      logger.error("Mapbox geocoding error in listing update:", err);
    }
  }

  let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing });

  if (geometry) {
    listing.geometry = geometry;
    await listing.save();
  }

  if (req.files && req.files.length > 0) {
    const newImages = req.files.map((file) => ({
      url: file.path,
      filename: file.filename,
    }));
    listing.image = newImages;
    await listing.save();
  }

  logger.info(`Listing updated: ID=${id}`);
  req.flash("success", "Listing Updated Successfully!");
  res.redirect(`/listings/${id}`);
};

module.exports.destroyListing = async (req, res) => {
  let { id } = req.params;
  let deletedListing = await Listing.findByIdAndDelete(id);
  logger.info(`Listing deleted: ID=${id}`);
  req.flash("success", " Listing Deleted Successfully!");
  res.redirect("/listings");
};
