// // const joi = require("joi")
// // module.exports.listingSchema = joi.object({
// //     listing : joi.object({
// //         title : joi.string().required(),
// //         description : joi.string().required(),
// //         price : joi.number().required().min(0),
// //         location : joi.string().required(),
// //         country : joi.string().required(),
// //         // image : joi.string().allow("",null),
// //         image: joi.object({
// //             fileName: joi.string().allow("", null),
// //             url: joi.string().allow("", null),
// //           }),
// //     }).required(),
// // })

// // MAIN
// const joi = require("joi");

// const listingSchema = joi.object({
//   listing: joi
//     .object({
//       title: joi.string().required(),
//       description: joi.string().required(),
//       loaction: joi.string().required(),
//       country: joi.string().required(),
//       price: joi.number().required(),
//     })
//     .required(),
// });
// module.exports = listingSchema;

// module.exports.reviewSchema = joi.object({
//   review: joi
//     .object({
//       rating: joi.number().required().min(1).max(5),
//       comment: joi.string().required(),
//     })
//     .required(),
// });

// const joi = require("joi");
// module.exports.listingSchema = joi.object({
//   listing: joi
//     .object({
//       title: joi.string().required(),
//       description: joi.string().required(),
//       location: joi.string().required(),
//       country: joi.string().required(),
//       price: joi.number().required(),
//     })
//     .required(),
// });

// module.exports.reviewSchema = joi.object({
//   review: joi
//     .object({
//       rating: joi.number().required().min(1).max(5),
//       comment: joi.string().required(),
//     })
//     .required(),
// });

const joi = require("joi");
module.exports.listingSchema = joi.object({
  listing: joi
    .object({
      title: joi.string().required(),
      description: joi.string().required(),
      location: joi.string().required(),
      country: joi.string().required(),
      price: joi.number().required(),
      image: joi.object({
        url: joi
          .string()
          .allow("", null)
          .default(
            "https://images.unsplash.com/photo-1564501049412-61c2a3083791?q=80&w=2832&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          ),
      }),
      contact: joi.number().required(),
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
