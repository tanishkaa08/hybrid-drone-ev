import { useNavigate } from "react-router-dom";
import "../MapDisplay.css";

export default function MapDisplay() {
  const navigate = useNavigate();
  const tripResults = JSON.parse(localStorage.getItem("tripResults"));

  if (!tripResults) {
    return (
      <div className="map-container">
        <h2>Trip Details</h2>
        <p>No trip results found. Please plan a trip first.</p>
      </div>
    );
  }

  return (
    <div className="map-container">
      <div className="map-content">
        <div className="map-left">
          <h2 className="page-title">Path Planning</h2>
          <input
            className="search-input"
            placeholder="Search for order ID"
          />
          <div className="map-placeholder">
            <input className="search-location" placeholder="Search for location" />
            <div className="dummy-map">Map Display Here</div>
          </div>
        </div>

        <div className="map-right">
          <h3>Trip Details</h3>
          <p><strong>Starting Point:</strong> Warehouse</p>

          {tripResults.deliveries.map((delivery, idx) => (
            <div key={idx} className="delivery-box">
              <span>{delivery.location}</span>
              <p>Payload: {delivery.weight} kg</p>
              {tripResults.droneDelivery.location === delivery.location ? (
                <p>Delivered by: Drone</p>
              ) : (
                <p>Delivered by: Truck</p>
              )}
            </div>
          ))}

          <div className="carbon-box">
            <p><strong>Carbon Emissions Reduction:</strong></p>
            <h2>{tripResults.carbonReduction}%</h2>
          </div>

          <div className="action-buttons">
            <button className="execute-btn" onClick={() => navigate("/dashboard")}>
              Execute
            </button>
            <button className="edit-btn" onClick={() => navigate("/newtrip")}>
              Edit Delivery
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
