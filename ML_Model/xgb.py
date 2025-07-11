import numpy as np
import pandas as pd
import joblib
import json
import sys
from typing import Dict, Any

def load_model_and_features() -> tuple:
    try:
        model = joblib.load('time_prediction_model.pkl')
        print("✓ Model loaded successfully")
        
        feature_names = joblib.load('feature_names.pkl')
        print("✓ Feature names loaded successfully")
        
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
        
        print("✓ Input features loaded successfully")
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

def predict_time(model, feature_names: list, input_features: Dict[str, float]) -> float:
    try:
        feature_array = np.array([[input_features[feature] for feature in feature_names]])
        predicted_time = model.predict(feature_array)[0]
        return predicted_time
        
    except Exception as e:
        print(f"Error making prediction: {e}")
        sys.exit(1)

def display_results(input_features: Dict[str, float], predicted_time: float):
    print("\n" + "="*50)
    print("TIME PREDICTION RESULTS")
    print("="*50)
    
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
    predicted_time = predict_time(model, feature_names, input_features)
    display_results(input_features, predicted_time)