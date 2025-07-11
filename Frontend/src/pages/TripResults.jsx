/* eslint-disable no-unused-vars */
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../TripResults.css";

const HQ = { lat: 12.9716, lng: 77.5946 }; // Bangalore

function formatTimeMinutes(minutes) {
  const min = Math.round(Number(minutes));
  if (minutes === undefined || minutes === null || isNaN(min) || min < 0) return 'N/A';
  if (min < 60) return min + ' min';
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${hr} hr` : `${hr} hr ${rem} min`;
}

export default function TripResults() {
  const [trips, setTrips] = useState([]);
  const [selected, setSelected] = useState(0);
  const [droneTime, setDroneTime] = useState(null);
  const [truckTime, setTruckTime] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const allTrips = JSON.parse(localStorage.getItem("allTrips") || "[]");
    setTrips(Array.isArray(allTrips) ? allTrips.slice().reverse() : []);
    setSelected(0);
  }, [location]);

  // Defensive: Only proceed if trips exist and selected trip is valid
  const trip = trips && trips.length > 0 && trips[selected] ? trips[selected] : null;

  useEffect(() => {
    if (trip && trip.totalTime) {
      setTruckTime(trip.totalTime);
    }
    if (trip && trip.droneDist && trip.droneDelivery) {
      const speed = 40;
      const distanceKm = Number(trip.droneDist) * 1.60934;
      const payloadKg = Number(trip.droneDelivery.weight);
      const baseTime = (distanceKm / speed) * 60;
      const penalty = Math.ceil(payloadKg / 2);
      setDroneTime((baseTime + penalty).toFixed(0));
    } else {
      setDroneTime(null);
    }
  }, [trip]);

  // Additional summary fields with full defensive checks
  const numTruckDeliveries = trip?.truckDeliveries?.length || 0;
  const numDroneDeliveries = trip?.droneDelivery ? 1 : 0;
  const totalDeliveries = numTruckDeliveries + numDroneDeliveries;
  const totalPayload =
    (trip?.truckDeliveries
      ? trip.truckDeliveries.reduce((sum, d) => sum + Number(d.weight || 0), 0)
      : 0) +
    (trip?.droneDelivery ? Number(trip.droneDelivery.weight || 0) : 0);
  const droneDistKm = trip?.droneDist ? (Number(trip.droneDist) * 1.60934) : 0;
  const truckDistKm = trip?.truckDist ? Number(trip.truckDist) * 1.60934 : 0;
  const truckOnlyCarbon = trip?.truckOnlyCarbon ? Number(trip.truckOnlyCarbon) : null;
  const hybridCarbon = trip?.hybridCarbon ? Number(trip.hybridCarbon) : null;
  const carbonSaved = (truckOnlyCarbon !== null && hybridCarbon !== null) ? (truckOnlyCarbon - hybridCarbon) : null;
  const truckOnlyTime = trip?.truckOnlyTime ? Number(trip.truckOnlyTime) : null;
  const hybridTime = trip?.totalTime ? Number(trip.totalTime) : null;
  const timeSaved = (truckOnlyTime !== null && hybridTime !== null) ? (truckOnlyTime - hybridTime) : null;

  if (!trip) {
    return <p style={{ padding: "20px" }}>No trip data found. Please add drones and deliveries.</p>;
  }

  return (
    <div className="path-planning-page">
      <div className="left-panel">
        <h2>All Trips</h2>
        <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 24 }}>
          {trips.map((t, i) => (
            <div
              key={t._id || t.id || (t.createdAt ? t.createdAt + "-" + i : i)}
              className={`delivery-card${i === selected ? ' selected' : ''}`}
              style={{
                cursor: 'pointer',
                marginBottom: 12,
                border: i === selected ? '2px solid #1976d2' : '1px solid #ddd'
              }}
              onClick={() => setSelected(i)}
            >
              <div>
                <b>Trip #{trips.length - i}</b> &nbsp;|&nbsp; {t.createdAt ? new Date(t.createdAt).toLocaleString() : "N/A"}
              </div>
              <div style={{ fontSize: 13, color: '#555' }}>
                Drone: {t.drone ? t.drone.droneId : 'N/A'} | Truck Deliveries: {t.truckDeliveries ? t.truckDeliveries.length : 0} | Carbon Reduction: {t.carbonReduction ? t.carbonReduction : "N/A"}%
              </div>
            </div>
          ))}
        </div>
        {/* You can keep your analytics boxes here if you want them below the trip list */}
      </div>
      <div className="right-panel">
        <h3>Trip Details</h3>
        <div className="trip-summary-box">
          <p><b>Trip Start:</b> {trip.createdAt ? new Date(trip.createdAt).toLocaleString() : "N/A"}</p>
          <p><b>Total Deliveries:</b> {totalDeliveries} (Truck: {numTruckDeliveries}, Drone: {numDroneDeliveries})</p>
          <p><b>Total Payload:</b> {totalPayload} kg</p>
          <p><b>Truck Route Distance:</b> {truckDistKm ? `${truckDistKm.toFixed(2)} km` : "N/A"}</p>
          <p><b>Drone Route Distance:</b> {droneDistKm ? `${droneDistKm.toFixed(2)} km` : "N/A"}</p>
        </div>
        {trip?.droneDelivery && (
          <div className="delivery-item">
            <div>✈️ <b>Drone Delivery:</b></div>
            <div className="delivery-info">
              <p><b>Drone:</b> {trip.drone ? trip.drone.droneId : 'N/A'}</p>
              <p><b>To:</b> {trip.droneDelivery ? `${trip.droneDelivery.latitude}, ${trip.droneDelivery.longitude}` : 'N/A'}</p>
              <p><b>Payload:</b> {trip.droneDelivery ? trip.droneDelivery.weight : 'N/A'} kg</p>
              <p><b>Distance:</b> {trip.droneDist ? (Number(trip.droneDist) * 1.60934).toFixed(2) + ' km' : "N/A"}</p>
              <p><b>Estimated Time:</b> {formatTimeMinutes(droneTime)}</p>
            </div>
          </div>
        )}
        {trip?.truckDeliveries && trip.truckDeliveries.length > 0 && (
          <div className="delivery-item">
            <div>🚚 <b>Truck Deliveries:</b></div>
            <div className="delivery-info">
              {trip.truckDeliveries.map((del, idx) => (
                <p key={idx}><b>To:</b> {del.latitude}, {del.longitude} | <b>Payload:</b> {del.weight} kg</p>
              ))}
              <p><b>Distance:</b> {truckDistKm ? `${truckDistKm.toFixed(2)} km` : "N/A"}</p>
              <p><b>Estimated Time:</b> {formatTimeMinutes(truckTime)}</p>
            </div>
          </div>
        )}
        <div className="carbon-box">
          <p><b>Carbon Emissions Reduction</b></p>
          <h2>{trip.carbonReduction ? `${trip.carbonReduction}%` : "N/A"}</h2>
        </div>
        <div className="carbon-box">
          <p><b>Total Carbon Emission Saved</b></p>
          <h2>
            {carbonSaved !== null ? `${carbonSaved.toFixed(2)} kg CO₂` : "N/A"}
          </h2>
        </div>
        <div className="carbon-box">
          <p><b>Estimated Time</b></p>
          <h2>
            {hybridTime !== null ? formatTimeMinutes(hybridTime) : "N/A"}
          </h2>
        </div>
        <div className="carbon-box">
          <p><b>Total Time Saved</b></p>
          <h2>
            {timeSaved !== null ? formatTimeMinutes(timeSaved) : "N/A"}
          </h2>
        </div>
        <div className="trip-summary-box" style={{ marginTop: 24 }}>
          <p><b>HQ Location:</b> {HQ.lat}, {HQ.lng} (Bangalore)</p>
        </div>
      </div>
    </div>
  );
}
