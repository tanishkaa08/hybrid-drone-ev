/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "../TripResults.css";
import axios from 'axios';
import { Resizable } from "re-resizable";

const HQ = { lat: 12.9716, lng: 77.5946 }; // Bangalore HQ

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

// Helper function to format time as 'X min' or 'X hr Y min'
function formatTimeMinutes(minutes) {
  const min = Math.round(Number(minutes));
  if (minutes === undefined || minutes === null || isNaN(min) || min < 0) return 'N/A';
  if (min < 60) return min + ' min';
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${hr} hr` : `${hr} hr ${rem} min`;
}

// Helper to calculate drone time (distance in km, time in min)
function calcDroneTime(distanceKm, payloadKg) {
  const speed = 40; // km/h
  const baseTime = (distanceKm / speed) * 60; // min
  const penalty = Math.ceil(payloadKg / 2); // 1 min per 2kg
  return baseTime + penalty;
}

// Helper: Find the closest point on a polyline to a given point (lat/lng)
function getPerpendicularLaunchPoint(routePath, deliveryLat, deliveryLng) {
  let minDist = Infinity;
  let closestPoint = null;
  for (let i = 0; i < routePath.length - 1; i++) {
    const [x1, y1] = routePath[i];
    const [x2, y2] = routePath[i + 1];
    const [px, py] = [deliveryLat, deliveryLng];
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) continue;
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    let proj;
    if (t < 0) proj = [x1, y1];
    else if (t > 1) proj = [x2, y2];
    else proj = [x1 + t * dx, y1 + t * dy];
    const dist = Math.sqrt((proj[0] - px) ** 2 + (proj[1] - py) ** 2);
    if (dist < minDist) {
      minDist = dist;
      closestPoint = proj;
    }
  }
  return closestPoint;
}

// Helper: Find the index in routePath closest to a given point
function findClosestIndex(routePath, point) {
  let minDist = Infinity, idx = 0;
  for (let i = 0; i < routePath.length; i++) {
    const dist = Math.sqrt(
      Math.pow(routePath[i][0] - point[0], 2) +
      Math.pow(routePath[i][1] - point[1], 2)
    );
    if (dist < minDist) {
      minDist = dist;
      idx = i;
    }
  }
  return idx;
}

// Placeholder: ML model to select which delivery is by drone
// Input: deliveries, truck route, etc.
// Output: index of delivery for drone, launch point (lat, lng)
const getDroneAssignment = (deliveries, truckRoute) => {
  // TODO: Integrate ML model here
  // For now, pick the farthest delivery as drone delivery
  let maxDist = -1, idx = -1;
  deliveries.forEach((del, i) => {
    const dist = Math.abs(Number(del.latitude) - HQ.lat) + Math.abs(Number(del.longitude) - HQ.lng);
    if (dist > maxDist) { maxDist = dist; idx = i; }
  });
  // Calculate perpendicular launch point (dummy: midpoint for now)
  const launchPoint = {
    latitude: (Number(deliveries[idx].latitude) + HQ.lat) / 2,
    longitude: (Number(deliveries[idx].longitude) + HQ.lng) / 2
  };
  return { droneIdx: idx, launchPoint };
};

// Placeholder: ML model to select best drone
// Input: available drones, required distance, payload
// Output: index of best drone or -1 if none
const selectBestDrone = (drones, requiredDistance) => {
  // TODO: Integrate ML model here
  // For now, pick first drone that can do 2*requiredDistance
  return drones.findIndex(drone => drone.range >= 2 * requiredDistance);
};

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
// Project a point onto a segment (lat/lng, using equirectangular approximation)
function projectPointOnSegment(A, B, P) {
  // A, B, P: [lat, lng]
  // Convert to equirectangular x/y (for small areas)
  const lat1 = toRad(A[0]), lon1 = toRad(A[1]);
  const lat2 = toRad(B[0]), lon2 = toRad(B[1]);
  const lat0 = toRad(P[0]), lon0 = toRad(P[1]);
  // Use A as origin
  const x1 = 0, y1 = 0;
  const x2 = (lon2 - lon1) * Math.cos((lat1 + lat2) / 2);
  const y2 = lat2 - lat1;
  const x0 = (lon0 - lon1) * Math.cos((lat1 + lat0) / 2);
  const y0 = lat0 - lat1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return A;
  const t = ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy);
  if (t < 0) return A;
  if (t > 1) return B;
  // Convert back to lat/lng
  const latProj = A[0] + t * (B[0] - A[0]);
  const lngProj = A[1] + t * (B[1] - A[1]);
  return [latProj, lngProj];
}
function findClosestPointOnRoute(routePath, deliveryLat, deliveryLng) {
  if (!routePath || routePath.length === 0) {
    console.log('findClosestPointOnRoute: routePath empty');
    return null;
  }
  if (routePath.length === 1) {
    console.log('findClosestPointOnRoute: only one point, returning', routePath[0]);
    return routePath[0];
  }
  let minDist = Infinity;
  let closestPoint = null;
  for (let i = 0; i < routePath.length - 1; i++) {
    const A = routePath[i];
    const B = routePath[i + 1];
    const P = [deliveryLat, deliveryLng];
    let proj = null;
    try {
      proj = projectPointOnSegment(A, B, P);
    } catch (e) {
      console.log('projectPointOnSegment error', e, A, B, P);
      proj = null;
    }
    if (proj && Array.isArray(proj) && proj.length === 2 && !isNaN(proj[0]) && !isNaN(proj[1])) {
      const dist = haversineDistance(proj[0], proj[1], deliveryLat, deliveryLng);
      if (dist < minDist) {
        minDist = dist;
        closestPoint = proj;
      }
    } else {
      console.log('Invalid proj', proj, 'for segment', A, B);
    }
  }
  // Fallback: if projection fails, use the closest route vertex
  if (!closestPoint) {
    console.log('No valid projection, falling back to closest vertex');
    let minVertexDist = Infinity;
    for (let i = 0; i < routePath.length; i++) {
      const dist = haversineDistance(routePath[i][0], routePath[i][1], deliveryLat, deliveryLng);
      if (dist < minVertexDist) {
        minVertexDist = dist;
        closestPoint = routePath[i];
      }
    }
  }
  console.log('findClosestPointOnRoute: returning', closestPoint);
  return closestPoint;
}

// Custom marker for drone launch point (orange)
const launchIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  shadowSize: [41, 41],
  className: "launch-marker"
});

// Placeholder: ML model to calculate drone time
// Input: distance (km), payload, drone specs, etc.
// Output: time in minutes
const getDroneTimeML = (distanceKm, payloadKg, drone) => {
  // TODO: Integrate ML model here
  // For now, use calcDroneTime as a fallback
  return calcDroneTime(distanceKm, payloadKg);
};

// Placeholder: ML model to calculate drone carbon emission
// Input: drone, distance, payload, etc.
// Output: carbon emission in grams or kg
const getDroneCarbonEmissionML = (drone, distanceKm, payloadKg) => {
  // TODO: Integrate ML model here
  // For now, assume 50g CO2 per km per kg payload
  return distanceKm * payloadKg * 50; // grams
};

// Placeholder: ML model to calculate truck carbon emission for a delivery
// Input: truck, distance, payload, etc.
// Output: carbon emission in grams or kg
const getTruckCarbonEmissionML = (truck, distanceKm, payloadKg) => {
  // TODO: Integrate ML model here
  // For now, assume 120g CO2 per km per kg payload
  return distanceKm * payloadKg * 120; // grams
};

export default function PathPlanning() {
  const [trip, setTrip] = useState(null);
  const [truckRoute, setTruckRoute] = useState({ distance: null, duration: null, loading: false, error: null });
  const [routePath, setRoutePath] = useState([]);
  const navigate = useNavigate();

  // Load trip from localStorage
  useEffect(() => {
    const storedTrip = localStorage.getItem("latestTrip");
    if (storedTrip) {
      setTrip(JSON.parse(storedTrip));
    } else {
      navigate("/newtrip");
    }
  }, []);

  // Compute truck route: HQ -> all truck deliveries -> HQ
  const truckWaypoints = trip && trip.truckDeliveries && trip.truckDeliveries.length > 0
    ? [
        { latitude: HQ.lat, longitude: HQ.lng },
        ...trip.truckDeliveries.map(del => ({ latitude: del.latitude, longitude: del.longitude })),
        { latitude: HQ.lat, longitude: HQ.lng }
      ]
    : [];

  // Fetch truck route from Mapbox
  useEffect(() => {
    if (truckWaypoints.length > 1) {
      (async () => {
        setTruckRoute({ distance: null, duration: null, loading: true, error: null });
        setRoutePath([]);
        try {
          const coordinatesStr = truckWaypoints
            .map(wp => `${parseFloat(wp.longitude)},${parseFloat(wp.latitude)}`)
            .join(';');
          const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatesStr}?geometries=geojson&access_token=${import.meta.env.VITE_MAPBOX_TOKEN}`;
          const res = await axios.get(url);
          const route = res.data.routes[0];
          const pathCoordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          setRoutePath(pathCoordinates);
          setTruckRoute({
            distance: (route.distance / 1000).toFixed(2), // km
            duration: (route.duration / 60).toFixed(0),   // min
            loading: false,
            error: null
          });
        } catch (err) {
          setTruckRoute({ distance: null, duration: null, loading: false, error: err.message || "Failed to fetch route" });
          setRoutePath([]);
        }
      })();
    }
  }, [JSON.stringify(truckWaypoints)]);

  // --- Calculate drone launch point and distance robustly ---
  let droneLaunchPoint = null, droneDist = null, droneTime = null, droneCarbon = null, truckCarbonIfDroneByTruck = null, carbonReduction = null;
  if (
    trip &&
    trip.droneDelivery &&
    routePath &&
    routePath.length > 1 &&
    trip.drones &&
    trip.drones.length > 0
  ) {
    const delivery = trip.droneDelivery;
    const payloadKg = Number(delivery.weight);
    const deliveryLat = Number(delivery.latitude);
    const deliveryLng = Number(delivery.longitude);
    // Always calculate the launch point as the closest point on the truck route
    droneLaunchPoint = findClosestPointOnRoute(routePath, deliveryLat, deliveryLng);
    console.log('Calculated droneLaunchPoint:', droneLaunchPoint);
    if (droneLaunchPoint) {
      droneDist = haversineDistance(droneLaunchPoint[0], droneLaunchPoint[1], deliveryLat, deliveryLng);
      const drone = trip.drones[0];
      droneTime = getDroneTimeML(droneDist, payloadKg, drone);
      droneCarbon = getDroneCarbonEmissionML(drone, droneDist, payloadKg);
      const truck = { type: 'default' };
      const truckDist = haversineDistance(HQ.lat, HQ.lng, deliveryLat, deliveryLng) * 2;
      truckCarbonIfDroneByTruck = getTruckCarbonEmissionML(truck, truckDist, payloadKg);
      if (truckCarbonIfDroneByTruck > 0) {
        carbonReduction = (((truckCarbonIfDroneByTruck - droneCarbon) / truckCarbonIfDroneByTruck) * 100).toFixed(1);
      }
    }
  }

  // UI rendering
  if (!trip) {
    return <p style={{ padding: "20px" }}>No trip data found. Please plan a trip first.</p>;
  }

  // Center map between HQ and first delivery
  const center = trip.droneDelivery
    ? [
        (Number(trip.droneDelivery.latitude) + HQ.lat) / 2,
        (Number(trip.droneDelivery.longitude) + HQ.lng) / 2,
      ]
    : [HQ.lat, HQ.lng];

  // --- Trip Timeline UI ---
  // Build the timeline steps based on the real path and deliveries
  const timelineSteps = [];
  if (trip && trip.truckDeliveries && trip.truckDeliveries.length > 0 && trip.droneDelivery && droneLaunchPoint) {
    // HQ
    timelineSteps.push({
      label: 'HQ',
      icon: '🏢',
      coords: [HQ.lat, HQ.lng],
      type: 'hq',
    });
    // Truck deliveries before launch point
    let launchIdx = 0;
    let minDist = Infinity;
    trip.truckDeliveries.forEach((del, idx) => {
      const dist = haversineDistance(droneLaunchPoint[0], droneLaunchPoint[1], Number(del.latitude), Number(del.longitude));
      if (dist < minDist) {
        minDist = dist;
        launchIdx = idx + 1; // +1 because HQ is at index 0
      }
    });
    trip.truckDeliveries.forEach((del, idx) => {
      timelineSteps.push({
        label: `Truck Delivery ${String.fromCharCode(65 + idx)}`,
        icon: '🚚',
        coords: [Number(del.latitude), Number(del.longitude)],
        type: 'truck',
      });
      if (idx === launchIdx - 1) {
        // Insert launch point after this delivery
        timelineSteps.push({
          label: 'Drone Launch Point',
          icon: '🚁',
          coords: [droneLaunchPoint[0], droneLaunchPoint[1]],
          type: 'launch',
        });
        timelineSteps.push({
          label: 'Drone Delivery',
          icon: '📦',
          coords: [Number(trip.droneDelivery.latitude), Number(trip.droneDelivery.longitude)],
          type: 'drone',
        });
        timelineSteps.push({
          label: 'Drone Pickup (Truck waits)',
          icon: '🤝',
          coords: [droneLaunchPoint[0], droneLaunchPoint[1]],
          type: 'pickup',
        });
      }
    });
    // Truck deliveries after launch point
    // (If any deliveries after the launch point, add them)
    if (launchIdx < trip.truckDeliveries.length) {
      for (let i = launchIdx; i < trip.truckDeliveries.length; i++) {
        const del = trip.truckDeliveries[i];
        timelineSteps.push({
          label: `Truck Delivery ${String.fromCharCode(65 + i)}`,
          icon: '🚚',
          coords: [Number(del.latitude), Number(del.longitude)],
          type: 'truck',
        });
      }
    }
    // Return to HQ
    timelineSteps.push({
      label: 'Return to HQ',
      icon: '🏢',
      coords: [HQ.lat, HQ.lng],
      type: 'hq',
    });
  }

  console.log('routePath', routePath);
  if (trip && trip.droneDelivery) {
    console.log('deliveryLat', Number(trip.droneDelivery.latitude), 'deliveryLng', Number(trip.droneDelivery.longitude));
  }
  console.log('droneLaunchPoint', droneLaunchPoint);

  return (
    <div className="path-planning-page">
      <div className="left-panel">
        <h2>Path Planning</h2>
        <div className="map-section" style={{ width: "100%" }}>
          <Resizable
            defaultSize={{ width: "100%", height: 300 }}
            minHeight={200}
            maxHeight={800}
            enable={{ top: true, right: false, bottom: true, left: false }}
            style={{ width: "100%" }}
          >
            <MapContainer
              center={center}
              zoom={8}
              style={{ width: "100%", height: "100%" }}
            >
              <TileLayer
                url={`https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=${import.meta.env.VITE_MAPBOX_TOKEN}`}
                id="mapbox/streets-v11"
                tileSize={512}
                zoomOffset={-1}
                attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> contributors'
              />
              <Marker position={[HQ.lat, HQ.lng]} icon={hqIcon}>
                <Popup>HQ Depot (A)</Popup>
              </Marker>
              {trip.droneDelivery && (
                <Marker
                  position={[Number(trip.droneDelivery.latitude), Number(trip.droneDelivery.longitude)]}
                  icon={droneIcon}
                >
                  <Popup>Drone Delivery (B)</Popup>
                </Marker>
              )}
              {trip.truckDeliveries &&
                trip.truckDeliveries.map((del, idx) => (
                  <Marker
                    key={idx}
                    position={[Number(del.latitude), Number(del.longitude)]}
                    icon={truckIcon}
                  >
                    <Popup>Truck Delivery ({String.fromCharCode(67 + idx)})</Popup>
                  </Marker>
                ))}
              {/* Drone launch marker and path always rendered if possible */}
              {droneLaunchPoint && (
                <Marker
                  position={[droneLaunchPoint[0], droneLaunchPoint[1]]}
                  icon={launchIcon}
                >
                  <Popup>Drone Launch Point (D)</Popup>
                </Marker>
              )}
              {droneLaunchPoint && trip.droneDelivery && (
                <Polyline
                  positions={[
                    [droneLaunchPoint[0], droneLaunchPoint[1]],
                    [Number(trip.droneDelivery.latitude), Number(trip.droneDelivery.longitude)],
                    [droneLaunchPoint[0], droneLaunchPoint[1]]
                  ]}
                  color="red"
                  weight={3}
                  opacity={0.7}
                  dashArray="8, 12"
                />
              )}
              {/* Truck route path */}
              {routePath.length > 1 && (
                <Polyline
                  positions={routePath}
                  color="blue"
                  weight={3}
                  opacity={0.7}
                />
              )}
            </MapContainer>
          </Resizable>
        </div>
      </div>

      <div className="right-panel">
        <h3>Trip Details</h3>
        <p><b>Starting Point:</b> HQ Depot Bangalore (12.9716, 77.5946)</p>
        <div className="delivery-item">
          <div><b>Drone Delivery:</b></div>
          <div className="delivery-info">
            <p><b>Drone ID:</b> {trip.drone ? trip.drone.droneId : 'N/A'} | 
              <b> Location:</b> {trip.droneDelivery ? `${trip.droneDelivery.latitude}, ${trip.droneDelivery.longitude}` : 'N/A'} | 
              <b> Payload:</b> {trip.droneDelivery ? trip.droneDelivery.weight : 'N/A'} kg</p>
            <p>
              <b>Drone Straight-Line Distance (one-way):</b> {typeof droneDist === 'number' ? droneDist.toFixed(2) + ' km' : <span style={{color:'red'}}>Cannot calculate (missing launch or delivery point)</span>}<br/>
              <b>Drone Round-Trip Distance:</b> {typeof droneDist === 'number' ? (2 * droneDist).toFixed(2) + ' km' : <span style={{color:'red'}}>Cannot calculate</span>}<br/>
              <b>Time:</b> {droneTime !== null && droneTime !== undefined ? formatTimeMinutes(droneTime) : 'N/A'}
            </p>
            {/* Fallback error message if launch point is not found */}
            {!droneLaunchPoint && (
              <div style={{color: 'red', marginTop: 8}}>
                No valid launch point found. Please check your delivery locations.
              </div>
            )}
          </div>
        </div>
        {trip.truckDeliveries && trip.truckDeliveries.length > 0 && (
          <div className="delivery-item">
            <div>🚚 <b>Truck Deliveries:</b></div>
            <div className="delivery-info">
              {trip.truckDeliveries.map((del, idx) => (
                <p key={idx}><b>Location:</b> {del.latitude}, {del.longitude} | <b>Payload:</b> {del.weight} kg</p>
              ))}
              {/* Truck route time and distance from Mapbox */}
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
        {/* Path Timeline: now placed below truck deliveries and above carbon emissions */}
        {timelineSteps && timelineSteps.length > 0 && (
          <div className="timeline-section" style={{margin: '24px 0'}}>
            <h4>Path Timeline</h4>
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}>
              {timelineSteps.map((step, idx) => (
                <div key={idx} style={{display: 'flex', alignItems: 'center', marginBottom: 12}}>
                  <div style={{width: 32, height: 32, borderRadius: 16, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: '2px solid #e5e7eb'}}>
                    {step.icon}
                  </div>
                  <div style={{marginLeft: 12, fontWeight: 500, fontSize: 16}}>{step.label}</div>
                  {idx < timelineSteps.length - 1 && (
                    <div style={{width: 2, height: 32, background: '#e5e7eb', marginLeft: 15}}></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Carbon Emissions Reduction section follows timeline */}
        <div className="carbon-box">
          <p><b>Carbon Emissions Reduction</b></p>
          <h2>{carbonReduction !== null ? `${carbonReduction}%` : 'N/A'}</h2>
          <div style={{ fontSize: '0.9em', color: '#666' }}>
            <div>Truck (if drone delivery by truck): {truckCarbonIfDroneByTruck ? truckCarbonIfDroneByTruck.toFixed(0) + 'g' : 'N/A'}</div>
            <div>Drone: {droneCarbon ? droneCarbon.toFixed(0) + 'g' : 'N/A'}</div>
          </div>
        </div>

        <div className="carbon-box">
          <p><b>Estimated Time</b></p>
          {(() => {
            const tDrone = droneTime;
            const tTruck = Number(truckRoute.duration);
            if ((!tDrone && tDrone !== 0) && (!tTruck && tTruck !== 0)) return <h2>N/A</h2>;
            const maxTime = Math.max(tDrone || 0, tTruck || 0);
            return <h2>{formatTimeMinutes(maxTime)}</h2>;
          })()}
        </div>

        <div className="button-group">
          <button className="execute-btn" onClick={async () => {
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
          }}>Execute Delivery</button>
          <button className="edit-btn" onClick={() => navigate("/newtrip")}>Edit Delivery</button>
        </div>
      </div>
    </div>
  );
}
