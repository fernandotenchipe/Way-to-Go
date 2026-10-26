import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { setupWebSocket } from './modules/rastreo/websocket/wsServer.js';

// Import routes
import trucksRouter from './modules/rastreo/routes/trucks.js';
import gpsRouter from './modules/rastreo/routes/gps.js';
import alertsRouter from './modules/rastreo/routes/alerts.js';
import authRouter from './modules/rastreo/routes/auth.js';
import logisticsRouter from './modules/logistica/routes/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'way-to-go-api',
    modules: ['rastreo', 'logistica', 'finanzas']
  });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/trucks', trucksRouter);
app.use('/api/gps', gpsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/logistica', logisticsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado'
  });
});

// Error handler
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket
setupWebSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   WAY TO GO API Server                     ║
║   Running on port ${PORT}                  ║
║   Environment: ${process.env.NODE_ENV || 'development'}             ║
║                                            ║
║   API: http://localhost:${PORT}/api          ║
║   WebSocket: ws://localhost:${PORT}/ws       ║
╚════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
