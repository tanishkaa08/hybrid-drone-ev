import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import asyncHandler from "../utils/AsyncHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const predictDroneDelivery = asyncHandler(async (req, res) => {
  const { hq, deliveries } = req.body;

  if (!hq || !deliveries || !Array.isArray(deliveries) || deliveries.length === 0) {
    throw new ApiError(400, "Invalid input: hq and deliveries array required");
  }

  try {
    // Prepare coordinates for the ML model: HQ first, then all deliveries
    const coordinates = [
      { lat: hq.latitude, lon: hq.longitude },
      ...deliveries.map(d => ({ lat: d.latitude, lon: d.longitude }))
    ];

    // Write coordinates to the shared JSON file
    const jsonPath = path.join(__dirname, '../../../ML_Model/kmeans_input.json');
    fs.writeFileSync(jsonPath, JSON.stringify(coordinates, null, 2));

    // Call the Python k-means script with --quiet
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

export {
  predictDroneDelivery
}; 