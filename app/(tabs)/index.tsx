import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import { useState, useEffect } from "react";
import { Button, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import * as SQLite from "expo-sqlite";
import { Accelerometer } from "expo-sensors";
import { AccelerometerMeasurement } from "expo-sensors";

const db = SQLite.openDatabaseSync("dashcam.db");

export default function App() {
  const [facing, setFacing] = useState<CameraType>("back");
  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [currentSession, setCurrentSession] = useState<number | null>(null);
  const [acceleration, setAcceleration] = useState({ x: 0, y: 0, z: 0 });
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null
  );

  useEffect(() => {
    initializeDB();
    requestLocationPermission();
  }, []);

  const initializeDB = () => {
    db.withTransactionSync(() => {
      db.runSync(
        "CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, start_time TEXT, end_time TEXT)"
      );
      db.runSync(
        "CREATE TABLE IF NOT EXISTS telemetry (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, timestamp TEXT, latitude REAL, longitude REAL, speed REAL, acceleration_x REAL, acceleration_y REAL, acceleration_z REAL, FOREIGN KEY(session_id) REFERENCES sessions(id))"
      );
    });
  };

  const requestLocationPermission = async () => {
    await Location.requestForegroundPermissionsAsync();
  };

  useEffect(() => {
    if (isRecording) {
      const accelerometerSubscription = Accelerometer.addListener(
        (data: AccelerometerMeasurement) => {
          setAcceleration(data);
          if (currentSession) {
            saveTelemetryData(data, null);
          }
        }
      );

      let locationSubscription: Location.LocationSubscription;
      (async () => {
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 10,
          },
          (location: Location.LocationObject) => {
            setLocation(location);
            if (currentSession) {
              saveTelemetryData(null, location);
            }
          }
        );
      })();

      return () => {
        accelerometerSubscription.remove();
        if (locationSubscription) {
          locationSubscription.remove();
        }
      };
    }
  }, [isRecording, currentSession]);

  const startRecording = () => {
    const timestamp = new Date().toISOString();
    db.withTransactionSync(() => {
      const result: any = db.runSync(
        "INSERT INTO sessions (start_time) VALUES (?)",
        [timestamp]
      );
      setCurrentSession(result.insertId);
      setIsRecording(true);
    });
  };

  const stopRecording = () => {
    if (!currentSession) return;

    const timestamp = new Date().toISOString();
    db.withTransactionSync(() => {
      db.runSync("UPDATE sessions SET end_time = ? WHERE id = ?", [
        timestamp,
        currentSession,
      ]);
    });
    setIsRecording(false);
    setCurrentSession(null);
  };

  const saveTelemetryData = (
    accelerometerData: AccelerometerMeasurement | null,
    locationData: Location.LocationObject | null
  ) => {
    if (!currentSession) return;

    const timestamp = new Date().toISOString();
    db.withTransactionSync(() => {
      db.runSync(
        "INSERT INTO telemetry (session_id, timestamp, latitude, longitude, speed, acceleration_x, acceleration_y, acceleration_z) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          currentSession,
          timestamp,
          locationData?.coords.latitude ?? null,
          locationData?.coords.longitude ?? null,
          locationData?.coords.speed ?? null,
          accelerometerData?.x ?? null,
          accelerometerData?.y ?? null,
          accelerometerData?.z ?? null,
        ]
      );
    });
  };

  function toggleCameraFacing() {
    setFacing((current) => (current === "back" ? "front" : "back"));
  }

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing={facing}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={toggleCameraFacing}>
            <Text style={styles.text}>Flip Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              isRecording ? styles.stopButton : styles.startButton,
            ]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Text style={styles.text}>
              {isRecording ? "Stop Recording" : "Start Recording"}
            </Text>
          </TouchableOpacity>
          {location && (
            <View style={styles.telemetryOverlay}>
              <Text style={styles.text}>
                Speed: {((location.coords.speed || 0) * 3.6).toFixed(1)} km/h
              </Text>
            </View>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  message: {
    textAlign: "center",
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "transparent",
    margin: 64,
  },
  button: {
    flex: 1,
    alignSelf: "flex-end",
    alignItems: "center",
    padding: 15,
    borderRadius: 10,
  },
  startButton: {
    backgroundColor: "rgba(76, 175, 80, 0.7)", // Semi-transparent green
  },
  stopButton: {
    backgroundColor: "rgba(244, 67, 54, 0.7)", // Semi-transparent red
  },
  text: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
  },
  telemetryOverlay: {
    position: "absolute",
    top: 20,
    left: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 5,
  },
});
