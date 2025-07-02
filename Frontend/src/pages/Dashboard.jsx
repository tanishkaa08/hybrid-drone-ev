import React from 'react';
import DroneTable from '../components/DroneTable';
import { useDrones } from '../data.jsx';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { drones, setDrones } = useDrones();
  const navigate = useNavigate();

  const toggle = (i) => {
    const updated = [...drones];
    updated[i].available = !updated[i].available;
    setDrones(updated);
  };

  const del = (i) => {
    const updated = drones.filter((_, idx) => idx !== i);
    setDrones(updated);
  };

  return (
    <div className="dashboard-container">
      <h2>Drones</h2>
      <DroneTable drones={drones} onToggle={toggle} onDelete={del} />
      <button className="rounded-btn submit-btn" style={{marginTop: 24}} onClick={() => navigate('/newtrip')}>
        Start New Trip
      </button>
    </div>
  );
}
