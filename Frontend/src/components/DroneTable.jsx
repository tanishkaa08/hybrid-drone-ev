import React from 'react';
import '../DroneTable.css';

export default function DroneTable({ drones, onToggle, onDelete }) {
  if (drones.length === 0) {
    return <p>No drones added yet.</p>;
  }

  return (
    <table className="drone-table">
      <thead>
        <tr>
          <th>Drone ID</th>
          <th>Payload Capacity (kg)</th>
          <th>Battery Capacity (mAh)</th>
          <th>Current Battery (%)</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {drones.map((d, i) => (
          <tr key={i}>
            <td>{d.id}</td>
            <td>{d.payload} kg</td>
            <td>{d.battery} mAh</td>
            <td>{d.batteryPercentage}%</td>
            <td>
              <button
                className={`status-btn ${d.available ? 'active' : 'inactive'}`}
                onClick={() => onToggle(i)}
              >
                {d.available ? 'Active' : 'Inactive'}
              </button>
            </td>
            <td>
              <button className="delete-btn" onClick={() => onDelete(i)}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
