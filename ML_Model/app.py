import os
import sys
from flask import Flask, request, jsonify
import joblib
import numpy as np

# --- Local Module Imports ---
# This assumes that `kmeans.py` and `xgb.py` are in the same directory as this `app.py` file.
# We will import the specific functions and classes we need.

try:
    from kmeans import find_outlier_index
    from xgb import select_best_drone, predict_time, Drone
except ImportError as e:
    print(f"FATAL ERROR: Could not import local modules (kmeans.py, xgb.py). Ensure they are in the same directory.")
    print(f"Details: {e}")
    sys.exit(1)


# --- Flask App Initialization ---
app = Flask(__name__)


# --- Global Variables for Models ---
# We load the models and feature names into memory once when the server starts.
# This is much more efficient than loading them from disk for every API call.
xgb_model = None
feature_names = None


# --- Model and Feature Loading Function ---
def load_models():
    """
    Loads the XGBoost model and feature names from .pkl files into global variables.
    This function is called once when the Flask application starts.
    """
    global xgb_model, feature_names
    
    try:
        # Construct absolute paths to the model files to ensure they are found.
        script_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(script_dir, 'time_prediction_model.pkl')
        features_path = os.path.join(script_dir, 'feature_names.pkl')

        print(f"Loading XGBoost model from: {model_path}")
        xgb_model = joblib.load(model_path)
        
        print(f"Loading feature names from: {features_path}")
        feature_names = joblib.load(features_path)
        
        print("✅ Models and features loaded successfully into memory.")
        
    except FileNotFoundError as e:
        print(f"🔥 FATAL ERROR: Model file not found. The prediction endpoint will not work.")
        print(f"   Error details: {e}")
        # The application will continue running, but the /predict_time endpoint will return an error.
    except Exception as e:
        print(f"🔥 FATAL ERROR: An unexpected error occurred while loading models.")
        print(f"   Error details: {e}")


# --- API Endpoints ---

@app.route('/find_outlier', methods=['POST'])
def handle_find_outlier():
    """
    API endpoint to find the outlier in a list of geographic coordinates.
    Expects a JSON payload: { "coordinates": [{"lat": 12.3, "lon": 45.6}, ...] }
    """
    print("Received request for /find_outlier")
    
    # Get JSON data from the request
    data = request.get_json()
    if not data or 'coordinates' not in data:
        return jsonify({"error": "Invalid input. JSON payload with a 'coordinates' key is required."}), 400

    try:
        # The `find_outlier_index` function expects a list of tuples.
        coordinates_list = data['coordinates']
        coordinates_tuples = [(float(d['lat']), float(d['lon'])) for d in coordinates_list]
        
        # Call the K-Means logic from kmeans.py
        outlier_index = find_outlier_index(coordinates_tuples)
        
        print(f"Outlier detected at index: {outlier_index}")
        return jsonify({"outlier_index": outlier_index})

    except Exception as e:
        print(f"Error during outlier detection: {e}")
        return jsonify({"error": f"An internal error occurred: {e}"}), 500


@app.route('/predict_time', methods=['POST'])
def handle_predict_time():
    """
    API endpoint to select the best drone and predict the flight time.
    Expects a JSON payload: { "features": {...}, "drones": [...] }
    """
    print("Received request for /predict_time")
    
    # First, check if the model was loaded successfully at startup.
    if not xgb_model or not feature_names:
        return jsonify({"error": "Prediction service is unavailable because the model could not be loaded."}), 503

    # Get JSON data from the request
    data = request.get_json()
    if not data or 'features' not in data or 'drones' not in data:
        return jsonify({"error": "Invalid input. JSON payload with 'features' and 'drones' keys is required."}), 400

    try:
        input_features = data['features']
        drones_data_list = data['drones']
        
        # Convert the list of drone dictionaries into a list of Drone objects.
        # This is required by your `select_best_drone` function.
        drones_list = [
            Drone(
                drone_id=d['drone_id'],
                payload_capacity=d['payload_capacity'],
                battery_capacity=d['battery_capacity'],
                battery_percent=d['battery_percent']
            ) for d in drones_data_list
        ]

        # 1. Select the best drone using the logic from xgb.py
        payload_in_kg = input_features.get('payload', 0) / 1000
        selected_drone = select_best_drone(drones_list, payload_in_kg)

        # 2. Predict the flight time using the logic from xgb.py
        predicted_time_seconds = predict_time(xgb_model, feature_names, input_features)

        # 3. Prepare the successful JSON response
        response_data = {
            "predicted_time_seconds": predicted_time_seconds,
            "predicted_time_minutes": predicted_time_seconds / 60,
            "selected_drone": selected_drone.__dict__, # Convert Drone object to dict for JSON
            "input_features": input_features
        }
        
        print(f"Prediction successful. Selected Drone: {selected_drone.drone_id}, Predicted Time: {predicted_time_seconds:.2f}s")
        return jsonify(response_data)

    except Exception as e:
        # This will catch errors from both drone selection (e.g., no suitable drone) and prediction.
        print(f"Error during time prediction: {e}")
        return jsonify({"error": f"An internal error occurred: {e}"}), 500


# --- Main Execution Block ---

if __name__ == '__main__':
    # Load the models before starting the server
    load_models()
    
    # Run the Flask app.
    # host='0.0.0.0' makes the server accessible from outside the container, which is essential for Render.
    # The port can be what you prefer, but it must be consistent. Render will map its internal port to this.
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port)