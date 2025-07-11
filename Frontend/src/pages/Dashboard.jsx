import React, { useEffect, useState } from 'react';
import DroneTable from '../components/DroneTable';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [drones, setDrones] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDrones = async () => {
      try {
        const res = await axios.get('/api/v1/drones/getalldrones');
        setDrones(res.data.data); 
      } catch (err) {
        console.error("Failed to fetch drones:", err.response?.data || err.message);
      }
    };

    fetchDrones();
  }, []);

  const toggle = async (i) => {
    const drone = drones[i];

    try {
      await axios.put(`/api/v1/drones/toggleavailability/${drone.droneId}`);

      const updated = [...drones];
      updated[i].available = !updated[i].available;
      setDrones(updated);
    } catch (err) {
      console.error("Error toggling drone availability:", err.response?.data || err.message);
      alert("Failed to update drone availability.");
    }
  };

  const del = async (i) => {
    const drone = drones[i];

    try {
      await axios.delete(`/api/v1/drones/${drone.droneId}`);

      const updated = drones.filter((_, idx) => idx !== i);
      setDrones(updated);
    } catch (err) {
      console.error("Error deleting drone:", err.response?.data || err.message);
      alert("Failed to delete drone.");
    }
  };

  return (
    <div className="dashboard-container">
      <h2>Drones</h2>
      <DroneTable drones={drones} onToggle={toggle} onDelete={del} />
      <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <button
          className="rounded-btn submit-btn"
          onClick={() => navigate('/newtrip')}
        >
          Start New Trip
        </button>
        <button
          className="rounded-btn submit-btn"
          style={{ background: '#1976d2', color: '#fff' }}
          onClick={() => navigate('/')}
        >
          Add Drone
        </button>
      </div>
    </div>
  );
}
