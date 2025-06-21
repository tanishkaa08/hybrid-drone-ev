import mongoose from 'mongoose';

const droneSchema = new mongoose.Schema({
    droneId:{
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    battery:{
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    payload:{
        type: Number,
        required: true,
        min: 0
    },
    available:{
        type: Boolean,
        default: true
    }
    
},{timestamps: true});

export const Drone = mongoose.model('Drone', droneSchema);