const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const initData = require("./data.js");
const Listing = require("../models/listing.js");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken });

if (process.env.NODE_ENV === "production" && process.env.FORCE_SEED !== "true") {
  console.error("FATAL ERROR: Database seeding is disabled in production to prevent data loss. Use FORCE_SEED=true to override.");
  process.exit(1);
}

const MONGO_URL = process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust";

main()
  .then(() => {
    console.log("Connected to DB");
    initDB();
  })
  .catch((err) => {
    console.error("Connection error in seeding:", err);
  });

async function main() {
  await mongoose.connect(MONGO_URL);
}

const initDB = async () => {
  try {
    await Listing.deleteMany({});
    
    const updatedData = [];
    console.log(`Starting geocoding for ${initData.data.length} listings. Please wait...`);

    for (let obj of initData.data) {
      let coordinates = [77.209, 28.613]; // Default: New Delhi
      try {
        const queryText = `${obj.location}, ${obj.country}`;
        const response = await geocodingClient
          .forwardGeocode({
            query: queryText,
            limit: 1,
          })
          .send();
        if (response && response.body && response.body.features && response.body.features.length > 0) {
          coordinates = response.body.features[0].geometry.coordinates;
        } else {
          console.warn(`Geocoding failed for: ${queryText}. Using default.`);
        }
      } catch (err) {
        console.error(`Mapbox geocoding error for ${obj.location}, ${obj.country}:`, err.message);
      }

      updatedData.push({
        ...obj,
        owner: "667c3abcab2dc8cfc6bdf372",
        image: [obj.image || { url: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?q=80&w=2832&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", filename: "default" }],
        contact: "+911234567890",
        category: ["Trending", "Rooms", "Mountains", "Camping", "Farms"][Math.floor(Math.random() * 5)],
        maxGuests: Math.floor(Math.random() * 5) + 2,
        geometry: { type: "Point", coordinates }
      });
    }

    await Listing.insertMany(updatedData);
    console.log("Database initialized successfully with geocoded sample data.");
  } catch (err) {
    console.error("Error seeding database:", err);
  } finally {
    mongoose.connection.close();
  }
};
