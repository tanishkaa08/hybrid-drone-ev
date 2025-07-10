import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import "../TripResults.css";
import L from "leaflet";

const HQ = { lat: 12.9716, lng: 77.5946 }; // Bangalore HQ

function formatTimeMinutes(minutes) {
  const min = Math.round(Number(minutes));
  if (minutes === undefined || minutes === null || isNaN(min) || min < 0) return 'N/A';
  if (min < 60) return min + ' min';
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${hr} hr` : `${hr} hr ${rem} min`;
}

function calcDroneTime(distanceKm, payloadKg) {
  const speed = 40; // km/h
  const baseTime = (distanceKm / speed) * 60; // min
  const penalty = Math.ceil(payloadKg / 2); // 1 min per 2kg
  return baseTime + penalty;
}

// Custom marker icons
const hqIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  shadowSize: [41, 41],
  className: "hq-marker"
});
const droneIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  shadowSize: [41, 41],
  className: "drone-marker"
});
const truckIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  shadowSize: [41, 41],
  className: "truck-marker"
});

export default function TripResults() {
  const [trips, setTrips] = useState([]);
  const [selected, setSelected] = useState(0);
  const [truckRoute, setTruckRoute] = useState({ distance: null, duration: null, loading: false, error: null });
  const [droneTime, setDroneTime] = useState(null);
  const [truckTime, setTruckTime] = useState(null);
  const [mapHeight, setMapHeight] = useState(300);
  const [mapWidth, setMapWidth] = useState(600);
  const navigate = useNavigate();
  const location = useLocation();

  // Reload trips whenever this page is navigated to
  useEffect(() => {
    const allTrips = JSON.parse(localStorage.getItem("allTrips") || "[]");
    setTrips(allTrips.slice().reverse()); // Most recent first, do not mutate original
    setSelected(0);
  }, [location]);

  const trip = trips[selected];

  // Calculate drone time if possible
  useEffect(() => {
    if (trip && trip.droneDelivery && trip.droneDist) {
      const distanceKm = Number(trip.droneDist) * 1.60934;
      const payloadKg = Number(trip.droneDelivery.weight);
      if (!isNaN(distanceKm) && !isNaN(payloadKg)) {
        setDroneTime(calcDroneTime(distanceKm, payloadKg).toFixed(0));
      } else {
        setDroneTime(null);
      }
    } else {
      setDroneTime(null);
    }
  }, [trip]);

  // Call ORS for truck route
  useEffect(() => {
    async function getORSRoute(waypoints) {
      setTruckRoute({ distance: null, duration: null, loading: true, error: null });
      try {
        const parsedWaypoints = waypoints.map(wp => ({
          latitude: parseFloat(wp.latitude),
          longitude: parseFloat(wp.longitude)
        })).filter(wp => !isNaN(wp.latitude) && !isNaN(wp.longitude));
        const coordinates = parsedWaypoints.map(wp => [wp.longitude, wp.latitude]);
        if (coordinates.length < 2) {
          setTruckRoute({ distance: null, duration: null, loading: false, error: "Not enough waypoints for route" });
          setTruckTime(null);
          return;
        }
        const res = await axios.post(
          "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
          { coordinates },
          {
            headers: {
              "Authorization": import.meta.env.VITE_ORS_API_KEY,
              "Content-Type": "application/json"
            }
          }
        );
        const summary = res.data.features[0].properties.summary;
        setTruckRoute({
          distance: (summary.distance / 1000).toFixed(2), // km
          duration: (summary.duration / 60).toFixed(0),   // min, rounded
          loading: false,
          error: null
        });
        setTruckTime((summary.duration / 60).toFixed(0));
      } catch (err) {
        setTruckRoute({ distance: null, duration: null, loading: false, error: err.message || "Failed to fetch route" });
        setTruckTime(null);
      }
    }
    if (trip && trip.truckDeliveries && trip.truckDeliveries.length > 0) {
      const waypoints = [
        { latitude: HQ.lat, longitude: HQ.lng },
        ...trip.truckDeliveries.map(del => ({
          latitude: del.latitude,
          longitude: del.longitude
        }))
      ];
      getORSRoute(waypoints);
    }
  }, [trip]);

  if (!trips.length) {
    return <p style={{ padding: "20px" }}>No trip data found. Please add drones and deliveries.</p>;
  }

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
                Drone: {t.drone ? t.drone.droneId : 'N/A'} | Truck Deliveries: {t.truckDeliveries ? t.truckDeliveries.length : 0} | Carbon Reduction: {t.carbonReduction}%
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
            <p><b>Drone:</b> {trip.drone ? trip.drone.droneId : 'N/A'}</p>
            <p><b>To:</b> {trip.droneDelivery ? `${trip.droneDelivery.latitude}, ${trip.droneDelivery.longitude}` : 'N/A'}</p>
            <p><b>Payload:</b> {trip.droneDelivery ? trip.droneDelivery.weight : 'N/A'} kg</p>
            <p><b>Distance:</b> {trip.droneDist ? (Number(trip.droneDist) * 1.60934).toFixed(2) + ' km' : 'N/A'}</p>
            <p><b>Estimated Time:</b> {formatTimeMinutes(droneTime)}</p>
          </div>
        </div>
        {trip.truckDeliveries && trip.truckDeliveries.length > 0 && (
          <div className="delivery-item">
            <div>🚚 <b>Truck Deliveries:</b></div>
            <div className="delivery-info">
              {trip.truckDeliveries.map((del, idx) => (
                <p key={idx}><b>To:</b> {del.latitude}, {del.longitude} | <b>Payload:</b> {del.weight} kg</p>
              ))}
              
              {truckRoute.loading ? (
                <p>Loading truck route...</p>
              ) : truckRoute.error ? (
                <p style={{ color: 'red' }}>{truckRoute.error}</p>
              ) : (
                truckRoute.distance && truckRoute.duration && (
                  <p><b>Distance:</b> {truckRoute.distance} km, <b>Time:</b> {formatTimeMinutes(truckRoute.duration)}</p>
                )
              )}
            </div>
          </div>
        )}
        <div className="carbon-box">
          <p><b>Carbon Emissions Reduction</b></p>
          <h2>{trip.carbonReduction}%</h2>
        </div>
        <div className="carbon-box">
          <p><b>Estimated Time</b></p>
          {(() => {
            const dTime = Number(droneTime);
            const tTime = Number(truckTime);
            if ((!dTime && dTime !== 0) && (!tTime && tTime !== 0)) return <h2>N/A</h2>;
            const maxTime = Math.max(dTime || 0, tTime || 0);
            return <h2>{formatTimeMinutes(maxTime)}</h2>;
          })()}
        </div>
        <div className="button-group">
          <button className="edit-btn" onClick={() => navigate("/newtrip")}>Edit Delivery</button>
        </div>
      </div>
    </div>
  );
}

