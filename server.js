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

const getSessionToken = (req) => {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
};

// Password Hashing with Scrypt & Random Salt
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false;
  // Legacy plaintext fallback check
  if (!storedPassword.includes(":")) {
    return password === storedPassword;
  }
  const [salt, key] = storedPassword.split(":");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  
  const keyBuffer = Buffer.from(key, "hex");
  const derivedBuffer = Buffer.from(derivedKey, "hex");
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

const databaseName = process.env.DB_NAME || 'driverdb';
const dbFile = path.resolve(process.cwd(), `${databaseName}.sqlite`);
let db;

function createSessionInDb(userId, durationDays = 7) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  
  const stmt = db.prepare("INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)");
  stmt.run(token, userId, expiresAt);
  return token;
}

function getSessionUserFromDb(token) {
  if (!token) return null;
  const stmt = db.prepare(`
    SELECT s.token, u.id, u.full_name, u.email, u.license_plate
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
  `);
  return stmt.get(token) || null;
}

function destroySessionInDb(token) {
  if (!token) return;
  const stmt = db.prepare("DELETE FROM user_sessions WHERE token = ?");
  stmt.run(token);
}

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

  // Create User Sessions table (Persistent session storage)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
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
      title TEXT,
      patient_name TEXT,
      location_lat REAL,
      location_lng REAL,
      severity TEXT DEFAULT 'High',
      status TEXT DEFAULT 'Pending',
      notes TEXT,
      assigned_ambulance_id INTEGER REFERENCES ambulances(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Ensure title & notes columns exist in emergencies (migration check)
  try {
    const columns = db.prepare("PRAGMA table_info(emergencies)").all();
    if (!columns.some(col => col.name === 'title')) {
      db.exec("ALTER TABLE emergencies ADD COLUMN title TEXT");
    }
    if (!columns.some(col => col.name === 'notes')) {
      db.exec("ALTER TABLE emergencies ADD COLUMN notes TEXT");
    }
  } catch (err) {
    console.error("Migration error (emergencies):", err);
  }

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
    
    if (!email || !password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ success: false, message: "Full Name is required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const hashedPassword = hashPassword(password);

    try {
      const stmt = db.prepare(
        "INSERT INTO users (full_name, email, license_plate, password) VALUES (?, ?, ?, ?) RETURNING id, full_name, email, license_plate"
      );
      const result = stmt.get(fullName.trim(), cleanEmail, licensePlate ? licensePlate.trim() : null, hashedPassword);
      
      const sessionId = createSessionInDb(result.id);
      res.json({ success: true, userId: result.id, sessionId, user: result });
    } catch (err) {
      console.error("Registration error details:", err);
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ success: false, message: "Email already registered" });
      }
      res.status(500).json({ 
        success: false, 
        message: "Database Error: " + (err.message || "Unknown error")
      });
    }
  });

  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    try {
      const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
      const user = stmt.get(cleanEmail);
      
      if (user && verifyPassword(password, user.password)) {
        // Auto-upgrade legacy plaintext password if verified
        if (!user.password.includes(":")) {
          const newHashed = hashPassword(password);
          db.prepare("UPDATE users SET password = ? WHERE id = ?").run(newHashed, user.id);
        }

        const sessionId = createSessionInDb(user.id);
        const { password: _, ...safeUser } = user;
        res.json({ success: true, user: safeUser, sessionId });
      } else {
        res.status(401).json({ success: false, message: "Invalid email or password." });
      }
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ success: false, message: "Server authentication error." });
    }
  });

  app.get("/api/me", (req, res) => {
    const token = getSessionToken(req);
    const sessionUser = getSessionUserFromDb(token);
    if (!sessionUser) {
      return res.status(401).json({ success: false, message: "Not authenticated or session expired." });
    }
    res.json({ success: true, user: sessionUser });
  });

  app.post("/api/logout", (req, res) => {
    const token = getSessionToken(req) || req.body?.sessionId;
    destroySessionInDb(token);
    res.json({ success: true });
  });


  // Emergency Reporting API Endpoints
  app.get("/api/emergencies", (req, res) => {
    try {
      const stmt = db.prepare("SELECT * FROM emergencies ORDER BY id DESC LIMIT 50");
      const emergencies = stmt.all();
      res.json({ success: true, emergencies });
    } catch (err) {
      console.error("Fetch emergencies error:", err);
      res.status(500).json({ success: false, message: "Database Error: " + err.message });
    }
  });

  app.post("/api/emergencies", (req, res) => {
    const { title, patientName, severity, locationLat, locationLng, notes } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: "Emergency title is required." });
    }
    
    try {
      const stmt = db.prepare(`
        INSERT INTO emergencies (title, patient_name, severity, location_lat, location_lng, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING *
      `);
      const emergency = stmt.get(
        title.trim(),
        patientName || null,
        severity || 'High',
        locationLat || null,
        locationLng || null,
        notes || null
      );
      
      // Broadcast new emergency via Socket.io
      io.emit("emergency:created", emergency);

      res.json({ success: true, emergency });
    } catch (err) {
      console.error("Create emergency error:", err);
      res.status(500).json({ success: false, message: "Database Error: " + err.message });
    }
  });

  app.post("/api/routes", (req, res) => {
    const { emergencyId, ambulanceId, polyline, distance, duration } = req.body;
    try {
      const stmt = db.prepare(`
        INSERT INTO routes (emergency_id, ambulance_id, polyline, distance, duration)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *
      `);
      const route = stmt.get(
        emergencyId || null,
        ambulanceId || null,
        polyline || null,
        distance || null,
        duration || null
      );

      if (emergencyId) {
        db.prepare("UPDATE emergencies SET status = 'Dispatched' WHERE id = ?").run(emergencyId);
        io.emit("emergency:dispatched", { emergencyId, routeId: route.id, status: 'Dispatched' });
      }

      res.json({ success: true, route });
    } catch (err) {
      console.error("Create route error:", err);
      res.status(500).json({ success: false, message: "Database Error: " + err.message });
    }
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
