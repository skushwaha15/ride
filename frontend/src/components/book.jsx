import React, { useState } from "react";
import { 
  FaUser,
  FaPhone,
  FaTimes,
  FaClock
} from "react-icons/fa";
import axios from 'axios';

function Book({ fare, vehicle, driver, pickupLocation, dropLocation, distance, duration, onClose, onRideRequested }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!name || !phone) {
      alert('Please fill all details');
      return;
    }

    setLoading(true);
    
    try {
      console.log("🚀 Sending ride request...", {
        driver,
        pickupLocation,
        dropLocation,
        fare
      });

      const res = await axios.post('http://localhost:5000/api/rides/request', {
        userId: 'user_' + Date.now(),
        driverId: driver?._id,
        pickupLocation: {
          lat: pickupLocation?.lat,
          lng: pickupLocation?.lng,
          address: pickupLocation?.address || 'Pickup location'
        },
        dropLocation: {
          lat: dropLocation?.lat,
          lng: dropLocation?.lng,
          address: dropLocation?.address || 'Drop location'
        },
        fare: fare,
        distance: distance,
        duration: duration,
        status: 'searching'
      });

      console.log("✅ Ride request response:", res.data);

      if (onRideRequested) {
        onRideRequested(res.data.ride);
      }

      alert(`🎉 Ride Request Sent!\n\nSearching for drivers near you...`);
      onClose();
      
    } catch (error) {
      console.error("❌ Error sending ride request:", error);
      alert('Failed to send ride request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Fixed Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Confirm Your Ride</h2>
          <FaTimes style={styles.closeIcon} onClick={onClose} />
        </div>

        {/* Scrollable Content */}
        <div style={styles.scrollableContent}>
          {/* Vehicle Info Card */}
          <div style={styles.vehicleCard}>
            <div style={styles.vehicleIconLarge}>
              {vehicle?.type === 'Mini' ? '🚗' : 
               vehicle?.type === 'Sedan' ? '🚙' : 
               vehicle?.type === 'SUV' ? '🚐' : '🛺'}
            </div>
            <div style={styles.vehicleDetails}>
              <div style={styles.vehicleNameRow}>
                <h3 style={styles.vehicleName}>{vehicle?.type || 'Mini'}</h3>
                <span style={styles.rating}>⭐ {driver?.rating || 4.9}</span>
              </div>
              <p style={styles.driverName}>{driver?.name || 'Professional Driver'}</p>
              <p style={styles.vehicleNumber}>{driver?.vehicleNumber || 'RJ14 XX 1234'}</p>
              <div style={styles.etaBadge}>
                <FaClock style={{ marginRight: '5px' }} /> Arrives in {vehicle?.eta || '2-3'} min
              </div>
            </div>
            <div style={styles.fareLarge}>
              <span style={styles.fareAmount}>₹{fare}</span>
              <span style={styles.fareLabel}>total</span>
            </div>
          </div>

          {/* Trip Route */}
          <div style={styles.routeCard}>
            <div style={styles.routePoint}>
              <div style={styles.pointDotGreen}></div>
              <div style={styles.pointAddress}>
                <span style={styles.pointLabel}>PICKUP</span>
                <p style={styles.address}>{pickupLocation?.address || 'Pickup location'}</p>
              </div>
            </div>
            
            <div style={styles.routeLine}></div>
            
            <div style={styles.routePoint}>
              <div style={styles.pointDotRed}></div>
              <div style={styles.pointAddress}>
                <span style={styles.pointLabel}>DROP</span>
                <p style={styles.address}>{dropLocation?.address || 'Drop location'}</p>
              </div>
            </div>
            
            <div style={styles.tripMeta}>
              <span style={styles.metaItem}>📏 {distance} km</span>
              <span style={styles.metaItem}>⏱️ {duration} mins</span>
            </div>
          </div>

          {/* Passenger Details Form */}
          <div style={styles.formSection}>
            <h4 style={styles.sectionTitle}>Passenger Details</h4>
            
            <div style={styles.inputGroup}>
              <FaUser style={styles.inputIcon} />
              <input
                style={styles.input}
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div style={styles.inputGroup}>
              <FaPhone style={styles.inputIcon} />
              <input
                style={styles.input}
                type="tel"
                placeholder="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {/* Payment Methods */}
          <div style={styles.paymentSection}>
            <h4 style={styles.sectionTitle}>Payment Method</h4>
            <div style={styles.paymentGrid}>
              <button 
                style={{
                  ...styles.paymentCard,
                  ...(paymentMethod === 'cash' && styles.paymentCardActive)
                }}
                onClick={() => setPaymentMethod('cash')}
              >
                <span style={styles.paymentEmoji}>💵</span>
                <span style={styles.paymentName}>Cash</span>
              </button>
              
              <button 
                style={{
                  ...styles.paymentCard,
                  ...(paymentMethod === 'card' && styles.paymentCardActive)
                }}
                onClick={() => setPaymentMethod('card')}
              >
                <span style={styles.paymentEmoji}>💳</span>
                <span style={styles.paymentName}>Card</span>
              </button>
              
              <button 
                style={{
                  ...styles.paymentCard,
                  ...(paymentMethod === 'upi' && styles.paymentCardActive)
                }}
                onClick={() => setPaymentMethod('upi')}
              >
                <span style={styles.paymentEmoji}>📱</span>
                <span style={styles.paymentName}>UPI</span>
              </button>
            </div>
          </div>

          {/* Price Breakdown */}
          <div style={styles.priceBreakdown}>
            <h4 style={styles.sectionTitle}>Fare Breakdown</h4>
            <div style={styles.priceRow}>
              <span>Base Fare</span>
              <span>₹{Math.round(fare * 0.8)}</span>
            </div>
            <div style={styles.priceRow}>
              <span>Distance Charge</span>
              <span>₹{Math.round(fare * 0.15)}</span>
            </div>
            <div style={styles.priceRow}>
              <span>Service Fee</span>
              <span>₹{Math.round(fare * 0.05)}</span>
            </div>
            <div style={styles.totalRow}>
              <span>Total</span>
              <span>₹{fare}</span>
            </div>
          </div>
        </div>

        {/* Fixed Footer with Confirm Button */}
        <div style={styles.footer}>
          <button 
            style={{
              ...styles.confirmButton,
              opacity: (!name || !phone || loading) ? 0.7 : 1,
              background: loading ? '#999' : '#4CAF50'
            }}
            onClick={handleConfirm}
            disabled={!name || !phone || loading}
          >
            {loading ? (
              <div style={styles.loadingContainer}>
                <div style={styles.buttonSpinner}></div>
                <span>Requesting...</span>
              </div>
            ) : (
              'Confirm & Request Ride'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(8px)',
    animation: 'fadeIn 0.3s ease'
  },
  modal: {
    background: 'white',
    borderRadius: '30px',
    width: '90%',
    maxWidth: '420px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
    animation: 'slideUp 0.3s ease'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #f0f0f0',
    background: 'white',
    borderRadius: '30px 30px 0 0'
  },
  title: {
    margin: 0,
    fontSize: '1.4rem',
    fontWeight: '600',
    color: '#333'
  },
  closeIcon: {
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: '#999',
    transition: 'color 0.2s',
    ':hover': {
      color: '#666'
    }
  },
  scrollableContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  vehicleCard: {
    display: 'flex',
    background: '#f8f9fa',
    borderRadius: '20px',
    padding: '15px',
    border: '1px solid #eee'
  },
  vehicleIconLarge: {
    fontSize: '3rem',
    marginRight: '15px'
  },
  vehicleDetails: {
    flex: 1
  },
  vehicleNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '4px'
  },
  vehicleName: {
    margin: 0,
    fontSize: '1.2rem',
    fontWeight: '600'
  },
  rating: {
    fontSize: '0.9rem',
    color: '#f39c12'
  },
  driverName: {
    margin: '2px 0',
    color: '#666',
    fontSize: '0.95rem'
  },
  vehicleNumber: {
    margin: '2px 0',
    color: '#999',
    fontSize: '0.85rem'
  },
  etaBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    background: '#e3f2fd',
    color: '#1976d2',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '0.85rem',
    marginTop: '8px'
  },
  fareLarge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center'
  },
  fareAmount: {
    fontSize: '1.6rem',
    fontWeight: '700',
    color: '#4CAF50'
  },
  fareLabel: {
    fontSize: '0.8rem',
    color: '#999'
  },
  routeCard: {
    background: '#f8f9fa',
    borderRadius: '20px',
    padding: '20px',
    border: '1px solid #eee'
  },
  routePoint: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px'
  },
  pointDotGreen: {
    width: '12px',
    height: '12px',
    background: '#4CAF50',
    borderRadius: '50%',
    marginTop: '4px',
    boxShadow: '0 0 0 3px rgba(76, 175, 80, 0.2)'
  },
  pointDotRed: {
    width: '12px',
    height: '12px',
    background: '#f44336',
    borderRadius: '50%',
    marginTop: '4px',
    boxShadow: '0 0 0 3px rgba(244, 67, 54, 0.2)'
  },
  pointAddress: {
    flex: 1
  },
  pointLabel: {
    fontSize: '0.7rem',
    color: '#999',
    letterSpacing: '0.5px'
  },
  address: {
    margin: '2px 0 0',
    fontSize: '0.95rem',
    color: '#333'
  },
  routeLine: {
    width: '2px',
    height: '30px',
    background: '#ddd',
    marginLeft: '5px',
    marginTop: '5px',
    marginBottom: '5px'
  },
  tripMeta: {
    display: 'flex',
    gap: '15px',
    marginTop: '15px',
    paddingTop: '15px',
    borderTop: '1px dashed #ddd'
  },
  metaItem: {
    fontSize: '0.9rem',
    color: '#666'
  },
  formSection: {
    background: '#f8f9fa',
    borderRadius: '20px',
    padding: '20px',
    border: '1px solid #eee'
  },
  sectionTitle: {
    margin: '0 0 15px',
    fontSize: '1.1rem',
    color: '#333'
  },
  inputGroup: {
    position: 'relative',
    marginBottom: '12px'
  },
  inputIcon: {
    position: 'absolute',
    left: '15px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#999',
    fontSize: '1rem'
  },
  input: {
    width: '100%',
    padding: '15px 15px 15px 45px',
    border: '2px solid #eee',
    borderRadius: '15px',
    fontSize: '1rem',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
    outline: 'none',
    ':focus': {
      borderColor: '#4CAF50'
    }
  },
  paymentSection: {
    background: '#f8f9fa',
    borderRadius: '20px',
    padding: '20px',
    border: '1px solid #eee'
  },
  paymentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px'
  },
  paymentCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px',
    border: '2px solid #eee',
    borderRadius: '15px',
    background: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
    gap: '8px'
  },
  paymentCardActive: {
    borderColor: '#4CAF50',
    background: '#e8f5e8'
  },
  paymentEmoji: {
    fontSize: '1.8rem'
  },
  paymentName: {
    fontSize: '0.9rem',
    fontWeight: '500'
  },
  priceBreakdown: {
    background: '#f8f9fa',
    borderRadius: '20px',
    padding: '20px',
    border: '1px solid #eee'
  },
  priceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    color: '#666'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0 0',
    marginTop: '8px',
    borderTop: '2px solid #ddd',
    fontSize: '1.2rem',
    fontWeight: '600',
    color: '#333'
  },
  footer: {
    padding: '20px',
    borderTop: '1px solid #f0f0f0',
    background: 'white',
    borderRadius: '0 0 30px 30px'
  },
  confirmButton: {
    width: '100%',
    padding: '18px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '50px',
    fontSize: '1.2rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 5px 15px rgba(76, 175, 80, 0.3)',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 20px rgba(76, 175, 80, 0.4)'
    }
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  buttonSpinner: {
    width: '20px',
    height: '20px',
    border: '3px solid rgba(255,255,255,0.3)',
    borderTop: '3px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
};

// Add animations
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(50px);
    }
    to {
      opacity: 1;
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
