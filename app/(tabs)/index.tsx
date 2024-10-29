// App.js
import React, { useState, useEffect } from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import { Camera } from "expo-camera";
import { Accelerometer } from "expo-sensors";
import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("dashcam.db");

export default function App() {
  const [hasPermissions, setHasPermissions] = useState<any>(false);
  const [isRecording, setIsRecording] = useState<any>(false);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [acceleration, setAcceleration] = useState<any>({ x: 0, y: 0, z: 0 });
  const [location, setLocation] = useState<any>(null);
  const [camera, setCamera] = useState<any>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    // Request permissions
    const cameraStatus = await Camera.requestCameraPermissionsAsync();
    const locationStatus = await Location.requestForegroundPermissionsAsync();

    if (
      cameraStatus.status === "granted" &&
      locationStatus.status === "granted"
    ) {
      setHasPermissions(true);
    }
    db.execSync(
      "CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, start_time TEXT, end_time TEXT);"
    );

    db.execSync(
      "CREATE TABLE IF NOT EXISTS telemetry (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, timestamp TEXT, latitude REAL, longitude REAL, speed REAL, acceleration_x REAL, acceleration_y REAL, acceleration_z REAL, FOREIGN KEY(session_id) REFERENCES sessions(id));"
    );
    // Initialize database
  };

  useEffect(() => {
    if (isRecording) {
      // Start sensor subscriptions
      const accelerometerSubscription = Accelerometer.addListener((data) => {
        setAcceleration(data);
        if (currentSession) {
          saveTelemetryData(data);
        }
      });

      const locationSubscription = Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 10,
        },
        (location) => {
          setLocation(location);
          if (currentSession) {
            saveTelemetryData(null, location);
          }
        }
      );

      return () => {
        accelerometerSubscription.remove();
        locationSubscription.remove();
      };
    }
  }, [isRecording, currentSession]);

  const startRecording = async () => {
    if (!hasPermissions || !camera) return;

    const timestamp = new Date().toISOString();

    // Create new session
    db.transaction((tx) => {
      tx.executeSql(
        "INSERT INTO sessions (start_time) VALUES (?)",
        [timestamp],
        (_, { insertId }) => {
          setCurrentSession(insertId);
          setIsRecording(true);
        }
      );
    });

    // Create directory for session
    const sessionDir = `${FileSystem.documentDirectory}session_${timestamp}/`;
    await FileSystem.makeDirectoryAsync(sessionDir, { intermediates: true });
  };

  const stopRecording = () => {
    if (!isRecording) return;

    const timestamp = new Date().toISOString();

    // Update session end time
    db.transaction((tx) => {
      tx.executeSql("UPDATE sessions SET end_time = ? WHERE id = ?", [
        timestamp,
        currentSession,
      ]);
    });

    setIsRecording(false);
    setCurrentSession(null);
  };

  const saveTelemetryData = (accelerometerData = null, locationData = null) => {
    const timestamp = new Date().toISOString();
    const acc = accelerometerData || acceleration;
    const loc = locationData || location;

    if (!currentSession) return;

    db.transaction((tx) => {
      tx.executeSql(
        "INSERT INTO telemetry (session_id, timestamp, latitude, longitude, speed, acceleration_x, acceleration_y, acceleration_z) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          currentSession,
          timestamp,
          loc?.coords.latitude,
          loc?.coords.longitude,
          loc?.coords.speed,
          acc.x,
          acc.y,
          acc.z,
        ]
      );
    });
  };

  const detectIncident = (acceleration) => {
    // Simple threshold-based incident detection
    const threshold = 2.0; // Adjust based on testing
    const magnitude = Math.sqrt(
      Math.pow(acceleration.x, 2) +
        Math.pow(acceleration.y, 2) +
        Math.pow(acceleration.z, 2)
    );

    if (magnitude > threshold) {
      // Save incident data
      const timestamp = new Date().toISOString();
      console.log(`Incident detected at ${timestamp}`);
    }
  };

  if (!hasPermissions) {
    return (
      <View style={styles.container}>
        <Text>Requesting permissions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={(ref) => setCamera(ref)}
        style={styles.camera}
        type={Camera.Constants.Type.BACK}
      />

      <View style={styles.overlay}>
        <TouchableOpacity
          style={[
            styles.button,
            isRecording ? styles.stopButton : styles.startButton,
          ]}
          onPress={isRecording ? stopRecording : startRecording}
        >
          <Text style={styles.buttonText}>
            {isRecording ? "Stop Recording" : "Start Recording"}
          </Text>
        </TouchableOpacity>

        {location && (
          <View style={styles.telemetryContainer}>
            <Text style={styles.telemetryText}>
              Speed: {((location.coords.speed || 0) * 3.6).toFixed(1)} km/h
            </Text>
            <Text style={styles.telemetryText}>
              Lat: {location.coords.latitude.toFixed(4)}
            </Text>
            <Text style={styles.telemetryText}>
              Lng: {location.coords.longitude.toFixed(4)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 20,
  },
  startButton: {
    backgroundColor: "#4CAF50",
  },
  stopButton: {
    backgroundColor: "#f44336",
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  telemetryContainer: {
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 10,
    borderRadius: 5,
  },
  telemetryText: {
    color: "white",
    fontSize: 16,
    marginBottom: 5,
  },
});
