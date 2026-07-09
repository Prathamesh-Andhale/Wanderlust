const winston = require("winston");
const path = require("path");

const fs = require("fs");

const transports = [];

// 1. Console transport is always active for containerized/serverless environment observability (stdout/stderr)
transports.push(
  new winston.transports.Console({
    format: process.env.NODE_ENV === "production"
      ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, stack }) => {
            if (stack) {
              return `${timestamp} ${level}: ${message}\n${stack}`;
            }
            return `${timestamp} ${level}: ${message}`;
          })
        )
  })
);

// 2. File transport is added conditionally if the log directory is writable
const logDir = path.join(__dirname, "../logs");
let isWritable = true;

try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.accessSync(logDir, fs.constants.W_OK);
} catch (err) {
  isWritable = false;
  console.warn(`WARNING: Log directory '${logDir}' is not writable (${err.message}). Falling back to Console-only logging.`);
}

if (isWritable) {
  const errorFileTransport = new winston.transports.File({
    filename: path.join(logDir, "error.log"),
    level: "error",
  });
  const combinedFileTransport = new winston.transports.File({
    filename: path.join(logDir, "combined.log"),
  });

  // Handle write errors gracefully to avoid uncaught exceptions
  errorFileTransport.on("error", (err) => console.error("Winston error file transport error:", err));
  combinedFileTransport.on("error", (err) => console.error("Winston combined file transport error:", err));

  transports.push(errorFileTransport, combinedFileTransport);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
});

module.exports = logger;
