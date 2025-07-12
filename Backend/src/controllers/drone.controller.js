import { Drone } from "../models/drone.models.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import asyncHandler from "../utils/AsyncHandler.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    // Update ML_Model/drones_list.json
    try {
        const dronesListPath = path.join(__dirname, '../../../ML_Model/drones_list.json');
        let dronesList = [];
        if (fs.existsSync(dronesListPath)) {
            dronesList = JSON.parse(fs.readFileSync(dronesListPath, 'utf-8'));
        }
        dronesList.push({
            drone_id: droneId,
            payload_capacity: Number(payload),
            battery_capacity: Number(batteryCapacity),
            battery_percent: Number(currentBattery)
        });
        fs.writeFileSync(dronesListPath, JSON.stringify(dronesList, null, 2));
    } catch (err) {
        console.error('Failed to update drones_list.json:', err);
    }

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

// Sync all drones from DB to ML_Model/drones_list.json
const syncDronesList = asyncHandler(async (req, res) => {
    try {
        const drones = await Drone.find();
        const dronesList = drones.map(d => ({
            drone_id: d.droneId,
            payload_capacity: Number(d.payload),
            battery_capacity: Number(d.batteryCapacity),
            battery_percent: Number(d.currentBattery)
        }));
        const dronesListPath = path.join(__dirname, '../../../ML_Model/drones_list.json');
        fs.writeFileSync(dronesListPath, JSON.stringify(dronesList, null, 2));
        res.status(200).json({ message: 'Drones list synced successfully!', count: dronesList.length });
    } catch (err) {
        console.error('Failed to sync drones_list.json:', err);
        res.status(500).json({ error: 'Failed to sync drones_list.json' });
    }
});


export {
    createDrone,
    getAllDrones,
    toggleDroneAvailablity,
    editDrone,
    deleteDrone,
    syncDronesList
};