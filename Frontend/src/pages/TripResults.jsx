/* eslint-disable no-unused-vars */
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

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function TripResults() {
  const [trips, setTrips] = useState([]);
  const [selected, setSelected] = useState(0);
  const [truckRoute, setTruckRoute] = useState({ distance: null, duration: null, loading: false, error: null });
  const [droneTime, setDroneTime] = useState(null);
  const [truckTime, setTruckTime] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Shared button style
  const buttonStyle = {
    background: "#43a047",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 24px",
    fontWeight: 600,
    fontSize: "1.05em",
    cursor: toggleLoading ? "wait" : "pointer",
    marginLeft: 10,
    opacity: toggleLoading ? 0.7 : 1
  };

  // Reload trips whenever this page is navigated to
  useEffect(() => {
    const allTrips = JSON.parse(localStorage.getItem("allTrips") || "[]");
    setTrips(allTrips.slice().reverse());
    setSelected(0);
  }, [location]);

  const trip = trips[selected];

  // Calculate drone time if possible
  useEffect(() => {
    // Always use ML prediction if available
    const xgbResult = localStorage.getItem("xgbResult");
    if (xgbResult && xgbResult !== "undefined") {
      try {
        const parsedResult = JSON.parse(xgbResult);
        if (parsedResult && (parsedResult.predicted_time_minutes || parsedResult.time)) {
          setDroneTime(parsedResult.predicted_time_minutes || parsedResult.time);
          return;
        }
      } catch (e) {
        console.error("Failed to parse xgbResult:", e);
      }
    }
    setDroneTime(null);
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
          "/orsapi/v2/directions/driving-car/geojson",
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
        console.error("ORS error:", err, err?.response?.data);
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

  const handleFinishDelivery = async () => {
    if (!trip?.drone) {
      alert("No drone assigned to this trip.");
      return;
    }
    setToggleLoading(true);
    try {
      await axios.put(`/api/v1/drones/toggleavailability/${trip.drone.droneId}`);

      let dronesList = JSON.parse(localStorage.getItem("dronesList") || "[]");
      dronesList = dronesList.map(d =>
        d.droneId === trip.drone.droneId
          ? { ...d, available: !d.available }
          : d
      );
      localStorage.setItem("dronesList", JSON.stringify(dronesList));

      trip.drone.available = !trip.drone.available;
      const allTrips = JSON.parse(localStorage.getItem("allTrips") || "[]").map(t =>
        t.drone && t.drone.droneId === trip.drone.droneId
          ? { ...t, drone: { ...t.drone, available: trip.drone.available } }
          : t
      );
      localStorage.setItem("allTrips", JSON.stringify(allTrips));
      setTrips(allTrips.slice().reverse());

      alert("Drone availability toggled successfully!");
    } catch (error) {
      alert("Failed to toggle drone availability: " + (error?.response?.data?.error || error.message));
    } finally {
      setToggleLoading(false);
    }
  };

  if (!trips.length) {
    return <p style={{ padding: "20px" }}>No trip data found. Please add drones and deliveries.</p>;
  }

  // Define trip data variables first
  let droneDelivery = trip?.droneDelivery;
  let truckDeliveries = trip?.truckDeliveries || [];

  // --- Traversal and Segment Logic (copied from PathPlanning.jsx) ---
  function getLabel(idx) {
    return String.fromCharCode(65 + idx);
  }

  // Nearest Neighbor TSP for truck route optimization (copy from PathPlanning.jsx)
  function nearestNeighborRoute(hq, deliveries) {
    const unvisited = deliveries.slice();
    let route = [[hq.lat, hq.lng]];
    let current = { lat: hq.lat, lng: hq.lng };
    while (unvisited.length > 0) {
      let minIdx = 0, minDist = Infinity;
      for (let i = 0; i < unvisited.length; i++) {
        const d = haversineDistance(current.lat, current.lng, Number(unvisited[i].latitude), Number(unvisited[i].longitude));
        if (d < minDist) {
          minDist = d;
          minIdx = i;
        }
      }
      current = {
        lat: Number(unvisited[minIdx].latitude),
        lng: Number(unvisited[minIdx].longitude)
      };
      route.push([current.lat, current.lng]);
      unvisited.splice(minIdx, 1);
    }
    route.push([hq.lat, hq.lng]);
    return route;
  }

  // Find the closest point ANYWHERE along the truck route polyline to the drone delivery (copy from PathPlanning.jsx)
  function closestPointOnPolyline(polyline, targetLat, targetLng, samplesPerSegment = 50) {
    let minDist = Infinity;
    let bestPoint = null;
    let bestIdx = 0;
    let bestFrac = 0;
    for (let i = 0; i < polyline.length - 1; i++) {
      const [lat1, lng1] = polyline[i];
      const [lat2, lng2] = polyline[i + 1];
      for (let t = 0; t <= samplesPerSegment; t++) {
        const frac = t / samplesPerSegment;
        const lat = lat1 + (lat2 - lat1) * frac;
        const lng = lng1 + (lng2 - lng1) * frac;
        const dist = haversineDistance(lat, lng, targetLat, targetLng);
        if (dist < minDist) {
          minDist = dist;
          bestPoint = [lat, lng];
          bestIdx = i;
          bestFrac = frac;
        }
      }
    }
    return { point: bestPoint, idx: bestIdx, frac: bestFrac };
  }

  // Calculate optimized truck route
  const optimizedNodeOrder = nearestNeighborRoute(HQ, truckDeliveries);

  // Use the same launch point calculation as PathPlanning.jsx
  const { point: launchPoint, idx: launchIdx, frac: launchFrac } = closestPointOnPolyline(
    optimizedNodeOrder,
    droneDelivery?.latitude,
    droneDelivery?.longitude,
    50 // high precision
  );

  // Build traversal order based on user-provided deliveries
  let launchInsertIdx = 0;
  let minDist = Infinity;
  const userTrip = [HQ, ...truckDeliveries, HQ];
  for (let i = 0; i < userTrip.length - 1; i++) {
    const [lat1, lng1] = [userTrip[i].latitude || userTrip[i].lat, userTrip[i].longitude || userTrip[i].lng];
    const [lat2, lng2] = [userTrip[i+1].latitude || userTrip[i+1].lat, userTrip[i+1].longitude || userTrip[i+1].lng];
    if (!launchPoint || launchPoint[0] == null || launchPoint[1] == null) continue;
    const dist = haversineDistance(launchPoint[0], launchPoint[1], lat1, lng1) + haversineDistance(launchPoint[0], launchPoint[1], lat2, lng2);
    if (dist < minDist) {
      minDist = dist;
      launchInsertIdx = i + 1;
    }
  }
  let traversalPoints = [];
  if (HQ.lat != null && HQ.lng != null) {
    traversalPoints.push({ label: getLabel(0), type: "HQ", coords: [HQ.lat, HQ.lng] });
  }
  for (let i = 0; i < launchInsertIdx; i++) {
    if (truckDeliveries[i] && truckDeliveries[i].latitude != null && truckDeliveries[i].longitude != null) {
      traversalPoints.push({ label: getLabel(i + 1), type: "Truck", coords: [truckDeliveries[i].latitude, truckDeliveries[i].longitude] });
    }
  }
  if (launchPoint && launchPoint[0] != null && launchPoint[1] != null) {
    traversalPoints.push({ label: getLabel(launchInsertIdx + 1), type: "Launch", coords: launchPoint });
  }
  if (droneDelivery && droneDelivery.latitude != null && droneDelivery.longitude != null) {
    traversalPoints.push({ label: getLabel(launchInsertIdx + 2), type: "DroneDelivery", coords: [droneDelivery.latitude, droneDelivery.longitude] });
  }
  if (launchPoint && launchPoint[0] != null && launchPoint[1] != null) {
    traversalPoints.push({ label: getLabel(launchInsertIdx + 3), type: "Landing", coords: launchPoint });
  }
  for (let i = launchInsertIdx; i < truckDeliveries.length; i++) {
    if (truckDeliveries[i] && truckDeliveries[i].latitude != null && truckDeliveries[i].longitude != null) {
      traversalPoints.push({ label: getLabel(launchInsertIdx + 4 + (i - launchInsertIdx)), type: "Truck", coords: [truckDeliveries[i].latitude, truckDeliveries[i].longitude] });
    }
  }
  if (HQ.lat != null && HQ.lng != null) {
    traversalPoints.push({ label: getLabel(launchInsertIdx + 4 + (truckDeliveries.length - launchInsertIdx)), type: "HQ", coords: [HQ.lat, HQ.lng] });
  }

  function getSegmentTime(ptA, ptB, typeA, typeB) {
    if (!ptA || !ptB || ptA[0] == null || ptA[1] == null || ptB[0] == null || ptB[1] == null) return NaN;
    const [latA, lngA] = ptA;
    const [latB, lngB] = ptB;
    const dist = haversineDistance(latA, lngA, latB, lngB);
    // Use ML time (predicted_time_minutes or time) for each drone segment (no division)
    let xgbResult = null;
    try {
      xgbResult = JSON.parse(localStorage.getItem("xgbResult"));
    } catch {}
    const mlMinutes = xgbResult && (xgbResult.predicted_time_minutes ?? xgbResult.time);
    if ((typeA === "Launch" && typeB === "DroneDelivery") || 
        (typeA === "DroneDelivery" && typeB === "Landing")) {
      if (mlMinutes) {
        return Number(mlMinutes);
      }
      return (dist / 40) * 60; // fallback to calculated time
    }
    if (["Launch", "DroneDelivery", "Landing"].includes(typeA) || ["Launch", "DroneDelivery", "Landing"].includes(typeB)) {
      return (dist / 40) * 60; // minutes
    }
    return (dist / 30) * 60; // minutes
  }

  // Calculate total trip time as the sum of all segment times in the traversal order
  const totalTripTime = traversalPoints.slice(0, -1).reduce((sum, pt, idx) => {
    return sum + getSegmentTime(
      traversalPoints[idx].coords,
      traversalPoints[idx + 1].coords,
      traversalPoints[idx].type,
      traversalPoints[idx + 1].type
    );
  }, 0);

  // --- Carbon Emission Calculation (copy from PathPlanning.jsx) ---
  const DRONE_EMISSION_PER_KM = 0.062;
  const TRUCK_EMISSION_PER_KM = 0.746;

  const allDeliveries = [droneDelivery, ...truckDeliveries];

  // Calculate total distance if all deliveries are done by truck
  let allTruckDist = 0;
  let prevTruck = HQ;
  allDeliveries.forEach((del) => {
    allTruckDist += haversineDistance(prevTruck.lat, prevTruck.lng, del.latitude, del.longitude);
    prevTruck = { lat: del.latitude, lng: del.longitude };
  });
  allTruckDist += haversineDistance(prevTruck.lat, prevTruck.lng, HQ.lat, HQ.lng);
  const allTruckCarbon = allTruckDist * TRUCK_EMISSION_PER_KM;

  // Calculate hybrid: 1 drone delivery (from launchPoint), rest by truck
  let hybridDroneDist = 2 * haversineDistance(launchPoint[0], launchPoint[1], droneDelivery.latitude, droneDelivery.longitude); // round trip for drone
  let hybridTruckDist = 0;
  let prevHybrid = HQ;
  truckDeliveries.forEach(del => {
    hybridTruckDist += haversineDistance(prevHybrid.lat, prevHybrid.lng, del.latitude, del.longitude);
    prevHybrid = { lat: del.latitude, lng: del.longitude };
  });
  hybridTruckDist += haversineDistance(prevHybrid.lat, prevHybrid.lng, HQ.lat, HQ.lng);
  const hybridCarbon = (hybridTruckDist * TRUCK_EMISSION_PER_KM) + (hybridDroneDist * DRONE_EMISSION_PER_KM);

  // Carbon reduction
  const carbonReduction = allTruckCarbon > 0 ? ((allTruckCarbon - hybridCarbon) / allTruckCarbon) * 100 : 0;

  return (
    <div className="path-planning-page">
      <div className="left-panel">
        <h2>All Trips</h2>
        <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 24 }}>
          {trips.map((t, i) => (
            <div
              key={`${t.createdAt || ''}_${i}`}
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
        <h2 style={{marginBottom: 12, color: "#1976d2", letterSpacing: 1}}>Trip Details</h2>
        <div style={{
          background: "#f1f8e9",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 18,
          boxShadow: "0 2px 8px #0001"
        }}>
          <div style={{fontWeight: 600, fontSize: "1.1em", marginBottom: 4}}>Carbon Emission Reduction</div>
          <div style={{
            fontSize: "2em",
            fontWeight: 700,
            color: carbonReduction >= 0 ? "#43a047" : "#d32f2f",
            marginBottom: 4
          }}>{carbonReduction.toFixed(1)}%</div>
          <div style={{ fontSize: "0.97em", color: "#666" }}>
            <span style={{marginRight: 16}}>
              <span style={{fontWeight: 500}}>Truck Only: </span>
              {allTruckCarbon.toFixed(2)} kg CO₂
            </span>
            <span>
              <span style={{fontWeight: 500}}>Hybrid: </span>
              {hybridCarbon.toFixed(2)} kg CO₂
            </span>
          </div>
        </div>
        <div style={{
          background: "#e3f2fd",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 18,
          boxShadow: "0 2px 8px #0001"
        }}>
          <div style={{fontWeight: 600, fontSize: "1.1em", marginBottom: 4}}>
            Estimated Time
            <span style={{ fontSize: 14, marginLeft: 8, color: "#d32f2f" }}>ML Enhanced</span>
          </div>
          <div style={{
            fontSize: "2em",
            fontWeight: 700,
            color: "#d32f2f"
          }}>{formatTimeMinutes(totalTripTime)}</div>
        </div>
        
        
        <div className="button-group">
          <button
            className="finish-btn"
            style={buttonStyle}
            onClick={handleFinishDelivery}
            disabled={toggleLoading}
          >
            {toggleLoading ? "Finishing..." : "Finish Delivery"}
          </button>
        </div>
      </div>
    </div>
  );
}
