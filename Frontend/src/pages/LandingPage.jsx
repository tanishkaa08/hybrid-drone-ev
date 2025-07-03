import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDrones } from '../data.jsx';
import '../LandingPage.css'; // Make sure to create or update this CSS file
import axios from 'axios';

export default function LandingPage() {
  const [numDrones, setNumDrones] = useState(1);
  const [droneData, setDroneData] = useState([
    { droneId: '', payload: '', batteryCapacity: '', currentBattery: '' }
  ]);
  const { setDrones } = useDrones();
  const navigate = useNavigate();

  const handleNumChange = (e) => {
    const val = Number(e.target.value);
    setNumDrones(val);
   setDroneData(Array.from({ length: val }, (_, i) => droneData[i] || {
  droneId: '',
  payload: '',
  batteryCapacity: '',
  currentBattery: ''
}));

  };

  const handleDroneFieldChange = (index, field, value) => {
    const updated = [...droneData];
    updated[index][field] = value;
    setDroneData(updated);
  };

  const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    for (const drone of droneData) {
      const { droneId, payload, batteryCapacity, currentBattery } = drone;

await axios.post('/api/v1/drones/register', {
  droneId,
  payload: Number(payload),
  batteryCapacity: Number(batteryCapacity),
  currentBattery: Number(currentBattery),
  available: true
});

    }

    setDrones(droneData.map(d => ({ ...d, available: true })));

    navigate('/dashboard');
  } catch (error) {
    console.error("Failed to register drones:", error.response?.data || error.message);
    alert("Failed to register drones. Please check console or your form.");
  }
};


  return (
    <div className="landing-container">
      <h2>Add Drones</h2>

      <form onSubmit={handleSubmit}>
        <label>Number of Drones:</label>
        <input
          type="number"
          min="1"
          value={numDrones}
          onChange={handleNumChange}
          placeholder="Enter number"
          className="small-input"
          required
        />

        {droneData.length > 0 && (
          <table className="drone-table">
            <thead>
              <tr>
                <th>Drone ID</th>
                <th>Payload Capacity (kg)</th>
                <th>Battery Capacity (mAh)</th>
                <th>Current Battery (%)</th>
              </tr>
            </thead>
            <tbody>
              {droneData.map((drone, index) => (
                <tr key={index}>
                  <td>
                    <input
                    type="text"
                    value={drone.droneId}
                    onChange={(e) => handleDroneFieldChange(index, 'droneId', e.target.value)}
                    required
                  />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={drone.payload}
                      onChange={(e) => handleDroneFieldChange(index, 'payload', e.target.value)}
                      required
                    />
                  </td>
                  <td>
                    <input
                  type="number"
                  min="0"
                  value={drone.batteryCapacity}
                  onChange={(e) => handleDroneFieldChange(index, 'batteryCapacity', e.target.value)}
                  required
                />
                  </td>
                  <td>
                    <input
                  type="number"
                  min="0"
                  max="100"
                  value={drone.currentBattery}
                  onChange={(e) => handleDroneFieldChange(index, 'currentBattery', e.target.value)}
                  required
                />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button type="submit" className="save-btn">Save Drones</button>
      </form>
    </div>
  );
}
