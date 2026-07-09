const nodemailer = require("nodemailer");
const logger = require("./logger.js");

let transporter;

async function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (user && pass) {
    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: { user, pass },
    });
    logger.info("Nodemailer configured with user SMTP credentials.");
  } else {
    // Ethereal mock fallback
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      logger.info(`Nodemailer using Ethereal fallback. User: ${testAccount.user}`);
    } catch (err) {
      logger.error("Failed to create Ethereal test account. Email sending falls back to Console logging.", err);
      // Stub logger transporter
      transporter = {
        sendMail: async (options) => {
          logger.warn(`[MOCK EMAIL] To: ${options.to}\nSubject: ${options.subject}\nText:\n${options.text}`);
          return { messageId: "mock-id-" + Date.now() };
        },
      };
    }
  }
  return transporter;
}

module.exports.sendEmail = async (options) => {
  try {
    const mailTransporter = await getTransporter();
    const info = await mailTransporter.sendMail({
      from: process.env.EMAIL_FROM || '"Wanderlust" <noreply@wanderlust.com>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    if (nodemailer.getTestMessageUrl && info && info.messageId && !process.env.EMAIL_USER) {
      const url = nodemailer.getTestMessageUrl(info);
      if (url) {
        logger.info(`Email sent! Preview URL: ${url}`);
      }
    } else {
      logger.info(`Email sent successfully to ${options.to}. MessageId: ${info.messageId}`);
    }
    return info;
  } catch (err) {
    logger.error(`Error sending email to ${options.to}:`, err);
    throw err;
  }
};
