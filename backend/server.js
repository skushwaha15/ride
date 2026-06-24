const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dns = require('dns');
const https = require('https');

// 🔧 Environment setup
require('dotenv').config();

// 🌐 Force IPv4
dns.setDefaultResultOrder('ipv4first');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; 

// 🎯 Environment detection
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 10000;

console.log(`🖥️  Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);

const app = express();
const server = http.createServer(app);

// CORS configuration
const normalizeOrigin = (origin = '') => origin.trim().replace(/\/$/, '');

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://ride-wmqa.vercel.app',
  'https://ride-backend-w2o0.onrender.com',
  ...(process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
    .split(',')
    .map(normalizeOrigin)
].filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOrigins.includes(normalizedOrigin)
    || /^https:\/\/ride-[a-z0-9-]+\.vercel\.app$/i.test(normalizedOrigin);
};

const corsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

const io = socketIo(server, {
  cors: {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "ride150806@gmail.com";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Ride App";
const ORS_API_KEY = process.env.OPENROUTESERVICE_API_KEY || process.env.ORS_API_KEY;
if (!BREVO_API_KEY) {
  console.warn("BREVO_API_KEY missing. Email OTP sending will fail until it is configured.");
}
if (!ORS_API_KEY) {
  console.warn("OPENROUTESERVICE_API_KEY missing. Real route distance and fare estimates will fall back to provided distance.");
}

const isValidEmail = (email = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const fareRates = {
  Mini: { baseFare: 50, perKm: 10 },
  Sedan: { baseFare: 80, perKm: 14 },
  SUV: { baseFare: 120, perKm: 18 },
  Auto: { baseFare: 40, perKm: 8 }
};

const getFareRate = (vehicleType = "Mini") => fareRates[vehicleType] || fareRates.Mini;

const calculateFareFromDistance = (distanceKm, vehicleType = "Mini") => {
  const rate = getFareRate(vehicleType);
  const distanceCharge = rate.perKm * distanceKm;
  const total = rate.baseFare + distanceCharge;

  return {
    fare: Math.round(total),
    breakdown: {
      baseFare: rate.baseFare,
      perKm: rate.perKm,
      distanceCharge: Math.round(distanceCharge),
      total: Math.round(total)
    }
  };
};

const calculateRideDurationMinutes = (distanceKm) => Math.max(1, Math.ceil(distanceKm * 2));

const parseCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getCoordinatesFromInput = ({ pickupLat, pickupLng, dropLat, dropLng, pickupLocation, dropLocation }) => {
  const pickup = {
    lat: parseCoordinate(pickupLat ?? pickupLocation?.lat),
    lng: parseCoordinate(pickupLng ?? pickupLocation?.lng)
  };
  const drop = {
    lat: parseCoordinate(dropLat ?? dropLocation?.lat),
    lng: parseCoordinate(dropLng ?? dropLocation?.lng)
  };

  if ([pickup.lat, pickup.lng, drop.lat, drop.lng].some((coord) => coord === null)) {
    return null;
  }

  return { pickup, drop };
};

const postJson = (url, payload, headers = {}) => {
  const body = JSON.stringify(payload);
  const parsedUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const request = https.request(
      parsedUrl,
      {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          ...headers
        }
      },
      (response) => {
        let responseBody = "";

        response.on("data", (chunk) => {
          responseBody += chunk;
        });

        response.on("end", () => {
          let parsedBody = null;

          try {
            parsedBody = responseBody ? JSON.parse(responseBody) : null;
          } catch (error) {
            return reject(new Error(responseBody || "Invalid JSON response"));
          }

          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(parsedBody);
            return;
          }

          const message = parsedBody?.error?.message || parsedBody?.message || `Request failed with status ${response.statusCode}`;
          reject(new Error(message));
        });
      }
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
};

const getJson = (url, headers = {}) => {
  const parsedUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const request = https.request(
      parsedUrl,
      {
        method: "GET",
        headers: {
          "accept": "application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8",
          ...headers
        }
      },
      (response) => {
        let responseBody = "";

        response.on("data", (chunk) => {
          responseBody += chunk;
        });

        response.on("end", () => {
          let parsedBody = null;

          try {
            parsedBody = responseBody ? JSON.parse(responseBody) : null;
          } catch (error) {
            return reject(new Error(responseBody || "Invalid JSON response"));
          }

          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(parsedBody);
            return;
          }

          const message = parsedBody?.error?.message || parsedBody?.message || `Request failed with status ${response.statusCode}`;
          reject(new Error(message));
        });
      }
    );

    request.on("error", reject);
    request.end();
  });
};

const parseOpenRouteServiceGeoJson = (data) => {
  const route = data?.features?.[0];
  const summary = route?.properties?.summary;

  if (!summary?.distance || !summary?.duration) {
    throw new Error("OpenRouteService did not return route distance");
  }

  return {
    distanceKm: Number((summary.distance / 1000).toFixed(2)),
    durationSeconds: Math.round(summary.duration),
    durationMin: calculateRideDurationMinutes(summary.distance / 1000),
    geometry: route.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) || []
  };
};

const getOpenRouteServiceRoute = async (pickup, drop) => {
  if (!ORS_API_KEY) {
    throw new Error("OPENROUTESERVICE_API_KEY is not configured");
  }

  try {
    const data = await postJson(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        coordinates: [
          [pickup.lng, pickup.lat],
          [drop.lng, drop.lat]
        ],
        instructions: false
      },
      {
        accept: "application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8",
        Authorization: ORS_API_KEY
      }
    );

    return parseOpenRouteServiceGeoJson(data);
  } catch (postError) {
    console.warn("OpenRouteService POST route failed, trying GET route:", postError.message);

    const params = new URLSearchParams({
      start: `${pickup.lng},${pickup.lat}`,
      end: `${drop.lng},${drop.lat}`
    });
    const data = await getJson(
      `https://api.openrouteservice.org/v2/directions/driving-car?${params.toString()}`,
      {
        Authorization: ORS_API_KEY
      }
    );

    return parseOpenRouteServiceGeoJson(data);
  }
};

const sendEmailWithBrevo = ({ to, subject, htmlContent, textContent }) => {
  if (!BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is not configured");
  }

  const payload = JSON.stringify({
    sender: {
      name: BREVO_SENDER_NAME,
      email: BREVO_SENDER_EMAIL
    },
    to: [{ email: to }],
    subject,
    htmlContent,
    textContent
  });

  return new Promise((resolve, reject) => {
    const request = https.request(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": BREVO_API_KEY,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload)
        }
      },
      (response) => {
        let body = "";

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(body ? JSON.parse(body) : {});
            return;
          }

          let errorMessage = `Brevo request failed with status ${response.statusCode}`;

          try {
            const parsed = body ? JSON.parse(body) : null;
            if (parsed?.message) {
              errorMessage = parsed.message;
            }
          } catch (parseError) {
            if (body) {
              errorMessage = body;
            }
          }

          reject(new Error(errorMessage));
        });
      }
    );

    request.on("error", reject);
    request.write(payload);
    request.end();
  });
};

// Middleware
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

// 📦 MongoDB Connection
const connectToMongoDB = async () => {
  try {
    let mongoURI = process.env.MONGO_URI;
    
    if (!isProduction) {
      if (!mongoURI) {
        mongoURI = 'mongodb://127.0.0.1:27017/cab_booking';
        console.log('📌 Using local MongoDB (Development Mode)');
      } else {
        console.log('📌 Using custom MongoDB URI');
      }
    } else {
      if (!mongoURI) {
        console.error('❌ Production mein MONGO_URI dena zaroori hai!');
        process.exit(1);
      }
      console.log('📌 Using Atlas MongoDB (Production Mode)');
    }

    console.log('🔌 Connecting to MongoDB...');

    const mongooseOptions = {
      family: 4,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 2
    };

    await mongoose.connect(mongoURI, mongooseOptions);
    console.log("✅ MongoDB Connected Successfully!");
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });
    
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    if (isProduction) {
      console.log('🔄 Retrying in 5 seconds...');
      setTimeout(connectToMongoDB, 5000);
    } else {
      console.log('💡 Local MongoDB chal raha hai? "net start MongoDB" se check karo');
    }
  }
};

connectToMongoDB();

// ==================== SCHEMAS ====================

// ✅ FIXED: User Schema - Phone optional, Email unique
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, sparse: true }, // optional phone for legacy users
  email: { type: String, unique: true, sparse: true }, // ← Email unique
  password: String,
  createdAt: { type: Date, default: Date.now },
  favoritePlaces: [{
    name: String,
    address: String,
    lat: Number,
    lng: Number
  }],
  recentSearches: [{
    address: String,
    type: String,
    timestamp: { type: Date, default: Date.now }
  }],
  paymentMethods: [{
    type: String,
    last4: String,
    token: String
  }]
});

userSchema.index({ email: 1 }, { unique: true, sparse: true });

const User = mongoose.model('User', userSchema);

const ensureUserIndexes = async () => {
  try {
    const indexes = await User.collection.indexes();
    const phoneIndex = indexes.find((index) => index.name === 'phone_1');

    if (phoneIndex?.unique) {
      await User.collection.dropIndex('phone_1');
      console.log('Dropped stale unique phone index from users collection');
    }
  } catch (error) {
    if (error.codeName !== 'IndexNotFound') {
      console.error('Failed to ensure user indexes:', error.message);
    }
  }
};

mongoose.connection.once('open', () => {
  ensureUserIndexes();
});

// Driver Schema
const driverSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  vehicleType: { type: String, required: true },
  vehicleNumber: { type: String, required: true },
  currentLocation: {
    lat: Number,
    lng: Number
  },
  isAvailable: { type: Boolean, default: false },
  lastUpdated: { type: Date, default: Date.now },
  socketId: String,
  rating: { type: Number, default: 4.9 },
  totalTrips: { type: Number, default: 0 }
});

const Driver = mongoose.model('Driver', driverSchema);

const chatMessageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  senderType: { type: String, enum: ['user', 'driver'], required: true },
  senderName: { type: String },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

// Ride Schema
const rideSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  driverId: { type: String },
  driverName: { type: String },
  driverPhone: { type: String },
  vehicleType: { type: String },
  vehicleNumber: { type: String },
  pickupLocation: {
    lat: Number,
    lng: Number,
    address: String
  },
  dropLocation: {
    lat: Number,
    lng: Number,
    address: String
  },
  status: { 
    type: String, 
    enum: [
      'SEARCHING', 
      'ACCEPTED', 
      'ARRIVING', 
      'STARTED', 
      'COMPLETED', 
      'CANCELLED'
    ],
    default: 'SEARCHING'
  },
  fare: Number,
  distance: Number,
  duration: Number,
  durationSeconds: Number,
  paymentMethod: {
    type: String,
    enum: ['CASH', 'CARD', 'UPI', 'WALLET'],
    default: 'CASH'
  },
  paymentTiming: {
    type: String,
    enum: ['POSTPAID', 'PREPAID'],
    default: 'POSTPAID'
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'COMPLETED'],
    default: 'PENDING'
  },
  otp: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  timeline: [
    {
      status: String,
      timestamp: { type: Date, default: Date.now },
      location: {
        lat: Number,
        lng: Number
      }
    }
  ],
  chatMessages: [chatMessageSchema]
});

const Ride = mongoose.model('Ride', rideSchema);

// Payment Schema
const paymentSchema = new mongoose.Schema({
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
  userId: { type: String, required: true },
  driverId: { type: String, required: true },
  amount: { type: Number, required: true },
  method: { 
    type: String, 
    enum: ['CASH', 'CARD', 'UPI', 'WALLET'],
    required: true 
  },
  status: { 
    type: String, 
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
    default: 'PENDING'
  },
  transactionId: { type: String },
  paymentIntentId: { type: String },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
});

const Payment = mongoose.model('Payment', paymentSchema);

// OTP Schema
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

const OTP = mongoose.model('OTP', otpSchema);

// ==================== STORE SOCKET IDS ====================
const userSockets = {};
const driverSockets = {};

// ==================== DRIVER ROUTES ====================

// Register new driver
app.post('/api/driver/register', async (req, res) => {
  try {
    console.log("📝 Register request:", req.body);
    
    const existingDriver = await Driver.findOne({ phone: req.body.phone });
    if (existingDriver) {
      return res.json({ 
        success: true, 
        driver: existingDriver,
        message: "Driver already exists"
      });
    }
    
    const driver = new Driver(req.body);
    await driver.save();
    console.log("✅ Driver registered with ID:", driver._id);
    res.json({ success: true, driver });
  } catch (error) {
    console.error("❌ Register error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Login existing driver
app.post('/api/driver/login', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const vehicleNumber = String(req.body.vehicleNumber || '').trim().toUpperCase();

    if (!phone || !vehicleNumber) {
      return res.status(400).json({ error: "Phone number and vehicle number are required" });
    }

    const escapedVehicleNumber = vehicleNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const driver = await Driver.findOne({
      phone,
      vehicleNumber: { $regex: `^${escapedVehicleNumber}$`, $options: 'i' }
    });

    if (!driver) {
      return res.status(401).json({ error: "Driver not found. Please check your details or register first." });
    }

    res.json({ success: true, driver });
  } catch (error) {
    console.error("Driver login error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update driver location and availability
app.post('/api/driver/update-location', async (req, res) => {
  try {
    const { driverId, lat, lng, isAvailable } = req.body;
    console.log("📍 Update location for driver:", driverId, "available:", isAvailable);
    
    if (!driverId) {
      return res.status(400).json({ error: "Driver ID required" });
    }
    
    const driver = await Driver.findByIdAndUpdate(driverId, {
      currentLocation: { lat, lng },
      isAvailable,
      lastUpdated: Date.now()
    }, { new: true });
    
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    console.log("✅ Driver updated:", driver.name, "available:", driver.isAvailable);
    
    io.emit('driver-status-update', {
      driverId: driver._id,
      name: driver.name,
      location: driver.currentLocation,
      isAvailable: driver.isAvailable,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber
    });
    
    res.json({ success: true, driver });
  } catch (error) {
    console.error("❌ Update error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get available drivers near a location
app.get('/api/drivers/available', async (req, res) => {
  try {
    const { lat, lng, radius = 50 } = req.query;
    
    console.log("🔍 Finding drivers near:", { lat, lng, radius });
    
    const drivers = await Driver.find({
      isAvailable: true,
      lastUpdated: { $gt: new Date(Date.now() - 10 * 60 * 1000) }
    });
    
    console.log(`📊 Total available drivers in DB: ${drivers.length}`);
    
    const formattedDrivers = drivers.map(driver => ({
      _id: driver._id,
      id: driver._id,
      name: driver.name,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      currentLocation: driver.currentLocation || { lat: 0, lng: 0 },
      isAvailable: driver.isAvailable,
      rating: driver.rating || 4.9
    }));
    
    res.json({ 
      success: true, 
      count: formattedDrivers.length,
      drivers: formattedDrivers
    });
    
  } catch (error) {
    console.error("❌ Available drivers error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get driver by ID
app.get('/api/driver/:id', async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    res.json({ success: true, driver });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RIDE ROUTES ====================

// Create new ride request
app.post('/api/rides/request', async (req, res) => {
  try {
    console.log("???? New ride request:", req.body);
    const selectedDriverId = req.body.driverId ? String(req.body.driverId) : null;
    const routeCoordinates = getCoordinatesFromInput(req.body);
    const ridePayload = { ...req.body };

    if (routeCoordinates) {
      const route = await getOpenRouteServiceRoute(routeCoordinates.pickup, routeCoordinates.drop);
      const fareEstimate = calculateFareFromDistance(route.distanceKm, ridePayload.vehicleType || 'Mini');

      ridePayload.distance = route.distanceKm;
      ridePayload.duration = route.durationMin;
      ridePayload.durationSeconds = route.durationSeconds;
      ridePayload.fare = fareEstimate.fare;
    }
    
    const ride = new Ride({
      ...ridePayload,
      status: 'SEARCHING'
    });
    
    await ride.save();
    console.log("??? Ride saved with ID:", ride._id);
    
    const rideRequestPayload = {
      rideId: ride._id,
      userId: ride.userId,
      driverId: ride.driverId,
      pickup: ride.pickupLocation,
      drop: ride.dropLocation,
      pickupLocation: ride.pickupLocation,
      dropLocation: ride.dropLocation,
      fare: ride.fare,
      distance: ride.distance,
      duration: ride.duration,
      ride
    };

    if (selectedDriverId) {
      const targetDriverSocketId = driverSockets[selectedDriverId];

      if (!targetDriverSocketId) {
        await Ride.findByIdAndDelete(ride._id);
        return res.status(409).json({ error: 'Selected driver is offline or unavailable. Please choose another driver.' });
      }

      io.to(targetDriverSocketId).emit('new-ride-request', rideRequestPayload);
      console.log(`???? Sent ride ${ride._id} to selected driver ${selectedDriverId}`);
    } else {
      io.emit('new-ride-request', rideRequestPayload);
      console.log(`???? Broadcast ride ${ride._id} to available drivers`);
    }

    if (ride.paymentTiming === 'PREPAID' && ride.paymentStatus === 'COMPLETED' && ride.driverId) {
      const existingPayment = await Payment.findOne({ transactionId: req.body.stripeCheckoutSessionId });
      if (!existingPayment) {
        const payment = new Payment({
          rideId: ride._id,
          userId: ride.userId,
          driverId: ride.driverId,
          amount: ride.fare,
          method: 'CARD',
          status: 'COMPLETED',
          transactionId: req.body.stripeCheckoutSessionId || `PREPAID_${Date.now()}`,
          completedAt: Date.now()
        });
        await payment.save();
      }
    }
    
    res.json({ success: true, ride });
  } catch (error) {
    console.error("??? Ride request error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Driver accepts ride
app.post('/api/rides/accept', async (req, res) => {
  try {
    const { rideId, driverId } = req.body;
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    const ride = await Ride.findByIdAndUpdate(rideId, {
      driverId,
      driverName: driver.name,
      driverPhone: driver.phone,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      status: 'ACCEPTED',
      updatedAt: Date.now()
    }, { new: true });

    if (!ride) {
      return res.status(404).json({ error: "Ride not found" });
    }
    
    io.emit('ride-accepted', {
      rideId,
      driverId,
      status: 'ACCEPTED',
      ride
    });
    
    res.json({ success: true, ride });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Driver rejects ride
app.post('/api/rides/reject', async (req, res) => {
  try {
    const { rideId } = req.body;
    
    await Ride.findByIdAndUpdate(rideId, {
      status: 'REJECTED',
      updatedAt: Date.now()
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rides/:rideId', async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) {
      return res.status(404).json({ error: "Ride not found" });
    }

    res.json({ success: true, ride });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update ride status endpoint
app.post('/api/rides/update-status', async (req, res) => {
  try {
    const { rideId, status, location } = req.body;
    
    const ride = await Ride.findByIdAndUpdate(rideId, {
      status,
      updatedAt: Date.now(),
      $push: {
        timeline: {
          status,
          timestamp: Date.now(),
          location
        }
      }
    }, { new: true });
    
    io.emit('ride-status-updated', {
      rideId,
      status,
      ride
    });
    
    res.json({ success: true, ride });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate OTP endpoint
app.post('/api/rides/generate-otp', async (req, res) => {
  try {
    const { rideId } = req.body;
    console.log("🔑 Generating OTP for ride:", rideId);
    
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: "Ride not found" });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    ride.otp = otp;
    await ride.save();
    
    console.log(`✅ OTP generated: ${otp} for user ${ride.userId}`);
    
    const otpPayload = {
      rideId,
      userId: ride.userId,
      otp,
      message: 'Your ride OTP is ready'
    };

    const userSocketId = userSockets[ride.userId];
    if (userSocketId) {
      io.to(userSocketId).emit('ride-otp', otpPayload);
      console.log(`📢 OTP sent to user ${ride.userId}`);
    } else {
      console.log(`⚠️ User ${ride.userId} not connected directly, broadcasting OTP event with userId filter`);
    }

    io.emit('ride-otp', otpPayload);
    
    res.json({ success: true, message: 'OTP sent to user' });
    
  } catch (error) {
    console.error("❌ OTP generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Verify OTP
app.post('/api/rides/verify-otp', async (req, res) => {
  try {
    const { rideId, otp } = req.body;
    
    const ride = await Ride.findById(rideId);
    
    if (ride.otp === otp) {
      ride.status = 'STARTED';
      ride.timeline.push({
        status: 'STARTED',
        timestamp: Date.now()
      });
      await ride.save();
      
      io.emit('ride-status-updated', {
        rideId,
        status: 'STARTED',
        ride
      });
      
      res.json({ success: true, message: 'OTP verified, ride started' });
    } else {
      res.status(400).json({ error: 'Invalid OTP' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.url);
  next();
});

app.get('/api/rides/:rideId/chat', async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId).select('chatMessages');
    if (!ride) {
      return res.status(404).json({ error: "Ride not found" });
    }

    res.json({ success: true, messages: ride.chatMessages || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== USER ROUTES (for logged in users) ====================

// Get user's recent rides
app.get('/api/users/:userId/recent-rides', async (req, res) => {
  try {
    const rides = await Ride.find({ 
      userId: req.params.userId,
      status: 'COMPLETED'
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('dropLocation createdAt');
    
    const recentPlaces = rides.map(ride => ({
      address: ride.dropLocation?.address || 'Unknown location',
      time: ride.createdAt
    }));
    
    res.json({ success: true, rides: recentPlaces });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save user search
app.post('/api/users/:userId/recent-search', async (req, res) => {
  try {
    const { address, type } = req.body;
    
    await User.findByIdAndUpdate(req.params.userId, {
      $push: {
        recentSearches: {
          address,
          type,
          timestamp: new Date()
        }
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get fare estimate
// GET fare estimate (for backward compatibility)
app.get('/api/fare/estimate', async (req, res) => {
  try {
    const { distance, vehicleType = 'Mini' } = req.query;
    const routeCoordinates = getCoordinatesFromInput(req.query);
    let distanceKm = parseCoordinate(distance);
    let durationMin = null;
    let durationSeconds = null;
    let routeGeometry = [];
    let source = 'provided-distance';

    if (routeCoordinates) {
      const route = await getOpenRouteServiceRoute(routeCoordinates.pickup, routeCoordinates.drop);
      distanceKm = route.distanceKm;
      durationMin = route.durationMin;
      durationSeconds = route.durationSeconds;
      routeGeometry = route.geometry;
      source = 'openrouteservice';
    }

    if (distanceKm === null || distanceKm < 0) {
      return res.status(400).json({ error: "Provide distance or pickup/drop coordinates" });
    }

    const fareEstimate = calculateFareFromDistance(distanceKm, vehicleType);

    res.json({
      success: true,
      fare: fareEstimate.fare,
      distance: distanceKm,
      duration: durationMin,
      durationSeconds,
      source,
      route: {
        geometry: routeGeometry
      },
      breakdown: fareEstimate.breakdown
    });
  } catch (error) {
    console.error("Fare estimate error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST fare estimate (for object format)
app.post('/api/fare/estimate', async (req, res) => {
  try {
    const { distance, vehicleType = 'Mini', pickupLocation, dropLocation } = req.body;
    const routeCoordinates = getCoordinatesFromInput({ pickupLocation, dropLocation });
    let distanceKm = parseCoordinate(distance);
    let durationMin = null;
    let durationSeconds = null;
    let routeGeometry = [];
    let source = 'provided-distance';

    if (routeCoordinates) {
      const route = await getOpenRouteServiceRoute(routeCoordinates.pickup, routeCoordinates.drop);
      distanceKm = route.distanceKm;
      durationMin = route.durationMin;
      durationSeconds = route.durationSeconds;
      routeGeometry = route.geometry;
      source = 'openrouteservice';
    }

    if (distanceKm === null || distanceKm < 0) {
      return res.status(400).json({ error: "Provide distance or pickup/drop coordinates" });
    }

    const fareEstimate = calculateFareFromDistance(distanceKm, vehicleType);

    res.json({
      success: true,
      fare: fareEstimate.fare,
      distance: distanceKm,
      duration: durationMin,
      durationSeconds,
      source,
      route: {
        geometry: routeGeometry
      },
      breakdown: fareEstimate.breakdown
    });
  } catch (error) {
    console.error("Fare estimate error:", error.message);
    res.status(500).json({ error: error.message });
  }
});
// ==================== GEOCODING ====================

app.get('/api/geocode/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    console.log(`📍 Geocoding: ${lat}, ${lng}`);
    
    if (!lat || !lng) {
      return res.status(400).json({ error: "Latitude and longitude required" });
    }
    
    return res.json({
      success: true,
      address: `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`,
      shortAddress: `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`
    });
    
  } catch (error) {
    console.error("❌ Geocoding error:", error.message);
    res.json({
      success: true,
      address: `${lat}, ${lng}`,
      shortAddress: `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`
    });
  }
});

// ==================== DEBUG ROUTES ====================

app.get('/api/debug/drivers', async (req, res) => {
  try {
    const drivers = await Driver.find({});
    console.log(`📊 Total drivers in DB: ${drivers.length}`);
    res.json({ 
      success: true, 
      count: drivers.length,
      drivers: drivers.map(d => ({
        id: d._id,
        name: d.name,
        phone: d.phone,
        vehicleType: d.vehicleType,
        vehicleNumber: d.vehicleNumber,
        isAvailable: d.isAvailable,
        location: d.currentLocation,
        lastUpdated: d.lastUpdated
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/debug/make-available/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findByIdAndUpdate(driverId, {
      isAvailable: true,
      lastUpdated: Date.now()
    }, { new: true });
    
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    
    io.emit('driver-available', {
      driverId: driver._id,
      _id: driver._id,
      name: driver.name,
      location: driver.currentLocation,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      isAvailable: true
    });
    
    res.json({ success: true, driver });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/debug/clear-all', async (req, res) => {
  try {
    await Driver.deleteMany({});
    console.log("🗑️ All drivers deleted");
    res.json({ success: true, message: "All drivers deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SOCKET.IO EVENTS ====================

io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  socket.on('register-user', (userId) => {
    userSockets[userId] = socket.id;
    console.log(`👤 User ${userId} registered with socket ${socket.id}`);
  });
  
  socket.on('register-driver', (driverId) => {
    driverSockets[driverId] = socket.id;
    console.log(`🚗 Driver ${driverId} registered with socket ${socket.id}`);
  });
  
  socket.on('driver-online', async (data) => {
    try {
      console.log("🚗 Driver online event received:", data);
      const { driverId, lat, lng, name, vehicleType, vehicleNumber } = data;
      
      if (!driverId) {
        console.error("❌ No driverId provided");
        return;
      }
      
      const driver = await Driver.findByIdAndUpdate(driverId, {
        isAvailable: true,
        currentLocation: { lat, lng },
        socketId: socket.id,
        lastUpdated: Date.now(),
        name: name,
        vehicleType: vehicleType,
        vehicleNumber: vehicleNumber
      }, { new: true });
      
      if (driver) {
        console.log(`✅ Driver ${driver.name} (${driver._id}) is now ONLINE`);
        
        io.emit('driver-available', {
          driverId: driver._id,
          _id: driver._id,
          name: driver.name,
          location: { lat, lng },
          vehicleType: driver.vehicleType,
          vehicleNumber: driver.vehicleNumber,
          isAvailable: true,
          rating: driver.rating || 4.9
        });
      }
    } catch (error) {
      console.error("❌ Driver online error:", error);
    }
  });
  
  socket.on('driver-offline', async (data) => {
    try {
      console.log("🚗 Driver offline event:", data);
      const { driverId } = data;
      
      if (!driverId) {
        console.error("❌ No driverId provided");
        return;
      }
      
      const driver = await Driver.findByIdAndUpdate(driverId, {
        isAvailable: false
      }, { new: true });
      
      if (driver) {
        console.log(`✅ Driver ${driver.name} is now OFFLINE`);
        io.emit('driver-unavailable', { driverId });
      }
    } catch (error) {
      console.error("❌ Driver offline error:", error);
    }
  });
  
  socket.on('driver-location-update', async (data) => {
    try {
      const { driverId, lat, lng } = data;
      console.log(`📍 Driver ${driverId} location update:`, { lat, lng });
      
      await Driver.findByIdAndUpdate(driverId, {
        currentLocation: { lat, lng },
        lastUpdated: Date.now()
      });
      
      const activeRide = await Ride.findOne({ 
        driverId, 
        status: { $in: ['ACCEPTED', 'ARRIVING', 'STARTED'] } 
      });
      
      if (activeRide) {
        console.log(`📢 Sending location to user ${activeRide.userId}`);
        
        const userSocketId = userSockets[activeRide.userId];
        if (userSocketId) {
          io.to(userSocketId).emit('driver-location', {
            driverId,
            location: { lat, lng },
            rideId: activeRide._id
          });
          console.log(`✅ Location sent to user socket: ${userSocketId}`);
        } else {
          console.log("⚠️ User socket not found, broadcasting");
          socket.broadcast.emit('driver-location', {
            driverId,
            location: { lat, lng },
            rideId: activeRide._id
          });
        }
      }
      
      io.emit('driver-location-changed', { 
        driverId, 
        location: { lat, lng } 
      });
    } catch (error) {
      console.error("❌ Location update error:", error);
    }
  });
  
  socket.on('request-driver-location', async (data) => {
    try {
      const { rideId } = data;
      console.log("📍 Location requested for ride:", rideId);
      
      const ride = await Ride.findById(rideId);
      
      if (ride && ride.driverId) {
        const driver = await Driver.findById(ride.driverId);
        if (driver && driver.currentLocation) {
          console.log("📍 Sending driver location to user:", driver.currentLocation);
          socket.emit('driver-location', {
            driverId: driver._id,
            location: driver.currentLocation,
            rideId: ride._id
          });
        } else {
          console.log("⚠️ Driver or location not found");
        }
      } else {
        console.log("⚠️ Ride or driver not found");
      }
    } catch (error) {
      console.error("❌ Error handling location request:", error);
    }
  });

  socket.on('join-ride-chat', async (data = {}) => {
    try {
      const { rideId, participantId, participantType } = data;
      if (!rideId || !participantId || !['user', 'driver'].includes(participantType)) {
        return socket.emit('ride-chat-error', { error: 'Invalid chat participant details' });
      }

      const ride = await Ride.findById(rideId).select('userId driverId chatMessages');
      if (!ride) {
        return socket.emit('ride-chat-error', { error: 'Ride not found' });
      }

      const isRideUser = participantType === 'user' && String(ride.userId) === String(participantId);
      const isRideDriver = participantType === 'driver' && String(ride.driverId) === String(participantId);

      if (!isRideUser && !isRideDriver) {
        return socket.emit('ride-chat-error', { error: 'You are not assigned to this ride' });
      }

      socket.join(`ride-chat-${rideId}`);
      socket.emit('ride-chat-history', {
        rideId,
        messages: ride.chatMessages || []
      });
    } catch (error) {
      console.error("Ride chat join error:", error);
      socket.emit('ride-chat-error', { error: 'Could not join ride chat' });
    }
  });

  socket.on('send-ride-message', async (data = {}) => {
    try {
      const { rideId, senderId, senderType, senderName } = data;
      const messageText = String(data.message || '').trim();

      if (!rideId || !senderId || !['user', 'driver'].includes(senderType) || !messageText) {
        return socket.emit('ride-chat-error', { error: 'Message cannot be sent' });
      }

      const ride = await Ride.findById(rideId);
      if (!ride) {
        return socket.emit('ride-chat-error', { error: 'Ride not found' });
      }

      const isRideUser = senderType === 'user' && String(ride.userId) === String(senderId);
      const isRideDriver = senderType === 'driver' && String(ride.driverId) === String(senderId);

      if (!isRideUser && !isRideDriver) {
        return socket.emit('ride-chat-error', { error: 'Only assigned ride participants can chat' });
      }

      if (!['ACCEPTED', 'ARRIVING', 'STARTED'].includes(ride.status)) {
        return socket.emit('ride-chat-error', { error: 'Chat is available after the ride is accepted' });
      }

      const chatMessage = {
        senderId: String(senderId),
        senderType,
        senderName: senderName || (senderType === 'driver' ? ride.driverName : 'Rider'),
        message: messageText.slice(0, 500),
        createdAt: new Date()
      };

      ride.chatMessages.push(chatMessage);
      await ride.save();

      const savedMessage = ride.chatMessages[ride.chatMessages.length - 1];
      const payload = {
        rideId,
        message: savedMessage
      };

      io.to(`ride-chat-${rideId}`).emit('ride-message', payload);

      const userSocketId = userSockets[ride.userId];
      const driverSocketId = driverSockets[ride.driverId];
      if (userSocketId) io.to(userSocketId).emit('ride-message', payload);
      if (driverSocketId) io.to(driverSocketId).emit('ride-message', payload);
    } catch (error) {
      console.error("Ride chat send error:", error);
      socket.emit('ride-chat-error', { error: 'Could not send message' });
    }
  });
  
  socket.on('disconnect', async () => {
    try {
      console.log('🔌 Client disconnected:', socket.id);
      
      for (const [userId, sockId] of Object.entries(userSockets)) {
        if (sockId === socket.id) {
          delete userSockets[userId];
          console.log(`👤 User ${userId} removed`);
          break;
        }
      }
      
      for (const [driverId, sockId] of Object.entries(driverSockets)) {
        if (sockId === socket.id) {
          delete driverSockets[driverId];
          
          const driver = await Driver.findByIdAndUpdate(driverId, {
            isAvailable: false
          });
          
          if (driver) {
            console.log(`✅ Driver ${driver.name} marked offline due to disconnect`);
            io.emit('driver-unavailable', { driverId });
          }
          break;
        }
      }
    } catch (error) {
      console.error("❌ Disconnect error:", error);
    }
  });
});

// ==================== STRIPE SETUP ====================
let stripe;
try {
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_dummy') {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log("✅ Stripe initialized with real key");
  } else {
    console.log("⚠️ Using mock Stripe for development");
    stripe = {
  checkout: {
    sessions: {
      create: async () => ({
        id: 'mock_session_' + Date.now()
      })
    }
  },
      paymentIntents: {
        create: async () => ({ 
          client_secret: 'mock_secret_' + Date.now(), 
          id: 'mock_pi_' + Date.now() 
        }),
        retrieve: async () => ({ status: 'succeeded' })
      }
    };
  }
} catch (error) {
  console.log("❌ Stripe error, using mock:", error.message);
  stripe = {
    paymentIntents: {
      create: async () => ({ client_secret: 'mock_secret', id: 'mock_id' }),
      retrieve: async () => ({ status: 'succeeded' })
    }
  };
}

// ==================== PAYMENT ROUTES ====================
app.post('/api/payments/create-checkout-session', async (req, res) => {
  try {
    const { amount, rideId, userId, driverId, bookingRef } = req.body;
    const checkoutAmount = Number(amount);

    if (!stripe?.checkout?.sessions?.create || !process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_dummy') {
      return res.status(503).json({ error: "Stripe checkout is not configured. Add STRIPE_SECRET_KEY in backend/.env." });
    }

    if (!Number.isFinite(checkoutAmount) || checkoutAmount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const requestOrigin = req.get('origin');
    const frontendUrl = process.env.FRONTEND_URL
      || (allowedOrigins.includes(requestOrigin) ? requestOrigin : null)
      || (isProduction ? 'https://your-frontend-url.com' : 'http://localhost:3000');

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],

      line_items: [
        {
          price_data: {
            currency: 'inr',
            product_data: {
              name: 'Ride Payment',
            },
            unit_amount: Math.round(checkoutAmount * 100),
          },
          quantity: 1,
        },
      ],

      mode: 'payment',
      metadata: {
        rideId: rideId ? String(rideId) : '',
        bookingRef: bookingRef ? String(bookingRef) : '',
        userId: userId ? String(userId) : '',
        driverId: driverId ? String(driverId) : ''
      },
      success_url: `${frontendUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}${bookingRef ? `&bookingRef=${bookingRef}` : ''}`,
      cancel_url: `${frontendUrl}/payment-cancel${bookingRef ? `?bookingRef=${bookingRef}` : ''}`,
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error("Stripe checkout error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/payments/checkout-session/:sessionId', async (req, res) => {
  try {
    if (!stripe?.checkout?.sessions?.retrieve) {
      return res.status(503).json({ error: "Stripe checkout is not configured" });
    }

    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    res.json({
      success: true,
      sessionId: session.id,
      paymentStatus: session.payment_status,
      status: session.status,
      amountTotal: session.amount_total,
      currency: session.currency,
      metadata: session.metadata || {}
    });
  } catch (error) {
    console.error("Stripe checkout verify error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments/create-intent', async (req, res) => {
  try {
    const { rideId, amount, paymentMethod, paymentTiming = 'POSTPAID', userId, driverId } = req.body; 
    
    console.log(`💳 Creating payment intent for ride: ${rideId}, amount: ₹${amount}`);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'inr',
      metadata: { rideId, paymentMethod, paymentTiming, userId, driverId }, 
      automatic_payment_methods: { enabled: true }
    });
    
    const payment = new Payment({
      rideId,
      userId,
      driverId,
      amount,
      method: paymentMethod.toUpperCase(),
      status: 'PENDING',
      paymentIntentId: paymentIntent.id
    });
    await payment.save();
    
    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentId: payment._id
    });
    
  } catch (error) {
    console.error("❌ Payment intent error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments/confirm', async (req, res) => {
  try {
    const { rideId, paymentMethod, paymentTiming = 'POSTPAID' } = req.body;
    
    console.log(`💰 Confirming payment for ride: ${rideId}, method: ${paymentMethod}`);
    
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: "Ride not found" });
    }
    
    const payment = new Payment({
      rideId,
      userId: ride.userId,
      driverId: ride.driverId,
      amount: ride.fare,
      method: paymentMethod.toUpperCase(),
      status: 'COMPLETED',
      transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      completedAt: Date.now()
    });
    await payment.save();

    await Ride.findByIdAndUpdate(rideId, {
      paymentStatus: 'COMPLETED',
      paymentMethod: paymentMethod.toUpperCase(),
      paymentTiming
    });
    
    await Driver.findByIdAndUpdate(ride.driverId, {
      $inc: { totalTrips: 1, totalEarnings: ride.fare }
    });
    
    io.emit('payment-success', {
      rideId,
      paymentId: payment._id,
      amount: ride.fare,
      method: paymentMethod
    });
    
    res.json({ 
      success: true, 
      payment,
      message: `Payment of ₹${ride.fare} completed successfully`
    });
    
  } catch (error) {
    console.error("❌ Payment confirmation error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments/verify', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      const payment = await Payment.findOneAndUpdate(
        { paymentIntentId },
        {
          status: 'COMPLETED',
          completedAt: Date.now(),
          transactionId: paymentIntent.id
        },
        { new: true }
      );
      
      if (payment) {
        await Ride.findByIdAndUpdate(payment.rideId, { 
          paymentStatus: 'COMPLETED',
          paymentMethod: payment.method,
          paymentTiming: paymentIntent.metadata?.paymentTiming || 'POSTPAID'
        });
        
        await Driver.findByIdAndUpdate(payment.driverId, {
          $inc: { totalTrips: 1, totalEarnings: payment.amount }
        });
        
        io.emit('payment-success', {
          rideId: payment.rideId,
          amount: payment.amount
        });
      }
      
      res.json({ success: true, payment });
    } else {
      res.json({ success: false, status: paymentIntent.status });
    }
    
  } catch (error) {
    console.error("❌ Payment verification error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/payments/driver/:driverId', async (req, res) => {
  try {
    const payments = await Payment.find({ 
      driverId: req.params.driverId,
      status: 'COMPLETED'
    }).sort({ completedAt: -1 }).limit(50);
    
    const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);
    
    res.json({
      success: true,
      payments,
      totalEarnings,
      totalTrips: payments.length
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== EMAIL OTP ROUTES ====================

// ✅ Send OTP via Email
app.post('/api/send-email-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    await OTP.deleteMany({ email });
    
    const otpRecord = new OTP({
      email,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    await otpRecord.save();
    
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4CAF50;">🚖 Ride App Verification</h2>
          <p>Your verification code is:</p>
          <h1 style="font-size: 48px; letter-spacing: 10px; color: #4CAF50; background: #f5f5f5; padding: 20px; text-align: center; border-radius: 10px;">${otp}</h1>
          <p>This code will expire in <strong>5 minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">© 2026 Ride App. All rights reserved.</p>
        </div>
      `;
    
    await sendEmailWithBrevo({
      to: email,
      subject: 'Your Ride App Verification Code',
      htmlContent,
      textContent: `Your Ride App verification code is ${otp}. This code will expire in 5 minutes.`
    });
    
    console.log(`✅ OTP sent to ${email}: ${otp}`);
    res.json({ success: true, message: 'OTP sent successfully' });
    
  } catch (error) {
    console.error("❌ Email error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Verify OTP
app.post('/api/verify-email-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();

    if (!isValidEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Invalid email or OTP format' });
    }
    
    const otpRecord = await OTP.findOne({ 
      email, 
      otp,
      expiresAt: { $gt: new Date() }
    });
    
    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    await OTP.deleteOne({ _id: otpRecord._id });
    
    let user = await User.findOne({ email });
    
    res.json({ 
      success: true, 
      exists: !!user,
      user: user || { email }
    });
    
  } catch (error) {
    console.error("❌ Verify error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Check if user exists by email
app.post('/api/users/check', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    res.json({ exists: !!user, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Register with email
app.post('/api/users/register', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Please enter your name' });
    }
    
    let user = await User.findOne({ email });
    
    if (user) {
      if (!user.name) {
        user.name = name;
        await user.save();
      }

      return res.json({ success: true, user, existing: true });
    }
    
    user = new User({
      name,
      email,
      phone: undefined,
      createdAt: new Date()
    });
    await user.save();
    
    res.json({ success: true, user, existing: false });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    res.status(500).json({ error: error.message });
  }
});

// ==================== START SERVER ====================

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: http://localhost:3000`);
  console.log(`🚗 Driver App URL: http://localhost:3001`);
  if (isProduction) {
    console.log(`🌍 Live URL: https://ride-backend-w2o0.onrender.com`);
  }
});
