import React, { useRef, useState, useEffect } from "react";
import FreeMap from "./FreeMap";
import Driver from "./driver";
import Book from "./book";
import RideChat from "./RideChat";
import { FaArrowLeft, FaComment, FaMapMarkerAlt, FaCar, FaClock } from "react-icons/fa";
import { useNavigate, useLocation } from "react-router-dom";
import io from "socket.io-client";
import axios from "axios";

const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:10000"
  : "https://ride-backend-w2o0.onrender.com";

function MapPage() {
  const [fare, setFare] = useState(0);
  const [showBooking, setShowBooking] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropCoords, setDropCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tripDistance, setTripDistance] = useState(null);
  const [tripDuration, setTripDuration] = useState(null);
  const [socket, setSocket] = useState(null);
  const [userId, setUserId] = useState("");
  const [currentRide, setCurrentRide] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const [rideNotice, setRideNotice] = useState("");
  const [rideOtp, setRideOtp] = useState(null);
  
  // Driver tracking states
  const [driverLocation, setDriverLocation] = useState(null);
  const [etaToPickup, setEtaToPickup] = useState(null);
  const [driverDistance, setDriverDistance] = useState(null);
  const [showDriverMap, setShowDriverMap] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const paymentRedirectStarted = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Calculate distance between two coordinates in km
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Calculate ETA based on distance (assuming average speed of 30 km/h in city)
  const calculateETA = (distanceKm) => {
    const avgSpeedKmph = 30;
    const timeHours = distanceKm / avgSpeedKmph;
    const timeMinutes = Math.ceil(timeHours * 60);
    return timeMinutes;
  };

  // Request driver location
  const requestDriverLocation = () => {
    if (socket && currentRide?._id && !isFetchingLocation) {
      setIsFetchingLocation(true);
      console.log("Requesting driver location for ride:", currentRide._id);
      socket.emit("request-driver-location", { rideId: currentRide._id });
      
      // Set timeout to reset fetching state
      setTimeout(() => setIsFetchingLocation(false), 5000);
    }
  };

  // Toggle driver map view
  const toggleDriverMap = () => {
    if (!driverLocation) {
      requestDriverLocation();
    }
    setShowDriverMap(!showDriverMap);
  };

  const handleResetTrip = () => {
    navigate("/");
  };

  const toggleChat = () => {
    setShowChat(!showChat);
  };

  const startPostRideStripePayment = async (ride) => {
    if (paymentRedirectStarted.current || !ride?._id) return;
    if (ride.paymentTiming !== "POSTPAID" || ride.paymentMethod !== "CARD" || ride.paymentStatus === "COMPLETED") {
      return;
    }

    paymentRedirectStarted.current = true;
    setRideNotice("Ride completed. Opening Stripe payment...");

    const pendingPayment = {
      ride,
      pickupLocation: pickupCoords || ride.pickupLocation,
      dropLocation: dropCoords || ride.dropLocation
    };
    localStorage.setItem("pendingUserPostpaidRidePayment", JSON.stringify(pendingPayment));

    try {
      const paymentRes = await axios.post(`${API_URL}/api/payments/create-checkout-session`, {
        rideId: ride._id,
        amount: ride.fare,
        userId: ride.userId,
        driverId: ride.driverId
      });

      if (!paymentRes.data.url) {
        throw new Error("Stripe checkout URL was not returned");
      }

      window.location.assign(paymentRes.data.url);
    } catch (error) {
      paymentRedirectStarted.current = false;
      setRideNotice(error.response?.data?.error || error.message || "Could not open Stripe payment.");
    }
  };

  useEffect(() => {
    const pickup = location.state?.pickupLocation;
    const drop = location.state?.dropLocation;
    const pickupAddress = location.state?.pickupAddress;
    const dropAddress = location.state?.dropAddress;
    const paymentRide = location.state?.paymentRide;
    const paymentMessage = location.state?.paymentMessage;

    if (pickup && drop) {
      setPickupCoords({
        ...pickup,
        address: pickup.address || pickupAddress || "Current location"
      });
      setDropCoords({
        ...drop,
        address: drop.address || dropAddress || "Destination"
      });

      if (paymentRide) {
        setCurrentRide(paymentRide);
        localStorage.setItem("currentRideId", paymentRide._id);
      }

      if (paymentMessage) {
        setRouteMessage(paymentMessage);
      }
    } else {
      alert("Please select pickup and drop first");
      navigate("/");
    }

    setLoading(false);
  }, [location.state, navigate]);

  useEffect(() => {
    let savedUserId = localStorage.getItem("userId");
    if (!savedUserId) {
      savedUserId = "user_" + Date.now();
      localStorage.setItem("userId", savedUserId);
    }
    setUserId(savedUserId);

    const newSocket = io(API_URL, {
      transports: ["websocket"],
      reconnection: true
    });

    newSocket.on("connect", () => {
      console.log("Socket connected");
      newSocket.emit("register-user", savedUserId);
    });

    newSocket.on("ride-accepted", (data) => {
      setCurrentRide((ride) => {
        const activeRideId = ride?._id || localStorage.getItem("currentRideId");
        if (String(data.rideId) !== String(activeRideId)) return ride;
        return data.ride || { ...ride, driverId: data.driverId, status: data.status };
      });
    });

    newSocket.on("ride-status-updated", (data) => {
      setCurrentRide((ride) => {
        const activeRideId = ride?._id || localStorage.getItem("currentRideId");
        if (String(data.rideId) !== String(activeRideId)) return ride;

        if (data.status === "ARRIVING") {
          setRideNotice("Your driver has arrived at the pickup location.");
        } else if (data.status === "STARTED") {
          setRideNotice("Your ride has started. Enjoy your journey.");
          setRideOtp(null);
        } else if (data.status === "COMPLETED") {
          const updatedRide = data.ride || { ...ride, status: data.status };
          if (updatedRide.paymentTiming === "POSTPAID" && updatedRide.paymentMethod === "CARD" && updatedRide.paymentStatus !== "COMPLETED") {
            startPostRideStripePayment(updatedRide);
          } else {
            setRideNotice("Your ride is completed. Thank you for riding with us.");
          }
          setRideOtp(null);
        } else if (data.status === "CANCELLED") {
          setRideNotice("This ride was cancelled.");
          setRideOtp(null);
        }

        return data.ride || { ...ride, status: data.status };
      });
    });

    newSocket.on("ride-otp", (data) => {
      const activeRideId = localStorage.getItem("currentRideId");
      const isCurrentRide = !data.rideId || String(data.rideId) === String(activeRideId);
      const isCurrentUser = !data.userId || String(data.userId) === String(savedUserId);

      if (!isCurrentRide || !isCurrentUser) return;

      setRideOtp(data.otp);
      setRideNotice("Share this OTP with your driver to start the ride.");
    });

    // Listen for driver location updates
    newSocket.on("driver-location", (data) => {
      console.log("Received driver location:", data);
      if (data.location && data.location.lat && data.location.lng) {
        setDriverLocation(data.location);
        
        // Calculate distance and ETA to pickup
        if (pickupCoords && pickupCoords.lat && pickupCoords.lng) {
          const distance = calculateDistance(
            data.location.lat,
            data.location.lng,
            pickupCoords.lat,
            pickupCoords.lng
          );
          setDriverDistance(distance);
          const eta = calculateETA(distance);
          setEtaToPickup(eta);
          console.log(`Driver distance: ${distance.toFixed(2)}km, ETA: ${eta} minutes`);
        }
      }
      setIsFetchingLocation(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.off("ride-status-updated");
      newSocket.off("ride-otp");
      newSocket.off("driver-location");
      newSocket.off("ride-accepted");
      newSocket.close();
    };
  }, [pickupCoords]); // Re-run when pickupCoords changes

  // Request driver location periodically when ride is active
  useEffect(() => {
    if (currentRide && (currentRide.status === "ACCEPTED" || currentRide.status === "ARRIVING")) {
      // Initial request
      requestDriverLocation();
      
      // Set up interval to request location every 10 seconds
      const interval = setInterval(() => {
        requestDriverLocation();
      }, 10000);
      
      return () => clearInterval(interval);
    } else {
      // Clear driver location when ride is not active
      setDriverLocation(null);
      setEtaToPickup(null);
      setDriverDistance(null);
      setShowDriverMap(false);
    }
  }, [currentRide?.status, currentRide?._id]);

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.header}>
        <FaArrowLeft
          style={styles.backIcon}
          onClick={() => navigate("/")}
        />
        <h2>Choose your ride</h2>
        <button 
          onClick={handleResetTrip}
          style={styles.resetButton}
        >
          Reset Trip
        </button>
      </div>

      {/* MAIN LEFT RIGHT */}
      <div style={styles.main}>
        {/* LEFT MAP */}
        <div style={styles.mapSide}>
          <FreeMap
            setFare={setFare}
            pickupLocation={pickupCoords}
            dropLocation={dropCoords}
            setTripDistance={setTripDistance}
            setTripDuration={setTripDuration}
            driverLocation={showDriverMap ? driverLocation : null}
            showDriverMarker={showDriverMap}
          />
        </div>

        {/* RIGHT DRIVER LIST */}
        <div style={styles.driverSide}>
          {routeMessage && (
            <div style={styles.routeMessage}>
              {routeMessage}
            </div>
          )}

          {(fare === 0 || tripDistance === null || tripDuration === null) &&
            <p>Calculating trip details...</p>
          }

          {fare > 0 && tripDistance !== null && tripDuration !== null && !showBooking && !currentRide && (
            <Driver
              fare={fare}
              onBook={(vehicle) => {
                setSelectedVehicle(vehicle);
                setShowBooking(true);
              }}
              pickupLocation={pickupCoords}
              dropLocation={dropCoords}
              distance={tripDistance}
              duration={tripDuration}
            />
          )}

          {currentRide && (
            <div style={styles.activeRideCard}>
              <div style={styles.activeRideHeader}>
                <h3 style={styles.activeRideTitle}>Your ride</h3>
                <button 
                  onClick={toggleChat}
                  style={styles.chatButton}
                >
                  <FaComment style={styles.chatIcon} />
                  {showChat ? "Hide Chat" : "Open Chat"}
                </button>
              </div>
              
              <p style={styles.activeRideText}>
                Status: <strong style={getStatusStyle(currentRide.status)}>
                  {currentRide.status || "SEARCHING"}
                </strong>
              </p>

              {rideNotice && (
                <div style={styles.rideNotice}>
                  {rideNotice}
                </div>
              )}

              {rideOtp && (
                <div style={styles.otpCard}>
                  <span style={styles.otpLabel}>Ride OTP</span>
                  <span style={styles.otpValue}>{rideOtp}</span>
                  <span style={styles.otpHint}>Show this code to your driver.</span>
                </div>
              )}
              
              {currentRide.driverName && (
                <>
                  <p style={styles.activeRideText}>
                    Driver: <strong>{currentRide.driverName}</strong>
                    {currentRide.vehicleNumber ? ` (${currentRide.vehicleNumber})` : ""}
                  </p>
                  <p style={styles.activeRideText}>
                    Vehicle: <strong>{currentRide.vehicleType}</strong>
                  </p>
                </>
              )}

              {/* Driver Tracking Section */}
              {(currentRide.status === "ACCEPTED" || currentRide.status === "ARRIVING") && (
                <div style={styles.driverTrackingSection}>
                  <div style={styles.driverInfoHeader}>
                    <FaCar style={styles.driverIcon} />
                    <span style={styles.driverInfoTitle}>Driver Location</span>
                  </div>
                  
                  {driverLocation ? (
                    <>
                      <div style={styles.etaContainer}>
                        <FaClock style={styles.etaIcon} />
                        <div>
                          <div style={styles.etaLabel}>Estimated arrival at pickup</div>
                          <div style={styles.etaValue}>
                            {etaToPickup !== null ? `${etaToPickup} minutes` : "Calculating..."}
                          </div>
                          {driverDistance !== null && (
                            <div style={styles.distanceValue}>
                              ({driverDistance.toFixed(1)} km away)
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <button 
                        onClick={toggleDriverMap}
                        style={styles.mapButton}
                      >
                        <FaMapMarkerAlt style={styles.mapButtonIcon} />
                        {showDriverMap ? "Hide Driver on Map" : "Show Driver on Map"}
                      </button>
                    </>
                  ) : (
                    <div style={styles.loadingLocation}>
                      <p>Fetching driver location...</p>
                      <button 
                        onClick={requestDriverLocation}
                        style={styles.refreshButton}
                        disabled={isFetchingLocation}
                      >
                        {isFetchingLocation ? "Fetching..." : "Refresh Location"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {currentRide.status === "SEARCHING" && (
                <p style={styles.activeRideHint}>Waiting for the driver to accept.</p>
              )}
              
              {currentRide.status === "STARTED" && (
                <p style={styles.activeRideHint}>Ride in progress. Enjoy your journey!</p>
              )}
              
              {currentRide.status === "COMPLETED" && (
                <p style={styles.activeRideHint}>Ride completed. Thank you for riding with us!</p>
              )}
              
              {/* Chat Section */}
              {showChat && (
                <div style={styles.chatContainer}>
                  <RideChat
                    socket={socket}
                    ride={currentRide}
                    participantId={userId}
                    participantType="user"
                    participantName="Rider"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* BOOKING POPUP */}
      {showBooking && (
        <Book
          fare={selectedVehicle?.selectedFare || fare}
          vehicle={selectedVehicle}
          driver={selectedVehicle}
          pickupLocation={pickupCoords}
          dropLocation={dropCoords}
          distance={tripDistance}
          duration={tripDuration}
          onClose={() => setShowBooking(false)}
          onRideRequested={(ride) => {
            console.log("Ride requested:", ride);
            setCurrentRide(ride);
            setShowBooking(false);
            setShowChat(false);
          }}
        />
      )}
    </div>
  );
}

const getStatusStyle = (status) => {
  switch(status) {
    case "ACCEPTED":
      return { color: "#4CAF50" };
    case "ARRIVING":
      return { color: "#FF9800" };
    case "STARTED":
      return { color: "#2196F3" };
    case "COMPLETED":
      return { color: "#9E9E9E" };
    default:
      return { color: "#FF5722" };
  }
};

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    flexDirection: "column"
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "15px",
    background: "white",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
  },
  backIcon: {
    fontSize: "20px",
    cursor: "pointer",
    marginRight: "10px"
  },
  resetButton: {
    padding: "8px 15px",
    background: "#f44336",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold"
  },
  main: {
    flex: 1,
    display: "flex"
  },
  mapSide: {
    width: "50%",
    height: "100%"
  },
  driverSide: {
    width: "50%",
    background: "white",
    padding: "20px",
    overflowY: "auto"
  },
  activeRideCard: {
    marginTop: "18px",
    padding: "16px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#f9fafb"
  },
  activeRideHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px"
  },
  activeRideTitle: {
    margin: "0",
    fontSize: "18px"
  },
  activeRideText: {
    margin: "6px 0",
    color: "#374151"
  },
  activeRideHint: {
    margin: "8px 0 0",
    color: "#6b7280",
    fontSize: "14px"
  },
  chatButton: {
    padding: "6px 12px",
    background: "#4CAF50",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    gap: "5px"
  },
  chatIcon: {
    fontSize: "12px"
  },
  chatContainer: {
    marginTop: "12px",
    borderTop: "1px solid #e5e7eb",
    paddingTop: "12px"
  },
  // Driver tracking styles
  driverTrackingSection: {
    marginTop: "12px",
    padding: "12px",
    background: "#f0f9ff",
    borderRadius: "8px",
    border: "1px solid #bae6fd"
  },
  driverInfoHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "12px"
  },
  driverIcon: {
    color: "#2563eb",
    fontSize: "16px"
  },
  driverInfoTitle: {
    fontWeight: "bold",
    color: "#1e40af",
    fontSize: "14px"
  },
  etaContainer: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "12px",
    padding: "10px",
    background: "white",
    borderRadius: "8px"
  },
  etaIcon: {
    color: "#f59e0b",
    fontSize: "20px",
    marginTop: "2px"
  },
  etaLabel: {
    fontSize: "11px",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  etaValue: {
    fontSize: "20px",
    fontWeight: "bold",
    color: "#1f2937"
  },
  distanceValue: {
    fontSize: "12px",
    color: "#6b7280",
    marginTop: "2px"
  },
  mapButton: {
    width: "100%",
    padding: "10px",
    background: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    marginTop: "8px"
  },
  mapButtonIcon: {
    fontSize: "14px"
  },
  loadingLocation: {
    textAlign: "center",
    padding: "10px"
  },
  refreshButton: {
    marginTop: "8px",
    padding: "6px 12px",
    background: "#6b7280",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px"
  },
  routeMessage: {
    marginBottom: "14px",
    padding: "12px",
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    borderRadius: "8px",
    color: "#047857",
    fontSize: "14px",
    fontWeight: "600"
  },
  rideNotice: {
    margin: "12px 0",
    padding: "12px",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: "8px",
    color: "#9a3412",
    fontSize: "14px",
    fontWeight: "600"
  },
  otpCard: {
    margin: "12px 0",
    padding: "16px",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "10px",
    textAlign: "center"
  },
  otpLabel: {
    display: "block",
    color: "#166534",
    fontSize: "12px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  otpValue: {
    display: "block",
    margin: "8px 0",
    color: "#14532d",
    fontSize: "34px",
    fontWeight: "800",
    letterSpacing: "8px"
  },
  otpHint: {
    display: "block",
    color: "#15803d",
    fontSize: "13px"
  }
};

export default MapPage;
