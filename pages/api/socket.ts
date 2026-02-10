import { Server as SocketIOServer } from 'socket.io';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Server as HTTPServer } from 'http';

// Extend NextApiResponse with socket server
type NextApiResponseServerIO = NextApiResponse & {
  socket: {
    server: HTTPServer & {
      io?: SocketIOServer;
    };
  };
};

// Hardcoded agents for Vercel (no filesystem access)
const agents = [
  {
    id: 'shalom',
    name: 'Shalom',
    type: 'shalom',
    status: 'active',
    position: { x: 0, y: 0 },
    color: '#6366f1',
    radius: 6,
    lastUpdate: Date.now()
  },
  {
    id: 'daily-kobold',
    name: 'Daily Kobold',
    type: 'daily',
    status: 'active', 
    position: { x: -30, y: 20 },
    color: '#22c55e',
    radius: 4,
    lastUpdate: Date.now()
  },
  {
    id: 'trade-kobold',
    name: 'Trade Kobold',
    type: 'trading',
    status: 'active',
    position: { x: 35, y: -20 },
    color: '#f97316',
    radius: 4,
    lastUpdate: Date.now()
  }
];

// Global io instance
let io: SocketIOServer | null = null;

// Setup handlers once
function setupIO(ioInstance: SocketIOServer) {
  ioInstance.on('connection', (socket) => {
    console.log('[Socket.IO] Client connected:', socket.id);
    
    // Send full state immediately
    socket.emit('full', {
      type: 'full',
      timestamp: Date.now(),
      fullState: agents
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Client disconnected:', socket.id);
    });
  });
}

export default function handler(req: NextApiRequest, res: NextApiResponseServerIO) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Initialize Socket.IO on first request
  if (!io && !res.socket.server.io) {
    try {
      io = new SocketIOServer(res.socket.server, {
        path: '/api/socket',
        cors: { origin: '*', methods: ['GET', 'POST'] },
        transports: ['polling'], // Vercel only supports polling reliably
        allowEIO3: true, // Support Engine.IO v3 clients if needed
      });
      
      res.socket.server.io = io;
      setupIO(io);
      
      console.log('[Socket.IO] Server initialized');
    } catch (err) {
      console.error('[Socket.IO] Init error:', err);
      res.status(500).json({ error: 'Socket init failed' });
      return;
    }
  }

  // For Socket.IO requests, don't end the response - let Socket.IO handle it
  // The connection stays open for polling
  if (req.url?.startsWith('/api/socket')) {
    // Socket.IO will handle the response
    return;
  }
  
  res.end();
}
