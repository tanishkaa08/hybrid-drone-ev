import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import NewTrip from "./pages/NewTrip";
import TripResults from "./pages/TripResults";
import PathPlanning from "./pages/PathPlanning";
import Navbar from "./components/Navbar";
import "./App.css";
import DroneProvider from "./data.jsx";

export default function App() {
  return (
    <DroneProvider>
      <div>
        <Navbar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/newtrip" element={<NewTrip />} />
          <Route path="/pathplanning" element={<PathPlanning />} />
          <Route path="/tripresults" element={<TripResults />} />
        </Routes>
      </div>
    </DroneProvider>
  );
}
