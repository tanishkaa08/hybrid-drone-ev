import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import asyncHandler from "../utils/AsyncHandler.js";
import axios from 'axios';

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

export {
  predictDroneDelivery,
  saveDronesList,
  predictDroneTime
};
