if (process.env.NODE_ENV != "production") {
  require("dotenv").config();
}
const express = require("express");
const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const aboutRoutes = require("./routes/about");

const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");
const bookingRouter = require("./routes/booking.js");
const adminRouter = require("./routes/admin.js");
const messageRouter = require("./routes/message.js");
const logger = require("./utils/logger.js");

// Validate Required Environment Variables
const dbUrl =
  process.env.ATLASDB_URL ||
  (process.env.NODE_ENV !== "production"
    ? "mongodb://127.0.0.1:27017/wanderlust"
    : null);
if (!dbUrl) {
  logger.error("FATAL ERROR: ATLASDB_URL environment variable is missing.");
  process.exit(1);
}

const requiredEnv = [
  "CLOUD_NAME",
  "CLOUD_API_KEY",
  "CLOUD_API_SECRET",
  "MAP_TOKEN",
];
const missingEnv = requiredEnv.filter((env) => !process.env[env]);
if (missingEnv.length > 0) {
  if (process.env.NODE_ENV === "production") {
    logger.error(
      `FATAL ERROR: The following environment variables are missing in production: ${missingEnv.join(", ")}`
    );
    process.exit(1);
  } else {
    logger.warn(
      `WARNING: The following environment variables are missing in development: ${missingEnv.join(", ")}. Uploads and Mapbox features will not function correctly.`
    );
  }
}

const sessionSecret =
  process.env.SECRET ||
  (process.env.NODE_ENV !== "production" ? "dev_session_secret_key" : null);

if (!sessionSecret) {
  console.error("FATAL ERROR: SECRET environment variable is not defined.");
  process.exit(1);
}

main()
  .then(() => {
    console.log("connected to DB");
  })
  .catch((err) => {
    console.error("DB connection error:", err);
  });

async function main() {
  await mongoose.connect(dbUrl);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));
app.use(cookieParser());

// 1. Helmet HTTP Headers & CSP configuration
const scriptSrcUrls = [
  "https://api.tiles.mapbox.com/",
  "https://api.mapbox.com/",
  "https://kit.fontawesome.com/",
  "https://cdnjs.cloudflare.com/",
  "https://cdn.jsdelivr.net",
];
const styleSrcUrls = [
  "https://kit-free.fontawesome.com/",
  "https://api.mapbox.com/",
  "https://api.tiles.mapbox.com/",
  "https://fonts.googleapis.com/",
  "https://use.fontawesome.com/",
  "https://cdn.jsdelivr.net",
];
const connectSrcUrls = [
  "https://api.mapbox.com/",
  "https://*.tiles.mapbox.com/",
  "https://events.mapbox.com/",
  "ws:",
  "wss:",
];
const fontSrcUrls = [
  "https://fonts.gstatic.com/",
  "https://use.fontawesome.com/",
];

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: [],
      connectSrc: ["'self'", ...connectSrcUrls],
      scriptSrc: ["'unsafe-inline'", "'self'", ...scriptSrcUrls],
      styleSrc: ["'self'", "'unsafe-inline'", ...styleSrcUrls],
      workerSrc: ["'self'", "blob:"],
      objectSrc: [],
      imgSrc: [
        "'self'",
        "blob:",
        "data:",
        "https://res.cloudinary.com/",
        "https://images.unsplash.com/",
        "https://*.cloudinary.com",
      ],
      fontSrc: ["'self'", ...fontSrcUrls],
    },
  })
);

// 2. Mongo Sanitization to prevent NoSQL Injection
app.use(mongoSanitize());

// HTTP request logging via Morgan streamed to Winston
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// 3. Rate Limiters
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 15,
  message: "Too many auth requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/login", authLimiter);
app.use("/signup", authLimiter);

// Session Store
const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: sessionSecret,
  },
  touchAfter: 24 * 3600,
});

store.on("error", (err) => {
  console.error("ERROR in MONGO SESSION STORE", err);
});

const sessionOptions = {
  store,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
};

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user || null;
  next();
});

app.get("/", (req, res) => {
  res.redirect("/listings");
});

app.use("/bookings", bookingRouter);
app.use("/admin", adminRouter);
app.use("/messages", messageRouter);
app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);
app.use("/about", aboutRoutes);

app.get("/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "up" : "down";
  res.status(dbStatus === "up" ? 200 : 503).json({
    status: dbStatus === "up" ? "healthy" : "unhealthy",
    timestamp: new Date(),
    uptime: process.uptime(),
    services: {
      database: dbStatus,
    },
  });
});

app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page not found!"));
});

app.use((err, req, res, next) => {
  let { statusCode = 500, message = "Something went wrong" } = err;

  if (process.env.NODE_ENV === "production") {
    console.error(`[Error] ${statusCode} - ${message}\nStack: ${err.stack}`);
    if (statusCode === 500) {
      message = "Internal Server Error";
    }
  } else {
    console.error(err.stack);
  }

  const safeErr = {
    message,
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  };

  res.status(statusCode).render("error.ejs", { err: safeErr });
});

const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

global.onlineUsers = new Map();
global.io = io;

io.on("connection", (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // Register online user
  socket.on("registerUser", (userId) => {
    if (userId) {
      global.onlineUsers.set(userId, socket.id);
      logger.info(
        `Socket user registered: userId=${userId} socketId=${socket.id}`
      );
    }
  });

  socket.on("disconnect", () => {
    for (let [userId, socketId] of global.onlineUsers.entries()) {
      if (socketId === socket.id) {
        global.onlineUsers.delete(userId);
        logger.info(`Socket user disconnected: userId=${userId}`);
        break;
      }
    }
  });
});

const port = process.env.PORT || 8080;
server.listen(port, "0.0.0.0", () => {
  console.log(`server is listening on port ${port}`);
});
