import React, { useState, useEffect } from 'react';
import { FaUser, FaStar, FaClock, FaMapMarkerAlt, FaPhone, FaComment } from "react-icons/fa";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { io } from 'socket.io-client';

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom car icon for driver
const carIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Custom pickup icon
const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function Driver({ fare, onBook, pickupLocation, dropLocation, distance, duration }) {
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState(null);
  
  // User side states
  const [searchingForDriver, setSearchingForDriver] = useState(false);
  const [rideStatus, setRideStatus] = useState(null);
  const [assignedDriver, setAssignedDriver] = useState(null);
  const [currentRide, setCurrentRide] = useState(null);
  const [otp, setOtp] = useState(null);
  const [showOtp, setShowOtp] = useState(false);
  const [driverLocation, setDriverLocation] = useState(null);
  const [rideStartTime, setRideStartTime] = useState(null);
  const [rideTimer, setRideTimer] = useState(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropAddress, setDropAddress] = useState('');
  const [mapCenter, setMapCenter] = useState([20.5937, 78.9629]); // Default India

  // Update map center when driver location changes
  useEffect(() => {
    if (driverLocation) {
      setMapCenter([driverLocation.lat, driverLocation.lng]);
    } else if (pickupLocation) {
      setMapCenter([pickupLocation.lat, pickupLocation.lng]);
    }
  }, [driverLocation, pickupLocation]);

  // Get address names with error handling
  useEffect(() => {
    const getAddress = async (lat, lng, setter) => {
      try {
        console.log(`📍 Getting address for: ${lat}, ${lng}`);
        const res = await axios.get(`https://ride-backend-w2o0.onrender.com/api/geocode/reverse?lat=${lat}&lng=${lng}`);
        if (res.data.success) {
          setter(res.data.shortAddress || res.data.address);
          console.log("✅ Address received:", res.data.shortAddress);
        } else {
          setter(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      } catch (error) {
        console.error("❌ Error getting address:", error.message);
        setter(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    };
    
    if (pickupLocation) {
      getAddress(pickupLocation.lat, pickupLocation.lng, setPickupAddress);
    } else {
      setPickupAddress('Pickup location');
    }
    
    if (dropLocation) {
      getAddress(dropLocation.lat, dropLocation.lng, setDropAddress);
    } else {
      setDropAddress('Drop location');
    }
  }, [pickupLocation, dropLocation]);

  // Listen for driver location updates
  useEffect(() => {
    if (!socket) {
      console.log("❌ Socket not available");
      return;
    }
    
    console.log("📍 Setting up location listener, socket connected:", socket.connected);
    
    const handleDriverLocation = (data) => {
      console.log("📍 Driver location received:", data);
      setDriverLocation(data.location);
    };
    
    socket.on('driver-location', handleDriverLocation);
    
    const timeout = setTimeout(() => {
      if (!driverLocation && currentRide) {
        console.log("⚠️ No location received, requesting...");
        socket.emit('request-driver-location', { rideId: currentRide._id });
      }
    }, 3000);
    
    return () => {
      socket.off('driver-location', handleDriverLocation);
      clearTimeout(timeout);
    };
  }, [socket, currentRide]);

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

  // Socket listeners for ride updates
  useEffect(() => {
    if (!socket) return;

    const handleRideAccepted = (data) => {
      console.log("✅ Ride accepted by driver:", data);
      setSearchingForDriver(false);
      setRideStatus('accepted');
      setAssignedDriver(data.driverId);
    };

    const handleRideRejected = (data) => {
      console.log("❌ Ride rejected:", data);
      setSearchingForDriver(false);
      alert('Driver rejected your ride. Finding another driver...');
      requestRide();
    };

    const handleRideStatusUpdated = (data) => {
      console.log("🔄 Ride status updated:", data);
      setRideStatus(data.status);
      setCurrentRide(data.ride);
      
      if (data.status === 'ACCEPTED') {
        setSearchingForDriver(false);
        alert('✅ Driver found! They are on the way to pickup.');
      } else if (data.status === 'ARRIVING') {
        alert('🚗 Driver has arrived at pickup location!');
      } else if (data.status === 'STARTED') {
        setRideStartTime(Date.now());
        alert('🎉 Your ride has started! Enjoy the journey.');
      } else if (data.status === 'COMPLETED') {
        setRideStartTime(null);
        setRideTimer(null);
        alert('💰 Ride completed! Thank you for riding with us.');
        setRideStatus(null);
        setCurrentRide(null);
      } else if (data.status === 'CANCELLED') {
        alert('❌ Ride was cancelled');
        setRideStatus(null);
        setCurrentRide(null);
        setSearchingForDriver(false);
      }
    };

    const handleRideOtp = (data) => {
      console.log("🔑 Ride OTP received:", data);
      setOtp(data.otp);
      setShowOtp(true);
    };

    socket.on('ride-accepted', handleRideAccepted);
    socket.on('ride-rejected', handleRideRejected);
    socket.on('ride-status-updated', handleRideStatusUpdated);
    socket.on('ride-otp', handleRideOtp);

    return () => {
      socket.off('ride-accepted', handleRideAccepted);
      socket.off('ride-rejected', handleRideRejected);
      socket.off('ride-status-updated', handleRideStatusUpdated);
      socket.off('ride-otp', handleRideOtp);
    };
  }, [socket]);

  // Request ride function
  const requestRide = async () => {
    if (!pickupLocation || !dropLocation) {
      alert('Please select pickup and drop locations first');
      return;
    }

    setSearchingForDriver(true);
    
    try {
      const res = await axios.post('https://ride-backend-w2o0.onrender.com/api/rides/request', {
        userId: localStorage.getItem('userId') || 'user_' + Date.now(),
        pickupLocation: {
          lat: pickupLocation.lat,
          lng: pickupLocation.lng,
          address: pickupLocation.address || 'Pickup location'
        },
        dropLocation: {
          lat: dropLocation.lat,
          lng: dropLocation.lng,
          address: dropLocation.address || 'Drop location'
        },
        fare: fare,
        distance: distance,
        duration: duration
      });
      
      console.log("✅ Ride requested:", res.data);
      localStorage.setItem('currentRideId', res.data.ride._id);
      
    } catch (error) {
      console.error("❌ Error requesting ride:", error);
      setSearchingForDriver(false);
      alert('Failed to request ride. Please try again.');
    }
  };

  // Cancel ride search
  const cancelSearch = () => {
    setSearchingForDriver(false);
    setRideStatus(null);
  };

  // Cancel ride function
  const cancelRide = async () => {
    if (!currentRide) return;
    
    try {
      await axios.post('https://ride-backend-w2o0.onrender.com/api/rides/update-status', {
        rideId: currentRide._id,
        status: 'CANCELLED'
      });
      
      setRideStatus('CANCELLED');
      setCurrentRide(null);
      setSearchingForDriver(false);
      alert('❌ Ride cancelled');
    } catch (error) {
      console.error("Error cancelling ride:", error);
    }
  };

  // Socket connection effect
  useEffect(() => {
    const newSocket = io('https://ride-backend-w2o0.onrender.com', {
      transports: ['websocket'],
      reconnection: true
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Connected to server');
      
      const userId = localStorage.getItem('userId') || 'user_' + Date.now();
      newSocket.emit('register-user', userId);
      localStorage.setItem('userId', userId);
    });

    loadAvailableDrivers();

    newSocket.on('driver-available', (data) => {
      console.log("📢 New driver available:", data);
      
      const newDriver = {
        _id: data.driverId || data._id,
        id: data.driverId || data._id,
        name: data.name || 'Driver',
        vehicleType: data.vehicleType || 'Mini',
        vehicleNumber: data.vehicleNumber || 'RJ14XX1234',
        currentLocation: data.location || { lat: 0, lng: 0 },
        isAvailable: true,
        rating: data.rating || 4.9
      };
      
      setAvailableDrivers(prev => {
        const exists = prev.some(d => d._id === newDriver._id);
        if (!exists) {
          console.log("➕ Adding new driver to list:", newDriver);
          return [...prev, newDriver];
        }
        return prev;
      });
    });

    newSocket.on('driver-unavailable', (data) => {
      console.log("📢 Driver offline:", data);
      setAvailableDrivers(prev => 
        prev.filter(d => d._id !== data.driverId && d.id !== data.driverId)
      );
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Separate effect for location-based loading
  useEffect(() => {
    if (pickupLocation) {
      console.log("📍 Pickup location changed, reloading nearby drivers:", pickupLocation);
      loadAvailableDrivers();
    }
  }, [pickupLocation]);

  const loadAvailableDrivers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log("🔍 Loading available drivers...");
      
      const res = await axios.get('https://ride-backend-w2o0.onrender.com/api/drivers/available', {
        params: {
          ...(pickupLocation && {
            lat: pickupLocation.lat,
            lng: pickupLocation.lng,
            radius: 50
          })
        }
      });
      
      console.log("📦 Drivers response:", res.data);

      if (res.data.success) {
        if (res.data.drivers.length > 0) {
          console.log(`✅ Found ${res.data.drivers.length} drivers`);
          setAvailableDrivers(res.data.drivers);
        } else {
          console.log("⚠️ No drivers found in API response");
        }
      }
    } catch (error) {
      console.error('❌ Error loading drivers:', error);
      setError('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  // Calculate distance (mock for now)
  const getDriverDistance = () => {
    return Math.floor(Math.random() * 5) + 1;
  };

  // Calculate fare
  const getDriverFare = (driverType) => {
    const multipliers = {
      'Mini': 1,
      'Sedan': 1.5,
      'SUV': 2,
      'Auto': 0.8
    };
    return Math.round(fare * (multipliers[driverType] || 1));
  };

  // Manual refresh
  const handleRefresh = () => {
    loadAvailableDrivers();
  };

  console.log("👀 Current available drivers state:", availableDrivers);

  // Show searching for driver screen
  if (searchingForDriver) {
    return (
      <div style={styles.searchingContainer}>
        <div style={styles.loadingSpinner}></div>
        <h3>🔍 Searching for nearby drivers...</h3>
        <p>Please wait while we find you the best ride</p>
        <div style={styles.tripDetails}>
          <p>📍 From: {pickupAddress || 'Pickup'}</p>
          <p>🏁 To: {dropAddress || 'Drop'}</p>
          <p>💰 Fare: ₹{fare}</p>
          <p>📏 Distance: {distance} km</p>
        </div>
        <button onClick={cancelSearch} style={styles.cancelBtn}>
          Cancel Search
        </button>
      </div>
    );
  }

  // Show driver assigned screen with live location
  if (rideStatus === 'accepted' || rideStatus === 'ARRIVING' || rideStatus === 'STARTED') {
    return (
      <div style={styles.assignedContainer}>
        <div style={styles.successIcon}>
          {rideStatus === 'accepted' && '✅'}
          {rideStatus === 'ARRIVING' && '🚗'}
          {rideStatus === 'STARTED' && '🎉'}
        </div>
        
        <h3>
          {rideStatus === 'accepted' && 'Driver Assigned!'}
          {rideStatus === 'ARRIVING' && 'Driver Arrived!'}
          {rideStatus === 'STARTED' && 'Ride In Progress!'}
        </h3>
        
        <p>
          {rideStatus === 'accepted' && 'Your driver is on the way'}
          {rideStatus === 'ARRIVING' && 'Driver is waiting at pickup location'}
          {rideStatus === 'STARTED' && 'Enjoy your journey!'}
        </p>
        
        {/* LIVE MAP */}
        <div style={styles.mapContainer}>
          <MapContainer
            center={mapCenter}
            zoom={15}
            style={{ height: '250px', width: '100%', borderRadius: '10px' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            
            {/* Driver Location Marker */}
            {driverLocation && (
              <Marker 
                position={[driverLocation.lat, driverLocation.lng]} 
                icon={carIcon}
              >
                <Popup>
                  <b>Driver Location</b><br/>
                  {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
                </Popup>
              </Marker>
            )}
            
            {/* Pickup Location Marker */}
            {pickupLocation && (
              <Marker 
                position={[pickupLocation.lat, pickupLocation.lng]} 
                icon={pickupIcon}
              >
                <Popup>
                  <b>Pickup Location</b><br/>
                  {pickupAddress || 'Pickup point'}
                </Popup>
              </Marker>
            )}
          </MapContainer>
          
          {/* Live Status Badge */}
          <div style={styles.liveStatusBadge}>
            <span style={styles.liveDot}></span>
            LIVE
          </div>
        </div>
        
        <div style={styles.driverInfo}>
          <div style={styles.driverCard}>
            <FaUser size={40} />
            <div>
              <h4>Driver {assignedDriver?.slice(-6) || 'Unknown'}</h4>
              <p>⚡ {rideStatus === 'accepted' ? '5 min away' : 
                     rideStatus === 'ARRIVING' ? 'At pickup' : 
                     'On ride - ' + (rideTimer || '0:00')}</p>
              <p>🚗 Vehicle: {currentRide?.vehicleType || 'Mini'} ({currentRide?.vehicleNumber || 'RJ14 XX 1234'})</p>
            </div>
          </div>
          
          <div style={styles.tripDetails}>
            <p><strong>📍 Pickup:</strong> {pickupAddress || 'Pickup location'}</p>
            <p><strong>🏁 Drop:</strong> {dropAddress || 'Drop location'}</p>
            <p><strong>💰 Fare:</strong> ₹{fare}</p>
          </div>
        </div>
        
        {/* RIDE IN PROGRESS SCREEN - When ride started */}
        {rideStatus === 'STARTED' && (
          <div style={styles.rideProgressCard}>
            <div style={styles.progressHeader}>
              <span style={styles.progressIcon}>🚗</span>
              <span style={styles.progressText}>Ride in Progress</span>
            </div>
            
            <div style={styles.timerDisplay}>
              ⏱️ Duration: {rideTimer || '0:00'}
            </div>
            
            <div style={styles.driverContact}>
              <button style={styles.contactBtn}>
                <FaPhone style={{marginRight: '5px'}} /> Call Driver
              </button>
              <button style={styles.contactBtn}>
                <FaComment style={{marginRight: '5px'}} /> Message
              </button>
            </div>
            
            <p style={styles.helpText}>
              Your driver is taking you to your destination. 
              You can contact them if needed.
            </p>
          </div>
        )}
        
        {/* Cancel button - only show if not started */}
        {rideStatus !== 'STARTED' && (
          <button onClick={cancelRide} style={styles.cancelBtn}>
            Cancel Ride
          </button>
        )}
      </div>
    );
  }

  // Loading state
  if (loading && availableDrivers.length === 0) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner}></div>
        <p>Finding nearby drivers...</p>
        <button onClick={handleRefresh} style={styles.refreshBtn}>
          🔄 Refresh
        </button>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={styles.noDriversContainer}>
        <div style={styles.noDriversIcon}>⚠️</div>
        <h3>Error</h3>
        <p>{error}</p>
        <button style={styles.retryBtn} onClick={handleRefresh}>
          🔄 Try Again
        </button>
      </div>
    );
  }

  // No drivers state
  if (availableDrivers.length === 0) {
    return (
      <div style={styles.noDriversContainer}>
        <div style={styles.noDriversIcon}>🚫</div>
        <h3>No Drivers Available</h3>
        <p>No drivers are online right now</p>
        <p style={{ fontSize: '0.8rem', color: '#999' }}>
          Socket: {socket?.connected ? '✅ Connected' : '❌ Disconnected'}
        </p>
        <button style={styles.retryBtn} onClick={handleRefresh}>
          🔄 Refresh
        </button>
        {pickupLocation && dropLocation && (
          <button 
            style={{...styles.retryBtn, background: '#ff9800', marginTop: '10px'}}
            onClick={requestRide}
          >
            🚖 Request Ride Anyway
          </button>
        )}
      </div>
    );
  }

  // Main render with drivers list
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3>{availableDrivers.length} Driver{availableDrivers.length > 1 ? 's' : ''} Available</h3>
        <span style={styles.liveBadge}>🔴 LIVE</span>
      </div>
      
      <div style={styles.driverList}>
        {availableDrivers.map((driver) => (
          <div key={driver._id} style={styles.card}>
            <div style={styles.driverIcon}>
              <span style={{ fontSize: '2rem' }}>
                {driver.vehicleType === 'Mini' ? '🚗' : 
                 driver.vehicleType === 'Sedan' ? '🚙' : 
                 driver.vehicleType === 'SUV' ? '🚐' : '🛺'}
              </span>
            </div>
            
            <div style={styles.driverDetails}>
              <div style={styles.driverHeader}>
                <div>
                  <h4>{driver.name}</h4>
                  <p style={styles.vehicleType}>{driver.vehicleType}</p>
                </div>
                <div style={styles.rating}>
                  <FaStar color="#FFD700" />
                  <span>{driver.rating || 4.9}</span>
                </div>
              </div>
              
              <div style={styles.driverInfo}>
                <span style={styles.infoItem}>
                  <FaMapMarkerAlt /> {getDriverDistance()} min away
                </span>
                <span style={styles.infoItem}>
                  <FaClock /> {driver.vehicleNumber}
                </span>
              </div>
              
              <div style={styles.fareSection}>
                <div>
                  <span style={styles.fareLabel}>Fare</span>
                  <span style={styles.fare}>₹{getDriverFare(driver.vehicleType)}</span>
                </div>
                <button 
                  style={styles.bookBtn}
                  onClick={() => {
                    onBook(driver);
                    requestRide();
                  }}
                >
                  Book Now
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Debug info */}
      <div style={styles.debugInfo}>
        <p>📍 Pickup: {pickupLocation ? 'Set' : 'Not set'}</p>
        <p>🔌 Socket: {socket?.connected ? 'Connected' : 'Disconnected'}</p>
        <button onClick={handleRefresh} style={styles.refreshBtn}>
          🔄 Manual Refresh
        </button>
      </div>

      {showOtp && (
        <div style={styles.otpOverlay}>
          <div style={styles.otpContainer}>
            <h3>🔑 Your Ride OTP</h3>
            <div style={styles.otpDisplay}>{otp}</div>
            <p>Show this OTP to your driver to start the ride</p>
            <button onClick={() => setShowOtp(false)} style={styles.gotItBtn}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#f8f9fa'
  },
  header: {
    padding: '20px',
    background: 'white',
    borderBottom: '1px solid #eee',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  liveBadge: {
    background: '#ff4444',
    color: 'white',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '0.8rem',
    animation: 'pulse 1.5s infinite'
  },
  driverList: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  card: {
    display: 'flex',
    background: 'white',
    borderRadius: '15px',
    padding: '15px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    animation: 'slideIn 0.3s ease'
  },
  driverIcon: {
    width: '60px',
    height: '60px',
    background: '#e3f2fd',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '15px'
  },
  driverDetails: {
    flex: 1
  },
  driverHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px'
  },
  vehicleType: {
    margin: '2px 0 0',
    fontSize: '0.85rem',
    color: '#666'
  },
  rating: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: '#f5f5f5',
    padding: '4px 8px',
    borderRadius: '20px'
  },
  driverInfo: {
    display: 'flex',
    gap: '15px',
    marginBottom: '12px'
  },
  infoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '0.9rem',
    color: '#666'
  },
  fareSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid #eee',
    paddingTop: '12px'
  },
  fareLabel: {
    display: 'block',
    fontSize: '0.8rem',
    color: '#666'
  },
  fare: {
    fontSize: '1.3rem',
    fontWeight: '700',
    color: '#4CAF50'
  },
  bookBtn: {
    padding: '8px 20px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '25px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px'
  },
  loadingSpinner: {
    width: '50px',
    height: '50px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #4CAF50',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px'
  },
  noDriversContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px',
    textAlign: 'center'
  },
  noDriversIcon: {
    fontSize: '4rem',
    marginBottom: '20px',
    opacity: 0.5
  },
  retryBtn: {
    padding: '12px 30px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '25px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '20px'
  },
  debugInfo: {
    padding: '10px',
    background: '#f0f0f0',
    borderTop: '1px solid #ddd',
    fontSize: '0.8rem',
    color: '#666',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  refreshBtn: {
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    padding: '5px 10px',
    borderRadius: '5px',
    cursor: 'pointer'
  },
  searchingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px',
    background: '#f8f9fa',
    textAlign: 'center'
  },
  assignedContainer: {
    padding: '20px',
    background: '#f8f9fa',
    minHeight: '100vh'
  },
  successIcon: {
    fontSize: '4rem',
    textAlign: 'center',
    marginBottom: '20px'
  },
  tripDetails: {
    background: 'white',
    padding: '15px',
    borderRadius: '10px',
    margin: '20px 0',
    textAlign: 'left'
  },
  cancelBtn: {
    padding: '12px 30px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '25px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '20px'
  },
  driverCard: {
    display: 'flex',
    gap: '15px',
    background: 'white',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '15px'
  },
  trackBtn: {
    width: '100%',
    padding: '15px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '20px'
  },
  otpOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(5px)'
  },
  otpContainer: {
    background: 'white',
    padding: '30px',
    borderRadius: '15px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
    textAlign: 'center',
    width: '80%',
    maxWidth: '350px'
  },
  otpDisplay: {
    fontSize: '48px',
    fontWeight: 'bold',
    letterSpacing: '10px',
    color: '#4CAF50',
    padding: '20px',
    background: '#f5f5f5',
    borderRadius: '10px',
    margin: '20px 0'
  },
  gotItBtn: {
    padding: '12px 30px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '25px',
    fontSize: '16px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  liveLocationCard: {
    background: '#e3f2fd',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '15px',
    border: '1px solid #2196F3'
  },
  movingCar: {
    fontSize: '2rem',
    animation: 'moveCar 2s infinite',
    textAlign: 'center'
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
  locationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '1.1rem'
  },
  locationText: {
    fontWeight: 'bold',
    color: '#2196F3'
  },
  locationTime: {
    fontSize: '0.7rem',
    color: '#999',
    marginTop: '5px'
  },
  locationLoader: {
    width: '30px',
    height: '30px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #2196F3',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '10px auto'
  },
  locationDebug: {
    fontSize: '0.65rem',
    color: '#999',
    marginTop: '5px',
    fontFamily: 'monospace'
  },
  debugBtn: {
    marginTop: '5px',
    padding: '3px 10px',
    background: '#f0f0f0',
    border: '1px solid #ccc',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '0.7rem'
  },
  // New map styles
  mapContainer: {
    position: 'relative',
    marginBottom: '15px',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
  },
  liveStatusBadge: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    background: 'rgba(255, 68, 68, 0.9)',
    color: 'white',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    zIndex: 1000
  },
  liveDot: {
    width: '8px',
    height: '8px',
    background: 'white',
    borderRadius: '50%',
    animation: 'pulse 1.5s infinite'
  },

 rideProgressCard: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '20px',
    borderRadius: '15px',
    marginTop: '20px',
    textAlign: 'center',
    boxShadow: '0 10px 30px rgba(102, 126, 234, 0.3)'
  },
  progressHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '15px'
  },
  progressIcon: {
    fontSize: '2rem'
  },
  progressText: {
    fontSize: '1.3rem',
    fontWeight: 'bold'
  },
  driverContact: {
    display: 'flex',
    gap: '10px',
    marginTop: '20px',
    marginBottom: '15px'
  },
  contactBtn: {
    flex: 1,
    padding: '12px',
    background: 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '10px',
    color: 'white',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    backdropFilter: 'blur(5px)',
    transition: 'all 0.3s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  helpText: {
    fontSize: '0.9rem',
    opacity: 0.9,
    marginTop: '10px'
  }
};

const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.7; }
    100% { opacity: 1; }
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes moveCar {
    0% { transform: translateX(0); }
    50% { transform: translateX(10px); }
    100% { transform: translateX(0); }
  }
`;
document.head.appendChild(style);

export default Driver;


