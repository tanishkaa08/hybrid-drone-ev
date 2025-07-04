import mongoose from "mongoose";

const deliverySchema = new mongoose.Schema({
  weight: Number,
  latitude: String,
  longitude: String
});

const tripSchema = new mongoose.Schema({
  drone: {
    droneId: String,
    payload: Number,
    currentBattery: Number
  },
  droneDelivery: deliverySchema,
  truckDeliveries: [deliverySchema],
  droneDist: String,
  truckDist: String,
  carbonReduction: String,
  totalTime: String,
  hybridCarbon: Number,
  deliveries: [deliverySchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Trip", tripSchema);
