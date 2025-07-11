import numpy as np
import pandas as pd
import joblib
import json
import sys
from typing import Dict, Any, List
from dataclasses import dataclass

@dataclass
class Drone:
    drone_id: str
    payload_capacity: float
    battery_capacity: float
    battery_percent: float

def load_model_and_features() -> tuple:
    try:
        model = joblib.load('time_prediction_model.pkl')
        print("Model loaded successfully")
        
        feature_names = joblib.load('feature_names.pkl')
        print("Feature names loaded successfully")
        
        return model, feature_names
        
    except FileNotFoundError as e:
        print(f"Error: Model file not found. Please ensure 'time_prediction_model.pkl' exists.")
        print("Make sure you have trained the model first using the notebook.")
        sys.exit(1)
    except Exception as e:
        print(f"Error loading model: {e}")
        sys.exit(1)

def load_input_from_json(filename: str) -> Dict[str, float]:
    try:
        with open(filename, 'r') as file:
            data = json.load(file)
        
        expected_features = [
            'distance', 'wind_speed', 'position_x', 'position_y', 'position_z', 
            'speed', 'payload', 'angular'
        ]
        
        if not isinstance(data, dict):
            raise ValueError("JSON file should contain a dictionary of features")
        
        missing_features = [feat for feat in expected_features if feat not in data]
        if missing_features:
            raise ValueError(f"Missing required features: {missing_features}")
        
        features = {}
        for feature in expected_features:
            try:
                features[feature] = float(data[feature])
            except (ValueError, TypeError):
                raise ValueError(f"Feature '{feature}' must be a numeric value")
        
        print("Input features loaded successfully")
        return features
        
    except FileNotFoundError:
        print(f"Error: File '{filename}' not found")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON format in '{filename}'")
        sys.exit(1)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading file: {e}")
        sys.exit(1)

def load_drones_list() -> List[Drone]:
    try:
        with open('drones_list.json', 'r') as file:
            drones_data = json.load(file)
        
        if not isinstance(drones_data, list):
            raise ValueError("drones_list.json should contain a list of drones")
        
        drones = []
        for drone_data in drones_data:
            drone = Drone(
                drone_id=drone_data['drone_id'],
                payload_capacity=drone_data['payload_capacity'],
                battery_capacity=drone_data['battery_capacity'],
                battery_percent=drone_data['battery_percent']
            )
            drones.append(drone)
        
        print("Drones list loaded successfully")
        return drones
        
    except FileNotFoundError:
        print("Error: drones_list.json not found")
        sys.exit(1)
    except json.JSONDecodeError:
        print("Error: Invalid JSON format in drones_list.json")
        sys.exit(1)
    except Exception as e:
        print(f"Error loading drones list: {e}")
        sys.exit(1)

def select_best_drone(drones: List[Drone], payload_weight_kg: float) -> Drone:
    suitable_drones = []
    
    for drone in drones:
        weight_difference = drone.payload_capacity - payload_weight_kg
        
        if weight_difference >= 0:
            suitable_drones.append({
                'drone': drone,
                'weight_difference': weight_difference
            })
    
    if not suitable_drones:
        print(f"Error: No drones available that can carry payload of {payload_weight_kg} kg")
        print("Available drone payload capacities:")
        for drone in drones:
            print(f"  - {drone.drone_id}: {drone.payload_capacity} kg")
        sys.exit(1)
    
    suitable_drones.sort(key=lambda x: x['weight_difference'])
    
    min_weight_diff = suitable_drones[0]['weight_difference']
    same_weight_drones = [d for d in suitable_drones if d['weight_difference'] == min_weight_diff]
    
    if len(same_weight_drones) > 1:
        same_weight_drones.sort(key=lambda x: -(x['drone'].battery_percent * x['drone'].battery_capacity / 100))
        best_drone_info = same_weight_drones[0]
    else:
        best_drone_info = suitable_drones[0]
    
    return best_drone_info['drone']

def predict_time(model, feature_names: list, input_features: Dict[str, float]) -> float:
    try:
        feature_array = np.array([[input_features[feature] for feature in feature_names]])
        predicted_time = model.predict(feature_array)[0]
        return predicted_time
        
    except Exception as e:
        print(f"Error making prediction: {e}")
        sys.exit(1)

def display_results(input_features: Dict[str, float], predicted_time: float, selected_drone: Drone):
    print("\n" + "="*50)
    print("TIME PREDICTION RESULTS")
    print("="*50)
    
    print("\nSelected Drone:")
    print("-" * 30)
    print(f"Drone ID: {selected_drone.drone_id}")
    print(f"Payload Capacity: {selected_drone.payload_capacity} kg")
    print(f"Battery Capacity: {selected_drone.battery_capacity} mAh")
    print(f"Current Battery: {selected_drone.battery_percent}%")
    
    battery_remaining = selected_drone.battery_percent * selected_drone.battery_capacity / 100
    print(f"Battery Remaining: {battery_remaining:.0f} mAh")
    
    payload_weight_kg = input_features['payload'] / 1000
    weight_difference = selected_drone.payload_capacity - payload_weight_kg
    print(f"Weight Difference: {weight_difference:.2f} kg")
    
    print("\nInput Features:")
    print("-" * 30)
    for feature, value in input_features.items():
        print(f"{feature:12}: {value:10.4f}")
    
    print("\nPrediction:")
    print("-" * 30)
    print(f"Predicted Time: {predicted_time:.4f} seconds")
    print(f"Predicted Time: {predicted_time/60:.2f} minutes")
    
    print("\n" + "="*50)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python xgb.py <input.json>")
        print("\nJSON file should contain the following features:")
        print("  - distance: Distance to destination (in meters)")
        print("  - wind_speed: Wind speed value (in m/s)")
        print("  - position_x: Longitude")
        print("  - position_y: Latitutde")
        print("  - position_z: Altitude")
        print("  - speed: Speed value (in m/s)")
        print("  - payload: Payload weight (in grams)")
        print("  - angular: Angular velocity magnitude (in rad/s)")
        print("\nExample:")
        print("  python xgb.py xgb_input.json")
        sys.exit(1)

    filename = sys.argv[1]
    print("Drone Time Prediction")
    print("=" * 30)
    print(f"Input file: {filename}")
    
    model, feature_names = load_model_and_features()
    input_features = load_input_from_json(filename)

    # Load drones list and select the best drone
    drones = load_drones_list()
    payload_weight_kg = input_features['payload'] / 1000 # Convert grams to kilograms
    best_drone = select_best_drone(drones, payload_weight_kg)

    predicted_time = predict_time(model, feature_names, input_features)
    display_results(input_features, predicted_time, best_drone)