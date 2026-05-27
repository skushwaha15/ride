import React, { useEffect, useMemo, useState } from "react";
import {
  FaTimes,
  FaClock,
  FaMapMarkerAlt,
  FaCircle,
  FaShieldAlt,
  FaStar,
  FaMoneyBillWave,
  FaCreditCard,
  FaWallet,
  FaMobileAlt
} from "react-icons/fa";
import axios from 'axios';

const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:10000' 
  : 'https://ride-backend-w20.onrender.com';

function Book({ fare, vehicle, driver, pickupLocation, dropLocation, distance, duration, onClose, onRideRequested }) {
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(localStorage.getItem('paymentMethod') || 'CASH');
  const [paymentTiming, setPaymentTiming] = useState(localStorage.getItem('paymentTiming') || 'POSTPAID');
  const [resolvedPickupAddress, setResolvedPickupAddress] = useState(pickupLocation?.address || '');
  const [resolvedDropAddress, setResolvedDropAddress] = useState(dropLocation?.address || '');

  useEffect(() => {
    const resolveAddress = async (location, setter, fallback) => {
      if (!location) {
        setter(fallback);
        return;
      }

      if (location.address) {
        setter(location.address);
        return;
      }

      if (typeof location.lat !== 'number' || typeof location.lng !== 'number') {
        setter(fallback);
        return;
      }

      try {
        const res = await axios.get(`${API_URL}/api/geocode/reverse`, {
          params: { lat: location.lat, lng: location.lng }
        });
        setter(res.data.shortAddress || res.data.address || fallback);
      } catch (error) {
        setter(`${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
      }
    };

    resolveAddress(pickupLocation, setResolvedPickupAddress, 'Current location');
    resolveAddress(dropLocation, setResolvedDropAddress, 'Destination');
  }, [pickupLocation, dropLocation]);

  useEffect(() => {
    if (paymentTiming === 'PREPAID') {
      setPaymentMethod('CARD');
    }
  }, [paymentTiming]);

  const paymentOptions = useMemo(() => ([
    { id: 'CARD', icon: <FaCreditCard size={16} />, label: 'Card', helper: 'Pay after ride' },
    { id: 'CASH', icon: <FaMoneyBillWave size={16} />, label: 'Cash', helper: 'Pay after ride' },
    { id: 'UPI', icon: <FaMobileAlt size={16} />, label: 'UPI', helper: 'Pay after ride' },
    { id: 'WALLET', icon: <FaWallet size={16} />, label: 'Wallet', helper: 'Pay after ride' }
  ]), []);

  const pickupText = resolvedPickupAddress?.split(',')[0] || 'Current location';
  const dropText = resolvedDropAddress?.split(',')[0] || 'Destination';
  const formattedDistance = typeof distance === 'number' ? distance.toFixed(2) : 'Calculating';

  const handleConfirm = async () => {
    setLoading(true);
    
    try {
      let userId = localStorage.getItem('userId');
      if (!userId) {
        userId = 'user_' + Date.now();
        localStorage.setItem('userId', userId);
      }

      localStorage.setItem('paymentMethod', paymentMethod);
      localStorage.setItem('paymentTiming', paymentTiming);

      const rideRequest = {
        userId: userId,
        driverId: driver?._id,
        pickupLocation: {
          lat: pickupLocation?.lat,
          lng: pickupLocation?.lng,
          address: resolvedPickupAddress || pickupLocation?.address || 'Pickup location'
        },
        dropLocation: {
          lat: dropLocation?.lat,
          lng: dropLocation?.lng,
          address: resolvedDropAddress || dropLocation?.address || 'Drop location'
        },
        fare: fare,
        distance: distance,
        duration: duration,
        vehicleType: driver?.vehicleType || vehicle?.vehicleType || vehicle?.type || 'Mini',
        vehicleNumber: driver?.vehicleNumber || vehicle?.vehicleNumber,
        paymentMethod,
        paymentTiming,
        status: 'SEARCHING'
      };

      if (paymentTiming === 'PREPAID') {
        const bookingRef = `booking_${Date.now()}`;
        const prepaidRideRequest = {
          ...rideRequest,
          paymentMethod: 'CARD',
          paymentTiming: 'PREPAID',
          paymentStatus: 'COMPLETED',
          bookingRef
        };

        localStorage.setItem('pendingPrepaidRideRequest', JSON.stringify(prepaidRideRequest));

        const paymentRes = await axios.post(
          `${API_URL}/api/payments/create-checkout-session`,
          {
            amount: fare,
            userId,
            driverId: driver?._id,
            bookingRef
          }
        );

        if (!paymentRes.data.url) {
          throw new Error('Stripe checkout URL was not returned');
        }

        window.location.assign(paymentRes.data.url);
        return;
      }

      const res = await axios.post(`${API_URL}/api/rides/request`, rideRequest);
      
      localStorage.setItem('currentRideId', res.data.ride._id);

      onRideRequested(res.data.ride);
      onClose();
      
    } catch (error) {
      alert(error.response?.data?.error || error.message || 'Failed to request ride');
    } finally {
      setLoading(false);
    }
  };

  // Format time
  const formatTime = (minutes) => {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes)) {
      return 'Calculating';
    }

    const roundedMinutes = Math.max(1, Math.ceil(minutes));
    if (roundedMinutes < 60) return `${roundedMinutes} min`;
    const hours = Math.floor(roundedMinutes / 60);
    const mins = roundedMinutes % 60;
    return mins ? `${hours} hr ${mins} min` : `${hours} hr`;
  };

  return (
    <>
      <div style={styles.overlay}>
        <div style={styles.modal}>
        {/* Header with just close button */}
        <div style={styles.header}>
          <button onClick={onClose} style={styles.closeButton}>
            <FaTimes size={20} color="#000" />
          </button>
          <h2 style={styles.title}>Confirm ride</h2>
          <div style={styles.placeholder}></div>
        </div>

        {/* Trip Route - Simple and clean */}
        <div style={styles.routeContainer}>
          <div style={styles.routePoint}>
            <FaCircle size={8} color="#10b981" />
            <span style={styles.routeText}>{pickupText}</span>
          </div>
          <div style={styles.routeLine}></div>
          <div style={styles.routePoint}>
            <FaMapMarkerAlt size={8} color="#ef4444" />
            <span style={styles.routeText}>{dropText}</span>
          </div>
        </div>

        {/* Vehicle Card - Uber style */}
        <div style={styles.vehicleCard}>
          <div style={styles.vehicleLeft}>
            <span style={styles.vehicleIcon}>
              {vehicle?.type === 'Mini' ? '🚗' : 
               vehicle?.type === 'Sedan' ? '🚙' : 
               vehicle?.type === 'SUV' ? '🚐' : '🛺'}
            </span>
          </div>
          <div style={styles.vehicleCenter}>
            <div style={styles.vehicleNameRow}>
              <span style={styles.vehicleName}>{vehicle?.type || 'Mini'}</span>
              <span style={styles.rating}>
                <FaStar size={12} color="#fbbf24" />
                <span>{driver?.rating || 4.9}</span>
              </span>
            </div>
            <div style={styles.vehicleMeta}>
              <span style={styles.metaItem}>
                <FaClock size={12} /> {formatTime(duration)}
              </span>
              <span style={styles.metaItem}>
                📏 {formattedDistance} km
              </span>
            </div>
          </div>
          <div style={styles.vehicleRight}>
            <span style={styles.fare}>₹{fare}</span>
          </div>
        </div>

        {/* Payment Method - Simple */}
        <div style={styles.paymentCard}>
          <div style={styles.paymentHeader}>
            <span style={styles.paymentTitle}>Payment method</span>
            <span style={styles.paymentBadge}>{paymentTiming === 'PREPAID' ? 'Prepaid' : 'Postpaid'}</span>
          </div>
          <div style={styles.paymentTimingRow}>
            <button
              type="button"
              onClick={() => setPaymentTiming('POSTPAID')}
              style={{
                ...styles.paymentTimingButton,
                ...(paymentTiming === 'POSTPAID' ? styles.paymentTimingButtonSelected : {})
              }}
            >
              Pay after ride
            </button>
            <button
              type="button"
              onClick={() => setPaymentTiming('PREPAID')}
              style={{
                ...styles.paymentTimingButton,
                ...(paymentTiming === 'PREPAID' ? styles.paymentTimingButtonSelected : {})
              }}
            >
              Prepay now
            </button>
          </div>
          <div style={styles.paymentOptions}>
            {paymentOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setPaymentMethod(option.id);
                  if (option.id !== 'CARD') {
                    setPaymentTiming('POSTPAID');
                  }
                }}
                style={{
                  ...styles.paymentOption,
                  ...(paymentMethod === option.id ? styles.paymentOptionSelected : {}),
                  ...(paymentTiming === 'PREPAID' && option.id !== 'CARD' ? styles.paymentOptionDisabled : {})
                }}
                disabled={paymentTiming === 'PREPAID' && option.id !== 'CARD'}
              >
                <span style={styles.paymentOptionIcon}>{option.icon}</span>
                <span style={styles.paymentOptionText}>
                  <span style={styles.paymentLabel}>{option.label}</span>
                  <span style={styles.paymentValue}>{option.helper}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Safety Info */}
        <div style={styles.safetyCard}>
          <FaShieldAlt size={16} color="#10b981" />
          <span style={styles.safetyText}>Your safety is our priority</span>
        </div>

        {/* Confirm Button */}
          <button 
            style={styles.confirmButton}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
                <div style={styles.loader}>
                  <div style={styles.spinner}></div>
                  <span>{paymentTiming === 'PREPAID' ? 'Preparing payment...' : 'Finding driver...'}</span>
                </div>
              ) : (
              paymentTiming === 'PREPAID' ? 'Book and prepay' : 'Request ride'
            )}
          </button>

          {/* Small note */}
          <p style={styles.note}>
            {paymentTiming === 'PREPAID'
              ? 'Stripe payment opens now and the ride will be marked prepaid.'
              : 'You will complete payment after the ride.'}
          </p>
        </div>
      </div>
    </>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 2000
  },
  modal: {
    background: '#ffffff',
    width: '100%',
    maxWidth: '400px',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '20px 20px 30px 20px',
    animation: 'slideUp 0.2s ease'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    padding: '8px',
    cursor: 'pointer',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '500',
    color: '#000'
  },
  placeholder: {
    width: '36px'
  },
  routeContainer: {
    marginBottom: '24px'
  },
  routePoint: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '4px 0'
  },
  routeText: {
    fontSize: '16px',
    color: '#000',
    fontWeight: '400'
  },
  routeLine: {
    width: '2px',
    height: '20px',
    background: '#e5e7eb',
    marginLeft: '3px',
    marginTop: '2px',
    marginBottom: '2px'
  },
  vehicleCard: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 0',
    borderTop: '1px solid #f3f4f6',
    borderBottom: '1px solid #f3f4f6',
    marginBottom: '16px'
  },
  vehicleLeft: {
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '12px'
  },
  vehicleIcon: {
    fontSize: '28px'
  },
  vehicleCenter: {
    flex: 1
  },
  vehicleNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px'
  },
  vehicleName: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#000'
  },
  rating: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '14px',
    color: '#6b7280'
  },
  vehicleMeta: {
    display: 'flex',
    gap: '16px'
  },
  metaItem: {
    fontSize: '14px',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  vehicleRight: {
    textAlign: 'right'
  },
  fare: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#000'
  },
  paymentCard: {
    padding: '16px 0',
    borderBottom: '1px solid #f3f4f6',
    marginBottom: '16px',
  },
  paymentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  paymentTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#111827'
  },
  paymentBadge: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#635bff',
    background: '#eef2ff',
    padding: '4px 8px',
    borderRadius: '999px'
  },
  paymentOptions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px'
  },
  paymentTimingRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginBottom: '10px'
  },
  paymentTimingButton: {
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    background: '#fff',
    padding: '10px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151'
  },
  paymentTimingButtonSelected: {
    border: '1px solid #635bff',
    background: '#f5f3ff',
    color: '#4f46e5'
  },
  paymentOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    background: '#fff',
    padding: '12px',
    textAlign: 'left',
    cursor: 'pointer'
  },
  paymentOptionSelected: {
    border: '1px solid #635bff',
    background: '#f5f3ff'
  },
  paymentOptionDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed'
  },
  paymentOptionIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#374151',
    flexShrink: 0
  },
  paymentOptionText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  paymentLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#000'
  },
  paymentValue: {
    fontSize: '12px',
    color: '#6b7280'
  },
  safetyCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    background: '#f3f4f6',
    borderRadius: '12px',
    marginBottom: '24px'
  },
  safetyText: {
    fontSize: '14px',
    color: '#374151'
  },
  confirmButton: {
    width: '100%',
    padding: '16px',
    background: '#000',
    color: '#fff',
    border: 'none',
    borderRadius: '50px',
    fontSize: '18px',
    fontWeight: '500',
    cursor: 'pointer',
    marginBottom: '12px',
    transition: 'background 0.2s'
  },
  note: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#9ca3af',
    margin: 0
  },
  loader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
};

// Add animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

export default Book;
