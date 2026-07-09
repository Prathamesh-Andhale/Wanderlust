# Wanderlust - Premium Airbnb-Style Booking Application

Wanderlust is an industry-ready, production-grade Airbnb clone built with Node.js, Express, MongoDB, and EJS. It includes secure authentication, transactional email notifications, real-time messaging, map integrations, and credit card payments.

---

## Key Features

1. **Secure Authentication & Account Security**:
   - Passport.js authentication with session safety.
   - Account Lockout (5 consecutive failed attempts locks account for 5 minutes).
   - 6-digit email OTP signup verification (transient TTL, rate-limited attempts).
   - NodeMailer integration supporting SMTP with automatic fallbacks to Ethereal Mail or Console testing.

2. **Listing Management & Multi-Image Uploads**:
   - Multi-image uploads via Cloudinary.
   - Dynamic map locations using Mapbox geocoding with New Delhi fallbacks.
   - Category tags, maximum guest capacity validation, and price listing.

3. **Booking Flow & Availability Calendar**:
   - Double-booking prevention using overlap validations inside MongoDB session transactions.
   - Flatpickr date-pickers that disable booked ranges client-side.
   - Dynamic server-side price calculations.
   - Self-contained mock payment checkout simulator in development, and Stripe Checkout in production.
   - 48-hour guest cancellation refund policy, and host cancellation flows.

4. **Wishlists & Favorites**:
   - Guests can add/remove properties to/from their personal favorites list, visible in their profiles.

5. **In-App Messaging & Socket.IO**:
   - Real-time guest-host messaging via WebSockets (Socket.IO).
   - Automatically fallback to offline email notifications if the recipient is not online.

6. **Admin Dashboard**:
   - Complete admin dashboard at `/admin` (admin role protected) to view statistics and delete users, listings, reviews, and bookings.

7. **Production Observability**:
   - Morgan HTTP request logs streamed directly into a Winston rotating file logger.
   - Startup config validation failing fast on missing variables.
   - JSON healthcheck endpoint at `/health` detailing database connectivity and process uptime.

---

## Tech Stack
* **Runtime**: Node.js (v22+)
* **Framework**: Express.js
* **Database**: MongoDB (Mongoose ODM)
* **Real-time**: Socket.IO
* **Payments**: Stripe SDK
* **Templating**: EJS (with Bootstrap styling)
* **Security**: Helmet CSP, CSURF, Express Mongo Sanitize, Express Rate Limit, Bcrypt/SHA-256

---

## Setup & Installation

### 1. Environment Variables
Create a `.env` file in the root directory:
```env
PORT=8080
ATLASDB_URL=mongodb://127.0.0.1:27017/wanderlust
SECRET=your_secure_session_secret

# Cloudinary
CLOUD_NAME=your_cloudinary_name
CLOUD_API_KEY=your_cloudinary_key
CLOUD_API_SECRET=your_cloudinary_secret

# Mapbox
MAP_TOKEN=your_mapbox_token

# Stripe (Optional)
STRIPE_SECRET_KEY=sk_test_...

# SMTP Mail (Optional - defaults to Ethereal mail simulator)
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password
EMAIL_FROM="Wanderlust" <noreply@wanderlust.com>
```

### 2. Local Execution
```bash
# Install dependencies
npm install --legacy-peer-deps

# Run local development server
npm run dev
```

### 3. Docker Execution
You can run the web server and database in isolated containers:
```bash
# Build and run containers
docker-compose up --build
```

---

## Running Tests
Run unit and integration tests (including the concurrent booking race condition validator):
```bash
npm test
```
