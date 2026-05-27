import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function PaymentCancel() {
  const navigate = useNavigate();

  useEffect(() => {
    const savedPostpaidPayment = localStorage.getItem("pendingUserPostpaidRidePayment");
    const savedRequest = localStorage.getItem("pendingPrepaidRideRequest");
    localStorage.removeItem("pendingUserPostpaidRidePayment");
    localStorage.removeItem("pendingPrepaidRideRequest");

    if (savedPostpaidPayment) {
      const pendingPayment = JSON.parse(savedPostpaidPayment);
      const ride = pendingPayment.ride;
      navigate("/map", {
        replace: true,
        state: {
          pickupLocation: pendingPayment.pickupLocation || ride.pickupLocation,
          dropLocation: pendingPayment.dropLocation || ride.dropLocation,
          pickupAddress: pendingPayment.pickupLocation?.address || ride.pickupLocation?.address,
          dropAddress: pendingPayment.dropLocation?.address || ride.dropLocation?.address,
          paymentRide: ride,
          paymentMessage: "Payment was cancelled. Your ride payment is still pending."
        }
      });
      return;
    }

    if (!savedRequest) {
      navigate("/", { replace: true });
      return;
    }

    const rideRequest = JSON.parse(savedRequest);
    navigate("/map", {
      replace: true,
      state: {
        pickupLocation: rideRequest.pickupLocation,
        dropLocation: rideRequest.dropLocation,
        pickupAddress: rideRequest.pickupLocation?.address,
        dropAddress: rideRequest.dropLocation?.address,
        paymentMessage: "Payment was cancelled. No request was sent to the driver."
      }
    });
  }, [navigate]);

  return (
    <div style={styles.container}>
      <p>Returning to the map...</p>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f3f4f6",
    color: "#374151"
  }
};

export default PaymentCancel;
