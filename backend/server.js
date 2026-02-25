const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)

// ==================== SCHEMAS ====================

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
  ]
});

const Ride = mongoose.model('Ride', rideSchema);

// ==================== STORE SOCKET IDS ====================
const userSockets = {}; // Store user socket IDs { userId: socketId }
const driverSockets = {}; // Store driver socket IDs { driverId: socketId }

// ==================== API ROUTES ====================

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
    console.log("📝 New ride request:", req.body);
    
    const ride = new Ride({
      ...req.body,
      status: 'SEARCHING'
    });
    
    await ride.save();
    console.log("✅ Ride saved with ID:", ride._id);
    
    io.emit('new-ride-request', {
      rideId: ride._id,
      pickup: ride.pickupLocation,
      drop: ride.dropLocation,
      fare: ride.fare,
      distance: ride.distance,
      duration: ride.duration
    });
    
    res.json({ success: true, ride });
  } catch (error) {
    console.error("❌ Ride request error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Driver accepts ride
app.post('/api/rides/accept', async (req, res) => {
  try {
    const { rideId, driverId } = req.body;
    
    const ride = await Ride.findByIdAndUpdate(rideId, {
      driverId,
      status: 'accepted',
      updatedAt: Date.now()
    }, { new: true });
    
    io.emit('ride-accepted', {
      rideId,
      driverId,
      status: 'accepted'
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
      status: 'rejected',
      updatedAt: Date.now()
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update ride status
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

// Generate OTP
app.post('/api/rides/generate-otp', async (req, res) => {
  try {
    const { rideId } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    const ride = await Ride.findByIdAndUpdate(rideId, {
      otp
    }, { new: true });
    
    // Send OTP to user via socket
    const userSocketId = userSockets[ride.userId];
    if (userSocketId) {
      io.to(userSocketId).emit('ride-otp', { rideId, otp });
    }
    
    res.json({ success: true, otp });
  } catch (error) {
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

// ==================== GEOCODING ====================

app.get('/api/geocode/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    console.log(`📍 Geocoding: ${lat}, ${lng}`);
    
    if (!lat || !lng) {
      return res.status(400).json({ error: "Latitude and longitude required" });
    }
    
    // Return coordinates directly to avoid API errors
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
  
  // Register user
  socket.on('register-user', (userId) => {
    userSockets[userId] = socket.id;
    console.log(`👤 User ${userId} registered with socket ${socket.id}`);
  });
  
  // Register driver
  socket.on('register-driver', (driverId) => {
    driverSockets[driverId] = socket.id;
    console.log(`🚗 Driver ${driverId} registered with socket ${socket.id}`);
  });
  
  // When driver comes online
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
  
  // When driver goes offline
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
  
  // Driver location update - FIXED VERSION
  socket.on('driver-location-update', async (data) => {
    try {
      const { driverId, lat, lng } = data;
      console.log(`📍 Driver ${driverId} location update:`, { lat, lng });
      
      // Update driver location
      await Driver.findByIdAndUpdate(driverId, {
        currentLocation: { lat, lng },
        lastUpdated: Date.now()
      });
      
      // Find active ride for this driver
      const activeRide = await Ride.findOne({ 
        driverId, 
        status: { $in: ['accepted', 'ARRIVING', 'STARTED'] } 
      });
      
      if (activeRide) {
        console.log(`📢 Sending location to user ${activeRide.userId}`);
        
        // Send to specific user if socket exists
        const userSocketId = userSockets[activeRide.userId];
        if (userSocketId) {
          io.to(userSocketId).emit('driver-location', {
            driverId,
            location: { lat, lng },
            rideId: activeRide._id
          });
          console.log(`✅ Location sent to user socket: ${userSocketId}`);
        } else {
          // Fallback - broadcast to all (might be noisy but works)
          console.log("⚠️ User socket not found, broadcasting");
          socket.broadcast.emit('driver-location', {
            driverId,
            location: { lat, lng },
            rideId: activeRide._id
          });
        }
      }
      
      // Broadcast for all users (for nearby drivers)
      io.emit('driver-location-changed', { 
        driverId, 
        location: { lat, lng } 
      });
    } catch (error) {
      console.error("❌ Location update error:", error);
    }
  });
  
  // Request driver location
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
  
  // Handle disconnect
  socket.on('disconnect', async () => {
    try {
      console.log('🔌 Client disconnected:', socket.id);
      
      // Remove from userSockets
      for (const [userId, sockId] of Object.entries(userSockets)) {
        if (sockId === socket.id) {
          delete userSockets[userId];
          console.log(`👤 User ${userId} removed`);
          break;
        }
      }
      
      // Remove from driverSockets and mark offline
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

// Start server
const PORT = 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: http://localhost:3000`);
  console.log(`🚗 Driver App URL: http://localhost:3001`);
});