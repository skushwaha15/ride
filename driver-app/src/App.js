import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import Payment from './payment';
import RideChat from './RideChat';

// ==================== ENVIRONMENT CONFIG ====================
const isLocalDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';

const API_URL = isLocalDevelopment 
  ? 'http://localhost:10000'
  : 'https://ride-backend-w2o0.onrender.com';
const ACTIVE_RIDE_STATUSES = ['ACCEPTED', 'ARRIVING', 'STARTED'];

console.log(`🌐 Environment: ${isLocalDevelopment ? 'LOCAL' : 'PRODUCTION'}`);
console.log(`🌐 API URL: ${API_URL}`);
// ============================================================

function App() {
  // ================ STATE DECLARATIONS ================
  const [driver, setDriver] = useState(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [location, setLocation] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [notice, setNotice] = useState({ type: 'info', message: '' });
  
  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState(null);
  
  // Earnings states
  const [earnings, setEarnings] = useState({ total: 0, today: 0, trips: 0 });
  
  // Form state
  const [form, setForm] = useState({
    name: '',
    phone: '',
    vehicleType: 'Mini',
    vehicleNumber: ''
  });
  const [loginForm, setLoginForm] = useState({
    phone: '',
    vehicleNumber: ''
  });
  
  // Ride requests states
  const [rideRequests, setRideRequests] = useState([]);
  const [currentRide, setCurrentRide] = useState(null);
  const [rideStatus, setRideStatus] = useState(null);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [rideStartTime, setRideStartTime] = useState(null);
  const [rideTimer, setRideTimer] = useState(null);
  
  const processedRideIds = useRef(new Set());

  // ================ HELPER FUNCTIONS ================
  const notify = (message, type = 'info') => {
    setNotice({ message, type });
  };

  const clearActiveRide = () => {
    localStorage.removeItem('driverCurrentRide');
    localStorage.removeItem('driverRideStatus');
    localStorage.removeItem('driverRideStartTime');
    setCurrentRide(null);
    setRideStatus(null);
    setRideStartTime(null);
    setRideTimer(null);
  };

  const saveActiveRide = (ride, status = ride?.status || 'ACCEPTED') => {
    if (!ride) return;
    if (!ACTIVE_RIDE_STATUSES.includes(status)) {
      clearActiveRide();
      return;
    }

    localStorage.setItem('driverCurrentRide', JSON.stringify(ride));
    localStorage.setItem('driverRideStatus', status);
    setCurrentRide(ride);
    setRideStatus(status);
  };

  const showPaymentScreen = (ride) => {
    setPaymentDetails({
      rideId: ride._id,
      amount: ride.fare,
      userId: ride.userId,
      driverId: driver._id,
      paymentMethod: ride.paymentMethod || 'CASH',
      paymentTiming: ride.paymentTiming || 'POSTPAID'
    });
    setShowPaymentModal(true);
  };

  const handlePaymentComplete = (payment) => {
    setShowPaymentModal(false);
    clearActiveRide();
    notify(`Payment of ₹${payment?.amount || currentRide?.fare} received.`, 'success');
    // Reload earnings after payment
    loadEarnings();
  };

  // Load earnings function
  const loadEarnings = async () => {
    if (!driver) return;
    try {
      const res = await axios.get(`${API_URL}/api/payments/driver/${driver._id}`);
      if (res.data.success) {
        const todayPayments = res.data.payments.filter(p => 
          new Date(p.completedAt).toDateString() === new Date().toDateString()
        );
        const todayEarnings = todayPayments.reduce((sum, p) => sum + p.amount, 0);
        
        setEarnings({
          total: res.data.totalEarnings,
          trips: res.data.totalTrips,
          today: todayEarnings
        });
      }
    } catch (error) {
      console.error("Error loading earnings:", error);
    }
  };

  // ================ useEffect HOOKS ================
  
  // Load saved driver on startup
  useEffect(() => {
    const savedDriver = localStorage.getItem('driver');
    if (savedDriver) {
      try {
        const driverData = JSON.parse(savedDriver);
        if (!driverData || !driverData._id) {
          console.log("⚠️ Invalid driver data, clearing storage");
          localStorage.removeItem('driver');
          setDriver(null);
          return;
        }
        setDriver(driverData);
        setIsAvailable(driverData.isAvailable || false);
        console.log("✅ Loaded saved driver:", driverData);

        const savedRide = localStorage.getItem('driverCurrentRide');
        const savedRideStatus = localStorage.getItem('driverRideStatus');
        const savedRideStartTime = localStorage.getItem('driverRideStartTime');
        if (savedRide) {
          const rideData = JSON.parse(savedRide);
          const status = savedRideStatus || rideData.status || 'ACCEPTED';
          if (ACTIVE_RIDE_STATUSES.includes(status)) {
            setCurrentRide(rideData);
            setRideStatus(status);
            if (savedRideStartTime) {
              setRideStartTime(Number(savedRideStartTime));
            }
          } else {
            clearActiveRide();
          }
        }
      } catch (e) {
        console.error("❌ Error loading saved driver:", e);
        localStorage.removeItem('driver');
        setDriver(null);
      }
    }
  }, []);

  useEffect(() => {
    const validateSavedRide = async () => {
      if (!driver || !currentRide?._id) return;

      try {
        const res = await axios.get(`${API_URL}/api/rides/${currentRide._id}`);
        const ride = res.data.ride;
        const status = ride.status || 'ACCEPTED';
        const belongsToDriver = String(ride.driverId || '') === String(driver._id);

        if (!belongsToDriver || !ACTIVE_RIDE_STATUSES.includes(status)) {
          clearActiveRide();
          notify('Previous saved ride was cleared because it is no longer active.', 'info');
          return;
        }

        saveActiveRide(ride, status);
      } catch (error) {
        clearActiveRide();
        notify('Previous saved ride was cleared because it could not be found.', 'info');
      }
    };

    validateSavedRide();
  }, [driver, currentRide?._id]);

  // Load earnings when driver is set
  useEffect(() => {
    if (driver) {
      loadEarnings();
    }
  }, [driver]);

  // Timer for started ride
  useEffect(() => {
    let interval;
    if (rideStatus === 'STARTED' && rideStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - rideStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        setRideTimer(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [rideStatus, rideStartTime]);

  // Setup socket and location tracking
  useEffect(() => {
    if (!driver) return;

    const newSocket = io(API_URL, {
      transports: ['websocket'],
      reconnection: true
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Socket connected with ID:', newSocket.id);
      newSocket.emit('register-driver', driver._id);
      
      if (isAvailable && location) {
        console.log("🔄 Re-emitting online status");
        newSocket.emit('driver-online', {
          driverId: driver._id,
          name: driver.name,
          vehicleType: driver.vehicleType,
          vehicleNumber: driver.vehicleNumber,
          lat: location.lat,
          lng: location.lng
        });
      }
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ Socket connection error:', err);
    });

    // Listen for new ride requests
    newSocket.on('new-ride-request', (rideData) => {
      console.log("🚗 New ride request received:", rideData);
      
      const uniqueId = rideData.rideId || 
                      `${rideData.pickup?.lat}_${rideData.pickup?.lng}_${rideData.fare}`;
      
      if (processedRideIds.current.has(uniqueId)) {
        console.log("⚠️ Duplicate ride ignored:", uniqueId);
        return;
      }
      
      processedRideIds.current.add(uniqueId);
      
      setRideRequests(prev => {
        const exists = prev.some(r => 
          r.rideId === rideData.rideId ||
          (r.pickup?.lat === rideData.pickup?.lat && 
           r.drop?.lat === rideData.drop?.lat &&
           Math.abs(r.fare - rideData.fare) < 1)
        );
        
        if (!exists) {
          console.log("✅ Adding new ride request:", rideData);
          return [...prev, { ...rideData, receivedAt: Date.now() }];
        }
        return prev;
      });
    });

    // Listen for ride status updates
    newSocket.on('ride-status-updated', (data) => {
      console.log("🔄 Ride status updated:", data);
      const savedCurrentRide = localStorage.getItem('driverCurrentRide');
      const savedCurrentRideId = savedCurrentRide ? JSON.parse(savedCurrentRide)._id : null;
      const activeRideId = currentRide?._id || savedCurrentRideId;
      const isAssignedToDriver = !data.ride?.driverId || String(data.ride.driverId) === String(driver._id);
      const isActiveRide = !activeRideId || String(data.rideId) === String(activeRideId);
      if (!isAssignedToDriver || !isActiveRide) return;

      saveActiveRide(data.ride, data.status);
      
      if (data.status === 'STARTED') {
        const startTime = Date.now();
        localStorage.setItem('driverRideStartTime', String(startTime));
        setRideStartTime(startTime);
        notify('Ride started. Safe journey.', 'success');
      } else if (data.status === 'COMPLETED') {
        setRideStartTime(null);
        setRideTimer(null);
        localStorage.removeItem('driverRideStartTime');
        notify('Ride completed. Processing payment...', 'success');
        // Payment modal will open from completeRide function
      } else if (data.status === 'ACCEPTED') {
        notify('Ride accepted. Head to pickup location.', 'success');
      } else if (data.status === 'ARRIVING') {
        notify('Arrival marked. The rider can see that you are at pickup.', 'success');
      }
    });

    newSocket.on('payment-success', (data) => {
      const savedCurrentRide = localStorage.getItem('driverCurrentRide');
      const savedCurrentRideId = savedCurrentRide ? JSON.parse(savedCurrentRide)._id : null;
      const activeRideId = currentRide?._id || savedCurrentRideId;

      if (String(data.rideId) !== String(activeRideId)) return;

      clearActiveRide();
      notify('Rider payment received.', 'success');
      loadEarnings();
    });

    // Start watching location
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const newLocation = { lat: latitude, lng: longitude };
          setLocation(newLocation);
          console.log("📍 Location updated:", newLocation);
          
          if (isAvailable && newSocket.connected) {
            newSocket.emit('driver-location-update', {
              driverId: driver._id,
              lat: latitude,
              lng: longitude
            });
            
            axios.post(`${API_URL}/api/driver/update-location`, {
              driverId: driver._id,
              lat: latitude,
              lng: longitude,
              isAvailable: true
            }).catch(err => console.log("Location update error:", err));
          }
        },
        (error) => {
          console.error('❌ Geolocation error:', error);
          notify('Please enable location access for the app.', 'error');
        },
        { 
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
        newSocket.close();
        processedRideIds.current.clear();
      };
    } else {
      notify('Geolocation is not supported on this device.', 'error');
      return () => {
        newSocket.close();
        processedRideIds.current.clear();
      };
    }
  }, [driver, isAvailable]);

  // ================ API FUNCTIONS ================
  
  const handleLogin = async () => {
    const phone = loginForm.phone.trim();
    const vehicleNumber = loginForm.vehicleNumber.trim();

    if (!phone || !vehicleNumber) {
      notify('Please enter phone number and vehicle number.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/driver/login`, {
        phone,
        vehicleNumber
      });

      if (res.data.success) {
        const driverData = res.data.driver;
        localStorage.setItem('driver', JSON.stringify(driverData));
        setDriver(driverData);
        setIsAvailable(driverData.isAvailable || false);
        notify('Login successful.', 'success');
      }
    } catch (error) {
      console.error("Driver login error:", error);
      notify('Login failed: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!form.name || !form.phone || !form.vehicleNumber) {
      notify('Please fill all fields.', 'error');
      return;
    }

    setLoading(true);
    try {
      console.log("📝 Registering with:", form);
      const res = await axios.post(`${API_URL}/api/driver/register`, form);
      console.log("📦 Register response:", res.data);
      
      if (res.data.success) {
        const driverData = res.data.driver;
        if (!driverData._id) {
          console.error("❌ No driver ID in response!");
          notify('Registration failed - no driver ID.', 'error');
          return;
        }
        localStorage.setItem('driver', JSON.stringify(driverData));
        setDriver(driverData);
        setIsAvailable(false);
        notify('Registration successful.', 'success');
      }
    } catch (error) {
      console.error("❌ Registration error:", error);
      notify('Registration failed: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleAvailability = async () => {
    if (!location) {
      notify('Getting your location. Please wait.', 'info');
      return;
    }

    if (!driver || !driver._id) {
      notify('Driver is not properly registered.', 'error');
      return;
    }

    setLoading(true);
    try {
      const newStatus = !isAvailable;
      console.log("🚗 Toggling to:", newStatus ? "ONLINE" : "OFFLINE");

      const res = await axios.post(`${API_URL}/api/driver/update-location`, {
        driverId: driver._id,
        lat: location.lat,
        lng: location.lng,
        isAvailable: newStatus
      });
      
      if (res.data.success) {
        setIsAvailable(newStatus);
        
        if (socket && socket.connected) {
          if (newStatus) {
            console.log("📤 Emitting driver-online event");
            socket.emit('driver-online', {
              driverId: driver._id,
              name: driver.name,
              vehicleType: driver.vehicleType,
              vehicleNumber: driver.vehicleNumber,
              lat: location.lat,
              lng: location.lng
            });
          } else {
            console.log("📤 Emitting driver-offline event");
            socket.emit('driver-offline', { driverId: driver._id });
          }
          notify(`You are now ${newStatus ? 'ONLINE' : 'OFFLINE'}.`, 'success');
        }
        
        const updatedDriver = { ...driver, isAvailable: newStatus };
        localStorage.setItem('driver', JSON.stringify(updatedDriver));
        setDriver(updatedDriver);
      }
    } catch (error) {
      console.error("❌ Error:", error);
      notify('Failed: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const acceptRide = async (rideId) => {
    try {
      console.log("🟢 Accepting ride with ID:", rideId);
      
      const res = await axios.post(`${API_URL}/api/rides/accept`, {
        rideId,
        driverId: driver._id
      });
      
      console.log("📦 Accept response:", res.data);
      
      if (res.data.success) {
        console.log("✅ Setting currentRide:", res.data.ride);
        saveActiveRide(res.data.ride, res.data.ride?.status || 'ACCEPTED');
        
        setRideRequests(prev => prev.filter(r => r.rideId !== rideId));
        notify('Ride accepted.', 'success');
      }
    } catch (error) {
      console.error("❌ Error accepting ride:", error);
      notify('Failed to accept ride: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const rejectRide = async (rideId) => {
    try {
      await axios.post(`${API_URL}/api/rides/reject`, { rideId });
      setRideRequests(prev => prev.filter(r => r.rideId !== rideId));
    } catch (error) {
      console.error("Error rejecting ride:", error);
    }
  };

  const updateRideStatus = async (newStatus) => {
    if (!currentRide) return;
    
    try {
      const res = await axios.post(`${API_URL}/api/rides/update-status`, {
        rideId: currentRide._id,
        status: newStatus,
        location: location
      });
      
      if (res.data.success) {
        console.log(`✅ Ride status updated to ${newStatus}`);
        saveActiveRide(res.data.ride, newStatus);
      }
    } catch (error) {
      console.error("Error updating ride status:", error);
      notify('Could not update ride status.', 'error');
    }
  };

  const handleArrived = async () => {
    if (!currentRide) {
      notify('No active ride found.', 'error');
      return;
    }
    
    try {
      console.log("🔑 Generating OTP for ride:", currentRide._id);
      
      const res = await axios.post(`${API_URL}/api/rides/generate-otp`, {
        rideId: currentRide._id
      });
      
      if (res.data.success) {
        console.log("✅ OTP generated and sent to user");
        await updateRideStatus('ARRIVING');
        notify('OTP sent to user. Ask the user for the OTP to start the ride.', 'success');
      } else {
        console.log("❌ OTP generation failed:", res.data);
        notify('Failed to generate OTP: ' + res.data.message, 'error');
      }
      
    } catch (error) {
      console.error("❌ Error in handleArrived:", error);
      notify('Failed to generate OTP: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const verifyOtpAndStart = async () => {
    try {
      const res = await axios.post(`${API_URL}/api/rides/verify-otp`, {
        rideId: currentRide._id,
        otp: enteredOtp
      });
      
      if (res.data.success) {
        setShowOtpInput(false);
        setEnteredOtp('');
        notify('Ride started.', 'success');
      }
    } catch (error) {
      notify('Invalid OTP.', 'error');
    }
  };

  const completeRide = async () => {
    if (!currentRide) return;
    
    try {
      await updateRideStatus('COMPLETED');
      if (currentRide.paymentTiming === 'POSTPAID' && currentRide.paymentMethod === 'CARD') {
        notify('Ride completed. Waiting for rider to pay by Stripe.', 'info');
        return;
      }

      showPaymentScreen(currentRide);
    } catch (error) {
      console.error("Error completing ride:", error);
    }
  };

  const handleLogout = () => {
    if (isAvailable) {
      notify('Please go offline first.', 'error');
      return;
    }
    localStorage.removeItem('driver');
    clearActiveRide();
    setDriver(null);
    setIsAvailable(false);
    if (socket) socket.close();
  };

  const formatDistance = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(2) : 'Calculating';
  };

  // ================ RENDER FUNCTIONS ================
  
  // Login / registration form
  if (!driver) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.logo}>🚖</div>
        <h2 style={styles.title}>{authMode === 'login' ? 'Driver Login' : 'Driver Registration'}</h2>
        {notice.message && (
          <div style={{
            ...styles.notice,
            ...(notice.type === 'error' ? styles.noticeError : {}),
            ...(notice.type === 'success' ? styles.noticeSuccess : {})
          }}>
            {notice.message}
          </div>
        )}

        <div style={styles.authTabs}>
          <button
            style={{
              ...styles.authTab,
              ...(authMode === 'login' ? styles.authTabActive : {})
            }}
            onClick={() => setAuthMode('login')}
            type="button"
          >
            Login
          </button>
          <button
            style={{
              ...styles.authTab,
              ...(authMode === 'register' ? styles.authTabActive : {})
            }}
            onClick={() => setAuthMode('register')}
            type="button"
          >
            Register
          </button>
        </div>

        {authMode === 'login' ? (
          <>
            <input
              placeholder="Phone Number"
              style={styles.input}
              value={loginForm.phone}
              onChange={(e) => setLoginForm({...loginForm, phone: e.target.value})}
            />
            <input
              placeholder="Vehicle Number"
              style={styles.input}
              value={loginForm.vehicleNumber}
              onChange={(e) => setLoginForm({...loginForm, vehicleNumber: e.target.value})}
            />

            <button style={styles.registerBtn} onClick={handleLogin} disabled={loading}>
              {loading ? 'Logging in...' : 'Login & Start Driving'}
            </button>
          </>
        ) : (
          <>
            <input
              placeholder="Full Name"
              style={styles.input}
              value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
            />
            <input
              placeholder="Phone Number"
              style={styles.input}
              value={form.phone}
              onChange={(e) => setForm({...form, phone: e.target.value})}
            />
            <select
              style={styles.input}
              value={form.vehicleType}
              onChange={(e) => setForm({...form, vehicleType: e.target.value})}
            >
              <option value="Mini">🚗 Mini</option>
              <option value="Sedan">🚙 Sedan</option>
              <option value="SUV">🚐 SUV</option>
              <option value="Auto">🛺 Auto</option>
            </select>
            <input
              placeholder="Vehicle Number"
              style={styles.input}
              value={form.vehicleNumber}
              onChange={(e) => setForm({...form, vehicleNumber: e.target.value})}
            />

            <button style={styles.registerBtn} onClick={handleRegister} disabled={loading}>
              {loading ? 'Registering...' : 'Register & Start Driving'}
            </button>
          </>
        )}
        <p style={styles.note}>⚠️ Enable location access</p>
      </div>
    );
  }

  // Driver dashboard
  return (
    <div style={styles.container}>
      {notice.message && (
        <div style={{
          ...styles.notice,
          ...(notice.type === 'error' ? styles.noticeError : {}),
          ...(notice.type === 'success' ? styles.noticeSuccess : {})
        }}>
          {notice.message}
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.driverName}>{driver.name}</h2>
          <p style={styles.driverPhone}>{driver.phone}</p>
        </div>
        <div style={styles.vehicleBadge}>
          {driver.vehicleType === 'Mini' ? '🚗' : 
           driver.vehicleType === 'Sedan' ? '🚙' : 
           driver.vehicleType === 'SUV' ? '🚐' : '🛺'} {driver.vehicleType}
        </div>
      </div>

      {/* Status Card */}
      <div style={styles.statusCard}>
        <div style={styles.locationInfo}>
          <span style={styles.locationDot}>📍</span>
          <p>
            {location 
              ? `Location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` 
              : 'Getting location...'}
          </p>
        </div>
        
        <button 
          style={{
            ...styles.toggleBtn,
            background: isAvailable ? '#f44336' : '#4CAF50'
          }}
          onClick={toggleAvailability}
          disabled={loading || !location}
        >
          {loading ? 'Please wait...' : (isAvailable ? '🔴 Go Offline' : '🟢 Go Online')}
        </button>
        
        <p style={styles.socketStatus}>
          Socket: {socket?.connected ? '✅' : '❌'} | Status: {isAvailable ? '🟢 Online' : '🔴 Offline'}
        </p>
      </div>

      {/* Ride Requests Section */}
      {rideRequests.length > 0 && (
        <div style={styles.rideRequestsSection}>
          <h3>🚗 New Ride Requests ({rideRequests.length})</h3>
          {rideRequests.map((ride, index) => (
            <div key={ride.rideId || index} style={styles.rideCard}>
              <div style={styles.rideDetails}>
                <p><strong>📍 From:</strong> {ride.pickup?.address || `${ride.pickup?.lat}, ${ride.pickup?.lng}`}</p>
                <p><strong>🏁 To:</strong> {ride.drop?.address || `${ride.drop?.lat}, ${ride.drop?.lng}`}</p>
                <p><strong>💰 Fare:</strong> ₹{ride.fare}</p>
                <p><strong>📏 Distance:</strong> {formatDistance(ride.distance)} km</p>
              </div>
              <div style={styles.rideActions}>
                <button onClick={() => acceptRide(ride.rideId)} style={styles.acceptBtn}>✅ Accept</button>
                <button onClick={() => rejectRide(ride.rideId)} style={styles.rejectBtn}>❌ Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Current Ride Section */}
      {currentRide && (
        <div style={styles.currentRideCard}>
          <div style={styles.currentRideHeader}>
            <h3 style={styles.currentRideTitle}>🟢 Current Ride - {rideStatus || 'ACCEPTED'}</h3>
            <button
              type="button"
              onClick={() => {
                clearActiveRide();
                notify('Saved ride cleared.', 'info');
              }}
              style={styles.clearRideBtn}
            >
              Clear
            </button>
          </div>
          <p>📍 Pickup: {currentRide.pickupLocation?.address || 'Pickup location'}</p>
          <p>🏁 Drop: {currentRide.dropLocation?.address || 'Drop location'}</p>
          
          {/* Show buttons based on status */}
          {(rideStatus === 'ACCEPTED' || rideStatus === null) && (
            <>
              <button onClick={() => updateRideStatus('ARRIVING')} style={styles.arrivingBtn}>
                🚗 I've Arrived at Pickup
              </button>
              <button onClick={() => setShowOtpInput(true)} style={styles.otpBtn}>
                Enter OTP to Start
              </button>
            </>
          )}
          
          {rideStatus === 'ARRIVING' && (
            <>
              <button onClick={handleArrived} style={styles.arrivingBtn}>
                🔑 Generate OTP
              </button>
              <button onClick={() => setShowOtpInput(true)} style={styles.otpBtn}>
                Enter OTP to Start
              </button>
            </>
          )}
          
          {showOtpInput && (
            <div style={styles.otpContainer}>
              <input
                type="text"
                placeholder="Enter 6-digit OTP"
                value={enteredOtp}
                onChange={(e) => setEnteredOtp(e.target.value)}
                maxLength="6"
                style={styles.otpInput}
              />
              <button onClick={verifyOtpAndStart} style={styles.verifyBtn}>
                Verify & Start Ride
              </button>
            </div>
          )}
          
          {rideStatus === 'STARTED' && (
            <>
              <div style={styles.timerDisplay}>
                ⏱️ Ride Time: {rideTimer || '0:00'}
              </div>
              <button onClick={completeRide} style={styles.completeBtn}>
                ✅ END RIDE & COMPLETE
              </button>
            </>
          )}

          <RideChat
            socket={socket}
            ride={{ ...currentRide, status: rideStatus || currentRide.status }}
            participantId={driver._id}
            participantType="driver"
            participantName={driver.name}
          />
        </div>
      )}

      {/* Vehicle Info */}
      <div style={styles.infoCard}>
        <h3>🚖 Vehicle Details</h3>
        <div style={styles.infoRow}>
          <span>Number:</span> <strong>{driver.vehicleNumber}</strong>
        </div>
        <div style={styles.infoRow}>
          <span>Type:</span> <strong>{driver.vehicleType}</strong>
        </div>
      </div>

      {/* Stats with Real Earnings */}
      <div style={styles.statsCard}>
        <h3>📊 Today's Stats</h3>
        <div style={styles.statsGrid}>
          <div style={styles.statItem}>
            <span style={styles.statValue}>{earnings.trips}</span>
            <span style={styles.statLabel}>Trips</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statValue}>₹{earnings.today}</span>
            <span style={styles.statLabel}>Today</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statValue}>₹{earnings.total}</span>
            <span style={styles.statLabel}>Total</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <p style={styles.status}>Status: {isAvailable ? '🟢 Online' : '🔴 Offline'}</p>
        <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
      </div>

      {/* Payment Modal - Always at the end of return */}
      {showPaymentModal && paymentDetails && (
        <Payment
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          amount={paymentDetails.amount}
          rideDetails={paymentDetails}
          onPaymentComplete={handlePaymentComplete}
          userType="driver"
        />
      )}
    </div>
  );
}

// Styles
const styles = {
  container: {
    maxWidth: '400px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#f5f5f5',
    minHeight: '100vh'
  },
  loginContainer: {
    maxWidth: '400px',
    margin: '50px auto',
    padding: '30px',
    background: 'white',
    borderRadius: '15px',
    boxShadow: '0 5px 20px rgba(0,0,0,0.1)'
  },
  logo: {
    fontSize: '4rem',
    textAlign: 'center',
    marginBottom: '10px'
  },
  title: {
    textAlign: 'center',
    marginBottom: '30px',
    color: '#333'
  },
  notice: {
    padding: '12px',
    marginBottom: '16px',
    borderRadius: '8px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1d4ed8',
    fontSize: '14px',
    fontWeight: '600'
  },
  noticeError: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c'
  },
  noticeSuccess: {
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    color: '#047857'
  },
  authTabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    padding: '4px',
    background: '#f1f5f9',
    borderRadius: '10px',
    marginBottom: '20px'
  },
  authTab: {
    padding: '10px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: '#555',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  authTabActive: {
    background: 'white',
    color: '#4CAF50',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
  },
  input: {
    width: '100%',
    padding: '12px',
    margin: '10px 0',
    border: '1px solid #ddd',
    borderRadius: '8px',
    boxSizing: 'border-box',
    fontSize: '14px'
  },
  registerBtn: {
    width: '100%',
    padding: '15px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '20px'
  },
  note: {
    textAlign: 'center',
    color: '#666',
    fontSize: '0.8rem',
    marginTop: '15px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    background: 'linear-gradient(135deg, #4CAF50, #45a049)',
    color: 'white',
    borderRadius: '15px',
    marginBottom: '20px',
    boxShadow: '0 5px 15px rgba(76, 175, 80, 0.3)'
  },
  driverName: {
    margin: 0,
    fontSize: '1.3rem'
  },
  driverPhone: {
    margin: '5px 0 0',
    fontSize: '0.9rem',
    opacity: 0.9
  },
  vehicleBadge: {
    background: 'white',
    color: '#4CAF50',
    padding: '8px 15px',
    borderRadius: '20px',
    fontWeight: 'bold',
    fontSize: '0.9rem'
  },
  rideRequestsSection: {
    background: '#fff3e0',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '20px'
  },
  rideCard: {
    background: 'white',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '10px',
    border: '1px solid #ff9800'
  },
  rideDetails: {
    fontSize: '0.9rem'
  },
  rideActions: {
    display: 'flex',
    gap: '10px',
    marginTop: '10px'
  },
  acceptBtn: {
    flex: 1,
    padding: '10px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  rejectBtn: {
    flex: 1,
    padding: '10px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  currentRideCard: {
    background: '#e8f5e8',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '20px',
    border: '2px solid #4CAF50'
  },
  currentRideHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px'
  },
  currentRideTitle: {
    margin: 0,
    fontSize: '18px'
  },
  clearRideBtn: {
    border: '1px solid #4CAF50',
    background: 'white',
    color: '#2e7d32',
    borderRadius: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  statusCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '15px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
    marginBottom: '20px'
  },
  locationInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '15px',
    padding: '10px',
    background: '#f5f5f5',
    borderRadius: '10px'
  },
  locationDot: {
    fontSize: '1.2rem'
  },
  toggleBtn: {
    width: '100%',
    padding: '15px',
    border: 'none',
    borderRadius: '10px',
    color: 'white',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginBottom: '10px'
  },
  socketStatus: {
    textAlign: 'center',
    fontSize: '0.8rem',
    color: '#666',
    margin: 0
  },
  infoCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '15px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
    marginBottom: '20px'
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid #eee'
  },
  statsCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '15px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
    marginBottom: '20px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '15px',
    marginTop: '15px'
  },
  statItem: {
    textAlign: 'center',
    padding: '10px',
    background: '#f5f5f5',
    borderRadius: '10px'
  },
  statValue: {
    display: 'block',
    fontSize: '1.3rem',
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: '5px'
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#666'
  },
  footer: {
    textAlign: 'center',
    padding: '20px',
    background: 'white',
    borderRadius: '15px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)'
  },
  status: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    margin: '0 0 10px'
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid #f44336',
    color: '#f44336',
    padding: '8px 20px',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '0.9rem'
  },
  arrivingBtn: {
    width: '100%',
    padding: '12px',
    background: '#FF9800',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    marginTop: '10px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  otpBtn: {
    width: '100%',
    padding: '12px',
    background: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    marginTop: '10px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  otpContainer: {
    marginTop: '15px',
    padding: '10px',
    background: '#f5f5f5',
    borderRadius: '8px'
  },
  otpInput: {
    width: '100%',
    padding: '12px',
    fontSize: '20px',
    textAlign: 'center',
    letterSpacing: '8px',
    border: '2px solid #ddd',
    borderRadius: '8px',
    marginBottom: '10px',
    boxSizing: 'border-box'
  },
  verifyBtn: {
    width: '100%',
    padding: '12px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  timerDisplay: {
    textAlign: 'center',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#4CAF50',
    padding: '10px',
    background: '#e8f5e8',
    borderRadius: '8px',
    margin: '10px 0'
  },
  completeBtn: {
    width: '100%',
    padding: '15px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '10px'
  }
};

export default App;
