import express from "express";
import { predictDroneDelivery,predictDroneTime,saveDronesList, runXGBModel } from "../controllers/ml.controller.js";

const router = express.Router();

router.post("/predict-drone-delivery", predictDroneDelivery);
router.post("/predict-drone-time", predictDroneTime);
router.get("/save-drones-list", saveDronesList);
router.post("/run-xgb", runXGBModel);

export default router;
