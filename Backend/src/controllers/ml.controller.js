import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import asyncHandler from "../utils/AsyncHandler.js";
import axios from 'axios';
import { Drone } from "../models/drone.models.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const predictDroneDelivery = asyncHandler(async (req, res) => {
  const { hq, deliveries } = req.body;

  if (!hq || !deliveries || !Array.isArray(deliveries) || deliveries.length === 0) {
    throw new ApiError(400, "Invalid input: hq and deliveries array required");
  }

  try {
    const coordinates = [
      { lat: hq.latitude, lon: hq.longitude },
      ...deliveries.map(d => ({ lat: d.latitude, lon: d.longitude }))
    ];

    const jsonPath = path.join(__dirname, '../../../ML_Model/kmeans_input.json');
    fs.writeFileSync(jsonPath, JSON.stringify(coordinates, null, 2));

    const pythonScriptPath = path.join(__dirname, '../../../ML_Model/kmeans.py');
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [pythonScriptPath, jsonPath, '--quiet']);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('Python script error:', errorOutput);
          reject(new ApiError(500, `ML model failed with code ${code}`));
          return;
        }

        let outlierIndex = parseInt(output.trim(), 10);
        let droneDeliveryIndex = outlierIndex - 1; // Subtract 1 for HQ

        // Fallback: If ML fails, pick the farthest delivery from HQ
        if (
          isNaN(droneDeliveryIndex) ||
          droneDeliveryIndex < 0 ||
          droneDeliveryIndex >= deliveries.length
        ) {
          let maxDist = -1, maxIdx = -1;
          deliveries.forEach((d, i) => {
            const dist = Math.sqrt(
              Math.pow(Number(d.latitude) - Number(hq.latitude), 2) +
              Math.pow(Number(d.longitude) - Number(hq.longitude), 2)
            );
            if (dist > maxDist) {
              maxDist = dist;
              maxIdx = i;
            }
          });
          droneDeliveryIndex = maxIdx;
        }

        res.status(200).json(
          new ApiResponse(200, { 
            droneIndex: droneDeliveryIndex,
            rawOutlierIndex: outlierIndex
          }, "Drone delivery prediction successful")
        );
        resolve();
      });

      pythonProcess.on('error', (err) => {
        reject(new ApiError(500, `Failed to execute Python script: ${err.message}`));
      });
    });

  } catch (error) {
    throw new ApiError(500, `ML prediction failed: ${error.message}`);
  }
});

 const saveDronesList = async (req, res) => {
  try {
   
    const response = await axios.get('http://localhost:8000/api/v1/drones/getalldrones');
    const drones = response.data;

    const dronesPath = path.join(__dirname, '../../../ML_Model/drones_list.json');
    fs.writeFileSync(dronesPath, JSON.stringify(drones, null, 2));
    res.status(200).json({ message: "Drones list saved successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

 const predictDroneTime = async (req, res) => {
  try {
    const mlInput = req.body;
    const inputPath = path.join(__dirname, '../../../ML_Model/xgb_input.json');
    fs.writeFileSync(inputPath, JSON.stringify(mlInput, null, 2));

    const pythonScriptPath = path.join(__dirname, '../../../ML_Model/xjb.py');
    const pythonProcess = spawn('python', [pythonScriptPath, inputPath]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python script error:', errorOutput);
        return res.status(500).json({ error: `ML model failed with code ${code}` });
      }

      let result = null;
      try {
        const lines = output.trim().split('\n').filter(line => line.trim() !== '');
        result = JSON.parse(lines[lines.length - 1]);
      } catch (e) {
        return res.status(500).json({ error: "Failed to parse ML output", raw: output });
      }

      res.status(200).json({ result });
    });

    pythonProcess.on('error', (err) => {
      res.status(500).json({ error: `Failed to execute Python script: ${err.message}` });
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Universal averages for missing fields
const UNIVERSAL_AVG = {
  position_z: 100,      // example value
  angular_speed: 0.5,   // example value
  speed: 10             // example value
};

export const runXGBModel = asyncHandler(async (req, res) => {
  // 1. Sync drones_list.json with all drones from DB
  try {
    const drones = await Drone.find();
    const dronesList = drones.map(d => ({
      drone_id: d.droneId,
      payload_capacity: Number(d.payload),
      battery_capacity: Number(d.batteryCapacity),
      battery_percent: Number(d.currentBattery)
    }));
    const dronesListPath = path.join(__dirname, "../../../ML_Model/drones_list.json");
    fs.writeFileSync(dronesListPath, JSON.stringify(dronesList, null, 2));
  } catch (err) {
    console.error('Failed to sync drones_list.json before ML prediction:', err);
  }
  // 1. Build xgb_input.json from req.body with correct format and universal averages
  const { payload, latitude, longitude, droneId, wind_speed, distance } = req.body;

  // Debug logging
  console.log("XGB API received:", { payload, latitude, longitude, droneId, wind_speed, distance });

  // Universal averages for missing fields
  const UNIVERSAL_AVG = {
    distance: 1000,         // meters
    wind_speed: 5,         // m/s
    position_x: 77.5946,   // longitude (Bangalore)
    position_y: 12.9716,   // latitude (Bangalore)
    position_z: 50,       // meters
    speed: 10,             // m/s
    payload: 1000,         // grams
    angular: 0.5           // rad/s
  };

  // Use user/API values if provided, else fallback to universal averages
  const xgbInput = {
    distance: distance !== undefined ? Number(distance) : UNIVERSAL_AVG.distance,
    wind_speed: wind_speed !== undefined ? Number(wind_speed) : UNIVERSAL_AVG.wind_speed,
    position_x: longitude !== undefined ? Number(longitude) : UNIVERSAL_AVG.position_x,
    position_y: latitude !== undefined ? Number(latitude) : UNIVERSAL_AVG.position_y,
    position_z: req.body.position_z !== undefined ? Number(req.body.position_z) : UNIVERSAL_AVG.position_z,
    speed: req.body.speed !== undefined ? Number(req.body.speed) : UNIVERSAL_AVG.speed,
    payload: payload !== undefined ? Number(payload) * 1000 : UNIVERSAL_AVG.payload, // kg to grams
    angular: req.body.angular_speed !== undefined ? Number(req.body.angular_speed) : UNIVERSAL_AVG.angular
  };

  console.log("XGB input being written:", xgbInput);

  const xgbInputPath = path.join(__dirname, "../../../ML_Model/xgb_input.json");
  fs.writeFileSync(xgbInputPath, JSON.stringify(xgbInput, null, 2));

  // 2. Build drones_list.json with correct format for xgb.py

  // 3. Call xgb.py (only pass the input file, drones_list.json should be in the same directory)
  const xgbScriptPath = path.join(__dirname, "../../../ML_Model/xgb.py");
  const pythonPath = path.join(__dirname, "../../../ML_Model/venv/Scripts/python.exe");
  
  // Check if virtual environment Python exists, otherwise use system Python
  const useVenvPython = fs.existsSync(pythonPath);
  const finalPythonPath = useVenvPython ? pythonPath : "python";
  
  console.log(`Using Python path: ${finalPythonPath}`);
  
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(finalPythonPath, [xgbScriptPath, xgbInputPath]);
    let output = "";
    let errorOutput = "";

    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
    });
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error('XGB Python script error:', errorOutput);
        console.error('XGB Python script output:', output);
        reject(new ApiError(500, `XGB model failed with code ${code}. Error: ${errorOutput}. Output: ${output}`));
        return;
      }
      
      // Parse JSON output from xgb.py
      try {
        const lines = output.trim().split("\n");
        // Find the JSON line (should be the last line)
        let jsonLine = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{') && line.endsWith('}')) {
            jsonLine = line;
            break;
          }
        }
        
        if (!jsonLine) {
          reject(new ApiError(500, "No JSON output found from XGB model"));
          return;
        }
        
        const result = JSON.parse(jsonLine);
        
        // Extract the data we need for the frontend
        const responseData = {
          droneId: result.drone?.drone_id || "UNKNOWN",
          time: result.predicted_time_minutes || 0,
          predictedTimeSeconds: result.predicted_time_seconds || 0,
          drone: result.drone,
          inputFeatures: result.input_features
        };
        
        res.status(200).json(new ApiResponse(200, responseData, "XGB model prediction successful"));
        resolve();
      } catch (err) {
        console.error('Failed to parse XGB output:', err);
        console.error('Raw output:', output);
        reject(new ApiError(500, "Failed to parse XGB model output: " + err.message));
      }
    });

    pythonProcess.on("error", (err) => {
      reject(new ApiError(500, `Failed to execute xgb.py: ${err.message}`));
    });
  });
});

export {
  predictDroneDelivery,
  saveDronesList,
  predictDroneTime
};
