import { Link } from 'react-router-dom';
export default function Navbar(){
  return (
    <nav className="navbar">
      <div className="navbar-logo">🚁 Drone Delivery</div>
      <div className="navbar-links">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/tripresults">Trips</Link>
        <Link to="/newtrip">New Trip</Link>
        <Link to="/pathplanning">Path Planning</Link>
        <Link to="/">Add Drone</Link>
      </div>
    </nav>
  );
}