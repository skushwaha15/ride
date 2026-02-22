import React, { useState, useCallback, useEffect } from "react";
import { GoogleMap, LoadScript, Marker, DirectionsRenderer } from "@react-google-maps/api";

const containerStyle = {
  width: '100%',
  height: '500px'
};

const defaultCenter = {
  lat: 28.6139, // Delhi
  lng: 77.2090
};

// Google Maps API Key - Replace with your actual key
const GOOGLE_MAPS_API_KEY = "YOUR_API_KEY_HERE";

function MapComponent({ setFare, pickupLocation, dropLocation }) {
  const [map, setMap] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [drop, setDrop] = useState(null);
  const [directions, setDirections] = useState(null);
  const [distance, setDistance] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const onLoad = useCallback(function callback(map) {
    setMap(map);
    setMapLoaded(true);
  }, []);

  const onUnmount = useCallback(function callback() {
    setMap(null);
    setMapLoaded(false);
  }, []);

  // Handle pickup/drop locations from Home component
  useEffect(() => {
    if (pickupLocation && dropLocation && mapLoaded) {
      console.log("Setting locations from props:", pickupLocation, dropLocation);
      
      setPickup(pickupLocation);
      setDrop(dropLocation);
      
      // Calculate route
      calculateRoute(pickupLocation, dropLocation);
      
      // Fit bounds to show both markers
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend(pickupLocation);
      bounds.extend(dropLocation);
      map.fitBounds(bounds);
    }
  }, [pickupLocation, dropLocation, mapLoaded, map]);

  // Click on map to set pickup/drop
  const handleMapClick = (event) => {
    if (!pickup) {
      const newPickup = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng()
      };
      setPickup(newPickup);
    } else if (!drop) {
      const newDrop = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng()
      };
      setDrop(newDrop);
      
      // Calculate route and fare
      calculateRoute(pickup, newDrop);
    }
  };

  const calculateRoute = (origin, destination) => {
    if (!window.google) return;
    
    const directionsService = new window.google.maps.DirectionsService();
    
    directionsService.route(
      {
        origin: origin,
        destination: destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK") {
          setDirections(result);
          
          // Calculate distance in km
          const distanceInMeters = result.routes[0].legs[0].distance.value;
          const distanceInKm = distanceInMeters / 1000;
          setDistance(distanceInKm);
          
          // Calculate fare (₹10 per km base)
          const calculatedFare = Math.round(distanceInKm * 10);
          setFare(calculatedFare);
          
          console.log("Route calculated:", distanceInKm, "km, Fare:", calculatedFare);
        } else {
          console.error("Directions request failed:", status);
        }
      }
    );
  };

  // Reset function - Commented out so it doesn't appear in UI
  // const resetSelection = () => {
  //   setPickup(null);
  //   setDrop(null);
  //   setDirections(null);
  //   setDistance(null);
  //   setFare(0);
  // };

  return (
    <div style={{ position: 'relative' }}>
      <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={pickup || defaultCenter}
          zoom={12}
          onLoad={onLoad}
          onUnmount={onUnmount}
          onClick={handleMapClick}
        >
          {/* Pickup Marker */}
          {pickup && (
            <Marker
              position={pickup}
              icon={{
                url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
              }}
              label="P"
            />
          )}
          
          {/* Drop Marker */}
          {drop && (
            <Marker
              position={drop}
              icon={{
                url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
              }}
              label="D"
            />
          )}
          
          {/* Route Line */}
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                polylineOptions: {
                  strokeColor: "#4CAF50",
                  strokeWeight: 5
                },
                suppressMarkers: true
              }}
            />
          )}
        </GoogleMap>
      </LoadScript>

      {/* Simple Info Panel - NO RESET BUTTON */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'white',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        zIndex: 1000
      }}>
        <p style={{ margin: '5px 0' }}>
          <span style={{ color: '#4CAF50' }}>●</span> Pickup
        </p>
        <p style={{ margin: '5px 0' }}>
          <span style={{ color: '#f44336' }}>●</span> Drop
        </p>
        {distance && (
          <>
            <p style={{ margin: '5px 0' }}>📏 {distance.toFixed(2)} km</p>
            <p style={{ margin: '5px 0', fontWeight: 'bold', color: '#4CAF50' }}>
              ₹{Math.round(distance * 10)}
            </p>
          </>
        )}
      </div>

      {/* Bottom Trip Details - NO RESET BUTTON */}
      {pickup && drop && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          background: 'white',
          padding: '12px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          zIndex: 1000,
          fontSize: '0.9rem'
        }}>
          <p style={{ margin: '3px 0' }}>
            <strong>📍</strong> {pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)}
          </p>
          <p style={{ margin: '3px 0' }}>
            <strong>🏁</strong> {drop.lat.toFixed(4)}, {drop.lng.toFixed(4)}
          </p>
        </div>
      )}
    </div>
  );
}

export default MapComponent;