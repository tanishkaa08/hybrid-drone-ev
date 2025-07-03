export default function DroneCard({ drone, toggleAvailability, handleNewTrip }) {
  return (
    <div className="card">
      <div>
        <strong>ID:</strong> {drone.id} &nbsp;|&nbsp;
        <strong>Battery:</strong> {drone.battery}mAh &nbsp;|&nbsp;
        <strong>Payload:</strong> {drone.payload}kg &nbsp;|&nbsp;
        <strong>Status:</strong> {drone.available ? "✅ Available" : "❌ Unavailable"}
      </div>
      <div className="card-buttons">
        <button onClick={() => toggleAvailability(drone.id)}>
          {drone.available ? "Make Unavailable" : "Make Available"}
        </button>
        <button onClick={() => handleNewTrip(drone)} disabled={!drone.available}>
          New Trip
        </button>
      </div>
    </div>
  );
}
