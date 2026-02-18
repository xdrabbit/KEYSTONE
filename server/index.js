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
app.get('/{*splat}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientBuild, 'index.html'));
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
