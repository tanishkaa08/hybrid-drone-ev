 import express from "express";
import app from "./app.js";

 import dotenv from "dotenv";
 dotenv.config({ path: "./.env" });

 import mongoose from "mongoose";
import { DB_NAME } from "./constants.js";
import connectDB from "./db/index.js";

connectDB()
.then(() => {
    app.listen(process.env.PORT || 8000, () => {
        console.log(`Server is running on port ${process.env.PORT}`);
    });
})
.catch((error) => {
     console.error("MongoDB connection error:", error);
     process.exit(1); 
 });