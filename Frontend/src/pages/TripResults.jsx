import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../TripResults.css";

export default function TripResults() {
  const [trips, setTrips] = useState([]);
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  // Reload trips whenever this page is navigated to
  useEffect(() => {
    const allTrips = JSON.parse(localStorage.getItem("allTrips") || "[]");
    setTrips(allTrips.slice().reverse()); // Most recent first, do not mutate original
    setSelected(0);
  }, [location]);

  if (!trips.length) {
    return <p style={{ padding: "20px" }}>No trip data found. Please add drones and deliveries.</p>;
  }

  const trip = trips[selected];

  return (
    <div className="path-planning-page">
      <div className="left-panel">
        <h2>All Trips</h2>
        <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 24 }}>
          {trips.map((t, i) => (
            <div
              key={t.createdAt || i}
              className={`delivery-card${i === selected ? ' selected' : ''}`}
              style={{ cursor: 'pointer', marginBottom: 12, border: i === selected ? '2px solid #1976d2' : '1px solid #ddd' }}
              onClick={() => setSelected(i)}
            >
              <div><b>Trip #{trips.length - i}</b> &nbsp;|&nbsp; {new Date(t.createdAt).toLocaleString()}</div>
              <div style={{ fontSize: 13, color: '#555' }}>
                Drone: {t.drone ? t.drone.id : 'N/A'} | Truck Deliveries: {t.truckDeliveries ? t.truckDeliveries.length : 0} | Carbon Reduction: {t.carbonReduction}%
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="right-panel">
        <h3>Trip Details</h3>
        <p><b>Starting Point:</b> HQ Depot</p>
        <div className="delivery-item">
          <div>✈️ <b>Drone Delivery:</b></div>
          <div className="delivery-info">
            <p><b>Drone:</b> {trip.drone ? trip.drone.id : 'N/A'}</p>
            <p><b>To:</b> {trip.droneDelivery ? `${trip.droneDelivery.latitude}, ${trip.droneDelivery.longitude}` : 'N/A'}</p>
            <p><b>Payload:</b> {trip.droneDelivery ? trip.droneDelivery.weight : 'N/A'} kg</p>
            <p><b>Distance:</b> {trip.droneDist} mi</p>
          </div>
        </div>
        {trip.truckDeliveries && trip.truckDeliveries.length > 0 && (
          <div className="delivery-item">
            <div>🚚 <b>Truck Deliveries:</b></div>
            <div className="delivery-info">
              {trip.truckDeliveries.map((del, idx) => (
                <p key={idx}><b>To:</b> {del.latitude}, {del.longitude} | <b>Payload:</b> {del.weight} kg</p>
              ))}
              <p><b>Total Truck Distance:</b> {trip.truckDist} mi</p>
            </div>
          </div>
        )}
        <div className="carbon-box">
          <p><b>Carbon Emissions Reduction</b></p>
          <h2>{trip.carbonReduction}%</h2>
        </div>
        <div className="carbon-box">
          <p><b>Estimated Time</b></p>
          <h2>{trip.totalTime} min</h2>
        </div>
        <div className="button-group">
          <button className="edit-btn" onClick={() => navigate("/newtrip")}>Edit Delivery</button>
        </div>
      </div>
    </div>
  );
}

