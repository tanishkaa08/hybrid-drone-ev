import { createDrone, editDrone, getAllDrones, toggleDroneAvailablity,deleteDrone, syncDronesList } from "../controllers/drone.controller.js";
import ApiError from "../utils/ApiError.js";
import { Router } from "express";

const router = Router();

router.route("/register").post(createDrone);
router.route("/getalldrones").get(getAllDrones);
router.route("/toggleavailability/:droneId").put(toggleDroneAvailablity);
router.route("/edit/:droneId").put(editDrone);
router.route("/sync-drones-list").post(syncDronesList);
router.route("/:droneId").delete(deleteDrone);

export default router;