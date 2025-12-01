import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  })
);

// =========================
//   IN-MEMORY DATABASE
// =========================
const users = [];     // riders
const drivers = [];   // drivers
const trips = [];     // trips

// =========================
//   HELPER FUNCTIONS
// =========================

// Rider create/find
function findOrCreateRider(phone) {
  let rider = users.find((u) => u.phone === phone);
  if (!rider) {
    rider = {
      id: uuidv4(),
      phone,
      name: `Rider-${phone.slice(-4)}`,
      createdAt: new Date(),
    };
    users.push(rider);
  }
  return rider;
}

// Driver create/find
function findOrCreateDriver(phone, carType = "mini") {
  let driver = drivers.find((d) => d.phone === phone);
  if (!driver) {
    driver = {
      id: uuidv4(),
      phone,
      name: `Driver-${phone.slice(-4)}`,
      carType,
      carModel: "Cab",
      carNumber: "MH01AB1234",
      isOnline: false,
      currentLat: null,
      currentLng: null,
      createdAt: new Date(),
    };
    drivers.push(driver);
  }
  return driver;
}

// Fare calculate
function calculateEstimatedFare(carType, distanceKm = 5) {
  let baseFare = 0;
  let perKm = 0;

  if (carType === "sedan") {
    baseFare = 60;
    perKm = 15;
  } else if (carType === "suv") {
    baseFare = 80;
    perKm = 18;
  } else {
    baseFare = 40;
    perKm = 12;
  }

  return Math.round(baseFare + perKm * distanceKm);
}

// =========================
//         ROUTES
// =========================

// Root
app.get("/", (req, res) => {
  res.json({ status: "GreenBharat backend running" });
});

// Rider login (simple)
app.post("/auth/rider/login", (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });

  const rider = findOrCreateRider(phone);
  res.json({ rider });
});

// Driver login
app.post("/auth/driver/login", (req, res) => {
  const { phone, carType } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });

  const driver = findOrCreateDriver(phone, carType || "mini");
  res.json({ driver });
});

// Driver status (online/offline + location)
app.post("/drivers/:id/status", (req, res) => {
  const { id } = req.params;
  const { isOnline, lat, lng } = req.body;

  const driver = drivers.find((d) => d.id === id);
  if (!driver) return res.status(404).json({ error: "Driver not found" });

  if (typeof isOnline === "boolean") driver.isOnline = isOnline;
  if (lat && lng) {
    driver.currentLat = lat;
    driver.currentLng = lng;
  }

  res.json({ driver });
});

// Rider books trip
app.post("/trips", (req, res) => {
  const {
    riderId,
    pickupAddress,
    dropAddress,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    carType,
    paymentMode,
  } = req.body;

  if (!riderId || !pickupAddress || !dropAddress || !carType) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const rider = users.find((u) => u.id === riderId);
  if (!rider) return res.status(404).json({ error: "Rider not found" });

  const driver = drivers.find(
    (d) => d.isOnline === true && d.carType === carType
  );

  const estimatedFare = calculateEstimatedFare(carType);

  const trip = {
    id: uuidv4(),
    riderId,
    driverId: driver ? driver.id : null,
    status: driver ? "assigned" : "searching",
    pickupAddress,
    dropAddress,
    pickupLat: pickupLat || null,
    pickupLng: pickupLng || null,
    dropLat: dropLat || null,
    dropLng: dropLng || null,
    carType,
    paymentMode: paymentMode || "cash",
    estimatedFare,
    finalFare: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  trips.push(trip);

  res.json({ trip, assignedDriver: driver || null });
});

// Driver accepts trip
app.post("/trips/:id/accept", (req, res) => {
  const { id } = req.params;
  const { driverId } = req.body;

  const trip = trips.find((t) => t.id === id);
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  const driver = drivers.find((d) => d.id === driverId);
  if (!driver) return res.status(404).json({ error: "Driver not found" });

  if (!driver.isOnline)
    return res.status(400).json({ error: "Driver offline" });

  trip.driverId = driverId;
  trip.status = "assigned";
  trip.updatedAt = new Date();

  res.json({ trip });
});

// Start trip
app.post("/trips/:id/start", (req, res) => {
  const { id } = req.params;
  const { driverId } = req.body;

  const trip = trips.find((t) => t.id === id);
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  if (trip.driverId !== driverId)
    return res.status(403).json({ error: "Not your trip" });

  trip.status = "ongoing";
  trip.updatedAt = new Date();

  res.json({ trip });
});

// End trip
app.post("/trips/:id/end", (req, res) => {
  const { id } = req.params;
  const { driverId, finalFare } = req.body;

  const trip = trips.find((t) => t.id === id);
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  if (trip.driverId !== driverId)
    return res.status(403).json({ error: "Not your trip" });

  trip.status = "completed";
  trip.finalFare = finalFare || trip.estimatedFare;
  trip.updatedAt = new Date();

  res.json({ trip });
});

// Trip history - rider
app.get("/riders/:id/trips", (req, res) => {
  const { id } = req.params;
  const riderTrips = trips.filter((t) => t.riderId === id);
  res.json({ trips: riderTrips });
});

// Trip history - driver
app.get("/drivers/:id/trips", (req, res) => {
  const { id } = req.params;
  const driverTrips = trips.filter((t) => t.driverId === id);
  res.json({ trips: driverTrips });
});

// =========================
//       START SERVER
// =========================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`GreenBharat backend running on port ${PORT}`);
});
