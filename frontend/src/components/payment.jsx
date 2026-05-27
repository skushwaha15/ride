import React, { useState, useEffect } from 'react';
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import axios from 'axios';

const STRIPE_PUBLISHABLE_KEY = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:10000' 
  : 'https://ride-backend-w20.onrender.com';

const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': { color: '#aab7c4' },
    },
  },
};

const PaymentMethodCard = ({ icon, label, selected, onClick, disabled }) => (
  <div 
    onClick={!disabled ? onClick : null}
    style={{
      ...styles.methodCard,
      ...(selected && styles.methodCardSelected),
      ...(disabled && styles.methodCardDisabled)
    }}
  >
    <span style={styles.methodIcon}>{icon}</span>
    <span style={styles.methodLabel}>{label}</span>
    {selected && <span style={styles.checkmark}>✓</span>}
  </div>
);

const CardPaymentForm = ({ amount, rideDetails, onSuccess, onError }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState('');

  useEffect(() => {
    const createPaymentIntent = async () => {
      try {
        const res = await axios.post(`${API_URL}/api/payments/create-intent`, {
          rideId: rideDetails.rideId,
          userId: rideDetails.userId,
          driverId: rideDetails.driverId,
          amount,
          paymentMethod: 'CARD',
          paymentTiming: rideDetails.paymentTiming || 'POSTPAID'
        });
        setClientSecret(res.data.clientSecret);
      } catch (error) {
        onError("Failed to initialize payment");
      }
    };
    
    createPaymentIntent();
  }, [amount, rideDetails]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) return;

    setProcessing(true);

    const cardNumberElement = elements.getElement(CardNumberElement);

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardNumberElement,
        billing_details: { name: 'Ride Payment' },
      }
    });

    if (error) {
      onError(error.message);
      setProcessing(false);
    } else if (paymentIntent.status === 'succeeded') {
      try {
        await axios.post(`${API_URL}/api/payments/verify`, {
          paymentIntentId: paymentIntent.id
        });
        onSuccess();
      } catch (err) {
        onError("Payment verification failed");
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.cardForm}>
      <div style={styles.cardField}>
        <label style={styles.cardLabel}>Card number</label>
        <div style={styles.cardElementContainer}>
          <CardNumberElement options={cardElementOptions} />
        </div>
      </div>

      <div style={styles.cardFieldsRow}>
        <div style={styles.cardField}>
          <label style={styles.cardLabel}>Expiry date</label>
          <div style={styles.cardElementContainer}>
            <CardExpiryElement options={cardElementOptions} />
          </div>
        </div>

        <div style={styles.cardField}>
          <label style={styles.cardLabel}>CVV</label>
          <div style={styles.cardElementContainer}>
            <CardCvcElement options={cardElementOptions} />
          </div>
        </div>
      </div>

      <button 
        type="submit" 
        disabled={!stripe || processing || !clientSecret}
        style={styles.payButton}
      >
        {processing ? 'Processing...' : `Pay ₹${amount}`}
      </button>
    </form>
  );
};

function Payment({ isOpen, onClose, amount, rideDetails, onPaymentComplete, userType = 'user', cardOnly = false }) {
  const [selectedMethod, setSelectedMethod] = useState(rideDetails?.paymentMethod || null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSelectedMethod(cardOnly ? 'CARD' : rideDetails?.paymentMethod || null);
    setError(null);
    setSuccess(false);
  }, [rideDetails, isOpen, cardOnly]);

  const paymentMethods = [
    { id: 'CASH', icon: '💵', label: 'Cash', component: null },
    { id: 'CARD', icon: '💳', label: 'Card', component: 'card' },
    { id: 'UPI', icon: '📱', label: 'UPI', component: null },
    { id: 'WALLET', icon: '👛', label: 'Wallet', component: null }
  ];

  const handlePayment = async () => {
    if (!selectedMethod) {
      setError('Please select a payment method');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      if (selectedMethod === 'CASH' || selectedMethod === 'UPI' || selectedMethod === 'WALLET') {
        const res = await axios.post(`${API_URL}/api/payments/confirm`, {
          rideId: rideDetails.rideId,
          paymentMethod: selectedMethod,
          paymentTiming: rideDetails.paymentTiming || 'POSTPAID'
        });
        
        if (res.data.success) {
          setSuccess(true);
          setTimeout(() => {
            onPaymentComplete(res.data.payment);
          }, 2000);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed');
      setProcessing(false);
    }
  };

  const handleCardSuccess = () => {
    setSuccess(true);
    setTimeout(() => {
      onPaymentComplete();
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
        
        <h2 style={styles.title}>
          {userType === 'driver' ? 'Collect Payment' : 'Complete Payment'}
        </h2>
        
        {success ? (
          <div style={styles.successContainer}>
            <span style={styles.successIcon}>✅</span>
            <h3>Payment Successful!</h3>
            <p style={styles.amount}>₹{amount}</p>
            <p>Thank you for riding with us</p>
          </div>
        ) : (
          <>
            <div style={styles.amountContainer}>
              <span style={styles.amountLabel}>Total Amount</span>
              <span style={styles.amount}>₹{amount}</span>
            </div>

            {!cardOnly && (
              <div style={styles.methodsContainer}>
                <h3>Select Payment Method</h3>
                <div style={styles.methodsGrid}>
                  {paymentMethods.map(method => (
                    <PaymentMethodCard
                      key={method.id}
                      icon={method.icon}
                      label={method.label}
                      selected={selectedMethod === method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      disabled={processing}
                    />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div style={styles.errorContainer}>
                <span>❌ {error}</span>
              </div>
            )}

            {selectedMethod === 'CARD' ? (
              stripePromise ? (
                <Elements stripe={stripePromise}>
                  <CardPaymentForm 
                    amount={amount}
                    rideDetails={rideDetails}
                    onSuccess={handleCardSuccess}
                    onError={setError}
                  />
                </Elements>
              ) : (
                <div style={styles.errorContainer}>
                  <span>❌ Stripe publishable key is missing. Add `REACT_APP_STRIPE_PUBLISHABLE_KEY` in frontend/.env.</span>
                </div>
              )
            ) : selectedMethod && (
              <button 
                onClick={handlePayment}
                disabled={processing}
                style={styles.confirmButton}
              >
                {processing ? 'Processing...' : 
                 userType === 'driver' ? `Collect ₹${amount}` : `Pay ₹${amount}`}
              </button>
            )}
          </>
        )}
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(5px)',
    overflowY: 'auto',
    padding: '24px 0',
    boxSizing: 'border-box'
  },
  modal: {
    backgroundColor: 'white',
    padding: '30px',
    borderRadius: '20px',
    width: '90%',
    maxWidth: '500px',
    maxHeight: 'calc(100vh - 48px)',
    overflowY: 'auto',
    position: 'relative',
    boxSizing: 'border-box'
  },
  closeBtn: {
    position: 'absolute',
    top: '15px',
    right: '15px',
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#666'
  },
  title: {
    textAlign: 'center',
    marginBottom: '30px',
    color: '#333'
  },
  amountContainer: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '20px',
    borderRadius: '15px',
    textAlign: 'center',
    marginBottom: '30px'
  },
  amountLabel: {
    display: 'block',
    fontSize: '0.9rem',
    opacity: 0.9,
    marginBottom: '5px'
  },
  amount: {
    display: 'block',
    fontSize: '2.5rem',
    fontWeight: 'bold'
  },
  methodsContainer: {
    marginBottom: '30px'
  },
  methodsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
    marginTop: '15px'
  },
  methodCard: {
    padding: '15px',
    border: '2px solid #eee',
    borderRadius: '10px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s',
    position: 'relative'
  },
  methodCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#e8f5e8'
  },
  methodCardDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  methodIcon: {
    fontSize: '2rem',
    display: 'block',
    marginBottom: '5px'
  },
  methodLabel: {
    fontSize: '0.9rem',
    color: '#666'
  },
  checkmark: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    color: '#4CAF50',
    fontWeight: 'bold'
  },
  confirmButton: {
    width: '100%',
    padding: '15px',
    background: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '20px'
  },
  cardForm: {
    marginTop: '20px'
  },
  cardField: {
    marginBottom: '15px'
  },
  cardFieldsRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  cardLabel: {
    display: 'block',
    marginBottom: '6px',
    color: '#333',
    fontSize: '0.9rem',
    fontWeight: '600'
  },
  cardElementContainer: {
    padding: '15px',
    border: '2px solid #ddd',
    borderRadius: '10px',
    background: 'white'
  },
  payButton: {
    width: '100%',
    padding: '15px',
    background: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  errorContainer: {
    padding: '10px',
    background: '#ffebee',
    color: '#f44336',
    borderRadius: '5px',
    margin: '20px 0',
    textAlign: 'center'
  },
  successContainer: {
    textAlign: 'center',
    padding: '40px 20px'
  },
  successIcon: {
    fontSize: '4rem',
    display: 'block',
    marginBottom: '20px'
  }
};

export default Payment;
