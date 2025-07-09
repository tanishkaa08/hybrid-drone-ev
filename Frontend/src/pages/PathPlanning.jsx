/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "../TripResults.css";
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import axios from 'axios';

// Fix leaflet marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const HQ = { lat: 40.7128, lng: -74.0060 };

export default function PathPlanning() {
  const [trip, setTrip] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedTrip = localStorage.getItem("latestTrip");
    if (storedTrip) {
      setTrip(JSON.parse(storedTrip));
    } else {
      navigate("/newtrip"); // fallback if no trip found
    }
  }, []);

  const handleExecute = async () => {
    if (!trip) return;

    try {
      await axios.post('/api/trips/createTrip', trip);

      const allTrips = JSON.parse(localStorage.getItem("allTrips") || "[]");
      allTrips.push(trip);
      localStorage.setItem("allTrips", JSON.stringify(allTrips));

      localStorage.removeItem("latestTrip");
      navigate("/tripresults");
    } catch (error) {
      console.error("Failed to save trip:", error);
      alert("Error: Failed to execute trip.");
    }
  };

  if (!trip) {
    return <p style={{ padding: "20px" }}>No trip data found. Please plan a trip first.</p>;
  }

  // Calculate map center between HQ and all delivery points
  const allCoords = [
    ...trip.truckDeliveries?.map(d => [Number(d.latitude), Number(d.longitude)]) || [],
    ...(trip.droneDelivery ? [[Number(trip.droneDelivery.latitude), Number(trip.droneDelivery.longitude)]] : []),
    [HQ.lat, HQ.lng]
  ];

  const latAvg = allCoords.reduce((sum, [lat]) => sum + lat, 0) / allCoords.length;
  const lngAvg = allCoords.reduce((sum, [, lng]) => sum + lng, 0) / allCoords.length;

  return (
    <div className="path-planning-page">
      <div className="left-panel">
        <h2>Path Planning</h2>
        <div className="map-section">
          <MapContainer center={[latAvg, lngAvg]} zoom={8} style={{ height: 300, width: "100%" }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <Marker position={[HQ.lat, HQ.lng]}>
              <Popup>HQ Depot</Popup>
            </Marker>

            {trip.droneDelivery && (
              <Marker position={[Number(trip.droneDelivery.latitude), Number(trip.droneDelivery.longitude)]}>
                <Popup>Drone Delivery<br />Payload: {trip.droneDelivery.weight} kg</Popup>
              </Marker>
            )}

            {trip.truckDeliveries?.map((del, idx) => (
              <Marker
                key={idx}
                position={[Number(del.latitude), Number(del.longitude)]}
              >
                <Popup>Truck Delivery {idx + 1}<br />Payload: {del.weight} kg</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      <div className="right-panel">
        <h3>Trip Details</h3>
        <p><b>Starting Point:</b> HQ Depot</p>

        {trip.droneDelivery ? (
          <div className="delivery-item">
            <div>✈️ <b>Drone Delivery:</b></div>
            <div className="delivery-info">
              <p><b>Drone:</b> {trip.drone?.droneId || 'N/A'}</p>
              <p><b>To:</b> {trip.droneDelivery.latitude}, {trip.droneDelivery.longitude}</p>
              <p><b>Payload:</b> {trip.droneDelivery.weight} kg</p>
              <p><b>Distance:</b> {trip.droneDist} mi</p>
            </div>
          </div>
        ) : (
          <div className="delivery-item">
            <p><b>No drone delivery selected.</b></p>
          </div>
        )}

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
          <p><b>Estimated Total Time</b></p>
          <h2>{trip.totalTime} min</h2>
        </div>

        <div className="button-group">
          <button className="execute-btn" onClick={handleExecute}>Execute Delivery</button>
          <button className="edit-btn" onClick={() => navigate("/newtrip")}>Edit Delivery</button>
        </div>
      </div>
    </div>
  );
}
