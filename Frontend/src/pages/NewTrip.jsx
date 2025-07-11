import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDrones } from '../data.jsx';

const TRUCK_EMISSION_PER_MILE = 1.2;
const DRONE_EMISSION_PER_MILE = 0.1;
const HQ = { lat: 40.7128, lng: -74.0060 }; // Example: New York City

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
  const [num, setNum] = useState(1);
  const [del, setDel] = useState([{ weight: '', latitude: '', longitude: '' }]);
  const { drones } = useDrones();
  const nav = useNavigate();

  const setField = (idx, f, v) => {
    const updated = [...del];
    updated[idx][f] = v;
    setDel(updated);
  };

  const handleArrowKeys = (e, idx) => {
    const val = del[idx].coordinates || '';
    let [lat, lng] = val.split(',').map(Number);
    if (isNaN(lat)) lat = 0;
    if (isNaN(lng)) lng = 0;
    let changed = false;
    const step = 0.0001;
    switch (e.key) {
      case 'ArrowUp':
        lat += step; changed = true; break;
      case 'ArrowDown':
        lat -= step; changed = true; break;
      case 'ArrowRight':
        lng += step; changed = true; break;
      case 'ArrowLeft':
        lng -= step; changed = true; break;
      default: break;
    }
    if (changed) {
      e.preventDefault();
      setField(idx, 'coordinates', `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
  };

  const handleTableKeyDown = (e, rowIdx, colIdx) => {
    const numRows = del.length;
    const numCols = 2; // weight, coordinates
    let nextRow = rowIdx;
    let nextCol = colIdx;

    switch (e.key) {
      case 'ArrowDown':
        nextRow = Math.min(rowIdx + 1, numRows - 1);
        break;
      case 'ArrowUp':
        nextRow = Math.max(rowIdx - 1, 0);
        break;
      case 'ArrowRight':
        nextCol = Math.min(colIdx + 1, numCols - 1);
        break;
      case 'ArrowLeft':
        nextCol = Math.max(colIdx - 1, 0);
        break;
      case 'Enter':
        if (colIdx < numCols - 1) {
          nextCol = colIdx + 1;
        } else if (rowIdx < numRows - 1) {
          nextRow = rowIdx + 1;
          nextCol = 0;
        }
        break;
      default:
        return;
    }
    e.preventDefault();
    const nextId = `input-${nextRow}-${nextCol === 0 ? 'weight' : 'coordinates'}`;
    const nextElem = document.getElementById(nextId);
    if (nextElem) nextElem.focus();
  };

  const optimizeTrip = (deliveries) => {
    let best = null;

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
          deliveries,
          createdAt: new Date().toISOString()
        };
      }
    }

    return best;
  };

  const submit = (e) => {
    e.preventDefault();
    const deliveries = del.map(d => {
      let lat = '', lng = '';
      if (d.coordinates) {
        [lat, lng] = d.coordinates.split(',').map(Number);
      }
      return {
        ...d,
        latitude: lat,
        longitude: lng,
        weight: Number(d.weight)
      };
    });
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
              <th>Coordinates</th>
            </tr>
          </thead>
          <tbody>
            {del.map((delivery, i) => (
              <tr key={i}>
                <td>
                  <input
                    id={`input-${i}-weight`}
                    name={`input-${i}-weight`}
                    type="number"
                    min="0"
                    placeholder="Weight"
                    required
                    className="small-input"
                    value={delivery.weight}
                    onChange={e => setField(i, 'weight', e.target.value)}
                    onKeyDown={e => handleTableKeyDown(e, i, 0)}
                  />
                </td>
                <td>
                  <input
                    id={`input-${i}-coordinates`}
                    name={`input-${i}-coordinates`}
                    placeholder="lat, lng"
                    required
                    className="small-input"
                    value={delivery.coordinates || ''}
                    onChange={e => setField(i, 'coordinates', e.target.value)}
                    onKeyDown={e => handleTableKeyDown(e, i, 1)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="rounded-btn submit-btn">Submit</button>
      </form>
    </div>
  );
}
