import { createDrone, editDrone, getAllDrones, toggleDroneAvailablity } from "../controllers/drone.controller";
import ApiError from "../utils/ApiError";
import { Router } from "express";

const router = Router();

router.route("/register").post(createDrone);
router.route("/getalldrones").get(getAllDrones);
router.route("/toggleavailability/:droneId").put(toggleDroneAvailablity);
router.route("/edit/:droneId").put(editDrone);

export default router;