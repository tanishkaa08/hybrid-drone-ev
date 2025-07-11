import express from "express";
import { predictDroneDelivery } from "../controllers/ml.controller.js";

const router = express.Router();

router.post("/predict-drone-delivery", predictDroneDelivery);

export default router;
