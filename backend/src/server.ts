import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { WebSocketServer, WebSocket } from 'ws';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import storageRoutes, { poolService } from './routes/storage.routes.js';
import systemRoutes, { telemetryService } from './routes/system.routes.js';
import filesRoutes from './routes/files.routes.js';

const app = express();
const server = http.createServer(app);

// Security & Parsing
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    // Allow local development ports and Render deployment domains
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.endsWith('.onrender.com') || origin.endsWith('.trycloudflare.com')) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive for local home network access
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
});
app.use('/api/auth', authLimiter);

// Health probe endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/files', filesRoutes);

// Global Error Handler
app.use(errorHandler);

// WebSocket Server for Real-Time Telemetry & Hardware Hot-Plug Notifications
const wss = new WebSocketServer({ server, path: '/ws/telemetry' });

wss.on('connection', (ws: WebSocket) => {
  logger.info('Client connected to real-time telemetry WebSocket');

  // Push immediate snapshot
  telemetryService.getTelemetry().then((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'TELEMETRY_SNAPSHOT', data }));
    }
  });

  const interval = setInterval(async () => {
    if (ws.readyState === WebSocket.OPEN) {
      const data = await telemetryService.getTelemetry();
      ws.send(JSON.stringify({ type: 'TELEMETRY_UPDATE', data }));
    }
  }, 3000);

  ws.on('close', () => {
    clearInterval(interval);
    logger.info('Client disconnected from telemetry WebSocket');
  });
});

const PORT = env.PORT;
server.listen(PORT, () => {
  logger.info(`=======================================================`);
  logger.info(` Cloud Storage Platform Backend Engine is ACTIVE`);
  logger.info(` HTTP API listening on: http://localhost:${PORT}/api`);
  logger.info(` WebSocket Telemetry on: ws://localhost:${PORT}/ws/telemetry`);
  logger.info(` Nextcloud Target URL:  ${env.NEXTCLOUD_INTERNAL_URL}`);
  logger.info(` Storage Mode:          ${env.SIMULATE_STORAGE ? 'SIMULATED (Dev)' : 'PHYSICAL (Host)'}`);
  logger.info(`=======================================================`);
});
