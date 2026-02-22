import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMap } from "react-leaflet";

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

// Function to fetch route from multiple providers
async function fetchRoute(start, end, setFare, setRouteGeometry, setDistance, setDuration) {
  try {
    console.log("Fetching route from:", start, "to:", end);
    
    // Try OSRM first
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
      
      const response = await fetch(osrmUrl, {
        mode: 'cors',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const distanceInKm = route.distance / 1000;
          const durationInMin = Math.round(route.duration / 60);
          const fare = Math.round(distanceInKm * 10);
          
          console.log("OSRM Route found:", distanceInKm, "km");
          
          setFare(fare);
          setDistance(distanceInKm);
          setDuration(durationInMin);
          
          const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
          setRouteGeometry(coordinates);
          
          return;
        }
      }
    } catch (osrmError) {
      console.log("OSRM failed, trying alternative...", osrmError);
    }
    
    // Try GraphHopper as alternative (public demo endpoint)
    try {
      const graphHopperUrl = `https://graphhopper.com/api/1/route?point=${start.lat},${start.lng}&point=${end.lat},${end.lng}&vehicle=car&locale=en&key=2b3f4b5c-4b5c-4b5c-4b5c-2b3f4b5c4b5c&points_encoded=false`;
      
      const response = await fetch(graphHopperUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.paths && data.paths.length > 0) {
          const route = data.paths[0];
          const distanceInKm = route.distance / 1000;
          const durationInMin = Math.round(route.time / 60000);
          const fare = Math.round(distanceInKm * 10);
          
          console.log("GraphHopper route found:", distanceInKm, "km");
          
          setFare(fare);
          setDistance(distanceInKm);
          setDuration(durationInMin);
          
          const coordinates = route.points.coordinates.map(coord => [coord[1], coord[0]]);
          setRouteGeometry(coordinates);
          
          return;
        }
      }
    } catch (graphHopperError) {
      console.log("GraphHopper failed", graphHopperError);
    }
    
    // Try OpenRouteService as another alternative (free tier)
    try {
      const orsUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=5b3ce3597851110001cf6248c0b8f9a7f5d44f5d9a7f5d44f5d9a7f5&start=${start.lng},${start.lat}&end=${end.lng},${end.lat}`;
      
      const response = await fetch(orsUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          const route = data.features[0];
          const distanceInKm = route.properties.summary.distance / 1000;
          const durationInMin = Math.round(route.properties.summary.duration / 60);
          const fare = Math.round(distanceInKm * 10);
          
          console.log("OpenRouteService route found:", distanceInKm, "km");
          
          setFare(fare);
          setDistance(distanceInKm);
          setDuration(durationInMin);
          
          const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
          setRouteGeometry(coordinates);
          
          return;
        }
      }
    } catch (orsError) {
      console.log("OpenRouteService failed", orsError);
    }
    
    // If all routing services fail, draw a straight line and estimate
    console.log("Using straight line approximation");
    const distanceInKm = calculateDistance(start.lat, start.lng, end.lat, end.lng);
    const durationInMin = Math.round(distanceInKm * 2);
    const fare = Math.round(distanceInKm * 10);
    
    setFare(fare);
    setDistance(distanceInKm);
    setDuration(durationInMin);
    
    setRouteGeometry([
      [start.lat, start.lng],
      [end.lat, end.lng]
    ]);
    
  } catch (error) {
    console.error("All routing services failed:", error);
    
    const distanceInKm = calculateDistance(start.lat, start.lng, end.lat, end.lng);
    const fare = Math.round(distanceInKm * 10);
    
    setFare(fare);
    setDistance(distanceInKm);
    setRouteGeometry([
      [start.lat, start.lng],
      [end.lat, end.lng]
    ]);
  }
}

// Calculate straight line distance (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function FreeMap({ setFare, pickupLocation, dropLocation }) {
  const [pickup, setPickup] = useState(null);
  const [drop, setDrop] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handle when locations are passed from Home
  useEffect(() => {
    const loadRouteFromProps = async () => {
      if (pickupLocation && dropLocation) {
        console.log("Loading route for:", pickupLocation, dropLocation);
        
        setPickup(pickupLocation);
        setDrop(dropLocation);
        setLoading(true);
        setError(null);
        
        const bounds = L.latLngBounds(
          [pickupLocation.lat, pickupLocation.lng],
          [dropLocation.lat, dropLocation.lng]
        );
        setMapBounds(bounds);
        
        await fetchRoute(
          pickupLocation, 
          dropLocation, 
          setFare, 
          setRouteGeometry, 
          setDistance, 
          setDuration
        );
        
        setLoading(false);
      }
    };
    
    loadRouteFromProps();
  }, [pickupLocation, dropLocation, setFare]);

  // Reset function - COMMENTED OUT SO IT DOESN'T APPEAR
  // const resetSelection = () => {
  //   setPickup(null);
  //   setDrop(null);
  //   setRouteGeometry([]);
  //   setDistance(null);
  //   setDuration(null);
  //   setMapBounds(null);
  //   setError(null);
  //   setFare(0);
  // };

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
              <b>Pickup Location</b>
              <br />
              Lat: {pickup.lat.toFixed(4)}, Lng: {pickup.lng.toFixed(4)}
            </Popup>
          </Marker>
        )}
        
        {/* Drop Marker */}
        {drop && (
          <Marker position={[drop.lat, drop.lng]} icon={redIcon}>
            <Popup>
              <b>Drop Location</b>
              <br />
              Lat: {drop.lat.toFixed(4)}, Lng: {drop.lng.toFixed(4)}
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Trip Info Panel - NO RESET BUTTON */}
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
              <strong>Pickup:</strong> {pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)}
            </p>
          )}
          
          {drop && (
            <p style={{ margin: '5px 0', color: '#f44336', fontSize: '0.9rem' }}>
              <strong>Drop:</strong> {drop.lat.toFixed(4)}, {drop.lng.toFixed(4)}
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
          
          {distance && !loading && (
            <>
              <hr style={{ margin: '10px 0' }} />
              <p style={{ margin: '5px 0' }}>
                <strong>📏 Distance:</strong> {distance.toFixed(2)} km
              </p>
              <p style={{ margin: '5px 0' }}>
                <strong>⏱️ Duration:</strong> {duration} mins
              </p>
              <p style={{ 
                margin: '10px 0 0 0', 
                fontSize: '1.3rem', 
                color: '#4CAF50',
                fontWeight: 'bold'
              }}>
                ₹{Math.round(distance * 10)}
              </p>
              {routeGeometry.length === 2 && (
                <p style={{ margin: '5px 0', fontSize: '0.8rem', color: '#999' }}>
                  *Straight line estimate (road route unavailable)
                </p>
              )}
            </>
          )}
          
          {/* RESET BUTTON COMPLETELY REMOVED */}
        </div>
      )}
    </div>
  );
}

export default FreeMap;