import { Drone } from "../models/drone.models.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import asyncHandler from "../utils/AsyncHandler.js";

const createDrone = asyncHandler(async ( req ,res) => {
    const {droneId,currentBattery, batteryCapacity, payload, available} = req.body;
    if(!droneId || !currentBattery || !payload || !batteryCapacity) {
        throw new ApiError(400, "Drone ID, totalBattery,batteryCapacity and payload are required.");
    }

    const existingDrone = await Drone.findOne({droneId: droneId});
    if(existingDrone) {
        throw new ApiError(400, "Drone with this ID already exists.");
    }
    const drone = await Drone.create({
        droneId,
        currentBattery,
        batteryCapacity,
        payload,
        available: available !== undefined ? available : true
    });

    if(!drone) {
        throw new ApiError(500, "Failed to create drone.");
    }

    res.status(201).json(new ApiResponse(201, drone, "Drone created successfully."));
})

const getAllDrones = asyncHandler(async(req,res) => {
    const drones = await Drone.find();
    if(!drones || drones.length === 0) {
        throw new ApiError(404, "No drones found.");
    }
    res.status(200).json(new ApiResponse(200, drones, "Drones retrieved successfully."));
})

const toggleDroneAvailablity = asyncHandler(async(req,res) => {
    const {droneId} = req.params;
    if(!droneId) {
        throw new ApiError(400, "Drone ID is required.");
    }
    
    const drone = await Drone.findOne({ droneId });
    if(!drone) {
        throw new ApiError(404, "Drone not found.");
    }

    drone.available = !drone.available;
    const updatedDrone = await drone.save({validateBeforeSave:false});

    if(!updatedDrone) {
        throw new ApiError(500, "Failed to update drone availability.");
    }

    res.status(200).json(new ApiResponse(200, updatedDrone, "Drone availability toggled successfully."));
})

const editDrone = asyncHandler(async ( req ,res) => {
    const {droneId} = req.params;
    const { battery, payload, available } = req.body;

    if(!droneId) {
        throw new ApiError(400, "Drone ID is required.");
    }

    if(!battery && !payload && available === undefined) {
        throw new ApiError(400, "At least one field (battery, payload, available) must be provided for update.");
    }

    const drone = await Drone.findOne({ droneId });

    if(!drone) {
        throw new ApiError(404, "Drone not found.");
    }

     const updatedDrone = await Drone.findByIdAndUpdate(
  drone._id,
  {
    battery: battery !== undefined ? battery : drone.battery,
    payload: payload !== undefined ? payload : drone.payload,
    available: available !== undefined ? available : drone.available
  },
  { new: true, runValidators: true }
);


    if(!updatedDrone) {
        throw new ApiError(500, "Failed to update drone.");
    }
    res.status(200).json(new ApiResponse(200, updatedDrone, "Drone updated successfully."));
 
})

const deleteDrone = asyncHandler(async (req, res) => {
  const { droneId } = req.params;

  const deleted = await Drone.findOneAndDelete({ droneId });
  if (!deleted) {
    throw new ApiError(404, "Drone not found");
  }

  res.status(200).json(new ApiResponse(200, null, "Drone deleted successfully"));
});




export {
    createDrone,
    getAllDrones,
    toggleDroneAvailablity,
    editDrone,
    deleteDrone
}