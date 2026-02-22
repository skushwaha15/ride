import React, { useState, useEffect } from "react";
import FreeMap from "./FreeMap";
import Driver from "./driver";
import Book from "./book";
import { FaArrowLeft } from "react-icons/fa";
import { useNavigate, useLocation } from "react-router-dom";

function MapPage() {

  const [fare, setFare] = useState(0);
  const [showBooking, setShowBooking] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropCoords, setDropCoords] = useState(null);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();

  // Reset trip function - Navigate to home
  const handleResetTrip = () => {
    navigate("/");  // Home page pe le jao
  };

  useEffect(() => {

    const pickup = location.state?.pickupLocation;
    const drop = location.state?.dropLocation;

    if (pickup && drop) {

      setPickupCoords(pickup);
      setDropCoords(drop);

    }

    else {

      alert("Please select pickup and drop first");

      navigate("/");

    }

    setLoading(false);

  }, [location.state, navigate]);


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

        {/* RESET TRIP BUTTON - RIGHT SIDE */}
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

          />

        </div>




        {/* RIGHT DRIVER LIST */}

        <div style={styles.driverSide}>


          {fare === 0 &&

            <p>Calculating fare...</p>

          }



          {fare > 0 && !showBooking && (

            <Driver

              fare={fare}

              onBook={(vehicle) => {

                setSelectedVehicle(vehicle);

                setShowBooking(true);

              }}

              pickupLocation={pickupCoords}
              dropLocation={dropCoords}
              distance={57.20}
              duration={114}

            />

          )}


        </div>



      </div>




      {/* BOOKING POPUP */}

      {showBooking && (

        <Book

          fare={fare}
          vehicle={selectedVehicle}
          driver={selectedVehicle}
          pickupLocation={pickupCoords}
          dropLocation={dropCoords}
          distance={57.20}
          duration={114}
          onClose={() => setShowBooking(false)}
          onRideRequested={(ride) => {
            console.log("Ride requested:", ride);
            setShowBooking(false);
          }}

        />

      )}


    </div>

  );

}



const styles = {

  container: {
    height: "100vh",
    display: "flex",
    flexDirection: "column"
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",  // Changed to space-between
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
  }

};


export default MapPage;