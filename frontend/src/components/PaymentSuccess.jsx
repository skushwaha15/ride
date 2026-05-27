import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:10000"
  : "https://ride-backend-w20.onrender.com";

function PaymentSuccess() {
  const [message, setMessage] = useState("Confirming your payment...");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hasHandledReturn = useRef(false);

  useEffect(() => {
    const completeStripeReturn = async () => {
      if (hasHandledReturn.current) return;
      hasHandledReturn.current = true;

      const sessionId = searchParams.get("session_id");
      const savedPostpaidPayment = localStorage.getItem("pendingUserPostpaidRidePayment");
      const savedRequest = localStorage.getItem("pendingPrepaidRideRequest");

      if (!sessionId || (!savedRequest && !savedPostpaidPayment)) {
        setMessage("Payment details were not found. Returning to the map...");
        setTimeout(() => navigate("/"), 1200);
        return;
      }

      try {
        const verifyRes = await axios.get(`${API_URL}/api/payments/checkout-session/${sessionId}`);
        if (verifyRes.data.paymentStatus !== "paid") {
          throw new Error("Stripe payment was not completed");
        }

        if (savedPostpaidPayment) {
          const pendingPayment = JSON.parse(savedPostpaidPayment);
          const ride = pendingPayment.ride;

          setMessage("Payment complete. Confirming your ride payment...");

          await axios.post(`${API_URL}/api/payments/confirm`, {
            rideId: ride._id,
            paymentMethod: "CARD",
            paymentTiming: "POSTPAID"
          });

          const rideRes = await axios.get(`${API_URL}/api/rides/${ride._id}`);
          localStorage.removeItem("pendingUserPostpaidRidePayment");

          navigate("/map", {
            replace: true,
            state: {
              pickupLocation: pendingPayment.pickupLocation || ride.pickupLocation,
              dropLocation: pendingPayment.dropLocation || ride.dropLocation,
              pickupAddress: pendingPayment.pickupLocation?.address || ride.pickupLocation?.address,
              dropAddress: pendingPayment.dropLocation?.address || ride.dropLocation?.address,
              paymentRide: rideRes.data.ride,
              paymentMessage: "Payment successful. Your ride is completed."
            }
          });
          return;
        }

        const rideRequest = JSON.parse(savedRequest);

        setMessage("Payment complete. Sending your request to the driver...");

        const rideRes = await axios.post(`${API_URL}/api/rides/request`, {
          ...rideRequest,
          paymentMethod: "CARD",
          paymentTiming: "PREPAID",
          paymentStatus: "COMPLETED",
          stripeCheckoutSessionId: sessionId
        });

        localStorage.setItem("currentRideId", rideRes.data.ride._id);
        localStorage.removeItem("pendingPrepaidRideRequest");

        navigate("/map", {
          replace: true,
          state: {
            pickupLocation: rideRequest.pickupLocation,
            dropLocation: rideRequest.dropLocation,
            pickupAddress: rideRequest.pickupLocation?.address,
            dropAddress: rideRequest.dropLocation?.address,
            paymentRide: rideRes.data.ride,
            paymentMessage: "Payment successful. Waiting for the driver to accept."
          }
        });
      } catch (error) {
        console.error("Prepaid booking completion failed:", error);
        setMessage(error.response?.data?.error || error.message || "Payment succeeded, but the ride request could not be sent.");
      }
    };

    completeStripeReturn();
  }, [navigate, searchParams]);

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <h2 style={styles.title}>Ride payment</h2>
        <p style={styles.message}>{message}</p>
      </div>
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
    padding: "20px"
  },
  panel: {
    width: "100%",
    maxWidth: "420px",
    background: "#fff",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
    textAlign: "center"
  },
  title: {
    margin: "0 0 12px",
    color: "#111827"
  },
  message: {
    margin: 0,
    color: "#4b5563",
    lineHeight: 1.5
  }
};

export default PaymentSuccess;
