import React, { useState, useEffect } from 'react';
import { FaUser, FaStar, FaClock, FaMapMarkerAlt } from "react-icons/fa";
import axios from 'axios';
import { io } from 'socket.io-client';

function Driver({ fare, onBook, pickupLocation, dropLocation, distance, duration }) {
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState(null);
  
  // User side states
  const [searchingForDriver, setSearchingForDriver] = useState(false);
  const [rideStatus, setRideStatus] = useState(null);
  const [assignedDriver, setAssignedDriver] = useState(null);

  // Socket listeners for ride updates
useEffect(() => {
  if (!socket) return;

  socket.on('ride-accepted', (data) => {
    console.log("✅ Ride accepted by driver:", data);
    setSearchingForDriver(false);
    setRideStatus('accepted');
    setAssignedDriver(data.driverId);
  });

  socket.on('ride-rejected', (data) => {
    console.log("❌ Ride rejected:", data);
    setSearchingForDriver(false);
    alert('Driver rejected your ride. Finding another driver...');
    requestRide();
  });

  return () => {
    socket.off('ride-accepted');
    socket.off('ride-rejected');
  };

// eslint-disable-next-line react-hooks/exhaustive-deps
}, [socket]);
 

  // Request ride function
  const requestRide = async () => {
    if (!pickupLocation || !dropLocation) {
      alert('Please select pickup and drop locations first');
      return;
    }

    setSearchingForDriver(true);
    
    try {
      const res = await axios.post('http://localhost:5000/api/rides/request', {
        userId: localStorage.getItem('userId') || 'user_' + Date.now(), // Generate temporary user ID
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
      
      // Save ride ID for tracking
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

  useEffect(() => {
    // Connect to socket
    const newSocket = io('http://localhost:5000', {
      transports: ['websocket'],
      reconnection: true
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Connected to server');
    });

    // Load drivers immediately
    loadAvailableDrivers();

    // Listen for new drivers
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

    // Listen for drivers going offline
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
      
      const res = await axios.get('http://localhost:5000/api/drivers/available', {
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
          <p>📍 From: {pickupLocation?.address || 'Pickup'}</p>
          <p>🏁 To: {dropLocation?.address || 'Drop'}</p>
          <p>💰 Fare: ₹{fare}</p>
          <p>📏 Distance: {distance} km</p>
        </div>
        <button onClick={cancelSearch} style={styles.cancelBtn}>
          Cancel Search
        </button>
      </div>
    );
  }

  // Show driver assigned screen
  if (rideStatus === 'accepted') {
    return (
      <div style={styles.assignedContainer}>
        <div style={styles.successIcon}>✅</div>
        <h3>Driver Assigned!</h3>
        <p>Your driver is on the way</p>
        <div style={styles.driverInfo}>
          <div style={styles.driverCard}>
            <FaUser size={40} />
            <div>
              <h4>Driver {assignedDriver}</h4>
              <p>⚡ 5 min away</p>
              <p>🚗 Vehicle: Swift (RJ14 XX 1234)</p>
            </div>
          </div>
          <div style={styles.tripDetails}>
            <p>📍 Pickup: {pickupLocation?.address || 'Pickup location'}</p>
            <p>🏁 Drop: {dropLocation?.address || 'Drop location'}</p>
            <p>💰 Fare: ₹{fare}</p>
          </div>
        </div>
        <button style={styles.trackBtn}>Track Driver</button>
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
  // New styles for ride features
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
  }
};

// Add animations
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
`;
document.head.appendChild(style);

export default Driver;
