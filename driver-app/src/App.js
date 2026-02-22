import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

function App() {
  const [driver, setDriver] = useState(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [location, setLocation] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    vehicleType: 'Mini',
    vehicleNumber: ''
  });
  
  // Ride requests states
  const [rideRequests, setRideRequests] = useState([]);
  const [currentRide, setCurrentRide] = useState(null);
  
  const processedRideIds = useRef(new Set());

  // Load saved driver on startup
  useEffect(() => {
    const savedDriver = localStorage.getItem('driver');
    if (savedDriver) {
      try {
        const driverData = JSON.parse(savedDriver);
        setDriver(driverData);
        setIsAvailable(driverData.isAvailable || false);
        console.log("✅ Loaded saved driver:", driverData);
      } catch (e) {
        console.error("Error loading saved driver:", e);
      }
    }
  }, []);

  // Setup socket and location tracking when driver is logged in
  useEffect(() => {
    if (!driver) return;

    // Connect to socket
    const newSocket = io('http://localhost:5000', {
      transports: ['websocket'],
      reconnection: true
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Socket connected with ID:', newSocket.id);
      
      // 👇 IMPORTANT: When socket connects, if driver was online, re-emit online event
      if (isAvailable && location) {
        console.log("🔄 Re-emitting online status after reconnection");
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

    // Remove existing listeners
    newSocket.off('new-ride-request');
    
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
    newSocket.off('ride-updated');
    
    newSocket.on('ride-updated', (data) => {
      if (data.status === 'cancelled') {
        setCurrentRide(null);
      }
    });

    // Start watching location
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const newLocation = { lat: latitude, lng: longitude };
          setLocation(newLocation);
          console.log("📍 Location updated:", newLocation);
          
          // If online, update location via socket and API
          if (isAvailable && newSocket.connected) {
            // Update via socket for real-time
            newSocket.emit('driver-location-update', {
              driverId: driver._id,
              lat: latitude,
              lng: longitude
            });
            
            // Also update via API to ensure DB is updated
            axios.post('http://localhost:5000/api/driver/update-location', {
              driverId: driver._id,
              lat: latitude,
              lng: longitude,
              isAvailable: true
            }).catch(err => console.log("Location update error:", err));
          }
        },
        (error) => {
          console.error('❌ Geolocation error:', error);
          alert('Please enable location access for the app');
        },
        { 
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
        newSocket.off('new-ride-request');
        newSocket.off('ride-updated');
        newSocket.close();
        processedRideIds.current.clear();
      };
    } else {
      alert('Geolocation is not supported by your browser');
      
      return () => {
        newSocket.off('new-ride-request');
        newSocket.off('ride-updated');
        newSocket.close();
        processedRideIds.current.clear();
      };
    }
  }, [driver, isAvailable]);

  const handleRegister = async () => {
    if (!form.name || !form.phone || !form.vehicleNumber) {
      alert('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      console.log("📝 Registering with:", form);
      const res = await axios.post('http://localhost:5000/api/driver/register', form);
      console.log("📦 Register response:", res.data);
      
      if (res.data.success) {
        const driverData = res.data.driver;
        localStorage.setItem('driver', JSON.stringify(driverData));
        setDriver(driverData);
        setIsAvailable(false);
        alert('✅ Registration successful!');
      }
    } catch (error) {
      console.error("❌ Registration error:", error);
      alert('Registration failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const toggleAvailability = async () => {
    if (!location) {
      alert('📍 Getting your location... Please wait a moment');
      return;
    }

    if (!driver || !driver._id) {
      alert('❌ Driver not properly registered');
      return;
    }

    setLoading(true);
    try {
      const newStatus = !isAvailable;
      console.log("🚗 Toggling to:", newStatus ? "ONLINE" : "OFFLINE");
      console.log("📍 Current location:", location);
      
      // First update via API
      const res = await axios.post('http://localhost:5000/api/driver/update-location', {
        driverId: driver._id,
        lat: location.lat,
        lng: location.lng,
        isAvailable: newStatus
      });
      
      console.log("📦 API Response:", res.data);
      
      if (res.data.success) {
        // Update local state
        setIsAvailable(newStatus);
        
        // Then emit socket event
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
            socket.emit('driver-offline', { 
              driverId: driver._id 
            });
          }
          alert(`✅ You are now ${newStatus ? 'ONLINE' : 'OFFLINE'}!`);
        } else {
          alert('⚠️ Socket not connected, but status updated');
        }
        
        // Update localStorage
        const updatedDriver = { ...driver, isAvailable: newStatus };
        localStorage.setItem('driver', JSON.stringify(updatedDriver));
        setDriver(updatedDriver);
      }
    } catch (error) {
      console.error("❌ Error details:", error);
      alert('Failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Accept ride function
  const acceptRide = async (rideId) => {
    try {
      const res = await axios.post('http://localhost:5000/api/rides/accept', {
        rideId,
        driverId: driver._id
      });
      
      if (res.data.success) {
        setCurrentRide(res.data.ride);
        setRideRequests(prev => prev.filter(r => r.rideId !== rideId));
        alert('✅ Ride accepted!');
      }
    } catch (error) {
      console.error("Error accepting ride:", error);
      alert('Failed to accept ride');
    }
  };

  // Reject ride function
  const rejectRide = async (rideId) => {
    try {
      await axios.post('http://localhost:5000/api/rides/reject', { rideId });
      setRideRequests(prev => prev.filter(r => r.rideId !== rideId));
    } catch (error) {
      console.error("Error rejecting ride:", error);
    }
  };

  const handleLogout = () => {
    if (isAvailable) {
      alert('Please go offline first before logging out');
      return;
    }
    localStorage.removeItem('driver');
    setDriver(null);
    setIsAvailable(false);
    if (socket) {
      socket.close();
    }
  };

  // Registration form
  if (!driver) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.logo}>🚖</div>
        <h2 style={styles.title}>Driver Registration</h2>
        
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
          placeholder="Vehicle Number (e.g., RJ14XX1234)"
          style={styles.input}
          value={form.vehicleNumber}
          onChange={(e) => setForm({...form, vehicleNumber: e.target.value})}
        />
        
        <button 
          style={styles.registerBtn} 
          onClick={handleRegister}
          disabled={loading}
        >
          {loading ? 'Registering...' : 'Register & Start Driving'}
        </button>
        
        <p style={styles.note}>
          ⚠️ Make sure your location is enabled
        </p>
      </div>
    );
  }

  // Driver dashboard
  return (
    <div style={styles.container}>
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

      {/* Status Card - Show online status prominently */}
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
          Socket: {socket?.connected ? '✅ Connected' : '❌ Disconnected'} | 
          Status: {isAvailable ? '🟢 Online' : '🔴 Offline'}
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
                <p><strong>📏 Distance:</strong> {ride.distance} km</p>
              </div>
              <div style={styles.rideActions}>
                <button 
                  onClick={() => acceptRide(ride.rideId)}
                  style={styles.acceptBtn}
                >
                  ✅ Accept
                </button>
                <button 
                  onClick={() => rejectRide(ride.rideId)}
                  style={styles.rejectBtn}
                >
                  ❌ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Current Ride Section */}
      {currentRide && (
        <div style={styles.currentRideCard}>
          <h3>🟢 Current Ride</h3>
          <p>Ride in progress...</p>
          <button style={styles.completeBtn}>Complete Ride</button>
        </div>
      )}

      {/* Vehicle Info */}
      <div style={styles.infoCard}>
        <h3>🚖 Vehicle Details</h3>
        <div style={styles.infoRow}>
          <span>Number:</span>
          <strong>{driver.vehicleNumber}</strong>
        </div>
        <div style={styles.infoRow}>
          <span>Type:</span>
          <strong>{driver.vehicleType}</strong>
        </div>
      </div>

      {/* Stats */}
      <div style={styles.statsCard}>
        <h3>📊 Today's Stats</h3>
        <div style={styles.statsGrid}>
          <div style={styles.statItem}>
            <span style={styles.statValue}>0</span>
            <span style={styles.statLabel}>Trips</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statValue}>₹0</span>
            <span style={styles.statLabel}>Earnings</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statValue}>4.9⭐</span>
            <span style={styles.statLabel}>Rating</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <p style={styles.status}>
          Status: {isAvailable ? '🟢 Online' : '🔴 Offline'}
        </p>
        <button onClick={handleLogout} style={styles.logoutBtn}>
          Logout
        </button>
      </div>
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
  completeBtn: {
    width: '100%',
    padding: '10px',
    background: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    marginTop: '10px',
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
  }
};

export default App;