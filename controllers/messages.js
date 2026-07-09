const Conversation = require("../models/conversation");
const Message = require("../models/message");
const Listing = require("../models/listing");
const User = require("../models/user");
const logger = require("../utils/logger");
const { sendEmail } = require("../utils/email");

module.exports.renderInbox = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .populate("participants")
      .populate("listing")
      .sort({ updatedAt: -1 });

    // Fetch last message for each conversation
    const conversationsWithLastMessage = await Promise.all(
      conversations.map(async (convo) => {
        const lastMsg = await Message.findOne({ conversation: convo._id })
          .sort({ createdAt: -1 })
          .populate("sender");
        
        // Count unread messages
        const unreadCount = await Message.countDocuments({
          conversation: convo._id,
          sender: { $ne: req.user._id },
          isRead: false,
        });

        return {
          ...convo.toObject(),
          lastMessage: lastMsg,
          unreadCount,
        };
      })
    );

    res.render("messages/inbox.ejs", { conversations: conversationsWithLastMessage });
  } catch (err) {
    next(err);
  }
};

module.exports.renderThread = async (req, res, next) => {
  try {
    const { convoId } = req.params;
    const convo = await Conversation.findOne({
      _id: convoId,
      participants: req.user._id,
    })
      .populate("participants")
      .populate("listing");

    if (!convo) {
      req.flash("error", "Conversation not found or unauthorized.");
      return res.redirect("/messages");
    }

    const messages = await Message.find({ conversation: convoId })
      .populate("sender")
      .sort({ createdAt: 1 });

    // Mark other participant's messages as read
    await Message.updateMany(
      { conversation: convoId, sender: { $ne: req.user._id }, isRead: false },
      { isRead: true }
    );

    const recipient = convo.participants.find((p) => !p._id.equals(req.user._id));

    res.render("messages/thread.ejs", { convo, messages, recipient });
  } catch (err) {
    next(err);
  }
};

module.exports.initiateConversation = async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const { text } = req.body;

    if (!text || text.trim() === "") {
      req.flash("error", "Message text cannot be empty.");
      return res.redirect("back");
    }

    const listing = await Listing.findById(listingId).populate("owner");
    if (!listing) {
      req.flash("error", "Listing not found.");
      return res.redirect("/listings");
    }

    if (listing.owner._id.equals(req.user._id)) {
      req.flash("error", "You cannot start a conversation with yourself.");
      return res.redirect("back");
    }

    // Check if conversation already exists between guest (req.user._id) and host (listing.owner._id) for this listing
    let convo = await Conversation.findOne({
      listing: listingId,
      participants: { $all: [req.user._id, listing.owner._id] },
    });

    if (!convo) {
      convo = new Conversation({
        listing: listingId,
        participants: [req.user._id, listing.owner._id],
      });
      await convo.save();
    }

    // Save message
    const newMessage = new Message({
      conversation: convo._id,
      sender: req.user._id,
      text: text.trim(),
    });
    await newMessage.save();

    logger.info(`Conversation initiated: ID=${convo._id} between guest=${req.user._id} and host=${listing.owner._id}`);

    // Check if recipient is online. If not, trigger offline email notification
    const recipientIdStr = listing.owner._id.toString();
    const isOnline = global.onlineUsers && global.onlineUsers.has(recipientIdStr);

    if (!isOnline) {
      await sendEmail({
        to: listing.owner.email,
        subject: `New message on Wanderlust for "${listing.title}"`,
        text: `Hi ${listing.owner.username},\n\nYou have received a new message from @${req.user.username} regarding "${listing.title}":\n\n"${text.trim()}"\n\nPlease log in to Wanderlust to reply.\n\nRegards,\nWanderlust`,
        html: `<h3>New Message Received</h3><p>Hi ${listing.owner.username},</p><p>You have received a new message from <b>@${req.user.username}</b> regarding <b>${listing.title}</b>:</p><p style="background: #f8f9fa; padding: 15px; border-left: 4px solid #fe424d;">"${text.trim()}"</p><p><a href="${req.protocol}://${req.get("host")}/messages/t/${convo._id}">Reply on Wanderlust</a></p>`
      });
    }

    req.flash("success", "Message sent successfully!");
    res.redirect(`/messages/t/${convo._id}`);
  } catch (err) {
    next(err);
  }
};

module.exports.postMessage = async (req, res, next) => {
  try {
    const { convoId } = req.params;
    const { text } = req.body;

    if (!text || text.trim() === "") {
      req.flash("error", "Message cannot be empty.");
      return res.redirect("back");
    }

    const convo = await Conversation.findOne({
      _id: convoId,
      participants: req.user._id,
    }).populate("participants").populate("listing");

    if (!convo) {
      req.flash("error", "Conversation not found or unauthorized.");
      return res.redirect("/messages");
    }

    const newMessage = new Message({
      conversation: convoId,
      sender: req.user._id,
      text: text.trim(),
    });
    await newMessage.save();

    const recipient = convo.participants.find((p) => !p._id.equals(req.user._id));

    // WebSocket Real-time Delivery via global Socket.io instance
    if (global.io) {
      const recipientSocketId = global.onlineUsers && global.onlineUsers.get(recipient._id.toString());
      if (recipientSocketId) {
        global.io.to(recipientSocketId).emit("receiveMessage", {
          convoId,
          senderUsername: req.user.username,
          text: text.trim(),
          createdAt: newMessage.createdAt,
        });
      }
    }

    // Send offline email if offline
    const isOnline = global.onlineUsers && global.onlineUsers.has(recipient._id.toString());
    if (!isOnline) {
      await sendEmail({
        to: recipient.email,
        subject: `New reply from @${req.user.username} on Wanderlust`,
        text: `Hi ${recipient.username},\n\nYou have received a new reply from @${req.user.username}:\n\n"${text.trim()}"\n\nLog in to reply: ${req.protocol}://${req.get("host")}/messages/t/${convoId}`,
        html: `<h3>New Reply Received</h3><p>Hi ${recipient.username},</p><p>You have received a new reply from <b>@${req.user.username}</b>:</p><p style="background: #f8f9fa; padding: 15px; border-left: 4px solid #fe424d;">"${text.trim()}"</p><p><a href="${req.protocol}://${req.get("host")}/messages/t/${convoId}">Reply on Wanderlust</a></p>`
      });
    }

    res.redirect(`/messages/t/${convoId}`);
  } catch (err) {
    next(err);
  }
};
