import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMap } from "react-leaflet";

const API_URL = process.env.REACT_APP_API_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:10000'
  : 'https://ride-backend-w20.onrender.com');

function ChangeView({ center, bounds }) {
  const map = useMap();
  
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (center) {
      map.setView(center, 13);
    }
  }, [center, bounds, map]);
  
  return null;
}

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom marker icons
const greenIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Driver marker icon (blue)
const driverIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

async function fetchRoute(start, end, setFare, setRouteGeometry, setDistance, setDuration, setError, setRouteSource) {
  const setTripMetrics = (rawDistanceInKm, rawDurationInMin, rawFare) => {
    const normalizedDistance = Number(rawDistanceInKm.toFixed(2));
    const normalizedDuration = Math.max(1, Math.ceil(Number(rawDurationInMin)));

    setFare(Math.round(rawFare ?? normalizedDistance * 10));
    setDistance(normalizedDistance);
    setDuration(normalizedDuration);
  };

  try {
    console.log("Fetching route from:", start, "to:", end);

    // Validate coordinates
    if (!start.lat || !start.lng || !end.lat || !end.lng) {
      throw new Error("Invalid coordinates provided");
    }

    // Use the pickupLocation/dropLocation object format that server expects
    const requestBody = {
      pickupLocation: {
        lat: start.lat,
        lng: start.lng
      },
      dropLocation: {
        lat: end.lat,
        lng: end.lng
      },
      vehicleType: 'Mini'
    };

    console.log("Sending request to backend:", requestBody);

    const response = await fetch(`${API_URL}/api/fare/estimate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "OpenRouteService route request failed");
    }

    if (!data.success || data.source !== 'openrouteservice' || typeof data.distance !== 'number') {
      console.warn("ORS route not available:", data);
      throw new Error(data.error || "Real route distance is unavailable");
    }

    console.log("Backend ORS route found:", data.distance, "km");
    setTripMetrics(data.distance, data.duration, data.fare);
    
    // Convert geometry coordinates from [lng, lat] to [lat, lng] if needed
    let geometry = data.route?.geometry || [];
    if (geometry.length > 0 && geometry[0] && geometry[0].length === 2) {
      geometry = geometry.map(coord => [coord[0], coord[1]]);
    }
    
    setRouteGeometry(geometry);
    setRouteSource(data.source);
    setError(null);
  } catch (error) {
    console.error("OpenRouteService route failed:", error);
    setFare(0);
    setDistance(null);
    setDuration(null);
    setRouteGeometry([]);
    setRouteSource(null);
    setError(error.message || "Real route distance is unavailable");
  }
}

const formatDuration = (minutes) => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) {
    return 'Calculating';
  }

  const roundedMinutes = Math.max(1, Math.ceil(minutes));
  if (roundedMinutes < 60) {
    return `${roundedMinutes} min`;
  }

  const hours = Math.floor(roundedMinutes / 60);
  const mins = roundedMinutes % 60;
  return mins ? `${hours} hr ${mins} min` : `${hours} hr`;
};

// Component to handle driver marker updates
function DriverMarker({ position, show }) {
  const map = useMap();
  const markerRef = useRef(null);

  useEffect(() => {
    if (!show || !position || !position.lat || !position.lng) {
      // Remove marker if it exists
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    // Create or update driver marker
    if (!markerRef.current) {
      markerRef.current = L.marker([position.lat, position.lng], {
        icon: driverIcon,
        zIndexOffset: 100
      }).addTo(map);
      
      markerRef.current.bindPopup(`
        <div style="padding: 5px;">
          <strong>🚗 Driver Location</strong><br/>
          Your driver is here
        </div>
      `);
    } else {
      markerRef.current.setLatLng([position.lat, position.lng]);
    }

    // Optionally center map on driver when toggled
    if (show && markerRef.current) {
      map.setView([position.lat, position.lng], 14);
    }

    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    };
  }, [position, show, map]);

  return null;
}

function FreeMap({ 
  setFare, 
  pickupLocation, 
  dropLocation, 
  setTripDistance, 
  setTripDuration,
  driverLocation = null,      // New prop for driver location
  showDriverMarker = false     // New prop to control driver marker visibility
}) {
  const [pickup, setPickup] = useState(null);
  const [drop, setDrop] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [routeSource, setRouteSource] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateFare = (value) => {
    setFareEstimate(value);
    setFare(value);
  };

  const updateDistance = (value) => {
    setDistance(value);
    if (setTripDistance) {
      setTripDistance(value);
    }
  };

  const updateDuration = (value) => {
    setDuration(value);
    if (setTripDuration) {
      setTripDuration(value);
    }
  };

  // Handle when locations are passed from Home
  useEffect(() => {
    const loadRouteFromProps = async () => {
      if (pickupLocation && dropLocation) {
        console.log("Loading route for:", pickupLocation, dropLocation);
        
        setPickup(pickupLocation);
        setDrop(dropLocation);
        setLoading(true);
        setError(null);
        setRouteSource(null);
        setFareEstimate(null);
        updateDistance(null);
        updateDuration(null);
        
        const bounds = L.latLngBounds(
          [pickupLocation.lat, pickupLocation.lng],
          [dropLocation.lat, dropLocation.lng]
        );
        setMapBounds(bounds);
        
        await fetchRoute(
          pickupLocation, 
          dropLocation, 
          updateFare, 
          setRouteGeometry, 
          updateDistance, 
          updateDuration,
          setError,
          setRouteSource
        );
        
        setLoading(false);
      }
    };
    
    loadRouteFromProps();
  }, [pickupLocation, dropLocation, setFare, setTripDistance, setTripDuration]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        center={pickup || [20.5937, 78.9629]}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {pickup && drop && <ChangeView bounds={mapBounds} />}
        {pickup && !drop && <ChangeView center={[pickup.lat, pickup.lng]} />}
        
        {/* Display the route */}
        {routeGeometry.length > 0 && (
          <Polyline
            positions={routeGeometry}
            color="#4CAF50"
            weight={5}
            opacity={0.7}
          />
        )}
        
        {/* Pickup Marker */}
        {pickup && (
          <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon}>
            <Popup>
              <b>📍 Pickup Location</b>
              <br />
              {pickup.address || `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}`}
            </Popup>
          </Marker>
        )}
        
        {/* Drop Marker */}
        {drop && (
          <Marker position={[drop.lat, drop.lng]} icon={redIcon}>
            <Popup>
              <b>🏁 Drop Location</b>
              <br />
              {drop.address || `${drop.lat.toFixed(4)}, ${drop.lng.toFixed(4)}`}
            </Popup>
          </Marker>
        )}
        
        {/* Driver Marker - Only shown when ride is active and user toggles it */}
        <DriverMarker 
          position={driverLocation} 
          show={showDriverMarker && driverLocation !== null}
        />
      </MapContainer>

      {/* Trip Info Panel */}
      {(pickup || drop) && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          background: 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          zIndex: 1000,
          minWidth: '250px',
          maxWidth: '300px'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>📍 Trip Details</h4>
          
          {pickup && (
            <p style={{ margin: '5px 0', color: '#4CAF50', fontSize: '0.9rem' }}>
              <strong>Pickup:</strong> {pickup.address || `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}`}
            </p>
          )}
          
          {drop && (
            <p style={{ margin: '5px 0', color: '#f44336', fontSize: '0.9rem' }}>
              <strong>Drop:</strong> {drop.address || `${drop.lat.toFixed(4)}, ${drop.lng.toFixed(4)}`}
            </p>
          )}
          
          {loading && (
            <p style={{ margin: '10px 0', color: '#666' }}>
              🗺️ Calculating best route...
            </p>
          )}
          
          {error && (
            <p style={{ margin: '10px 0', color: '#f44336' }}>
              ⚠️ {error}
            </p>
          )}
          
          {distance !== null && !loading && (
            <>
              <hr style={{ margin: '10px 0' }} />
              <p style={{ margin: '5px 0' }}>
                <strong>📏 Distance:</strong> {distance.toFixed(2)} km
              </p>
              <p style={{ margin: '5px 0' }}>
                <strong>⏱️ Ride time:</strong> {formatDuration(duration)}
              </p>
              <p style={{ 
                margin: '10px 0 0 0', 
                fontSize: '1.3rem', 
                color: '#4CAF50',
                fontWeight: 'bold'
              }}>
                ₹{fareEstimate}
              </p>
            </>
          )}
          
          {/* Driver Info Panel - Only shown when driver is assigned */}
          {showDriverMarker && driverLocation && (
            <div style={{
              marginTop: '10px',
              padding: '10px',
              background: '#E3F2FD',
              borderRadius: '5px',
              borderLeft: '3px solid #2196F3'
            }}>
              <p style={{ margin: '0', fontSize: '0.85rem', color: '#1565C0' }}>
                🚗 Driver is on the way!
              </p>
              <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: '#1976D2' }}>
                Location: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FreeMap;