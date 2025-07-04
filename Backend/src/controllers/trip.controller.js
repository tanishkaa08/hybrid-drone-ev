import Trip from "../models/trip.models.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import asyncHandler from "../utils/AsyncHandler.js";
import { Drone } from "../models/drone.models.js";

const createTrip = asyncHandler(async (req, res) => {
  const tripData = req.body;

  const trip = await Trip.create(tripData);
  if (!trip) {
    throw new ApiError(500, "Failed to create trip.");
  }

  const drone = await Drone.findOne({ droneId: tripData.drone.droneId });
  if (drone) {
    drone.currentBattery = tripData.drone.currentBattery;
    drone.available = false;
    await drone.save();
  }else {
  console.warn(`Drone with ID ${tripData.drone.droneId} not found in DB.`);
}

  res.status(201).json(new ApiResponse(201, trip, "Trip created successfully."));
});


const getAllTrips = asyncHandler(async (req, res) => {
  const trips = await Trip.find().sort({ createdAt: -1 });

  if (!trips || trips.length === 0) {
    throw new ApiError(404, "No trips found.");
  }

  res.status(200).json(new ApiResponse(200, trips, "Trips retrieved successfully."));
});

const getTripById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const trip = await Trip.findById(id);

  if (!trip) {
    throw new ApiError(404, "Trip not found.");
  }

  res.status(200).json(new ApiResponse(200, trip, "Trip retrieved successfully."));
});

export {
  createTrip,
  getAllTrips,
  getTripById
};
