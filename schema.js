const joi = require("joi");

module.exports.listingSchema = joi.object({
  listing: joi
    .object({
      title: joi.string().required(),
      description: joi.string().required(),
      location: joi.string().required(),
      country: joi.string().required(),
      price: joi.number().required().min(0),
      image: joi.any().allow("", null),
      category: joi
        .string()
        .valid(
          "Trending",
          "Rooms",
          "Iconic Cities",
          "Mountains",
          "Castles",
          "Amazing Pools",
          "Camping",
          "Farms",
          "Arctic"
        )
        .optional(),
      maxGuests: joi.number().min(1).optional(),
      contact: joi
        .string()
        .pattern(/^\+?[1-9]\d{1,14}$|^[0-9]{10}$/)
        .required()
        .messages({
          "string.pattern.base":
            "Contact must be a valid phone number (10 digits or E.164 format)",
        }),
    })
    .required(),
});

module.exports.reviewSchema = joi.object({
  review: joi
    .object({
      rating: joi.number().required().min(1).max(5),
      comment: joi.string().required(),
    })
    .required(),
});

module.exports.bookingSchema = joi.object({
  booking: joi
    .object({
      checkIn: joi.date().iso().required(),
      checkOut: joi.date().iso().required(),
      numberOfGuests: joi.number().min(1).required(),
    })
    .required(),
});
