import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDrones } from '../data.jsx';

// Hardcoded carbon emission values (kg CO2 per mile)
const TRUCK_EMISSION_PER_MILE = 1.2;
const DRONE_EMISSION_PER_MILE = 0.1;
const HQ = { lat: 40.7128, lng: -74.0060 }; // Example: New York City

function getDistance(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 3958.8; // miles
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
  const [num, setNum] = useState(1);
  const [del, setDel] = useState([
    { weight: '', latitude: '', longitude: '' }
  ]);
  const { drones } = useDrones();
  const nav = useNavigate();

  const setField = (idx, f, v) => {
    const updated = [...del];
    updated[idx][f] = v;
    setDel(updated);
  };

  const optimizeTrip = (deliveries) => {
    let best = null;
    for (let i = 0; i < deliveries.length; i++) {
      const droneDelivery = deliveries[i];
      const truckDeliveries = deliveries.filter((_, idx) => idx !== i);
      const suitableDrones = drones.filter(d => d.available && Number(d.payload) >= Number(droneDelivery.weight) && Number(d.currentBattery) >= 20);
      if (!suitableDrones.length) continue;
      const drone = suitableDrones[0];
      const droneDist = getDistance(HQ.lat, HQ.lng, Number(droneDelivery.latitude), Number(droneDelivery.longitude));
      let truckDist = 0, prev = HQ;
      truckDeliveries.forEach(del => {
        truckDist += getDistance(prev.lat, prev.lng, Number(del.latitude), Number(del.longitude));
        prev = { lat: Number(del.latitude), lng: Number(del.longitude) };
      });
      if (truckDeliveries.length) truckDist += getDistance(prev.lat, prev.lng, HQ.lat, HQ.lng);
      const truckOnlyDist = deliveries.reduce((sum, del, idx) => {
        if (idx === 0) return sum + getDistance(HQ.lat, HQ.lng, Number(del.latitude), Number(del.longitude));
        return sum + getDistance(Number(deliveries[idx-1].latitude), Number(deliveries[idx-1].longitude), Number(del.latitude), Number(del.longitude));
      }, 0) + getDistance(Number(deliveries[deliveries.length-1].latitude), Number(deliveries[deliveries.length-1].longitude), HQ.lat, HQ.lng);
      const truckOnlyCarbon = truckOnlyDist * TRUCK_EMISSION_PER_MILE;
      const hybridCarbon = truckDist * TRUCK_EMISSION_PER_MILE + droneDist * DRONE_EMISSION_PER_MILE;
      const carbonReduction = ((truckOnlyCarbon - hybridCarbon) / truckOnlyCarbon) * 100;
      const truckTime = truckDist / 30 * 60;
      const droneTime = droneDist / 40 * 60;
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
          hybridCarbon,
          deliveries,
          createdAt: new Date().toISOString(),
        };
      }
    }
    return best;
  };

  const submit = e => {
    e.preventDefault();
    const deliveries = del.map(d => ({ ...d, weight: Number(d.weight) }));
    const trip = optimizeTrip(deliveries);
    if (trip) {
      localStorage.setItem('latestTrip', JSON.stringify(trip));
      nav('/pathplanning');
    } else {
      alert('No feasible drone delivery found. All deliveries assigned to truck.');
    }
  };

  return (
    <div className="container new-trip-container">
      <h2>Create New Trip</h2>
      <form className="new-trip-form" onSubmit={submit}>
        <label>Number of Deliveries</label>
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
        />
        <table className="input-table">
          <thead>
            <tr>
              <th>Payload (kg)</th>
              <th>Latitude</th>
              <th>Longitude</th>
            </tr>
          </thead>
          <tbody>
            {del.map((delivery, i) => (
              <tr key={i}>
                <td><input type="number" min="0" placeholder="Weight" required className="small-input" value={delivery.weight} onChange={e => setField(i, 'weight', e.target.value)} /></td>
                <td><input placeholder="Latitude" required className="small-input" value={delivery.latitude} onChange={e => setField(i, 'latitude', e.target.value)} /></td>
                <td><input placeholder="Longitude" required className="small-input" value={delivery.longitude} onChange={e => setField(i, 'longitude', e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="rounded-btn submit-btn">Submit</button>
      </form>
    </div>
  );
}
