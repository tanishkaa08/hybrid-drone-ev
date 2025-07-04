import express from "express";
import { createTrip, getAllTrips, getTripById } from "../controllers/trip.controller.js";

const router = express.Router();

router.post("/createTrip", createTrip);
router.get("/getAllTrips", getAllTrips);
router.get("/:id", getTripById);

export default router;
