import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  FaEnvelope, 
  FaLock, 
  FaUser, 
  FaArrowRight, 
  FaCar,
  FaShieldAlt,
  FaClock,
  FaCheckCircle,
  FaTimesCircle
} from 'react-icons/fa';

const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:10000' 
  : 'https://ride-backend-w20.onrender.com';

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [focused, setFocused] = useState(null);

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleSendOtp = async () => {
    if (!email || !email.includes('@') || !email.includes('.')) {
      setError('Please enter a valid email address');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const res = await axios.post(`${API_URL}/api/send-email-otp`, { email });
      
      if (res.data.success) {
        setStep(2);
        setTimer(300);
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Please enter 6-digit OTP');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const res = await axios.post(`${API_URL}/api/verify-email-otp`, {
        email,
        otp
      });
      
      if (res.data.success) {
        if (res.data.exists) {
          localStorage.setItem('user', JSON.stringify(res.data.user));
          navigate('/');
        } else {
          setStep(3);
        }
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    
    setLoading(true);
    
    try {
      const res = await axios.post(`${API_URL}/api/users/register`, {
        email,
        name
      });
      
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/');
    } catch (error) {
      setError(error.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/send-email-otp`, { email });
      setTimer(300);
    } catch (error) {
      setError('Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.container}>
      {/* Animated Background */}
      <div style={styles.background}>
        <div style={styles.gradientOverlay}></div>
        <div style={styles.pattern}></div>
      </div>

      {/* Main Content */}
      <div style={styles.content}>
        {/* Logo Section */}
        <div style={styles.logoSection}>
          <div style={styles.logoWrapper}>
            <FaCar style={styles.logoIcon} />
            <h1 style={styles.logoText}>RIDE</h1>
          </div>
          <p style={styles.tagline}>Your journey begins here</p>
        </div>

        {/* Card */}
        <div style={styles.card}>
          {/* Progress Bar */}
          <div style={styles.progressContainer}>
            <div style={styles.progressBar}>
              <div 
                style={{
                  ...styles.progressFill,
                  width: step === 1 ? '33%' : step === 2 ? '66%' : '100%'
                }}
              />
            </div>
            <div style={styles.steps}>
              <div style={styles.stepItem}>
                <div style={{
                  ...styles.stepDot,
                  ...(step >= 1 ? styles.stepDotActive : {})
                }}>1</div>
                <span style={styles.stepLabel}>Email</span>
              </div>
              <div style={styles.stepItem}>
                <div style={{
                  ...styles.stepDot,
                  ...(step >= 2 ? styles.stepDotActive : {})
                }}>2</div>
                <span style={styles.stepLabel}>Verify</span>
              </div>
              <div style={styles.stepItem}>
                <div style={{
                  ...styles.stepDot,
                  ...(step >= 3 ? styles.stepDotActive : {})
                }}>3</div>
                <span style={styles.stepLabel}>Profile</span>
              </div>
            </div>
          </div>

          {/* Step 1: Email */}
          {step === 1 && (
            <div style={styles.formContainer}>
              <h2 style={styles.title}>Welcome Back!</h2>
              <p style={styles.subtitle}>Enter your email to continue</p>
              
              {error && (
                <div style={styles.errorMessage}>
                  <FaTimesCircle style={styles.errorIcon} />
                  <span>{error}</span>
                </div>
              )}
              
              <div style={styles.inputGroup}>
                <FaEnvelope style={styles.inputIcon} />
                <input
                  style={{
                    ...styles.input,
                    ...(focused === 'email' ? styles.inputFocused : {})
                  }}
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                />
              </div>
              
              <button 
                style={{
                  ...styles.button,
                  ...(loading && styles.buttonDisabled)
                }}
                onClick={handleSendOtp}
                disabled={loading}
              >
                {loading ? (
                  <div style={styles.loader} />
                ) : (
                  <>
                    Continue
                    <FaArrowRight style={styles.buttonIcon} />
                  </>
                )}
              </button>

              <div style={styles.securityNote}>
                <FaShieldAlt style={styles.securityIcon} />
                <span>We'll never share your email</span>
              </div>
            </div>
          )}

          {/* Step 2: OTP */}
          {step === 2 && (
            <div style={styles.formContainer}>
              <h2 style={styles.title}>Verification Code</h2>
              <p style={styles.subtitle}>
                We've sent a code to <strong>{email}</strong>
              </p>
              
              {error && (
                <div style={styles.errorMessage}>
                  <FaTimesCircle style={styles.errorIcon} />
                  <span>{error}</span>
                </div>
              )}
              
              <div style={styles.otpContainer}>
                <input
                  style={styles.otpInput}
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0,6))}
                  maxLength="6"
                />
              </div>
              
              {timer > 0 ? (
                <div style={styles.timerContainer}>
                  <FaClock style={styles.timerIcon} />
                  <span>Code expires in {formatTime(timer)}</span>
                </div>
              ) : (
                <button 
                  style={styles.resendButton}
                  onClick={handleResendOtp}
                  disabled={loading}
                >
                  Resend Code
                </button>
              )}
              
              <button 
                style={{
                  ...styles.button,
                  ...((loading || otp.length !== 6) && styles.buttonDisabled)
                }}
                onClick={handleVerifyOtp}
                disabled={loading || otp.length !== 6}
              >
                {loading ? (
                  <div style={styles.loader} />
                ) : (
                  <>
                    Verify & Continue
                    <FaArrowRight style={styles.buttonIcon} />
                  </>
                )}
              </button>
              
              <button 
                style={styles.backButton}
                onClick={() => setStep(1)}
              >
                ← Change email
              </button>
            </div>
          )}

          {/* Step 3: Name */}
          {step === 3 && (
            <div style={styles.formContainer}>
              <h2 style={styles.title}>Complete Profile</h2>
              <p style={styles.subtitle}>Tell us your name</p>
              
              {error && (
                <div style={styles.errorMessage}>
                  <FaTimesCircle style={styles.errorIcon} />
                  <span>{error}</span>
                </div>
              )}
              
              <div style={styles.inputGroup}>
                <FaUser style={styles.inputIcon} />
                <input
                  style={{
                    ...styles.input,
                    ...(focused === 'name' ? styles.inputFocused : {})
                  }}
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                />
              </div>
              
              <button 
                style={{
                  ...styles.button,
                  ...(loading && styles.buttonDisabled)
                }}
                onClick={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <div style={styles.loader} />
                ) : (
                  <>
                    Create Account
                    <FaArrowRight style={styles.buttonIcon} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Features */}
          <div style={styles.features}>
            <div style={styles.feature}>
              <FaCheckCircle style={styles.featureIcon} />
              <span>Secure Login</span>
            </div>
            <div style={styles.feature}>
              <FaCheckCircle style={styles.featureIcon} />
              <span>Instant OTP</span>
            </div>
            <div style={styles.feature}>
              <FaCheckCircle style={styles.featureIcon} />
              <span>24/7 Support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <p>© 2026 Ride App. All rights reserved.</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    position: 'relative',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden'
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    zIndex: 0
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)'
  },
  pattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'radial-gradient(circle at 30px 30px, rgba(255,255,255,0.1) 2px, transparent 0)',
    backgroundSize: '60px 60px'
  },
  content: {
    position: 'relative',
    zIndex: 1,
    maxWidth: '450px',
    margin: '0 auto',
    padding: '40px 20px',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  },
  logoSection: {
    textAlign: 'center',
    marginBottom: '40px'
  },
  logoWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '10px'
  },
  logoIcon: {
    fontSize: '40px',
    color: '#fff',
    animation: 'bounce 2s infinite'
  },
  logoText: {
    fontSize: '40px',
    margin: 0,
    color: '#fff',
    fontWeight: '700',
    textShadow: '0 2px 10px rgba(0,0,0,0.2)'
  },
  tagline: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: '16px',
    margin: 0
  },
  card: {
    background: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(10px)',
    borderRadius: '30px',
    padding: '40px',
    boxShadow: '0 30px 60px rgba(0,0,0,0.3)',
    animation: 'slideUp 0.5s ease'
  },
  progressContainer: {
    marginBottom: '30px'
  },
  progressBar: {
    height: '4px',
    background: '#e5e7eb',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '15px'
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
    transition: 'width 0.3s ease'
  },
  steps: {
    display: 'flex',
    justifyContent: 'space-between'
  },
  stepItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '5px'
  },
  stepDot: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    background: '#e5e7eb',
    color: '#999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    transition: 'all 0.3s ease'
  },
  stepDotActive: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    boxShadow: '0 5px 15px rgba(102, 126, 234, 0.4)'
  },
  stepLabel: {
    fontSize: '12px',
    color: '#666'
  },
  formContainer: {
    animation: 'fadeIn 0.5s ease'
  },
  title: {
    fontSize: '28px',
    margin: '0 0 10px',
    color: '#333',
    fontWeight: '700'
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '30px'
  },
  inputGroup: {
    position: 'relative',
    marginBottom: '20px'
  },
  inputIcon: {
    position: 'absolute',
    left: '15px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#999',
    fontSize: '18px',
    zIndex: 1
  },
  input: {
    width: '100%',
    padding: '16px 16px 16px 45px',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    fontSize: '16px',
    outline: 'none',
    transition: 'all 0.3s ease',
    boxSizing: 'border-box'
  },
  inputFocused: {
    border: '2px solid #667eea',
    boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)'
  },
  button: {
    width: '100%',
    padding: '16px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    transition: 'all 0.3s ease',
    boxShadow: '0 10px 20px rgba(102, 126, 234, 0.3)'
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed'
  },
  buttonIcon: {
    fontSize: '18px',
    transition: 'transform 0.3s ease'
  },
  errorMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px',
    background: '#fee',
    color: '#f44336',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px'
  },
  errorIcon: {
    fontSize: '18px'
  },
  securityNote: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '20px',
    fontSize: '14px',
    color: '#999'
  },
  securityIcon: {
    color: '#667eea'
  },
  otpContainer: {
    marginBottom: '20px'
  },
  otpInput: {
    width: '100%',
    padding: '20px',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    fontSize: '32px',
    textAlign: 'center',
    letterSpacing: '8px',
    outline: 'none',
    transition: 'all 0.3s ease'
  },
  timerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '20px',
    fontSize: '14px',
    color: '#666'
  },
  timerIcon: {
    color: '#f39c12'
  },
  resendButton: {
    width: '100%',
    padding: '12px',
    background: 'none',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    fontSize: '14px',
    color: '#667eea',
    cursor: 'pointer',
    marginBottom: '15px',
    transition: 'all 0.3s ease'
  },
  backButton: {
    width: '100%',
    padding: '12px',
    background: 'none',
    border: 'none',
    fontSize: '14px',
    color: '#999',
    cursor: 'pointer',
    marginTop: '15px',
    transition: 'color 0.3s ease'
  },
  loader: {
    width: '24px',
    height: '24px',
    border: '3px solid rgba(255,255,255,0.3)',
    borderTop: '3px solid #fff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  features: {
    display: 'flex',
    justifyContent: 'space-around',
    marginTop: '30px',
    padding: '20px 0 0',
    borderTop: '1px solid #e5e7eb'
  },
  feature: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '13px',
    color: '#666'
  },
  featureIcon: {
    color: '#4CAF50',
    fontSize: '16px'
  },
  footer: {
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    marginTop: '30px',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '14px'
  }
};

// Add animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  @keyframes bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-10px);
    }
  }
  
  button:hover ${styles.buttonIcon} {
    transform: translateX(5px);
  }
  
  button:active {
    transform: translateY(2px);
  }
`;
document.head.appendChild(style);

export default Login;