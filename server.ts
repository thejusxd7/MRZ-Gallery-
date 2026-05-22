import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { DiscordMessage, BotConfig, BotStatus, LogEntry, RealtimePayload } from "./src/types";
// Firebase Admin SDK core imports
import admin from "firebase-admin";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Resolve directories
let currentDir = "";
try {
  currentDir = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
  currentDir = __dirname;
}

const DATA_DIR = path.join(currentDir, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const MESSAGES_PATH = path.join(DATA_DIR, "messages.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initialize Firestore (Cloud Database)
let db: any = null;
try {
  const firebaseConfigPath = path.join(currentDir, "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    const rawConfig = fs.readFileSync(firebaseConfigPath, "utf-8");
    const firebaseConfig = JSON.parse(rawConfig);
    
    // Check if firebase-admin has already been initialized
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
    
    // Access the database, supplying custom Database ID if present
    if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
      db = admin.firestore(firebaseConfig.firestoreDatabaseId);
    } else {
      db = admin.firestore();
    }
    console.log(`[DATABASE] Cloud Firestore initialized via Firebase Admin SDK with Database ID: ${firebaseConfig.firestoreDatabaseId || "(default)"}`);
  } else {
    console.warn("[DATABASE] WARNING: firebase-applet-config.json not found. Firestore features are disabled.");
  }
} catch (dbErr: any) {
  console.error(`[DATABASE] Error initializing Firestore database: ${dbErr.message}`);
}

// In-Memory store
let messages: DiscordMessage[] = [];
const BOT_OWNER_ID = "1364315043700674662";

let botConfig: BotConfig = {
  botToken: process.env.DISCORD_BOT_TOKEN || "",
  channelId: process.env.DISCORD_CHANNEL_ID || "",
  allowedOperators: {},
};

function isAuthorizedOperator(userId: string, username: string, globalName?: string): { authorized: boolean; role?: "mrz" | "mrzadmin" | "mrzmod" } {
  // 1. Bot Owner has ultimate root access (mrzadmin role)
  if (userId === BOT_OWNER_ID) {
    return { authorized: true, role: "mrzadmin" };
  }
  
  // 2. Explicitly added operator in the configuration
  if (botConfig.allowedOperators && botConfig.allowedOperators[userId]) {
    return { authorized: true, role: botConfig.allowedOperators[userId].role };
  }

  // 3. Fallback to hardcoded usernames for backward compatibility
  const usernameLower = username.toLowerCase();
  const globalLower = (globalName || "").toLowerCase();
  
  if (usernameLower === "mrz" || globalLower === "mrz") {
    return { authorized: true, role: "mrz" };
  }
  if (usernameLower === "mrzadmin" || globalLower === "mrzadmin") {
    return { authorized: true, role: "mrzadmin" };
  }
  if (usernameLower === "mrzmod" || globalLower === "mrzmod") {
    return { authorized: true, role: "mrzmod" };
  }

  return { authorized: false };
}
let botStatus: BotStatus = {
  connected: false,
  status: "offline",
  botName: null,
  botAvatarUrl: null,
  error: null,
  monitoredChannel: null,
};
let systemLogs: LogEntry[] = [];

// Session state storage
const sessions = new Map<string, { username: string; role: "admin" | "mod" }>();

interface SseConnection {
  res: express.Response;
  isAdmin: boolean;
}
const sseConnections = new Set<SseConnection>();

// SSE Broadcast helper
function broadcast(payload: RealtimePayload, requireAdmin = false) {
  const payloadString = `data: ${JSON.stringify(payload)}\n\n`;
  sseConnections.forEach((conn) => {
    if (!requireAdmin || conn.isAdmin) {
      try {
        conn.res.write(payloadString);
      } catch (err) {
        console.error("SSE write failure:", err);
      }
    }
  });
}

// Log helper
function addLog(level: "info" | "warn" | "error", message: string) {
  const log: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  systemLogs.unshift(log);
  if (systemLogs.length > 100) systemLogs.pop();
  
  // Stream log immediately to admin clients
  broadcast({ type: "log", data: log }, true);
  console.log(`[${level.toUpperCase()}] ${log.timestamp} - ${message}`);

  // Write log asynchronously to Firestore
  if (db) {
    const logId = "log_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    db.collection("logs").doc(logId).set(log).catch(() => {
      // Handled silently to prevent loop
    });
  }
}

// Persistent message write helper
async function persistNewMessage(msg: DiscordMessage) {
  if (!db) return;
  try {
    await db.collection("messages").doc(msg.id).set(msg);
  } catch (err: any) {
    addLog("error", `Firestore save message failed: ${err.message}`);
  }
}

// Persistent message delete helper
async function persistDeleteMessage(id: string) {
  if (!db) return;
  try {
    await db.collection("messages").doc(id).delete();
  } catch (err: any) {
    addLog("error", `Firestore delete message failed: ${err.message}`);
  }
}

// Load persisted data from both Local files and Cloud Firestore Space
async function loadPersistedData() {
  // First load from local storage files for rapid boot & fallback
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      botConfig = JSON.parse(data);
      if (!botConfig.allowedOperators) {
        botConfig.allowedOperators = {};
      }
      addLog("info", "Bot configuration loaded from local storage cache.");
    } else {
      botConfig.allowedOperators = {};
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(botConfig, null, 2));
    }
  } catch (error: any) {
    addLog("error", `Failed to load local config: ${error.message}`);
  }

  try {
    if (fs.existsSync(MESSAGES_PATH)) {
      const data = fs.readFileSync(MESSAGES_PATH, "utf-8");
      const rawMessages = JSON.parse(data);
      if (Array.isArray(rawMessages)) {
        const allowed = ["mrz", "mrzadmin", "mrzmod"];
        messages = rawMessages.filter((m: any) => {
          const authName = (m.authorName || "").toLowerCase();
          const authTag = (m.authorTag || "").toLowerCase().split("#")[0];
          return allowed.includes(authName) || allowed.includes(authTag);
        });
        addLog("info", `Loaded and filtered ${messages.length} authorized messages from local cache.`);
        fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2));
      } else {
        messages = [];
      }
    } else {
      messages = [];
      fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2));
      addLog("info", "Initialized empty local messages cache.");
    }
  } catch (error: any) {
    addLog("error", `Failed to load local messages: ${error.message}`);
  }

  // Next, synchronize configuration and messages from direct Firestore Space
  if (db) {
    try {
      addLog("info", "Synchronizing configuration from Cloud Firestore database...");
      const configDoc = await db.collection("config").doc("bot").get();
      if (configDoc.exists) {
        const remoteConfig = configDoc.data() as BotConfig;
        if (remoteConfig.botToken || remoteConfig.channelId) {
          botConfig = remoteConfig;
          if (!botConfig.allowedOperators) {
            botConfig.allowedOperators = {};
          }
          addLog("info", "Bot configuration successfully synchronized from Firestore.");
        }
      } else {
        // Feed local configuration to database as seed
        await db.collection("config").doc("bot").set(botConfig);
        addLog("info", "Seeded local configuration keys into Firestore database.");
      }
    } catch (err: any) {
      addLog("error", `Firestore config synchronization failed: ${err.message}`);
    }

    try {
      addLog("info", "Synchronizing messages from Cloud Firestore database...");
      const messagesColl = db.collection("messages");
      const q = messagesColl.orderBy("createdAt", "desc").limit(200);
      const querySnapshot = await q.get();
      const remoteMsgs: DiscordMessage[] = [];
      
      querySnapshot.forEach((docSnap) => {
        remoteMsgs.push(docSnap.data() as DiscordMessage);
      });

      if (remoteMsgs.length > 0) {
        messages = remoteMsgs;
        addLog("info", `Successfully synchronized ${messages.length} messages from Firestore database.`);
        fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2));
      } else if (messages.length > 0) {
        addLog("info", `Seeding ${messages.length} local messages into empty Firestore database...`);
        for (const msg of messages) {
          await db.collection("messages").doc(msg.id).set(msg);
        }
        addLog("info", "Completed seeding messages to Firestore.");
      }
    } catch (err: any) {
      addLog("error", `Firestore messages synchronization failed: ${err.message}`);
    }
  }
}

// Save helpers
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(botConfig, null, 2));
    if (db) {
      db.collection("config").doc("bot").set(botConfig).catch((err: any) => {
        addLog("error", `Async Firestore config save failed: ${err.message}`);
      });
    }
  } catch (error: any) {
    addLog("error", `Failed to save local config file: ${error.message}`);
  }
}

function saveMessages() {
  try {
    fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2));
  } catch (error: any) {
    addLog("error", `Failed to save local messages file: ${error.message}`);
  }
}



// Discord client removed from web service
let discordClient: any = null;

// Update bot status helper
function setStatus(status: BotStatus["status"], errorMsg: string | null = null) {
  botStatus.status = status;
  botStatus.connected = status === "online";
  botStatus.error = errorMsg;
  if (status !== "online") {
    botStatus.botName = null;
    botStatus.botAvatarUrl = null;
    botStatus.monitoredChannel = null;
  }
  
  // Broadcast update to admin front-end instantly
  broadcast({ type: "status", data: botStatus }, true);
}

// Initialize and login Discord Bot (Disabled)
async function startDiscordBot() {
  // Discord bot integration has been deprecated and disabled.
}

// Parse json structures with 60mb limit to handle POV media files (images, audio, videos)
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ limit: "60mb", extended: true }));

// Serve uploaded media files publicly
app.use("/uploads", express.static(UPLOADS_DIR));

// Configured credentials list
const USERS: { username: string; password: string; role: "admin" | "mod" }[] = [
  { username: "Mrz", password: "mrz001", role: "admin" },
  { username: "mrzadmin", password: "adminmrz123", role: "admin" },
  { username: "mrzmod", password: "modmrz321", role: "mod" }
];

// Admin/Moderator Authorization Middleware
function authenticateAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers["x-admin-token"] || 
                req.query.token || 
                req.body?.token || 
                (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : undefined);
  if (token && typeof token === "string" && sessions.has(token)) {
    next();
  } else {
    addLog("warn", `Unauthorized access attempt to ${req.originalUrl} - Method: ${req.method}, Token Present: ${!!token}`);
    res.status(401).json({ error: "Unauthorized access" });
  }
}

// Strict Full-Administration authorization check - only "mrzadmin" has full admin clearance
function requireFullAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers["x-admin-token"] || 
                req.query.token || 
                req.body?.token || 
                (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : undefined);
  if (token && typeof token === "string" && sessions.has(token)) {
    const sessionInfo = sessions.get(token);
    if (sessionInfo && sessionInfo.username?.toLowerCase() === "mrzadmin") {
      return next();
    }
    addLog("warn", `Forbidden administration action attempt on ${req.originalUrl} by ${sessionInfo?.username || "unknown"}`);
  } else {
    addLog("warn", `Unauthorized full-admin access attempt on ${req.originalUrl} - Method: ${req.method}, Token Present: ${!!token}`);
  }
  res.status(403).json({ error: "Forbidden: Full administration credentials required" });
}

// Open / Public Endpoints
app.get("/api/messages", (req, res) => {
  res.json(messages);
});

// Auth Administration Endpoints
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const cleanUsername = typeof username === "string" ? username.trim() : "";
  const cleanPassword = typeof password === "string" ? password.trim() : "";
  
  const matchedUser = USERS.find(
    (u) => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.password === cleanPassword
  );

  // Extract IP Address securely
  let rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip || "Unknown IP";
  const ipAddress = Array.isArray(rawIp) ? rawIp[0] : rawIp;

  if (matchedUser) {
    const sessionToken = "session_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    sessions.set(sessionToken, { username: matchedUser.username, role: matchedUser.role });
    addLog("info", `Login success: ${matchedUser.username} authenticated as role '${matchedUser.role}'.`);

    res.json({ 
      success: true, 
      token: sessionToken, 
      username: matchedUser.username, 
      role: matchedUser.role 
    });
  } else {
    addLog("warn", `Failed login attempt for user: '${username}'`);

    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.post("/api/logout", (req, res) => {
  const token = req.headers["x-admin-token"];
  if (token && typeof token === "string") {
    sessions.delete(token);
    addLog("info", "User session closed.");
  }
  res.json({ success: true });
});

app.get("/api/verify-token", (req, res) => {
  const token = req.headers["x-admin-token"] || req.query.token;
  if (token && typeof token === "string" && sessions.has(token)) {
    const info = sessions.get(token);
    res.json({ success: true, username: info?.username, role: info?.role });
  } else {
    res.json({ success: false });
  }
});

// Protected Information, Config, and Controls Endpoints (Require full Admin role)
app.get("/api/config", requireFullAdmin, (req, res) => {
  res.json({
    botToken: "",
    hasToken: false,
    channelId: "",
  });
});

app.post("/api/config", requireFullAdmin, async (req, res) => {
  res.json({ success: true, config: { channelId: "", hasToken: false } });
});

app.get("/api/status", requireFullAdmin, (req, res) => {
  res.json(botStatus);
});

app.get("/api/logs", requireFullAdmin, (req, res) => {
  res.json(systemLogs);
});

app.post("/api/clear", requireFullAdmin, async (req, res) => {
  const adminToken = (req.headers["x-admin-token"] || req.query.token || req.body?.token) as string;
  const sessionInfo = sessions.get(adminToken);
  const operatorName = sessionInfo ? sessionInfo.username : "Administrator";

  messages = [];
  saveMessages();
  
  if (db) {
    try {
      const messagesColl = db.collection("messages");
      const querySnapshot = await messagesColl.get();
      querySnapshot.forEach((docSnap) => {
        docSnap.ref.delete().catch((e: any) => console.error("Firestore board clear sub-error:", e));
      });
      addLog("info", "Purged message records from Firestore database collection.");
    } catch (err: any) {
      addLog("error", `Firestore board clear failed: ${err.message}`);
    }
  }

  broadcast({ type: "messages_init", data: [] });
  addLog("info", "Board message list was cleared by user command.");

  res.json({ success: true });
});

// File upload handler - converts base64 payload to static container asset
app.post("/api/upload", authenticateAdmin, (req, res) => {
  const { fileName, fileType, data } = req.body;
  if (!fileName || !data) {
    return res.status(400).json({ error: "Missing uploaded file stream details" });
  }

  try {
    const base64Clean = data.includes(";base64,") ? data.split(";base64,")[1] : data;
    const buffer = Buffer.from(base64Clean, "base64");
    
    const ext = path.extname(fileName) || ".png";
    const filenameOnly = path.basename(fileName, ext).replace(/[^a-zA-Z0-9]/g, "_");
    const uniqueName = `${filenameOnly}_${Date.now()}${ext}`;
    
    const filePath = path.join(UPLOADS_DIR, uniqueName);
    fs.writeFileSync(filePath, buffer);
    
    const downloadUrl = `/uploads/${uniqueName}`;
    addLog("info", `File successfully uploaded statically -> ${uniqueName} (${buffer.length} bytes)`);
    res.json({ 
      success: true, 
      url: downloadUrl, 
      size: buffer.length, 
      name: fileName, 
      contentType: fileType 
    });
  } catch (err: any) {
    addLog("error", `File upload failed: ${err.message}`);
    res.status(500).json({ error: `Upload thread exception: ${err.message}` });
  }
});

// Large-file chunked uploader supporting uploads up to 3GB size safely without container RAM exhaustion
app.post("/api/upload-chunked", authenticateAdmin, (req, res) => {
  const { fileName, fileType, chunkIndex, totalChunks, uploadId, data } = req.body;
  
  if (!fileName || data === undefined || uploadId === undefined || chunkIndex === undefined || totalChunks === undefined) {
    return res.status(400).json({ error: "Missing chunk upload parameters" });
  }

  try {
    const base64Clean = data.includes(";base64,") ? data.split(";base64,")[1] : data;
    const buffer = Buffer.from(base64Clean, "base64");
    
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9]/g, "_");
    const safeFileName = path.basename(fileName).replace(/[^a-zA-Z0-9.-]/g, "_");
    const tempFilePath = path.join(UPLOADS_DIR, `part_${safeUploadId}_${safeFileName}`);

    if (chunkIndex === 0) {
      fs.writeFileSync(tempFilePath, buffer);
    } else {
      fs.appendFileSync(tempFilePath, buffer);
    }

    if (chunkIndex === totalChunks - 1) {
      const ext = path.extname(fileName) || ".mp4";
      const filenameOnly = path.basename(safeFileName, ext).replace(/[^a-zA-Z0-9]/g, "_");
      const uniqueName = `${filenameOnly}_${Date.now()}${ext}`;
      const finalPath = path.join(UPLOADS_DIR, uniqueName);
      
      fs.renameSync(tempFilePath, finalPath);
      
      const downloadUrl = `/uploads/${uniqueName}`;
      const finalSize = fs.statSync(finalPath).size;
      addLog("info", `Chuncked file upload completed -> ${uniqueName} (${finalSize} bytes)`);
      
      res.json({
        success: true,
        completed: true,
        url: downloadUrl,
        size: finalSize,
        name: fileName,
        contentType: fileType
      });
    } else {
      res.json({
        success: true,
        completed: false,
        message: `Chunk ${chunkIndex + 1}/${totalChunks} received`
      });
    }
  } catch (err: any) {
    addLog("error", `Chunk upload anomaly at index ${chunkIndex}: ${err.message}`);
    res.status(500).json({ error: `Chunk transfer thread crash: ${err.message}` });
  }
});

// Sends a real-time customized manual operator message to the gallery synced feed
app.post("/api/custom-message", authenticateAdmin, (req, res) => {
  const { authorName, authorTag, authorAvatar, content, attachments, customBoxColor, customGlow } = req.body;
  
  const token = (req.headers["x-admin-token"] || req.query.token) as string;
  const sessionInfo = sessions.get(token);
  const operatorName = sessionInfo ? sessionInfo.username : "Operator";

  const newMsg: DiscordMessage = {
    id: "user_msg_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    authorId: "operator_" + (sessionInfo?.username || "mod"),
    authorName: authorName ? authorName.trim() : "MRZ Admin",
    authorTag: authorTag ? authorTag.trim() : "MRZ#1234",
    authorAvatar: authorAvatar || "https://i.imgur.com/uL8SqeX.jpeg",
    content: content || "",
    attachments: attachments || [],
    createdAt: new Date().toISOString(),
    channelId: botConfig.channelId || "mrz-dispatch",
    channelName: "mrz-webpage-dispatch",
    customBoxColor: customBoxColor || "default",
    customGlow: !!customGlow
  };

  messages.unshift(newMsg);
  if (messages.length > 100000) {
    const removed = messages.pop();
    if (removed) persistDeleteMessage(removed.id);
  }
  
  saveMessages();
  persistNewMessage(newMsg);
  broadcast({ type: "message", data: newMsg });
  addLog("info", `Manual board broadcast posted by ${operatorName} as "${newMsg.authorName}"`);

  res.json({ success: true, message: newMsg });
});

// Delete message individually
app.delete("/api/messages/:id", authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const initialLength = messages.length;
  const deletedMsg = messages.find(m => m.id === id);
  const token = (req.headers["x-admin-token"] || req.query.token) as string;
  const sessionInfo = sessions.get(token);
  const operatorName = sessionInfo ? sessionInfo.username : "Admin/Mod";

  messages = messages.filter(m => m.id !== id);
  if (messages.length < initialLength) {
    saveMessages();
    persistDeleteMessage(id);
    broadcast({ type: "message_delete", data: id });
    addLog("info", `Moderated & deleted individual message reference [ID: ${id}]`);

    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Message not found" });
  }
});

// Edit/update message individually (name, profile, timestamps, styling, content)
app.patch("/api/messages/:id", requireFullAdmin, (req, res) => {
  const { id } = req.params;
  const msgIndex = messages.findIndex(m => m.id === id);
  if (msgIndex !== -1) {
    const { token, ...fieldsToUpdate } = req.body;
    const oldMsg = { ...messages[msgIndex] };
    const updatedMsg = { ...messages[msgIndex], ...fieldsToUpdate };
    
    const adminToken = (req.headers["x-admin-token"] || req.query.token || token) as string;
    const sessionInfo = sessions.get(adminToken);
    const operatorName = sessionInfo ? sessionInfo.username : "Administrator";

    messages[msgIndex] = updatedMsg;
    saveMessages();
    persistNewMessage(updatedMsg);
    broadcast({ type: "message_update", data: updatedMsg });
    addLog("info", `Moderated & updated individual message reference [ID: ${id}]`);

    res.json({ success: true, message: updatedMsg });
  } else {
    res.status(404).json({ error: "Message not found" });
  }
});

// Server-Sent Events stream routing
app.get("/api/stream", (req, res) => {
  const token = req.query.token as string;
  const isAdmin = !!(token && sessions.has(token));

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  res.write("\n");

  const connection: SseConnection = { res, isAdmin };
  sseConnections.add(connection);
  
  // Send active messages and logs for synchronization
  res.write(`data: ${JSON.stringify({ type: "messages_init", data: messages })}\n\n`);
  
  if (isAdmin) {
    res.write(`data: ${JSON.stringify({ type: "status", data: botStatus })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "log", data: { timestamp: new Date().toISOString(), level: "info", message: "Console stream connected with administrator privileges." } })}\n\n`);
  }

  addLog("info", `Web-client (${isAdmin ? "Admin" : "Viewer"}) connected to active stream. Total listening tabs: ${sseConnections.size}`);

  req.on("close", () => {
    sseConnections.delete(connection);
    addLog("info", `Web-client (${isAdmin ? "Admin" : "Viewer"}) closed connection. Remaining listening tabs: ${sseConnections.size}`);
  });
});

// Setup Vite or production static assets serving, wait for data sync
async function startServer() {
  // Sync all configurations and messages with direct Cloud Firestore db first
  await loadPersistedData();

  if (process.env.NODE_ENV !== "production") {
    addLog("info", "Starting application in Sandbox Development environment...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    addLog("info", "Starting application in Production environment...");
    const distPath = path.join(currentDir, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    addLog("info", `Platform gateway server running on port: ${PORT}`);
  });
}

startServer();
