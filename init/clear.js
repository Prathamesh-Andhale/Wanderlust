const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const Listing = require("../models/listing.js");

const MONGO_URL = process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust";

main()
  .then(() => {
    console.log("Connected to DB");
    clearDB();
  })
  .catch((err) => {
    console.error("Connection error:", err);
  });

async function main() {
  await mongoose.connect(MONGO_URL);
}

const clearDB = async () => {
  try {
    await Listing.deleteMany({});
    console.log("Database cleared successfully (all sample listings removed).");
  } catch (err) {
    console.error("Error clearing database:", err);
  } finally {
    mongoose.connection.close();
  }
};
