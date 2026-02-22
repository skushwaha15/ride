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
mongoose.connect('mongodb://localhost:27017/cab_booking')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

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

// ==================== API ROUTES ====================

// Register new driver
app.post('/api/driver/register', async (req, res) => {
  try {
    console.log("📝 Register request:", req.body);
    
    // Check if driver already exists with same phone
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
    
    // Broadcast to all users about driver availability
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
    
    // Get all available drivers (active in last 10 minutes)
    const drivers = await Driver.find({
      isAvailable: true,
      lastUpdated: { $gt: new Date(Date.now() - 10 * 60 * 1000) }
    });
    
    console.log(`📊 Total available drivers in DB: ${drivers.length}`);
    
    // Format drivers for frontend
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

// ==================== DEBUG ROUTES ====================

// Get all drivers (debug)
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

// Make a driver available (debug)
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
    
    // Broadcast to all users
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

// Clear all drivers (debug - use carefully!)
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
  
  // When driver comes online
  socket.on('driver-online', async (data) => {
    try {
      console.log("🚗 Driver online event received:", data);
      const { driverId, lat, lng, name, vehicleType, vehicleNumber } = data;
      
      if (!driverId) {
        console.error("❌ No driverId provided");
        return;
      }
      
      // Find and update driver
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
        
        // Broadcast to ALL users
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
        
        console.log("📢 Broadcasted driver-available event");
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
  
  // When driver updates location
  socket.on('driver-location-update', async (data) => {
    try {
      const { driverId, lat, lng } = data;
      await Driver.findByIdAndUpdate(driverId, {
        currentLocation: { lat, lng },
        lastUpdated: Date.now()
      });
      
      io.emit('driver-location-changed', { 
        driverId, 
        location: { lat, lng } 
      });
    } catch (error) {
      console.error("❌ Location update error:", error);
    }
  });
  
  socket.on('disconnect', async () => {
    try {
      console.log('🔌 Client disconnected:', socket.id);
      
      // Mark driver offline when disconnected
      const driver = await Driver.findOneAndUpdate({ socketId: socket.id }, {
        isAvailable: false
      });
      
      if (driver) {
        console.log(`✅ Driver ${driver.name} marked offline due to disconnect`);
        io.emit('driver-unavailable', { driverId: driver._id });
      }
    } catch (error) {
      console.error("❌ Disconnect error:", error);
    }
  });
});

// Ride Schema - Backend mein add karo
const rideSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  driverId: { type: String },
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
    enum: ['searching', 'accepted', 'rejected', 'completed', 'cancelled'],
    default: 'searching'
  },
  fare: Number,
  distance: Number,
  duration: Number,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Ride = mongoose.model('Ride', rideSchema);

// Create new ride request
app.post('/api/rides/request', async (req, res) => {
  try {
    const ride = new Ride(req.body);
    await ride.save();
    
    // Notify nearby drivers via socket
    io.emit('new-ride-request', {
      rideId: ride._id,
      pickup: ride.pickupLocation,
      drop: ride.dropLocation,
      fare: ride.fare,
      distance: ride.distance
    });
    
    res.json({ success: true, ride });
  } catch (error) {
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
    
    // Notify user that driver accepted
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

// Start server
const PORT = 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: http://localhost:3000`);
  console.log(`🚗 Driver App URL: http://localhost:3001`);
});