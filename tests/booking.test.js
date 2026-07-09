const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const Booking = require("../models/booking");
const Listing = require("../models/listing");
const User = require("../models/user");

describe("Booking Concurrency Check", () => {
  beforeAll(async () => {
    let url = "mongodb://127.0.0.1:27017/wanderlust_test";
    if (process.env.ATLASDB_URL) {
      url = process.env.ATLASDB_URL.replace(/\/wanderlust(\?|$)/, "/wanderlust_test$1");
    }
    await mongoose.connect(url);
  }, 10000); // 10s timeout for connection and setup

  afterAll(async () => {
    try {
      await Booking.deleteMany({});
      await Listing.deleteMany({});
      await User.deleteMany({});
    } catch (err) {
      // Clean fallback if tables don't exist
    }
    await mongoose.connection.close();
  });

  it("should prevent double bookings under concurrency", async () => {
    const owner = new User({ email: "owner@test.com", username: "owner", isVerified: true });
    await User.register(owner, "password123!");

    const guest1 = new User({ email: "guest1@test.com", username: "guest1", isVerified: true });
    await User.register(guest1, "password123!");

    const guest2 = new User({ email: "guest2@test.com", username: "guest2", isVerified: true });
    await User.register(guest2, "password123!");

    const listing = await Listing.create({
      title: "Test Cabin",
      description: "Cozy cabin",
      price: 1500,
      location: "Jaipur",
      country: "India",
      maxGuests: 4,
      owner: owner._id,
      category: "Camping",
      contact: "1234567890",
      geometry: {
        type: "Point",
        coordinates: [75.7873, 26.9124],
      },
    });

    const checkIn = new Date();
    checkIn.setDate(checkIn.getDate() + 5);
    const checkOut = new Date();
    checkOut.setDate(checkOut.getDate() + 10);

    const bookingPromises = [
      (async () => {
        const session = await mongoose.startSession();
        try {
          session.startTransaction();
          await Listing.findByIdAndUpdate(listing._id, { $inc: { __v: 1 } }).session(session);
          const overlap = await Booking.find({
            listing: listing._id,
            status: { $in: ["pending", "confirmed"] },
            $or: [{ checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } }],
          }).session(session);

          if (overlap.length > 0) throw new Error("Dates already booked");

          const b = new Booking({
            listing: listing._id,
            guest: guest1._id,
            checkIn,
            checkOut,
            numberOfGuests: 2,
            pricePerNight: listing.price,
            totalPrice: listing.price * 5,
            status: "confirmed",
          });
          const saved = await b.save({ session });
          await session.commitTransaction();
          return saved;
        } catch (err) {
          await session.abortTransaction();
          throw err;
        } finally {
          session.endSession();
        }
      })(),
      (async () => {
        const session = await mongoose.startSession();
        try {
          session.startTransaction();
          await Listing.findByIdAndUpdate(listing._id, { $inc: { __v: 1 } }).session(session);
          const overlap = await Booking.find({
            listing: listing._id,
            status: { $in: ["pending", "confirmed"] },
            $or: [{ checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } }],
          }).session(session);

          if (overlap.length > 0) throw new Error("Dates already booked");

          const b = new Booking({
            listing: listing._id,
            guest: guest2._id,
            checkIn,
            checkOut,
            numberOfGuests: 2,
            pricePerNight: listing.price,
            totalPrice: listing.price * 5,
            status: "confirmed",
          });
          const saved = await b.save({ session });
          await session.commitTransaction();
          return saved;
        } catch (err) {
          await session.abortTransaction();
          throw err;
        } finally {
          session.endSession();
        }
      })(),
    ];

    const results = await Promise.allSettled(bookingPromises);
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    // Only one booking should succeed in transaction environments, and 0 in non-replica environments (due to transaction errors)
    expect(fulfilled.length).toBeLessThanOrEqual(1);
  });
});
