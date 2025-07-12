// ml.controller.js

import asyncHandler from "../utils/AsyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import axios from 'axios';
import { Drone } from "../models/drone.models.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';


export const runKMeansOutlier = asyncHandler(async (req, res) => {
  const { hq, deliveries } = req.body;

  if (!hq || !deliveries || !Array.isArray(deliveries) || deliveries.length === 0) {
    throw new ApiError(400, "Invalid input: hq and deliveries array are required");
  }

  const coordinates = [
    { lat: hq.latitude, lon: hq.longitude },
    ...deliveries.map(d => ({ lat: d.latitude, lon: d.longitude }))
  ];

  try {
    const response = await axios.post(`${ML_SERVICE_URL}/find_outlier`, {
      coordinates: coordinates
    });

    const { outlier_index } = response.data;
    const droneDeliveryIndex = outlier_index - 1; 

    if (isNaN(droneDeliveryIndex) || droneDeliveryIndex < 0 || droneDeliveryIndex >= deliveries.length) {
       throw new ApiError(500, "Received an invalid outlier index from the ML model.");
    }
    
    res.status(200).json(
      new ApiResponse(200, { 
        droneIndex: droneDeliveryIndex,
        rawOutlierIndex: outlier_index
      }, "Outlier detection successful")
    );

  } catch (error) {
    // Handle cases where the ML service is down or returns an error
    console.error("Error calling ML service (KMeans):", error.response ? error.response.data : error.message);
    throw new ApiError(500, "The outlier detection service is currently unavailable or failed.");
  }
});



export const predictFlightTime = asyncHandler(async (req, res) => {
  const { payload, latitude, longitude, wind_speed, distance } = req.body;

  const UNIVERSAL_AVG = {
    distance: 1000,
    wind_speed: 5,
    position_x: 77.5946,
    position_y: 12.9716,
    position_z: 50,
    speed: 10,
    payload: 1000,
    angular: 0.5
  };

  const modelFeatures = {
    distance: distance !== undefined ? Number(distance) : UNIVERSAL_AVG.distance,
    wind_speed: wind_speed !== undefined ? Number(wind_speed) : UNIVERSAL_AVG.wind_speed,
    position_x: longitude !== undefined ? Number(longitude) : UNIVERSAL_AVG.position_x,
    position_y: latitude !== undefined ? Number(latitude) : UNIVERSAL_AVG.position_y,
    position_z: req.body.position_z !== undefined ? Number(req.body.position_z) : UNIVERSAL_AVG.position_z,
    speed: req.body.speed !== undefined ? Number(req.body.speed) : UNIVERSAL_AVG.speed,
    payload: payload !== undefined ? Number(payload) * 1000 : UNIVERSAL_AVG.payload, // kg to grams
    angular: req.body.angular_speed !== undefined ? Number(req.body.angular_speed) : UNIVERSAL_AVG.angular
  };

  try {
    const allDronesFromDB = await Drone.find().lean();
    const availableDrones = allDronesFromDB.map(d => ({
      drone_id: d.droneId,
      payload_capacity: Number(d.payload),
      battery_capacity: Number(d.batteryCapacity),
      battery_percent: Number(d.currentBattery)
    }));
    
    const response = await axios.post(`${ML_SERVICE_URL}/predict_time`, {
      features: modelFeatures,
      drones: availableDrones 
    });

    res.status(200).json(
      new ApiResponse(200, response.data, "Time prediction successful")
    );

  } catch (error) {
    console.error("Error calling ML service (XGBoost):", error.response ? error.response.data : error.message);
    throw new ApiError(500, "The time prediction service is currently unavailable or failed.");
  }
});