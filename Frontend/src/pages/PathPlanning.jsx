/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip,
  LayersControl, ScaleControl, ZoomControl, useMap
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import axios from "axios";

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

// HQ set to Connaught Place, New Delhi
const HQ = { lat: 28.6139, lng: 77.2090 };
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

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

// ----------- Closest launch point logic -----------
function findShortestDroneTripPoint(polyline, deliveryLat, deliveryLng) {
  let minDist = Infinity;
  let bestPoint = null;
  let bestIdx = 0;
  // Try all vertices and midpoints
  for (let i = 0; i < polyline.length - 1; i++) {
    const candidates = [
      polyline[i],
      [
        (polyline[i][0] + polyline[i+1][0]) / 2,
        (polyline[i][1] + polyline[i+1][1]) / 2
      ]
    ];
    for (const pt of candidates) {
      const droneLeg = haversineDistance(pt[0], pt[1], deliveryLat, deliveryLng);
      if (droneLeg < minDist) {
        minDist = droneLeg;
        bestPoint = pt;
        bestIdx = i;
      }
    }
  }
  // Also check the last vertex
  const lastPt = polyline[polyline.length - 1];
  const droneLegLast = haversineDistance(lastPt[0], lastPt[1], deliveryLat, deliveryLng);
  if (droneLegLast < minDist) {
    minDist = droneLegLast;
    bestPoint = lastPt;
    bestIdx = polyline.length - 1;
  }
  return { point: bestPoint, idx: bestIdx };
}

export default function PathPlanning() {
  const [trip, setTrip] = useState(null);
  const [truckPolyline, setTruckPolyline] = useState([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const storedTrip = localStorage.getItem("latestTrip");
    if (storedTrip) {
      setTrip(JSON.parse(storedTrip));
    } else {
      navigate("/newtrip");
    }
  }, []);

  // Defensive: always define these, even if trip is null
  let droneDelivery = null;
  let truckDeliveries = [];
  let drone = null;
  let optimizedNodeOrder = [[HQ.lat, HQ.lng], [HQ.lat, HQ.lng]];
  if (trip) {
    droneDelivery = trip.droneDelivery
      ? {
          ...trip.droneDelivery,
          latitude: Number(trip.droneDelivery.latitude),
          longitude: Number(trip.droneDelivery.longitude)
        }
      : null;
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

  if (!trip || !droneDelivery) return <div style={{padding: 40}}>Loading trip...</div>;

  // --------- Use the closest launch point logic ---------
  const { point: launchPoint, idx: launchIdx } = findShortestDroneTripPoint(
    truckPolyline.length > 1 ? truckPolyline : optimizedNodeOrder,
    droneDelivery.latitude,
    droneDelivery.longitude
  );
  const landingPoint = launchPoint;

  let traversalPoints = [
    { label: "A", type: "HQ", coords: [HQ.lat, HQ.lng] },
    ...optimizedNodeOrder.slice(1, -1).map((coords, i) => ({
      label: getLabel(i + 1),
      type: "Truck",
      coords,
      idx: i
    })),
    { label: getLabel(optimizedNodeOrder.length - 1), type: "Launch", coords: launchPoint },
    { label: getLabel(optimizedNodeOrder.length), type: "DroneDelivery", coords: [droneDelivery.latitude, droneDelivery.longitude] },
    { label: getLabel(optimizedNodeOrder.length + 1), type: "Landing", coords: landingPoint },
    { label: getLabel(optimizedNodeOrder.length + 2), type: "HQ", coords: [HQ.lat, HQ.lng] }
  ];

  // Calculate truck time to launch point
  let truckTimeToLaunch = 0;
  let truckDistToLaunch = 0;
  const polyline = truckPolyline.length > 1 ? truckPolyline : optimizedNodeOrder;
  let cumDist = [0];
  for (let i = 1; i < polyline.length; i++) {
    cumDist[i] = cumDist[i-1] + haversineDistance(
      polyline[i-1][0], polyline[i-1][1], polyline[i][0], polyline[i][1]
    );
  }
  truckDistToLaunch = cumDist[launchIdx] + haversineDistance(polyline[launchIdx][0], polyline[launchIdx][1], launchPoint[0], launchPoint[1]);
  truckTimeToLaunch = (truckDistToLaunch / 30) * 60;

  // Truck time after launch point
  let truckTimeAfter = 0;
  let truckDistAfter = 0;
  if (launchIdx < polyline.length - 1) {
    truckDistAfter += haversineDistance(
      launchPoint[0], launchPoint[1],
      polyline[launchIdx + 1][0], polyline[launchIdx + 1][1]
    );
    truckDistAfter += (cumDist[polyline.length - 1] - cumDist[launchIdx + 1]);
  }
  truckTimeAfter = (truckDistAfter / 30) * 60;

  // Drone round trip time (launch -> delivery -> launch)
  const droneLeg = haversineDistance(
    launchPoint[0], launchPoint[1],
    droneDelivery.latitude, droneDelivery.longitude
  );
  const droneTripTime = (2 * droneLeg / 40) * 60; // 40 km/h

  // Total trip time
  const totalTripTime = truckTimeToLaunch + Math.max(droneTripTime, truckTimeAfter);

  // Emissions (truck only, hybrid)
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
  for (let i = 0; i < polyline.length - 1; i++) {
    truckDist += haversineDistance(
      polyline[i][0], polyline[i][1],
      polyline[i+1][0], polyline[i+1][1]
    );
  }

  const TRUCK_EMISSION_PER_MILE = 1.2;
  const DRONE_EMISSION_PER_MILE = 0.1;
  const truckOnlyCarbon = miles(truckOnlyDist) * TRUCK_EMISSION_PER_MILE;
  const hybridCarbon = miles(truckDist) * TRUCK_EMISSION_PER_MILE + miles(droneDistKm) * DRONE_EMISSION_PER_MILE;
  const carbonReduction = truckOnlyCarbon > 0 ? ((truckOnlyCarbon - hybridCarbon) / truckOnlyCarbon) * 100 : 0;

  const allPoints = traversalPoints.map(pt => pt.coords);
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
