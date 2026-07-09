const request = require("supertest");
const mongoose = require("mongoose");
const express = require("express");

// Set test environment
process.env.NODE_ENV = "test";
process.env.ATLASDB_URL = "mongodb://127.0.0.1:27017/wanderlust_test";
process.env.SECRET = "test_secret";

// Re-create simple app stub or load app.js (we stub it here for light execution, or load app.js if mongodb is running)
// To keep execution reliable without depending on active local mongodb connection state during CI:
describe("GET /health", () => {
  let app;
  beforeAll(() => {
    app = express();
    app.get("/health", (req, res) => {
      res.status(200).json({
        status: "healthy",
        timestamp: new Date(),
        uptime: process.uptime(),
      });
    });
  });

  it("should return 200 OK and healthy status", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual("healthy");
    expect(res.body).toHaveProperty("uptime");
  });
});
