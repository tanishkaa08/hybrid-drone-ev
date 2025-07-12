/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDrones } from '../data.jsx';

const TRUCK_EMISSION_PER_MILE = 1.2;
const DRONE_EMISSION_PER_MILE = 0.1;

function getDistance(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function NewTrip() {
  const [hqLat, setHqLat] = useState('12.9716');
  const [hqLng, setHqLng] = useState('77.5946');
  const [num, setNum] = useState(1);
  const [del, setDel] = useState([{ weight: '', latitude: '', longitude: '' }]);
  const { drones } = useDrones();
  const nav = useNavigate();
  // Always create refs for each cell before rendering
  const deliveryRefs = useRef([]);
  if (deliveryRefs.current.length !== del.length) {
    deliveryRefs.current = Array(del.length)
      .fill()
      .map((_, row) =>
        Array(3)
          .fill()
          .map((_, col) => deliveryRefs.current[row]?.[col] || React.createRef())
      );
  }

  // Prefill if editing
  useEffect(() => {
    const editTrip = localStorage.getItem("editTrip");
    if (editTrip) {
      const trip = JSON.parse(editTrip);
      let deliveries = [];
      if (trip.droneDelivery) deliveries.push(trip.droneDelivery);
      if (Array.isArray(trip.truckDeliveries)) deliveries = deliveries.concat(trip.truckDeliveries);
      setNum(deliveries.length);
      setDel(deliveries.map(d => ({
        weight: d.weight || '',
        latitude: d.latitude || '',
        longitude: d.longitude || ''
      })));
      if (trip.hqLat && trip.hqLng) {
        setHqLat(String(trip.hqLat));
        setHqLng(String(trip.hqLng));
      }
    }
  }, []);

  const setField = (idx, f, v) => {
    const updated = [...del];
    updated[idx][f] = v;
    setDel(updated);
  };

  const optimizeTrip = (deliveries, hqLat, hqLng) => {
    let best = null;
    const HQ = { lat: Number(hqLat), lng: Number(hqLng) };
    for (let i = 0; i < deliveries.length; i++) {
      const droneDelivery = deliveries[i];
      const truckDeliveries = deliveries.filter((_, idx) => idx !== i);
      const availableDrones = drones.filter(d =>
        d.available &&
        Number(d.payload) >= Number(droneDelivery.weight) &&
        Number(d.currentBattery) >= 20
      );
      if (!availableDrones.length) continue;
      const drone = availableDrones[0];
      const droneDist = getDistance(HQ.lat, HQ.lng, Number(droneDelivery.latitude), Number(droneDelivery.longitude)) * 2;
      let truckDist = 0;
      let prev = HQ;
      truckDeliveries.forEach(del => {
        truckDist += getDistance(prev.lat, prev.lng, Number(del.latitude), Number(del.longitude));
        prev = { lat: Number(del.latitude), lng: Number(del.longitude) };
      });
      if (truckDeliveries.length) {
        truckDist += getDistance(prev.lat, prev.lng, HQ.lat, HQ.lng);
      }
      const truckOnlyDist = deliveries.reduce((sum, del, idx) => {
        const from = idx === 0 ? HQ : {
          lat: Number(deliveries[idx - 1].latitude),
          lng: Number(deliveries[idx - 1].longitude)
        };
        return sum + getDistance(from.lat, from.lng, Number(del.latitude), Number(del.longitude));
      }, 0) + getDistance(Number(deliveries[deliveries.length - 1].latitude), Number(deliveries[deliveries.length - 1].longitude), HQ.lat, HQ.lng);
      const truckOnlyCarbon = truckOnlyDist * TRUCK_EMISSION_PER_MILE;
      const hybridCarbon = (truckDist * TRUCK_EMISSION_PER_MILE) + (droneDist * DRONE_EMISSION_PER_MILE);
      const carbonReduction = ((truckOnlyCarbon - hybridCarbon) / truckOnlyCarbon) * 100;
      const truckTime = (truckDist / 30) * 60;
      const droneTime = (droneDist / 40) * 60;
      const totalTime = Math.max(truckTime, droneTime);
      if (!best || hybridCarbon < best.hybridCarbon) {
        best = {
          drone,
          droneDelivery,
          truckDeliveries,
          droneDist: droneDist.toFixed(2),
          truckDist: truckDist.toFixed(2),
          carbonReduction: carbonReduction.toFixed(1),
          totalTime: totalTime.toFixed(1),
          hybridCarbon: hybridCarbon.toFixed(2),
          truckOnlyCarbon: truckOnlyCarbon.toFixed(2),
          truckOnlyTime: (truckOnlyDist / 30 * 60).toFixed(1),
          deliveries,
          hqLat: Number(hqLat),
          hqLng: Number(hqLng),
          createdAt: new Date().toISOString()
        };
      }
    }
    return best;
  };

  const optimizeTripWithML = (deliveries, hqLat, hqLng, predictedDroneIndex) => {
    const HQ = { lat: Number(hqLat), lng: Number(hqLng) };
    
    // Validate predicted index
    if (predictedDroneIndex < 0 || predictedDroneIndex >= deliveries.length) {
      console.warn('Invalid ML prediction index, falling back to original optimization');
      return optimizeTrip(deliveries, hqLat, hqLng);
    }
    
    const droneDelivery = deliveries[predictedDroneIndex];
    const truckDeliveries = deliveries.filter((_, idx) => idx !== predictedDroneIndex);
    
    const availableDrones = drones.filter(d =>
      d.available &&
      Number(d.payload) >= Number(droneDelivery.weight) &&
      Number(d.currentBattery) >= 20
    );
    
    if (!availableDrones.length) {
      console.warn('No suitable drone available for ML-predicted delivery, falling back to original optimization');
      return optimizeTrip(deliveries, hqLat, hqLng);
    }
    
    const drone = availableDrones[0];
    const droneDist = getDistance(HQ.lat, HQ.lng, Number(droneDelivery.latitude), Number(droneDelivery.longitude)) * 2;
    
    let truckDist = 0;
    let prev = HQ;
    truckDeliveries.forEach(del => {
      truckDist += getDistance(prev.lat, prev.lng, Number(del.latitude), Number(del.longitude));
      prev = { lat: Number(del.latitude), lng: Number(del.longitude) };
    });
    if (truckDeliveries.length) {
      truckDist += getDistance(prev.lat, prev.lng, HQ.lat, HQ.lng);
    }
    
    const truckOnlyDist = deliveries.reduce((sum, del, idx) => {
      const from = idx === 0 ? HQ : {
        lat: Number(deliveries[idx - 1].latitude),
        lng: Number(deliveries[idx - 1].longitude)
      };
      return sum + getDistance(from.lat, from.lng, Number(del.latitude), Number(del.longitude));
    }, 0) + getDistance(Number(deliveries[deliveries.length - 1].latitude), Number(deliveries[deliveries.length - 1].longitude), HQ.lat, HQ.lng);
    
    const truckOnlyCarbon = truckOnlyDist * TRUCK_EMISSION_PER_MILE;
    const hybridCarbon = (truckDist * TRUCK_EMISSION_PER_MILE) + (droneDist * DRONE_EMISSION_PER_MILE);
    const carbonReduction = ((truckOnlyCarbon - hybridCarbon) / truckOnlyCarbon) * 100;
    const truckTime = (truckDist / 30) * 60;
    const droneTime = (droneDist / 40) * 60;
    const totalTime = Math.max(truckTime, droneTime);
    
    return {
      drone,
      droneDelivery,
      truckDeliveries,
      droneDist: droneDist.toFixed(2),
      truckDist: truckDist.toFixed(2),
      carbonReduction: carbonReduction.toFixed(1),
      totalTime: totalTime.toFixed(1),
      hybridCarbon: hybridCarbon.toFixed(2),
      truckOnlyCarbon: truckOnlyCarbon.toFixed(2),
      truckOnlyTime: (truckOnlyDist / 30 * 60).toFixed(1),
      deliveries,
      hqLat: Number(hqLat),
      hqLng: Number(hqLng),
      createdAt: new Date().toISOString(),
      mlPredictedIndex: predictedDroneIndex
    };
  };

  const submit = async (e) => {
    e.preventDefault();
    const deliveries = del.map(d => ({
      ...d,
      weight: Number(d.weight)
    }));
    
    try {
      // KMeans call (already present)
      const hq = { latitude: Number(hqLat), longitude: Number(hqLng) };
      // Before calling the ML API (wherever the ML API is called, e.g., in optimizeTripWithML or submit)
      console.log("[ML INPUT] Deliveries:", deliveries, "HQ:", hqLat, hqLng, "Drones:", drones);
      const mlResponse = await fetch('/api/ml/predict-drone-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hq, deliveries })
      });
      if (!mlResponse.ok) {
        const errText = await mlResponse.text();
        console.error('ML prediction failed:', errText);
      }
      const mlData = await mlResponse.json();
      const predictedDroneIndex = mlData.data.droneIndex;

      let trip;
      if (typeof predictedDroneIndex === 'number' && predictedDroneIndex >= 0 && predictedDroneIndex < deliveries.length) {
        trip = optimizeTripWithML(deliveries, hqLat, hqLng, predictedDroneIndex);
        trip.mlPredictedDelivery = deliveries[predictedDroneIndex];
      } else {
        trip = optimizeTrip(deliveries, hqLat, hqLng);
        trip.mlPredictedDelivery = null;
      }
      if (trip) {
        localStorage.setItem('latestTrip', JSON.stringify(trip));
        localStorage.removeItem("editTrip");

        // --- XGB INTEGRATION ---
        // Prepare the payload for XGB with more complete data
        const droneDelivery = trip.mlPredictedDelivery || trip.droneDelivery;
        const assignedDrone = trip.drone;
        
        // Calculate distance from launch to drone delivery
        // For now, use HQ as launch (for full integration, use actual launchPoint if available)
        const hqLatNum = Number(hqLat);
        const hqLngNum = Number(hqLng);
        const deliveryLat = Number(droneDelivery?.latitude);
        const deliveryLng = Number(droneDelivery?.longitude);
        // Haversine in meters
        const R = 6371000;
        const dLat = (deliveryLat - hqLatNum) * Math.PI / 180;
        const dLng = (deliveryLng - hqLngNum) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(hqLatNum * Math.PI / 180) * Math.cos(deliveryLat * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const launchToDeliveryDistance = R * c;

        // Use wind speed from localStorage if available
        let wind_speed = 5; // fallback default
        const windSpeedLS = localStorage.getItem('windSpeed');
        if (windSpeedLS && !isNaN(Number(windSpeedLS))) {
          wind_speed = Number(windSpeedLS);
        } else {
          // Fallback: fetch wind speed from OpenWeather API
          try {
            const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${deliveryLat}&lon=${deliveryLng}&appid=${import.meta.env.VITE_OPENWEATHER_API_KEY}&units=metric`);
            if (weatherRes.ok) {
              const weatherData = await weatherRes.json();
              if (weatherData && weatherData.wind && typeof weatherData.wind.speed === 'number') {
                wind_speed = weatherData.wind.speed;
              }
            }
          } catch (e) {
            console.warn('Failed to fetch wind speed, using default:', e);
          }
        }

        const xgbPayload = {
          payload: droneDelivery?.weight,
          latitude: droneDelivery?.latitude,
          longitude: droneDelivery?.longitude,
          droneId: assignedDrone?.droneId,
          distance: launchToDeliveryDistance,
          wind_speed: wind_speed,
          speed: 10,     // Default speed
          position_z: 100, // Default altitude
          angular_speed: 0.5 // Default angular speed
        };

        try {
          const xgbRes = await fetch("/api/ml/run-xgb", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(xgbPayload)
          });
          
          console.log("XGB Response status:", xgbRes.status);
          
          if (!xgbRes.ok) {
            const errorText = await xgbRes.text();
            console.error("XGB API error:", xgbRes.status, errorText);
            localStorage.removeItem("xgbResult");
          } else {
            const xgbData = await xgbRes.json();
            console.log("XGB API success:", xgbData);
            if (xgbData && xgbData.data) {
              localStorage.setItem("xgbResult", JSON.stringify(xgbData.data));
            } else {
              localStorage.removeItem("xgbResult");
            }
          }
        } catch (e) {
          console.error("XGB API exception:", e);
          localStorage.removeItem("xgbResult");
        }
        // --- END XGB INTEGRATION ---

        nav('/pathplanning');
      } else {
        alert('No feasible drone delivery found. All deliveries assigned to truck.');
      }
    } catch (error) {
      console.error('ML prediction error:', error);
      const trip = optimizeTrip(deliveries, hqLat, hqLng);
      trip.mlPredictedDelivery = null;
      if (trip) {
        localStorage.setItem('latestTrip', JSON.stringify(trip));
        localStorage.removeItem("editTrip");
        nav('/pathplanning');
      } else {
        alert('No feasible drone delivery found. All deliveries assigned to truck.');
      }
    }
  };

  // Spreadsheet-like navigation
  const handleKeyDown = (e, rowIdx, colIdx) => {
    const numRows = del.length;
    const numCols = 3;
    let nextRow = rowIdx;
    let nextCol = colIdx;
    if (e.key === 'ArrowDown') {
      nextRow = Math.min(numRows - 1, rowIdx + 1);
    } else if (e.key === 'ArrowUp') {
      nextRow = Math.max(0, rowIdx - 1);
    } else if (e.key === 'ArrowLeft') {
      nextCol = Math.max(0, colIdx - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      nextCol = Math.min(numCols - 1, colIdx + 1);
      if (nextCol === numCols && rowIdx < numRows - 1) {
        nextCol = 0;
        nextRow = rowIdx + 1;
      }
    } else if (e.key === 'Enter') {
      nextRow = Math.min(numRows - 1, rowIdx + 1);
    } else {
      return;
    }
    e.preventDefault();
    const ref = deliveryRefs.current[nextRow]?.[nextCol];
    if (ref && ref.current) ref.current.focus();
  };

  async function getDroneDeliveryIndex(hq, deliveries) {
    const res = await fetch('/api/ml/predict-drone-delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hq, deliveries })
    });
    const data = await res.json();
    return data.droneIndex; // index in deliveries array
  }

  return (
    <div className="container new-trip-container">
      <h2>Create New Trip</h2>
      <form className="new-trip-form" onSubmit={submit} autoComplete="off">
        <div style={{ display: 'flex', gap: 24, marginBottom: 18, alignItems: 'center' }}>
          <div>
            <label style={{ fontWeight: 500 }}>HQ Latitude</label><br />
            <input
              type="number"
              step="any"
              value={hqLat}
              onChange={e => setHqLat(e.target.value)}
              required
              className="small-input"
              style={{ width: 120, marginRight: 8 }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 500 }}>HQ Longitude</label><br />
            <input
              type="number"
              step="any"
              value={hqLng}
              onChange={e => setHqLng(e.target.value)}
              required
              className="small-input"
              style={{ width: 120 }}
            />
          </div>
        </div>
        <label style={{ fontWeight: 500 }}>Number of Deliveries</label>
        <input
          type="number"
          min="1"
          value={num}
          onChange={e => {
            const v = Number(e.target.value);
            setNum(v);
            setDel(Array.from({ length: v }, (_, i) => del[i] || { weight: '', latitude: '', longitude: '' }));
          }}
          placeholder="Enter number of deliveries"
          required
          className="small-input"
          style={{ width: 180, marginBottom: 18 }}
        />
        <div style={{ overflowX: 'auto', marginBottom: 18 }}>
          <table className="input-table" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420, background: '#f8fafc', borderRadius: 10, boxShadow: '0 2px 8px #0001' }}>
            <thead>
              <tr style={{ background: '#e3eafc', color: '#1976d2', fontWeight: 600 }}>
                <th style={{ padding: '10px 16px', borderRadius: '10px 0 0 0' }}>Payload (kg)</th>
                <th style={{ padding: '10px 16px' }}>Latitude</th>
                <th style={{ padding: '10px 16px', borderRadius: '0 10px 0 0' }}>Longitude</th>
              </tr>
            </thead>
            <tbody>
              {del.map((delivery, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f1f8e9' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <input
                      type="number"
                      min="0"
                      placeholder="Weight"
                      required
                      className="small-input"
                      style={{ width: 90, borderRadius: 6, border: '1px solid #b3c6e0', padding: '6px 8px' }}
                      value={delivery.weight}
                      onChange={e => setField(i, 'weight', e.target.value)}
                      ref={deliveryRefs.current[i][0]}
                      onKeyDown={e => handleKeyDown(e, i, 0)}
                    />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <input
                      placeholder="Latitude"
                      required
                      className="small-input"
                      style={{ width: 120, borderRadius: 6, border: '1px solid #b3c6e0', padding: '6px 8px' }}
                      value={delivery.latitude}
                      onChange={e => setField(i, 'latitude', e.target.value)}
                      ref={deliveryRefs.current[i][1]}
                      onKeyDown={e => handleKeyDown(e, i, 1)}
                    />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <input
                      placeholder="Longitude"
                      required
                      className="small-input"
                      style={{ width: 120, borderRadius: 6, border: '1px solid #b3c6e0', padding: '6px 8px' }}
                      value={delivery.longitude}
                      onChange={e => setField(i, 'longitude', e.target.value)}
                      ref={deliveryRefs.current[i][2]}
                      onKeyDown={e => handleKeyDown(e, i, 2)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="rounded-btn submit-btn" style={{ marginTop: 10, padding: '12px 32px', fontWeight: 600, fontSize: '1.1em', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 8, boxShadow: '0 2px 8px #1976d222', cursor: 'pointer' }}>Submit</button>
      </form>
    </div>
  );
}