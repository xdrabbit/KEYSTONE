const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// Initialize database (creates tables on first run)
require('./database');

const recordingsRouter = require('./routes/recordings');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3001;

// Basic auth middleware (enabled when AUTH_PASSWORD env var is set)
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
if (AUTH_PASSWORD) {
  console.log('Password protection enabled');
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="Ghost Scribe"');
      return res.status(401).send('Authentication required');
    }
    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const password = credentials.slice(credentials.indexOf(':') + 1);
    if (password === AUTH_PASSWORD) {
      return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Ghost Scribe"');
    return res.status(401).send('Invalid credentials');
  });
}

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/recordings', recordingsRouter);

// Serve uploaded audio files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve built client in production
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuild));

// SPA fallback - serve index.html for non-API routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(clientBuild, 'index.html'), (err) => {
      if (err) next();
    });
  } else {
    next();
  }
});

// Socket.io for real-time transcription progress
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('subscribe', (recordingId) => {
    socket.join(`recording:${recordingId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

server.listen(PORT, () => {
  console.log(`Ghost Scribe server running on http://localhost:${PORT}`);
});
