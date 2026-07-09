const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapasync");
const messageController = require("../controllers/messages");
const { isLoggedin } = require("../middleware");
const rateLimit = require("express-rate-limit");

const msgLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 messages per minute
  message: "Too many messages sent. Please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /messages - Inbox
router.get("/", isLoggedin, wrapAsync(messageController.renderInbox));

// GET /messages/t/:convoId - Conversation thread
router.get("/t/:convoId", isLoggedin, wrapAsync(messageController.renderThread));

// POST /messages/listings/:listingId - Initiate conversation
router.post("/listings/:listingId", isLoggedin, msgLimiter, wrapAsync(messageController.initiateConversation));

// POST /messages/t/:convoId - Post reply
router.post("/t/:convoId", isLoggedin, msgLimiter, wrapAsync(messageController.postMessage));

module.exports = router;
