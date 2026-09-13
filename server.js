import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config(); // fallback to .env if it exists

const sessions = new Map();
const generateSessionId = () => crypto.randomBytes(32).toString("hex");
const getSessionToken = (req) => {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
};

const databaseName = process.env.DB_NAME || 'driverdb';
const dbFile = path.resolve(process.cwd(), `${databaseName}.sqlite`);
let db;

async function ensureDatabaseExists() {
  db = new Database(dbFile);
  console.log(`Connected to SQLite database at ${dbFile}`);
  
  console.log("Initializing database schema...");
  
  // Create Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      license_plate TEXT
    )
  `);

  // Ensure license_plate column exists in users (migration check)
  try {
    const columns = db.prepare("PRAGMA table_info(users)").all();
    if (!columns.some(col => col.name === 'license_plate')) {
      db.exec("ALTER TABLE users ADD COLUMN license_plate TEXT");
    }
  } catch (err) {
    console.error("Migration error:", err);
  }

  // Create Ambulances table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ambulances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_plate TEXT UNIQUE NOT NULL,
      driver_id INTEGER REFERENCES users(id),
      status TEXT DEFAULT 'Available',
      current_lat REAL,
      current_lng REAL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create Emergencies table
  db.exec(`
    CREATE TABLE IF NOT EXISTS emergencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_name TEXT,
      location_lat REAL NOT NULL,
      location_lng REAL NOT NULL,
      severity TEXT,
      status TEXT DEFAULT 'Pending',
      assigned_ambulance_id INTEGER REFERENCES ambulances(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create Routes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emergency_id INTEGER REFERENCES emergencies(id),
      ambulance_id INTEGER REFERENCES ambulances(id),
      polyline TEXT,
      distance REAL,
      duration INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Database schema initialized successfully.");
}

async function startServer() {
  const app = express();
  app.use(express.json()); // Essential for parsing login/register data

  // Initialize Database Table
  try {
    await ensureDatabaseExists();
  } catch (err) {
    console.error("Database initialization error:", err);
  }

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;

  // Store ambulance states
  const ambulances = {};

  // Diagnostic Logging for API
  app.use("/api/*", (req, res, next) => {
    console.log(`[API REQUEST] ${req.method} ${req.originalUrl}`);
    next();
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is alive and routes are registered" });
  });

  // Authentication API Endpoints
  app.post("/api/register", async (req, res) => {
    const { fullName, email, licensePlate, password } = req.body;
    console.log("Registering:", email);
    try {
      const stmt = db.prepare(
        "INSERT INTO users (full_name, email, license_plate, password) VALUES (?, ?, ?, ?) RETURNING id, full_name, email, license_plate"
      );
      const result = stmt.get(fullName, email, licensePlate || null, password);
      
      const sessionId = generateSessionId();
      sessions.set(sessionId, {
        id: result.id,
        full_name: result.full_name,
        email: result.email,
        license_plate: result.license_plate,
      });
      res.json({ success: true, userId: result.id, sessionId });
    } catch (err) {
      console.error("Registration error details:", err);
      // Unique constraint violation in SQLite
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ success: false, message: "Email already registered" });
      }
      res.status(500).json({ 
        success: false, 
        message: "Database Error: " + (err.message || "Unknown error"),
        detail: err.message
      });
    }
  });

  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    try {
      const stmt = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?");
      const user = stmt.get(email, password);
      
      if (user) {
        const sessionId = generateSessionId();
        sessions.set(sessionId, {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
        });
        res.json({ success: true, user, sessionId });
      } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
      }
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  app.get("/api/me", (req, res) => {
    const token = getSessionToken(req);
    if (!token || !sessions.has(token)) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const session = sessions.get(token);
    res.json({ success: true, user: session });
  });

  app.post("/api/logout", (req, res) => {
    const token = getSessionToken(req) || req.body?.sessionId;
    if (token && sessions.has(token)) {
      sessions.delete(token);
    }
    res.json({ success: true });
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    socket.emit("ambulances:init", Object.values(ambulances));

    socket.on("ambulance:update", (data) => {
      const ambulanceData = { ...data, id: socket.id, lastUpdate: Date.now() };
      ambulances[socket.id] = ambulanceData;
      socket.broadcast.emit("ambulance:updated", ambulanceData);
    });

    socket.on("disconnect", () => {
      delete ambulances[socket.id];
      io.emit("ambulance:removed", socket.id);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
