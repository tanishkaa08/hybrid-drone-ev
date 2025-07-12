/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip,
  LayersControl, ScaleControl, ZoomControl, useMap
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import axios from "axios";
import { Resizable } from "re-resizable";
import React from "react"; // Added for React.Fragment

// Helper functions
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [map, points]);
  return null;
}
function letterIcon(letter, color = "#1976d2") {
  return L.divIcon({
    html: `<div style="
      background:${color};
      color:#fff;
      font-weight:bold;
      border-radius:50%;
      width:32px;height:32px;
      display:flex;align-items:center;justify-content:center;
      border:2px solid #fff;
      box-shadow:0 0 4px #0003;
      font-size:18px;
    ">${letter}</div>`,
    iconSize: [32, 32],
    className: ""
  });
}
const droneIcon = letterIcon("D", "#d32f2f");
const truckIcon = letterIcon("T", "#388e3c");
const hqIcon = letterIcon("A", "#1976d2");
const launchIcon = letterIcon("L", "#ffa000");
const landingIcon = letterIcon("P", "#7b1fa2");

const HQ = { lat: 12.9716, lng: 77.5946 }; // Bangalore
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;
console.log("OpenWeather API Key:", OPENWEATHER_API_KEY);

function toRad(x) { return (x * Math.PI) / 180; }
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
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
function miles(km) { return km * 0.621371; }
function getLabel(idx) {
  return String.fromCharCode(65 + idx);
}
function formatTimeMinutes(minutes) {
  const min = Math.round(Number(minutes));
  if (minutes === undefined || minutes === null || isNaN(min) || min < 0) return 'N/A';
  if (min < 60) return min + ' min';
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${hr} hr` : `${hr} hr ${rem} min`;
}

// Nearest Neighbor TSP for truck route optimization
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

// Find the closest point ANYWHERE along the truck route polyline to the drone delivery
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

// Calculate truck distance up to launch (including fractional segment)
function truckDistanceToLaunch(polyline, launchIdx, launchFrac) {
  let dist = 0;
  for (let i = 1; i <= launchIdx; i++) {
    dist += haversineDistance(
      polyline[i - 1][0], polyline[i - 1][1],
      polyline[i][0], polyline[i][1]
    );
  }
  if (launchFrac > 0) {
    const [lat1, lng1] = polyline[launchIdx];
    const [lat2, lng2] = polyline[launchIdx + 1];
    const lat = lat1 + (lat2 - lat1) * launchFrac;
    const lng = lng1 + (lng2 - lng1) * launchFrac;
    dist += haversineDistance(lat1, lng1, lat, lng);
  }
  return dist;
}

// Calculate truck distance after launch (including fractional segment)
function truckDistanceAfterLaunch(polyline, launchIdx, launchFrac) {
  let dist = 0;
  if (launchFrac < 1) {
    const [lat1, lng1] = polyline[launchIdx];
    const [lat2, lng2] = polyline[launchIdx + 1];
    const lat = lat1 + (lat2 - lat1) * launchFrac;
    const lng = lng1 + (lng2 - lng1) * launchFrac;
    dist += haversineDistance(lat, lng, lat2, lng2);
  }
  for (let i = launchIdx + 2; i < polyline.length; i++) {
    dist += haversineDistance(
      polyline[i - 1][0], polyline[i - 1][1],
      polyline[i][0], polyline[i][1]
    );
  }
  return dist;
}

export default function PathPlanning() {
  const [trip, setTrip] = useState(null);
  const [truckPolyline, setTruckPolyline] = useState([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const [mapSize, setMapSize] = useState({ width: 700, height: 450 });
  const [windSpeed, setWindSpeed] = useState(null);
  const [windLoading, setWindLoading] = useState(false);
  const [windError, setWindError] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
  const storedTrip = localStorage.getItem("latestTrip");
  if (storedTrip) {
    setTrip(JSON.parse(storedTrip));
  } else {
      navigate("/newtrip");
  }
}, []);

  let droneDelivery = null;
  let truckDeliveries = [];
  let drone = null;
  let optimizedNodeOrder = [[HQ.lat, HQ.lng], [HQ.lat, HQ.lng]];
  let mlPredictedIndex = null;
  let mlPredictedDelivery = null;
  if (trip) {
    mlPredictedIndex = trip.mlPredictedIndex;
    mlPredictedDelivery = trip.mlPredictedDelivery;
    droneDelivery = mlPredictedDelivery
      ? {
          ...mlPredictedDelivery,
          latitude: Number(mlPredictedDelivery.latitude),
          longitude: Number(mlPredictedDelivery.longitude)
        }
      : (trip.droneDelivery
        ? {
            ...trip.droneDelivery,
            latitude: Number(trip.droneDelivery.latitude),
            longitude: Number(trip.droneDelivery.longitude)
          }
        : null);
    truckDeliveries = (trip.truckDeliveries || []).map(del => ({
      ...del,
      latitude: Number(del.latitude),
      longitude: Number(del.longitude)
    }));
    drone = trip.drone;
    optimizedNodeOrder = nearestNeighborRoute(HQ, truckDeliveries);
  }

  // Fetch Mapbox Route Polyline for Truck
  useEffect(() => {
    async function fetchRoute() {
      setLoadingRoute(true);
      setRouteError(null);
      try {
        if (!MAPBOX_TOKEN) throw new Error("Mapbox token missing");
        const coordsStr = optimizedNodeOrder
          .map(([lat, lng]) => `${lng},${lat}`)
          .join(';');
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;
        const res = await axios.get(url);
        if (!res.data.routes || !res.data.routes[0]) throw new Error("No route found");
        const geometry = res.data.routes[0].geometry.coordinates;
        setTruckPolyline(geometry.map(([lng, lat]) => [lat, lng]));
      } catch (err) {
        setRouteError("Failed to fetch truck route. Showing straight lines instead.");
        setTruckPolyline([]);
      }
      setLoadingRoute(false);
    }
    if (optimizedNodeOrder.length > 1 && MAPBOX_TOKEN) fetchRoute();
  }, [JSON.stringify(optimizedNodeOrder), MAPBOX_TOKEN]);

  // --- TRUE HYBRID LAUNCH/LAND LOGIC ---
  const { point: launchPoint, idx: launchIdx, frac: launchFrac } = closestPointOnPolyline(
    truckPolyline.length > 1 ? truckPolyline : optimizedNodeOrder,
    droneDelivery?.latitude,
    droneDelivery?.longitude,
    50 // high precision
  );
  const landingPoint = launchPoint;

  // Build traversal order based on user-provided deliveries
  // User trip: [HQ, ...truckDeliveries, HQ]
  const userTrip = [HQ, ...truckDeliveries, HQ];
  let launchInsertIdx = 0;
  let minDist = Infinity;
  // Find the segment where the launch point is closest
  for (let i = 0; i < userTrip.length - 1; i++) {
    const [lat1, lng1] = [userTrip[i].latitude || userTrip[i].lat, userTrip[i].longitude || userTrip[i].lng];
    const [lat2, lng2] = [userTrip[i+1].latitude || userTrip[i+1].lat, userTrip[i+1].longitude || userTrip[i+1].lng];
    if (!launchPoint || launchPoint[0] == null || launchPoint[1] == null) continue;
    const dist = haversineDistance(launchPoint[0], launchPoint[1], lat1, lng1) + haversineDistance(launchPoint[0], launchPoint[1], lat2, lng2);
    if (dist < minDist) {
      minDist = dist;
      launchInsertIdx = i + 1; // insert after i-th delivery
    }
  }
  // Build traversal order array (only user points + hybrid points)
  let traversalPoints = [];
  // HQ
  if (HQ.lat != null && HQ.lng != null) {
    traversalPoints.push({ label: getLabel(0), type: "HQ", coords: [HQ.lat, HQ.lng] });
  }
  // Truck deliveries up to launchInsertIdx
  for (let i = 0; i < launchInsertIdx; i++) {
    if (truckDeliveries[i] && truckDeliveries[i].latitude != null && truckDeliveries[i].longitude != null) {
      traversalPoints.push({ label: getLabel(i + 1), type: "Truck", coords: [truckDeliveries[i].latitude, truckDeliveries[i].longitude] });
    }
  }
  // Launch
  if (launchPoint && launchPoint[0] != null && launchPoint[1] != null) {
    traversalPoints.push({ label: getLabel(launchInsertIdx + 1), type: "Launch", coords: launchPoint });
  }
  // Drone Delivery
  if (droneDelivery && droneDelivery.latitude != null && droneDelivery.longitude != null) {
    traversalPoints.push({ label: getLabel(launchInsertIdx + 2), type: "DroneDelivery", coords: [droneDelivery.latitude, droneDelivery.longitude] });
  }
  // Landing
  if (landingPoint && landingPoint[0] != null && landingPoint[1] != null) {
    traversalPoints.push({ label: getLabel(launchInsertIdx + 3), type: "Landing", coords: landingPoint });
  }
  // Remaining truck deliveries after launchInsertIdx
  for (let i = launchInsertIdx; i < truckDeliveries.length; i++) {
    if (truckDeliveries[i] && truckDeliveries[i].latitude != null && truckDeliveries[i].longitude != null) {
      traversalPoints.push({ label: getLabel(launchInsertIdx + 4 + (i - launchInsertIdx)), type: "Truck", coords: [truckDeliveries[i].latitude, truckDeliveries[i].longitude] });
    }
  }
  // HQ (end)
  if (HQ.lat != null && HQ.lng != null) {
    traversalPoints.push({ label: getLabel(launchInsertIdx + 4 + (truckDeliveries.length - launchInsertIdx)), type: "HQ", coords: [HQ.lat, HQ.lng] });
  }
  const allPoints = traversalPoints.map(pt => pt.coords);

  // Calculate time between each stop
  function getSegmentTime(ptA, ptB, typeA, typeB) {
    if (!ptA || !ptB || ptA[0] == null || ptA[1] == null || ptB[0] == null || ptB[1] == null) return NaN;
    const [latA, lngA] = ptA;
    const [latB, lngB] = ptB;
    const dist = haversineDistance(latA, lngA, latB, lngB);
    // If either point is Launch, DroneDelivery, or Landing, use drone speed (40 km/h)
    if (["Launch", "DroneDelivery", "Landing"].includes(typeA) || ["Launch", "DroneDelivery", "Landing"].includes(typeB)) {
      return (dist / 40) * 60; // minutes
    }
    // Otherwise, truck speed (30 km/h)
    return (dist / 30) * 60; // minutes
  }

  // Wind speed fetch
  useEffect(() => {
    const fetchWind = async () => {
      if (launchPoint && droneDelivery) {
        setWindLoading(true);
        setWindError(null);
        setWindSpeed(null);
        try {
          const lat1 = launchPoint[0];
          const lng1 = launchPoint[1];
          const lat2 = droneDelivery.latitude;
          const lng2 = droneDelivery.longitude;
          const midLat = (lat1 + lat2) / 2;
          const midLng = (lng1 + lng2) / 2;
          const url = `https://api.openweathermap.org/data/2.5/weather?lat=${midLat}&lon=${midLng}&appid=${OPENWEATHER_API_KEY}&units=metric`;
          const res = await fetch(url);
          const data = await res.json();
          const wind = data.wind && data.wind.speed ? data.wind.speed : null;
          setWindSpeed(wind);
        } catch (err) {
          setWindError('Failed to fetch wind speed');
        } finally {
          setWindLoading(false);
        }
      }
    };
    fetchWind();
  }, [launchPoint && droneDelivery && `${launchPoint[0]},${launchPoint[1]},${droneDelivery.latitude},${droneDelivery.longitude}`]);

  if (!trip || !droneDelivery) return <div style={{padding: 40}}>Loading trip...</div>;

  const polyline = truckPolyline.length > 1 ? truckPolyline : optimizedNodeOrder;
  const truckDistToLaunch = truckDistanceToLaunch(polyline, launchIdx, launchFrac);
  const truckTimeToLaunch = (truckDistToLaunch / 30) * 60;

  const truckDistAfter = truckDistanceAfterLaunch(polyline, launchIdx, launchFrac);
  const truckTimeAfter = (truckDistAfter / 30) * 60;

  const droneLeg = haversineDistance(
    launchPoint[0], launchPoint[1],
    droneDelivery.latitude, droneDelivery.longitude
  );
  const droneTripTime = (2 * droneLeg / 40) * 60; // 40 km/h

  const totalTripTime = truckTimeToLaunch + Math.max(droneTripTime, truckTimeAfter);

  // Emissions (truck only, hybrid)
  let truckOnlyDist = 0;
  let prev = HQ;
  const allDeliveries = [droneDelivery, ...truckDeliveries];
  allDeliveries.forEach((del) => {
    const next = { lat: del.latitude, lng: del.longitude };
    truckOnlyDist += haversineDistance(prev.lat, prev.lng, next.lat, next.lng); // in km
    prev = next;
  });
  truckOnlyDist += haversineDistance(prev.lat, prev.lng, HQ.lat, HQ.lng); // in km

  const droneDistKm = droneLeg * 2; // round trip in km
  let truckDist = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    truckDist += haversineDistance(
      polyline[i][0], polyline[i][1],
      polyline[i+1][0], polyline[i+1][1]
    ); // in km
  }

  const TRUCK_EMISSION_PER_KM = 0.746; // 1.2 miles = 1.60934 km, so 1.2/1.60934 ≈ 0.746 kg/km
  const DRONE_EMISSION_PER_KM = 0.062; // 0.1 miles = 0.160934 km, so 0.1/1.60934 ≈ 0.062 kg/km

  const truckOnlyCarbon = truckOnlyDist * TRUCK_EMISSION_PER_KM;
  const hybridCarbon = (truckDist * TRUCK_EMISSION_PER_KM) + (droneDistKm * DRONE_EMISSION_PER_KM);
  const carbonReduction = truckOnlyCarbon > 0 ? ((truckOnlyCarbon - hybridCarbon) / truckOnlyCarbon) * 100 : 0;

  return (
    <div style={{
      display: "flex",
      flexDirection: "row",
      height: "100vh",
      width: "100vw",
      fontFamily: "Inter, Roboto, Arial, sans-serif",
      overflowX: "hidden" // Hide horizontal scrollbar
    }}>
      {/* Sidebar */}
      <div style={{
        width: 400,
        minWidth: 320,
        maxWidth: 500,
        background: "#fff",
        boxShadow: "2px 0 12px #0001",
        padding: "36px 24px 36px 32px",
        overflowY: "visible",
        overflowX: "hidden" // Hide horizontal scrollbar in sidebar
      }}>
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
            color: "#43a047",
            marginBottom: 4
          }}>{carbonReduction.toFixed(1)}%</div>
          <div style={{ fontSize: "0.97em", color: "#666" }}>
            <span style={{marginRight: 16}}>
              <span style={{fontWeight: 500}}>Truck Only: </span>
              {truckOnlyCarbon.toFixed(2)} kg CO₂
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
          <div style={{fontWeight: 600, fontSize: "1.1em", marginBottom: 4}}>Estimated Time</div>
          <div style={{
            fontSize: "2em",
            fontWeight: 700,
            color: "#1976d2"
          }}>{formatTimeMinutes(totalTripTime)}</div>
        </div>
        
        {mlPredictedDelivery && (
          <div style={{
            background: "#fff3e0",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 18,
            boxShadow: "0 2px 8px #0001",
            border: "2px solid #ff9800"
          }}>
            <div style={{fontWeight: 600, fontSize: "1.1em", marginBottom: 4, color: "#e65100"}}>
              ML model Prediction
            </div>
            <div style={{fontSize: "1em", color: "#666"}}>
              Delivery at <strong style={{color: "#e65100"}}>{mlPredictedDelivery.latitude}, {mlPredictedDelivery.longitude}</strong> was selected by AI for drone delivery
            </div>
           
          </div>
        )}
        {!mlPredictedDelivery && (
          <div style={{background: "#ffeaea", borderRadius: 12, padding: "16px 20px", marginBottom: 18, border: "2px solid #e57373"}}>
            <div style={{fontWeight: 600, color: "#d32f2f"}}>No ML Prediction</div>
            <div style={{color: "#888"}}>Fallback logic was used for drone delivery selection.</div>
          </div>
        )}
        <div style={{
          background: "#f6f8fa",
          borderRadius: 12,
          padding: "18px 22px",
          marginBottom: 18,
          boxShadow: "0 2px 8px #0001"
        }}>
          <div style={{fontWeight: 600, fontSize: "1.1em", marginBottom: 6}}>Traversal Order</div>
          <div style={{display: "flex", flexDirection: "column", gap: 0}}>
            {traversalPoints.map((pt, idx) => (
              <React.Fragment key={idx}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#e3eafc",
                  borderRadius: 8,
                  padding: "8px 16px",
                  margin: "0 0 0 0",
                  fontWeight: 500,
                  color: pt.type === "HQ" ? "#1976d2" : pt.type === "Truck" ? "#388e3c" : pt.type === "Launch" ? "#ffa000" : pt.type === "DroneDelivery" ? "#d32f2f" : pt.type === "Landing" ? "#7b1fa2" : "#1976d2",
                  fontSize: "1.08em",
                  boxShadow: idx === 0 ? "0 2px 8px #1976d222" : undefined
                }}>
                  <span style={{
                    display: "inline-block",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: pt.type === "HQ" ? "#1976d2" : pt.type === "Truck" ? "#388e3c" : pt.type === "Launch" ? "#ffa000" : pt.type === "DroneDelivery" ? "#d32f2f" : pt.type === "Landing" ? "#7b1fa2" : "#1976d2",
                    color: "#fff",
                    fontWeight: 700,
                    textAlign: "center",
                    lineHeight: "22px",
                    marginRight: 10
                  }}>{pt.label}</span>
                  {pt.type}
                </div>
                {/* Arrow and time to next stop */}
                {idx < traversalPoints.length - 1 && (
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    margin: "0 0 0 18px"
                  }}>
                    <span style={{ fontSize: 22, color: "#b3b3b3", margin: "2px 0" }}>↓</span>
                    <span style={{ fontSize: 13, color: "#1976d2", fontWeight: 500, marginBottom: 2 }}>
                      {(() => {
                        const t = getSegmentTime(
                          traversalPoints[idx].coords,
                          traversalPoints[idx + 1].coords,
                          traversalPoints[idx].type,
                          traversalPoints[idx + 1].type
                        );
                        return isNaN(t) ? "" : `${Math.round(t)} min`;
                      })()}
                    </span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div style={{
          background: "#fff",
          borderRadius: 12,
          padding: "18px 22px",
          marginBottom: 18,
          boxShadow: "0 2px 8px #0001"
        }}>
          <div style={{fontWeight: 600, fontSize: "1.1em", marginBottom: 6}}>Locations</div>
          <table style={{width: "100%", fontSize: "1em", borderCollapse: "collapse"}}>
            <tbody>
              <tr>
                <td style={{fontWeight: 500, color: "#1976d2"}}>HQ (A):</td>
                <td>{HQ.lat}, {HQ.lng}</td>
              </tr>
              {optimizedNodeOrder.slice(1, -1).map((coords, idx) => (
                <tr key={idx}>
                  <td style={{fontWeight: 500, color: "#388e3c"}}>{getLabel(idx + 1)} (Truck):</td>
                  <td>{coords[0]}, {coords[1]}</td>
                </tr>
              ))}
              <tr>
                <td style={{fontWeight: 500, color: "#ffa000"}}>{getLabel(optimizedNodeOrder.length - 1)} (Launch):</td>
                <td>{launchPoint ? `${launchPoint[0].toFixed(5)}, ${launchPoint[1].toFixed(5)}` : "N/A"}</td>
              </tr>
              <tr>
                <td style={{fontWeight: 500, color: "#d32f2f"}}>{getLabel(optimizedNodeOrder.length)} (Drone Delivery):</td>
                <td>{droneDelivery.latitude}, {droneDelivery.longitude}</td>
              </tr>
              <tr>
                <td style={{fontWeight: 500, color: "#7b1fa2"}}>{getLabel(optimizedNodeOrder.length + 1)} (Landing):</td>
                <td>{landingPoint ? `${landingPoint[0].toFixed(5)}, ${landingPoint[1].toFixed(5)}` : "N/A"}</td>
              </tr>
              <tr>
                <td style={{fontWeight: 500, color: "#1976d2"}}>{getLabel(optimizedNodeOrder.length + 2)} (HQ):</td>
                <td>{HQ.lat}, {HQ.lng}</td>
              </tr>
            </tbody>
          </table>
            </div>
        <div style={{marginTop: 16, fontSize: "1.1em"}}>
          <b>Drone ID Used:</b> <span style={{color: "#d32f2f"}}>{drone ? drone.droneId : "N/A"}</span>
        </div>
        <div style={{marginTop: 8}}>
          <b>Wind Speed (drone route):</b>
          {windLoading && <span style={{color: '#888'}}> Loading...</span>}
          {windError && <span style={{color: 'red'}}> {windError}</span>}
          {windSpeed !== null && !windLoading && !windError && (
            <span style={{color: '#0077b6'}}> {windSpeed} m/s</span>
          )}
        </div>
        {/* Action Buttons */}
        <div style={{
          display: "flex",
          gap: 16,
          marginTop: 32,
          justifyContent: "flex-end"
        }}>
          <button
  style={{
    background: "#1976d2",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 28px",
    fontWeight: 600,
    fontSize: "1.1em",
    cursor: "pointer",
    boxShadow: "0 2px 8px #1976d222",
    transition: "background 0.2s"
  }}
  onClick={async () => {
    try {
      await axios.post('/api/trips/createTrip', trip);

      // Mark the drone as unavailable locally
      if (trip.drone) {
        trip.drone.available = false;
      }

      let dronesList = JSON.parse(localStorage.getItem("dronesList") || "[]");
      if (trip.drone) {
        dronesList = dronesList.map(d =>
          d.droneId === trip.drone.droneId ? { ...d, available: false } : d
        );
        localStorage.setItem("dronesList", JSON.stringify(dronesList));
      }

      const allTrips = JSON.parse(localStorage.getItem("allTrips") || "[]");
      allTrips.push(trip);
      localStorage.setItem("allTrips", JSON.stringify(allTrips));
      localStorage.removeItem("latestTrip");
      navigate("/tripresults");
    } catch (error) {
      alert("Error: Failed to execute trip.");
    }
  }}
>
  Execute Delivery
</button>

         <button
  style={{
    background: "#fff",
    color: "#1976d2",
    border: "2px solid #1976d2",
    borderRadius: 8,
    padding: "12px 28px",
    fontWeight: 600,
    fontSize: "1.1em",
    cursor: "pointer",
    boxShadow: "0 2px 8px #1976d222",
    transition: "background 0.2s"
  }}
  onClick={() => {
    localStorage.setItem("editTrip", JSON.stringify(trip));
    navigate("/newtrip");
  }}
>
  Edit Delivery
</button>
        </div>
      </div>

      {/* Map */}
      <div style={{
        flex: 1,
        position: "relative",
        overflowX: "hidden"
      }}>
        {routeError && <div style={{position:"absolute",top:10,left:10,color:"red",zIndex:999}}>{routeError}</div>}
        <MapContainer
          style={{ width: "100%", height: "100%" }}
          zoom={11}
          center={allPoints[0]}
          scrollWheelZoom={true}
          zoomControl={false}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="OpenStreetMap">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors' />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Mapbox Streets">
              <TileLayer
                url={`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`}
                attribution='&copy; Mapbox &copy; OpenStreetMap contributors'
                tileSize={512}
                zoomOffset={-1}
              />
            </LayersControl.BaseLayer>
          </LayersControl>
          <ZoomControl position="topright" />
          <ScaleControl position="bottomleft" />
          <FitBounds points={allPoints} />
          {traversalPoints.map((pt, idx) => (
            <Marker
              key={idx}
              position={pt.coords}
              icon={
                pt.type === "HQ" ? hqIcon :
                pt.type === "Truck" ? truckIcon :
                pt.type === "Launch" ? launchIcon :
                pt.type === "Landing" ? landingIcon :
                pt.type === "DroneDelivery" ? droneIcon : hqIcon
              }
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                <span style={{ fontWeight: "bold", fontSize: 15 }}>{pt.label}</span>
              </Tooltip>
              <Popup>
                <b>{pt.label}</b> - {pt.type}
                <br />
                <span style={{ fontSize: 13, color: "#333" }}>
                  {pt.coords[0].toFixed(5)}, {pt.coords[1].toFixed(5)}
                </span>
                {pt.type === "DroneDelivery" && trip.drone && (
                  <div>Drone ID Used: <b>{trip.drone.droneId}</b></div>
                )}
              </Popup>
            </Marker>
          ))}
          {polyline.length > 1 && (
            <Polyline positions={polyline} color="#1976d2" weight={6} opacity={0.8} />
          )}
          {launchPoint && (
            <Polyline
              positions={[
                launchPoint,
                [droneDelivery.latitude, droneDelivery.longitude],
                landingPoint
              ]}
              color="#d32f2f"
              weight={4}
              opacity={0.9}
              dashArray="12, 10"
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}