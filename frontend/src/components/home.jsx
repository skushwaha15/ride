import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import bg from "../assets/car1.jpg";
import { FaMapMarkerAlt, FaSearch, FaCar, FaClock, FaShieldAlt, FaStar, FaPhone, FaEnvelope, FaFacebook, FaTwitter, FaInstagram, FaArrowRight } from "react-icons/fa";

function Home() {
  const navigate = useNavigate();
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("Daily");
  const [recentSearches] = useState([
    "Mumbai Airport",
    "Andheri Station",
    "Bandra Kurla Complex"
  ]);

  const tabs = ["Daily", "Rental", "Outstation"];

  // Get current location
  const getCurrentLocation = () => {
    setLoading(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );
            const data = await response.json();
            
            const address = data.display_name?.split(',')[0] || "Current Location";
            setPickup(address);
            
            sessionStorage.setItem("currentLocation", JSON.stringify({
              lat: latitude,
              lng: longitude,
              address: address
            }));
            
          } catch (error) {
            console.error("Error getting address:", error);
            setPickup("Current Location");
            
            sessionStorage.setItem("currentLocation", JSON.stringify({
              lat: latitude,
              lng: longitude,
              address: "Current Location"
            }));
          }
          
          setLoading(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          alert("Please enable location access or enter pickup manually");
          setLoading(false);
        }
      );
    } else {
      alert("Geolocation is not supported by your browser");
      setLoading(false);
    }
  };
const handleSearch = async () => {
  setLoading(true);
  
  try {
    // Pehle check karo ki user ne manually address daala hai ya current location use karna hai
    let pickupCoords;
    
    // Agar pickup field mein "Current Location" nahi hai aur user ne manually type kiya hai
    if (pickup && pickup !== "Current Location" && !pickup.includes("Current Location")) {
      // Manual address se coordinates lo
      const pickupRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(pickup)}`
      );
      const pickupData = await pickupRes.json();
      
      if (pickupData.length > 0) {
        pickupCoords = {
          lat: parseFloat(pickupData[0].lat),
          lng: parseFloat(pickupData[0].lon)
        };
      } else {
        throw new Error("Pickup location not found");
      }
    } else {
      // Current location use karo agar user ne "Use Current" button dabaya hai
      const currentLocationData = JSON.parse(sessionStorage.getItem("currentLocation") || "{}");
      
      if (currentLocationData.lat && currentLocationData.lng) {
        pickupCoords = {
          lat: currentLocationData.lat,
          lng: currentLocationData.lng
        };
      } else {
        throw new Error("Current location not available. Please enter pickup location manually.");
      }
    }
    
    // Drop location coordinates lo
    const dropRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(drop)}`
    );
    const dropData = await dropRes.json();
    
    if (dropData.length > 0) {
      const dropCoords = {
        lat: parseFloat(dropData[0].lat),
        lng: parseFloat(dropData[0].lon)
      };
      
      navigate("/map", {
        state: {
          pickupLocation: pickupCoords,
          dropLocation: dropCoords,
          pickupAddress: pickup,
          dropAddress: drop
        }
      });
    } else {
      alert("Destination location not found");
    }
  } catch (error) {
    console.error("Error:", error);
    alert(error.message || "Error finding locations. Please try again.");
  }
  
  setLoading(false);
};

  const handleQuickSelect = (location) => {
    setDrop(location);
  };

  return (
    <div style={styles.container}>
      {/* NAVBAR */}
      <nav style={styles.navbar}>
        <div style={styles.navLeft}>
          <h2 style={styles.logo}>
            <FaCar style={styles.logoIcon} />
            RIDE
          </h2>
        </div>
        
        <div style={styles.navRight}>
          <button style={styles.navBtn}>Ride</button>
          <button style={styles.navBtn}>Drive</button>
          <button style={styles.navBtnPrimary}>Sign Up</button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <div style={styles.hero}>
        <div style={styles.heroOverlay}></div>
        <img src={bg} style={styles.bg} alt="background" />

        {/* SEARCH SECTION */}
        <div style={styles.searchSection}>
          <div style={styles.searchContainer}>
            <h1 style={styles.mainTitle}>
              Book a <span style={styles.highlight}>Cab</span> in Seconds
            </h1>
            <p style={styles.subTitle}>Safe, reliable, and affordable rides at your fingertips</p>

            {/* Tabs */}
            <div style={styles.tabsContainer}>
              {tabs.map((tab) => (
                <button
                  key={tab}
                  style={{
                    ...styles.tab,
                    ...(activeTab === tab ? styles.activeTab : {})
                  }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Input Fields */}
            <div style={styles.inputGroup}>
              <div style={styles.inputWrapper}>
                <FaMapMarkerAlt style={styles.inputIcon} />
                <input
                  placeholder="Enter pickup location"
                  style={styles.input}
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                />
                <button 
                  onClick={getCurrentLocation}
                  style={styles.locationBtn}
                  disabled={loading}
                >
                  📍 Use Current
                </button>
              </div>

              <div style={styles.inputWrapper}>
                <FaMapMarkerAlt style={{...styles.inputIcon, color: '#f44336'}} />
                <input
                  placeholder="Where to?"
                  style={styles.input}
                  value={drop}
                  onChange={(e) => setDrop(e.target.value)}
                />
              </div>

              {/* Recent Searches */}
              {!drop && recentSearches.length > 0 && (
                <div style={styles.recentSearches}>
                  <p style={styles.recentTitle}>Recent destinations:</p>
                  <div style={styles.recentList}>
                    {recentSearches.map((item, index) => (
                      <button
                        key={index}
                        style={styles.recentItem}
                        onClick={() => handleQuickSelect(item)}
                      >
                        <FaClock style={styles.recentIcon} />
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button 
                style={styles.searchBtn}
                onClick={handleSearch}
                disabled={loading || !drop}
              >
                {loading ? (
                  "LOADING..."
                ) : (
                  <>
                    SEARCH CABS
                    <FaArrowRight style={styles.btnIcon} />
                  </>
                )}
              </button>
            </div>

            {/* Safety Badge */}
            <div style={styles.safetyBadge}>
              <FaShieldAlt style={styles.shieldIcon} />
              <span>Your safety is our priority. All drivers are verified.</span>
            </div>
          </div>
        </div>

        {/* FEATURES SECTION */}
        <div style={styles.features}>
          <div style={styles.featureCard}>
            <div style={styles.featureIcon}>🚗</div>
            <h4>50,000+ Rides</h4>
            <p>Daily rides across cities</p>
          </div>
          <div style={styles.featureCard}>
            <div style={styles.featureIcon}>⭐</div>
            <h4>4.8 Rating</h4>
            <p>From 1M+ happy customers</p>
          </div>
          <div style={styles.featureCard}>
            <div style={styles.featureIcon}>🔒</div>
            <h4>Safe Rides</h4>
            <p>24/7 safety support</p>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS SECTION */}
      <div style={styles.howItWorks}>
        <h2 style={styles.sectionTitle}>How It <span style={styles.highlight}>Works</span></h2>
        <div style={styles.steps}>
          <div style={styles.step}>
            <div style={styles.stepNumber}>1</div>
            <h4>Enter Location</h4>
            <p>Choose pickup and drop location</p>
          </div>
          <div style={styles.step}>
            <div style={styles.stepNumber}>2</div>
            <h4>Choose Cab</h4>
            <p>Select from available cabs</p>
          </div>
          <div style={styles.step}>
            <div style={styles.stepNumber}>3</div>
            <h4>Enjoy Ride</h4>
            <p>Track and reach safely</p>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <div style={styles.footerContainer}>
          <div style={styles.footerSection}>
            <h3 style={styles.footerLogo}>
              <FaCar style={styles.footerIcon} />
              RIDE
            </h3>
            <p style={styles.footerText}>Book cab in seconds, travel in comfort</p>
            <div style={styles.socialLinks}>
              <a href="#" style={styles.socialLink}><FaFacebook /></a>
              <a href="#" style={styles.socialLink}><FaTwitter /></a>
              <a href="#" style={styles.socialLink}><FaInstagram /></a>
            </div>
          </div>

          <div style={styles.footerSection}>
            <h4>Company</h4>
            <a href="#" style={styles.footerLink}>About Us</a>
            <a href="#" style={styles.footerLink}>Careers</a>
            <a href="#" style={styles.footerLink}>Blog</a>
            <a href="#" style={styles.footerLink}>Press</a>
          </div>

          <div style={styles.footerSection}>
            <h4>Services</h4>
            <a href="#" style={styles.footerLink}>Daily Rides</a>
            <a href="#" style={styles.footerLink}>Rental</a>
            <a href="#" style={styles.footerLink}>Outstation</a>
            <a href="#" style={styles.footerLink}>Airport</a>
          </div>

          <div style={styles.footerSection}>
            <h4>Support</h4>
            <a href="#" style={styles.footerLink}>Help Center</a>
            <a href="#" style={styles.footerLink}>Safety</a>
            <a href="#" style={styles.footerLink}>Terms</a>
            <a href="#" style={styles.footerLink}>Privacy</a>
          </div>

          <div style={styles.footerSection}>
            <h4>Contact</h4>
            <p style={styles.contactInfo}>
              <FaPhone style={styles.contactIcon} /> 1800-123-4567
            </p>
            <p style={styles.contactInfo}>
              <FaEnvelope style={styles.contactIcon} /> support@ride.com
            </p>
          </div>
        </div>

        <div style={styles.footerBottom}>
          <p>© 2026 Ride App. All rights reserved. Made with ❤️ for better travel</p>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  navbar: {
    background: "rgba(0,0,0,0.95)",
    color: "white",
    padding: "15px 50px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backdropFilter: "blur(10px)"
  },
  navLeft: {
    display: "flex",
    alignItems: "center"
  },
  logo: {
    margin: 0,
    fontSize: "1.8rem",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "linear-gradient(45deg, #fff, #4CAF50)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent"
  },
  logoIcon: {
    color: "#4CAF50",
    fontSize: "2rem"
  },
  navRight: {
    display: "flex",
    gap: "15px",
    alignItems: "center"
  },
  navBtn: {
    padding: "8px 20px",
    border: "none",
    background: "transparent",
    color: "white",
    fontSize: "1rem",
    cursor: "pointer",
    borderRadius: "20px",
    transition: "all 0.3s",
    ':hover': {
      background: "rgba(255,255,255,0.1)"
    }
  },
  navBtnPrimary: {
    padding: "8px 25px",
    border: "none",
    background: "#4CAF50",
    color: "white",
    fontSize: "1rem",
    cursor: "pointer",
    borderRadius: "20px",
    fontWeight: "bold",
    transition: "all 0.3s",
    ':hover': {
      background: "#45a049",
      transform: "translateY(-2px)"
    }
  },
  hero: {
    position: "relative",
    minHeight: "100vh"
  },
  heroOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "linear-gradient(135deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 100%)",
    zIndex: 1
  },
  bg: {
    width: "100%",
    height: "100vh",
    objectFit: "cover",
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 0
  },
  searchSection: {
    position: "relative",
    zIndex: 2,
    padding: "100px 50px 50px",
    maxWidth: "1200px",
    margin: "0 auto"
  },
  searchContainer: {
    background: "white",
    padding: "40px",
    borderRadius: "20px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    maxWidth: "600px"
  },
  mainTitle: {
    fontSize: "2.8rem",
    margin: "0 0 10px",
    color: "#333",
    lineHeight: "1.2"
  },
  highlight: {
    color: "#4CAF50",
    borderBottom: "3px solid #4CAF50"
  },
  subTitle: {
    fontSize: "1.1rem",
    color: "#666",
    marginBottom: "30px"
  },
  tabsContainer: {
    display: "flex",
    gap: "10px",
    marginBottom: "30px",
    borderBottom: "2px solid #eee",
    paddingBottom: "10px"
  },
  tab: {
    padding: "10px 20px",
    border: "none",
    background: "transparent",
    fontSize: "1rem",
    cursor: "pointer",
    color: "#666",
    transition: "all 0.3s",
    borderRadius: "20px",
    fontWeight: "500"
  },
  activeTab: {
    background: "#4CAF50",
    color: "white"
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "15px"
  },
  inputWrapper: {
    position: "relative",
    width: "100%"
  },
  inputIcon: {
    position: "absolute",
    left: "15px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#4CAF50",
    fontSize: "1.2rem",
    zIndex: 1
  },
  input: {
    width: "100%",
    padding: "15px 45px",
    border: "2px solid #eee",
    borderRadius: "12px",
    fontSize: "1rem",
    transition: "all 0.3s",
    boxSizing: "border-box",
    ':focus': {
      borderColor: "#4CAF50",
      outline: "none",
      boxShadow: "0 0 0 3px rgba(76, 175, 80, 0.1)"
    }
  },
  locationBtn: {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "#4CAF50",
    color: "white",
    border: "none",
    padding: "8px 15px",
    borderRadius: "20px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: "bold",
    transition: "all 0.3s",
    ':hover': {
      background: "#45a049",
      transform: "translateY(-50%) scale(1.05)"
    }
  },
  recentSearches: {
    marginTop: "5px"
  },
  recentTitle: {
    fontSize: "0.9rem",
    color: "#666",
    marginBottom: "8px"
  },
  recentList: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap"
  },
  recentItem: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    padding: "5px 12px",
    background: "#f5f5f5",
    border: "none",
    borderRadius: "20px",
    fontSize: "0.9rem",
    color: "#666",
    cursor: "pointer",
    transition: "all 0.3s",
    ':hover': {
      background: "#e8f5e8",
      color: "#4CAF50"
    }
  },
  recentIcon: {
    fontSize: "0.8rem"
  },
  searchBtn: {
    background: "#4CAF50",
    color: "white",
    padding: "18px",
    border: "none",
    borderRadius: "12px",
    fontSize: "1.2rem",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.3s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    marginTop: "10px",
    ':hover': {
      background: "#45a049",
      transform: "translateY(-2px)",
      boxShadow: "0 10px 25px rgba(76, 175, 80, 0.3)"
    },
    ':disabled': {
      background: "#ccc",
      cursor: "not-allowed",
      transform: "none"
    }
  },
  btnIcon: {
    fontSize: "1.2rem"
  },
  safetyBadge: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginTop: "20px",
    padding: "10px 15px",
    background: "#f5f5f5",
    borderRadius: "10px",
    color: "#666",
    fontSize: "0.9rem"
  },
  shieldIcon: {
    color: "#4CAF50",
    fontSize: "1.2rem"
  },
  features: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    justifyContent: "center",
    gap: "30px",
    padding: "0 50px 50px",
    maxWidth: "1200px",
    margin: "0 auto"
  },
  featureCard: {
    background: "white",
    padding: "30px",
    borderRadius: "15px",
    textAlign: "center",
    flex: 1,
    maxWidth: "250px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
    transition: "all 0.3s",
    ':hover': {
      transform: "translateY(-10px)",
      boxShadow: "0 20px 40px rgba(0,0,0,0.2)"
    }
  },
  featureIcon: {
    fontSize: "3rem",
    marginBottom: "15px"
  },
  howItWorks: {
    padding: "80px 50px",
    background: "#f9f9f9",
    textAlign: "center"
  },
  sectionTitle: {
    fontSize: "2.5rem",
    marginBottom: "50px",
    color: "#333"
  },
  steps: {
    display: "flex",
    justifyContent: "center",
    gap: "50px",
    maxWidth: "1000px",
    margin: "0 auto"
  },
  step: {
    flex: 1,
    textAlign: "center",
    padding: "30px",
    background: "white",
    borderRadius: "15px",
    boxShadow: "0 5px 20px rgba(0,0,0,0.05)"
  },
  stepNumber: {
    width: "50px",
    height: "50px",
    background: "#4CAF50",
    color: "white",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    fontWeight: "bold",
    margin: "0 auto 20px"
  },
  footer: {
    background: "#111",
    color: "white",
    padding: "60px 50px 20px"
  },
  footerContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "40px",
    maxWidth: "1200px",
    margin: "0 auto"
  },
  footerSection: {
    display: "flex",
    flexDirection: "column",
    gap: "10px"
  },
  footerLogo: {
    fontSize: "1.8rem",
    margin: "0 0 15px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "#4CAF50"
  },
  footerIcon: {
    fontSize: "2rem"
  },
  footerText: {
    color: "#999",
    lineHeight: "1.6",
    marginBottom: "15px"
  },
  socialLinks: {
    display: "flex",
    gap: "15px"
  },
  socialLink: {
    color: "#999",
    fontSize: "1.2rem",
    transition: "color 0.3s",
    textDecoration: "none",
    ':hover': {
      color: "#4CAF50"
    }
  },
  footerLink: {
    color: "#999",
    textDecoration: "none",
    fontSize: "0.95rem",
    transition: "color 0.3s",
    ':hover': {
      color: "#4CAF50"
    }
  },
  contactInfo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "#999",
    margin: "5px 0"
  },
  contactIcon: {
    color: "#4CAF50"
  },
  footerBottom: {
    textAlign: "center",
    paddingTop: "40px",
    marginTop: "40px",
    borderTop: "1px solid #333",
    color: "#666"
  }
};

export default Home;