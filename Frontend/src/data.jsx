import React, { createContext, useContext, useState } from 'react';

const DroneContext = createContext();

const DroneProvider = ({ children }) => {
  const [drones, setDrones] = useState([]);
  const [deliveries, setDeliveries] = useState([]);

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