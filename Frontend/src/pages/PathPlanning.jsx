/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip,
  LayersControl, ScaleControl, ZoomControl, useMap
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

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
function projectPointOnSegment(A, B, P) {
  const toXY = ([lat, lng]) => {
    const x = lng * Math.cos(toRad((A[0] + B[0]) / 2));
    const y = lat;
    return [x, y];
  };
  const [x1, y1] = toXY(A);
  const [x2, y2] = toXY(B);
  const [x0, y0] = toXY(P);
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return A;
  const t = ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy);
  if (t < 0) return A;
  if (t > 1) return B;
  return [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])];
}
function findPerpendicularPointOnRoute(routePath, deliveryLat, deliveryLng) {
  let minDist = Infinity;
  let closestPoint = null;
  let closestIdx = 0;
  for (let i = 0; i < routePath.length - 1; i++) {
    const A = routePath[i];
    const B = routePath[i + 1];
    const proj = projectPointOnSegment(A, B, [deliveryLat, deliveryLng]);
    const dist = haversineDistance(proj[0], proj[1], deliveryLat, deliveryLng);
    if (dist < minDist) {
      minDist = dist;
      closestPoint = proj;
      closestIdx = i;
    }
  }
  return { point: closestPoint, idx: closestIdx };
}
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

  const droneDelivery = trip.droneDelivery;
  const truckDeliveries = trip.truckDeliveries || [];
  const drone = trip.drone;

  const routePath = [
    [HQ.lat, HQ.lng],
    ...truckDeliveries.map(del => [Number(del.latitude), Number(del.longitude)]),
    [HQ.lat, HQ.lng]
  ];

  const { point: launchPoint } = findPerpendicularPointOnRoute(
    routePath,
    Number(droneDelivery.latitude),
    Number(droneDelivery.longitude)
  );
  const landingPoint = launchPoint;

  let traversalPoints = [
    { label: "A", type: "HQ", coords: [HQ.lat, HQ.lng] },
    ...truckDeliveries.map((del, i) => ({
      label: getLabel(i + 1),
      type: "Truck",
      coords: [Number(del.latitude), Number(del.longitude)],
      idx: i
    })),
    { label: getLabel(truckDeliveries.length + 1), type: "Launch", coords: launchPoint },
    { label: getLabel(truckDeliveries.length + 2), type: "DroneDelivery", coords: [Number(droneDelivery.latitude), Number(droneDelivery.longitude)] },
    { label: getLabel(truckDeliveries.length + 3), type: "Landing", coords: landingPoint },
    { label: getLabel(truckDeliveries.length + 4), type: "HQ", coords: [HQ.lat, HQ.lng] }
  ];

  let truckOnlyDist = 0;
  let prev = HQ;
  const allDeliveries = [droneDelivery, ...truckDeliveries];
  allDeliveries.forEach((del) => {
    const next = { lat: Number(del.latitude), lng: Number(del.longitude) };
    truckOnlyDist += haversineDistance(prev.lat, prev.lng, next.lat, next.lng);
    prev = next;
  });
  truckOnlyDist += haversineDistance(prev.lat, prev.lng, HQ.lat, HQ.lng);

  const droneDistKm = haversineDistance(launchPoint[0], launchPoint[1], Number(droneDelivery.latitude), Number(droneDelivery.longitude)) * 2;
  prev = HQ;
  let truckDist = 0;
  truckDeliveries.forEach(del => {
    const next = { lat: Number(del.latitude), lng: Number(del.longitude) };
    truckDist += haversineDistance(prev.lat, prev.lng, next.lat, next.lng);
    prev = next;
  });
  truckDist += haversineDistance(prev.lat, prev.lng, HQ.lat, HQ.lng);

  const TRUCK_EMISSION_PER_MILE = 1.2;
  const DRONE_EMISSION_PER_MILE = 0.1;
  const truckOnlyCarbon = miles(truckOnlyDist) * TRUCK_EMISSION_PER_MILE;
  const hybridCarbon = miles(truckDist) * TRUCK_EMISSION_PER_MILE + miles(droneDistKm) * DRONE_EMISSION_PER_MILE;
  const carbonReduction = truckOnlyCarbon > 0 ? ((truckOnlyCarbon - hybridCarbon) / truckOnlyCarbon) * 100 : 0;

  const truckTime = (truckDist / 30) * 60;
  const droneTime = (droneDistKm / 40) * 60;
  const totalTime = Math.max(truckTime, droneTime);

  // For fitBounds
  const allPoints = traversalPoints.map(pt => pt.coords);

  return (
    <div style={{
      display: "flex",
      width: "100%",
      fontFamily: "Inter, Roboto, Arial, sans-serif",
      background: "#f8fafc"
    }}>
      <div style={{
        flex: 1,
        minHeight: "100vh",
        background: "#e3eafc",
        boxShadow: "0 0 12px #0001",
        position: "relative"
      }}>
        <MapContainer
          style={{ width: "100%", height: "100vh", borderRadius: "0 16px 16px 0" }}
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

          {/* Markers with tooltips */}
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
          {/* Truck Route */}
          <Polyline positions={routePath} color="#1976d2" weight={6} opacity={0.8} />
          {/* Drone Path */}
          {launchPoint && (
            <Polyline
              positions={[
                launchPoint,
                [Number(droneDelivery.latitude), Number(droneDelivery.longitude)],
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
          }}>{formatTimeMinutes(totalTime)}</div>
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
              {truckDeliveries.map((del, idx) => (
                <tr key={idx}>
                  <td style={{fontWeight: 500, color: "#388e3c"}}>{getLabel(idx + 1)} (Truck):</td>
                  <td>{del.latitude}, {del.longitude}</td>
                </tr>
              ))}
              <tr>
                <td style={{fontWeight: 500, color: "#ffa000"}}>{getLabel(truckDeliveries.length + 1)} (Launch):</td>
                <td>{launchPoint ? `${launchPoint[0].toFixed(5)}, ${launchPoint[1].toFixed(5)}` : "N/A"}</td>
              </tr>
              <tr>
                <td style={{fontWeight: 500, color: "#d32f2f"}}>{getLabel(truckDeliveries.length + 2)} (Drone Delivery):</td>
                <td>{droneDelivery.latitude}, {droneDelivery.longitude}</td>
              </tr>
              <tr>
                <td style={{fontWeight: 500, color: "#7b1fa2"}}>{getLabel(truckDeliveries.length + 3)} (Landing):</td>
                <td>{landingPoint ? `${landingPoint[0].toFixed(5)}, ${landingPoint[1].toFixed(5)}` : "N/A"}</td>
              </tr>
              <tr>
                <td style={{fontWeight: 500, color: "#1976d2"}}>{getLabel(truckDeliveries.length + 4)} (HQ):</td>
                <td>{HQ.lat}, {HQ.lng}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{marginTop: 16, fontSize: "1.1em"}}>
          <b>Drone Used:</b> <span style={{color: "#d32f2f"}}>{drone ? drone.droneId : "N/A"}</span>
        </div>
      </div>
    </div>
  );
}
