import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
const app=express();
import droneRoutes from './routes/drone.routes.js';
import tripRoutes from "./routes/trip.routes.js";
import mlRoutes from './routes/ml.routes.js';
app.use(cors(
    {
        origin: process.env.CORS_ORIGIN,
        credentials: true, 
    }
))

app.use(express.json({
    limit: '16kb'
}))

app.use(express.urlencoded({
    extended: true,
    limit: '16kb',
}
))

app.use(express.static('public'));
app.use(cookieParser());

app.use('/api/v1/drones', droneRoutes);
app.use("/api/trips", tripRoutes);
app.use('/api/ml', mlRoutes);
export default app;