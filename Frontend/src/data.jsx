/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const DroneContext = createContext();

const DroneProvider = ({ children }) => {
  const [drones, setDrones] = useState([]);
  const [deliveries, setDeliveries] = useState([]);

  // 🧠 Fetch drones once when provider mounts
  useEffect(() => {
    const fetchDrones = async () => {
      try {
        const res = await axios.get('/api/v1/drones/getalldrones');
        console.log('Fetched drones:', res.data.data);
        setDrones(res.data.data);
      } catch (err) {
        console.error('Failed to fetch drones for context:', err.response?.data || err.message);
      }
    };

    fetchDrones();
  }, []);

  return (
    <DroneContext.Provider value={{ drones, setDrones, deliveries, setDeliveries }}>
      {children}
    </DroneContext.Provider>
  );
};

export default DroneProvider;

export function useDrones() {
  const context = useContext(DroneContext);
  if (!context) throw new Error('useDrones must be used within DroneProvider');
  return context;
}
