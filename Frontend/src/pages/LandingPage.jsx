import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDrones } from '../data.jsx';
import '../LandingPage.css'; // Make sure to create or update this CSS file

export default function LandingPage() {
  const [numDrones, setNumDrones] = useState(1);
  const [droneData, setDroneData] = useState([
    { id: '', payload: '', battery: '', batteryPercentage: '' }
  ]);
  const { setDrones } = useDrones();
  const navigate = useNavigate();

  const handleNumChange = (e) => {
    const val = Number(e.target.value);
    setNumDrones(val);
    setDroneData(Array.from({ length: val }, (_, i) => droneData[i] || { id: '', payload: '', battery: '', batteryPercentage: '' }));
  };

  const handleDroneFieldChange = (index, field, value) => {
    const updated = [...droneData];
    updated[index][field] = value;
    setDroneData(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setDrones(droneData.map(d => ({ ...d, available: true })));
    navigate('/dashboard');
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
                      value={drone.id}
                      onChange={(e) => handleDroneFieldChange(index, 'id', e.target.value)}
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
                      value={drone.battery}
                      onChange={(e) => handleDroneFieldChange(index, 'battery', e.target.value)}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={drone.batteryPercentage}
                      onChange={(e) => handleDroneFieldChange(index, 'batteryPercentage', e.target.value)}
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
