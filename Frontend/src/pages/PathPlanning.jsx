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

// --- UI Helper: Fit map bounds to all points ---
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

// --- Custom marker icons with colored letters ---
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

const HQ = { lat: 40.7128, lng: -74.0060 };

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

// --- Nearest Neighbor TSP Heuristic for Truck Route (excluding drone delivery) ---
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

// --- Find closest truck node (HQ or delivery) to drone delivery ---
function findClosestNodeOnRoute(routeNodes, deliveryLat, deliveryLng) {
  let minDist = Infinity;
  let closestNode = null;
  let closestIdx = 0;
  for (let i = 0; i < routeNodes.length; i++) {
    const node = routeNodes[i];
    const dist = haversineDistance(node[0], node[1], deliveryLat, deliveryLng);
    if (dist < minDist) {
      minDist = dist;
      closestNode = node;
      closestIdx = i;
    }
  }
  return { point: closestNode, idx: closestIdx };
}

export default function PathPlanning() {
  const [trip, setTrip] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedTrip = localStorage.getItem("latestTrip");
    if (storedTrip) {
      setTrip(JSON.parse(storedTrip));
    } else {
      navigate("/newtrip");
    }
  }, []);

  if (!trip) return <div>Loading...</div>;

  // --- Robustly ensure all coordinates are numbers ---
  const droneDelivery = {
    ...trip.droneDelivery,
    latitude: Number(trip.droneDelivery.latitude),
    longitude: Number(trip.droneDelivery.longitude)
  };
  // Exclude drone delivery from truck deliveries
  const truckDeliveries = (trip.truckDeliveries || []).map(del => ({
    ...del,
    latitude: Number(del.latitude),
    longitude: Number(del.longitude)
  }));
  const drone = trip.drone;

  // --- Optimized Truck Route (Nearest Neighbor) ---
  const optimizedRoutePath = nearestNeighborRoute(HQ, truckDeliveries);

  // --- Find best launch/landing node (must be a node on the route) ---
  const { point: launchPoint, idx: launchIdx } = findClosestNodeOnRoute(
    optimizedRoutePath,
    droneDelivery.latitude,
    droneDelivery.longitude
  );
  const landingPoint = launchPoint; // always a node

  // --- Traversal points for UI ---
  let traversalPoints = [
    { label: "A", type: "HQ", coords: [HQ.lat, HQ.lng] },
    ...optimizedRoutePath.slice(1, -1).map((coords, i) => ({
      label: getLabel(i + 1),
      type: "Truck",
      coords,
      idx: i
    })),
    { label: getLabel(optimizedRoutePath.length - 1), type: "Launch", coords: launchPoint },
    { label: getLabel(optimizedRoutePath.length), type: "DroneDelivery", coords: [droneDelivery.latitude, droneDelivery.longitude] },
    { label: getLabel(optimizedRoutePath.length + 1), type: "Landing", coords: landingPoint },
    { label: getLabel(optimizedRoutePath.length + 2), type: "HQ", coords: [HQ.lat, HQ.lng] }
  ];

  // --- Calculate truck time to launch node ---
  let truckTimeToLaunch = 0;
  for (let i = 0; i < launchIdx; i++) {
    truckTimeToLaunch += haversineDistance(
      optimizedRoutePath[i][0], optimizedRoutePath[i][1],
      optimizedRoutePath[i+1][0], optimizedRoutePath[i+1][1]
    );
  }
  truckTimeToLaunch = (truckTimeToLaunch / 30) * 60; // 30 km/h

  // --- Drone round trip time (launch -> delivery -> launch) ---
  const droneLeg = haversineDistance(
    launchPoint[0], launchPoint[1],
    droneDelivery.latitude, droneDelivery.longitude
  );
  const droneTripTime = (2 * droneLeg / 40) * 60; // 40 km/h

  // --- Truck time from launch node to HQ (after rendezvous) ---
  let truckTimeAfter = 0;
  for (let i = launchIdx; i < optimizedRoutePath.length - 1; i++) {
    truckTimeAfter += haversineDistance(
      optimizedRoutePath[i][0], optimizedRoutePath[i][1],
      optimizedRoutePath[i+1][0], optimizedRoutePath[i+1][1]
    );
  }
  truckTimeAfter = (truckTimeAfter / 30) * 60;

  // --- Total trip time: truck to launch + max(drone round trip, 0) + truck to HQ ---
  const totalTripTime = truckTimeToLaunch + Math.max(droneTripTime, 0) + truckTimeAfter;

  // --- Emissions (truck only, hybrid) ---
  let truckOnlyDist = 0;
  let prev = HQ;
  const allDeliveries = [droneDelivery, ...truckDeliveries];
  allDeliveries.forEach((del) => {
    const next = { lat: del.latitude, lng: del.longitude };
    truckOnlyDist += haversineDistance(prev.lat, prev.lng, next.lat, next.lng);
    prev = next;
  });
  truckOnlyDist += haversineDistance(prev.lat, prev.lng, HQ.lat, HQ.lng);

  const droneDistKm = droneLeg * 2;
  let truckDist = 0;
  for (let i = 0; i < optimizedRoutePath.length - 1; i++) {
    truckDist += haversineDistance(
      optimizedRoutePath[i][0], optimizedRoutePath[i][1],
      optimizedRoutePath[i+1][0], optimizedRoutePath[i+1][1]
    );
  }

  const TRUCK_EMISSION_PER_MILE = 1.2;
  const DRONE_EMISSION_PER_MILE = 0.1;
  const truckOnlyCarbon = miles(truckOnlyDist) * TRUCK_EMISSION_PER_MILE;
  const hybridCarbon = miles(truckDist) * TRUCK_EMISSION_PER_MILE + miles(droneDistKm) * DRONE_EMISSION_PER_MILE;
  const carbonReduction = truckOnlyCarbon > 0 ? ((truckOnlyCarbon - hybridCarbon) / truckOnlyCarbon) * 100 : 0;

  // For fitBounds
  const allPoints = traversalPoints.map(pt => pt.coords);

  // Responsive layout helper
  const isMobile = window.innerWidth < 900;

  return (
    <div style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      minHeight: "100vh",
      background: "#f8fafc",
      fontFamily: "Inter, Roboto, Arial, sans-serif"
    }}>
      <div style={{
        flex: "1 1 600px",
        minWidth: 340,
        maxWidth: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#e3eafc",
        padding: isMobile ? 8 : 32
      }}>
        <div style={{
          width: isMobile ? "98vw" : "90vw",
          maxWidth: 800,
          height: isMobile ? "50vh" : "70vh",
          minHeight: 340,
          borderRadius: isMobile ? 12 : 18,
          boxShadow: "0 4px 32px #0002",
          overflow: "hidden",
          background: "#fff",
          border: "1px solid #dbeafe",
          position: "relative"
        }}>
          <MapContainer
            style={{ width: "100%", height: "100%" }}
            zoom={11}
            center={allPoints[0]}
            scrollWheelZoom={true}
            zoomControl={false}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer url="https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" maxZoom={20} subdomains={['mt0','mt1','mt2','mt3']} />
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
                <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent>
                  <span style={{ fontWeight: "bold", fontSize: 15 }}>{pt.label}</span>
                </Tooltip>
                <Popup>
                  <b>{pt.label}</b> - {pt.type}
                  {pt.type === "DroneDelivery" && trip.drone && (
                    <div>Drone ID: <b>{trip.drone.droneId}</b></div>
                  )}
                </Popup>
              </Marker>
            ))}
            <Polyline positions={optimizedRoutePath} color="#1976d2" weight={6} opacity={0.8} />
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
            {/* Map Legend */}
            <div style={{
              position: "absolute",
              bottom: 28, left: 28,
              background: "#fff",
              borderRadius: 10,
              padding: "10px 18px",
              boxShadow: "0 2px 8px #0002",
              fontSize: 15,
              zIndex: 999
            }}>
              <div style={{marginBottom: 4, fontWeight: 600, color: "#222"}}>Legend</div>
              <div style={{display: "flex", alignItems: "center", gap: 10, marginBottom: 2}}>
                <span style={{
                  display: "inline-block", width: 18, height: 18, borderRadius: "50%", background: "#1976d2", color: "#fff", textAlign: "center", fontWeight: "bold"
                }}>A</span> HQ
              </div>
              <div style={{display: "flex", alignItems: "center", gap: 10, marginBottom: 2}}>
                <span style={{
                  display: "inline-block", width: 18, height: 18, borderRadius: "50%", background: "#388e3c", color: "#fff", textAlign: "center", fontWeight: "bold"
                }}>T</span> Truck Delivery
              </div>
              <div style={{display: "flex", alignItems: "center", gap: 10, marginBottom: 2}}>
                <span style={{
                  display: "inline-block", width: 18, height: 18, borderRadius: "50%", background: "#ffa000", color: "#fff", textAlign: "center", fontWeight: "bold"
                }}>L</span> Drone Launch
              </div>
              <div style={{display: "flex", alignItems: "center", gap: 10, marginBottom: 2}}>
                <span style={{
                  display: "inline-block", width: 18, height: 18, borderRadius: "50%", background: "#d32f2f", color: "#fff", textAlign: "center", fontWeight: "bold"
                }}>D</span> Drone Delivery
              </div>
              <div style={{display: "flex", alignItems: "center", gap: 10}}>
                <span style={{
                  display: "inline-block", width: 18, height: 18, borderRadius: "50%", background: "#7b1fa2", color: "#fff", textAlign: "center", fontWeight: "bold"
                }}>P</span> Drone Landing
              </div>
            </div>
          </MapContainer>
        </div>
      </div>
      <div style={{
        flex: 1,
        padding: "36px 36px 36px 48px",
        background: "#fff",
        minHeight: "100vh",
        boxShadow: "0 0 24px #0002",
        display: "flex",
        flexDirection: "column"
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
        <div style={{
          background: "#f6f8fa",
          borderRadius: 12,
          padding: "18px 22px",
          marginBottom: 18,
          boxShadow: "0 2px 8px #0001"
        }}>
          <div style={{fontWeight: 600, fontSize: "1.1em", marginBottom: 6}}>Traversal Order</div>
          <div style={{display: "flex", flexWrap: "wrap", gap: 10}}>
            {traversalPoints.map((pt, idx) => (
              <span key={idx} style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#e3eafc",
                borderRadius: 8,
                padding: "4px 12px",
                marginRight: 6,
                fontWeight: 500,
                color: "#1976d2",
                fontSize: "1em"
              }}>
                <span style={{
                  display: "inline-block",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#1976d2",
                  color: "#fff",
                  fontWeight: 700,
                  textAlign: "center",
                  lineHeight: "22px",
                  marginRight: 6
                }}>{pt.label}</span>
                {pt.type}
                {idx < traversalPoints.length - 1 ? <span style={{margin: "0 8px", color: "#aaa"}}>→</span> : ""}
              </span>
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
              {optimizedRoutePath.slice(1, -1).map((coords, idx) => (
                <tr key={idx}>
                  <td style={{fontWeight: 500, color: "#388e3c"}}>{getLabel(idx + 1)} (Truck):</td>
                  <td>{coords[0]}, {coords[1]}</td>
                </tr>
              ))}
              <tr>
                <td style={{fontWeight: 500, color: "#ffa000"}}>{getLabel(optimizedRoutePath.length - 1)} (Launch):</td>
                <td>{launchPoint ? `${launchPoint[0].toFixed(5)}, ${launchPoint[1].toFixed(5)}` : "N/A"}</td>
              </tr>
              <tr>
                <td style={{fontWeight: 500, color: "#d32f2f"}}>{getLabel(optimizedRoutePath.length)} (Drone Delivery):</td>
                <td>{droneDelivery.latitude}, {droneDelivery.longitude}</td>
              </tr>
              <tr>
                <td style={{fontWeight: 500, color: "#7b1fa2"}}>{getLabel(optimizedRoutePath.length + 1)} (Landing):</td>
                <td>{landingPoint ? `${landingPoint[0].toFixed(5)}, ${landingPoint[1].toFixed(5)}` : "N/A"}</td>
              </tr>
              <tr>
                <td style={{fontWeight: 500, color: "#1976d2"}}>{getLabel(optimizedRoutePath.length + 2)} (HQ):</td>
                <td>{HQ.lat}, {HQ.lng}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{marginTop: 16, fontSize: "1.1em"}}>
          <b>Drone Used:</b> <span style={{color: "#d32f2f"}}>{drone ? drone.droneId : "N/A"}</span>
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
                const allTrips = JSON.parse(localStorage.getItem("allTrips") || "[]");
                allTrips.push(trip);
                localStorage.setItem("allTrips", JSON.stringify(allTrips));
                localStorage.removeItem("latestTrip");
                navigate("/tripresults");
              } catch (error) {
                alert("Error: Failed to execute trip.");
              }
            }}
          >Execute Delivery</button>
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
            onClick={() => navigate("/newtrip")}
          >Edit Delivery</button>
        </div>
      </div>
    </div>
  );
}
