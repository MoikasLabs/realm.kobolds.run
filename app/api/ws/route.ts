import { NextResponse } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { Socket as NetSocket } from 'net';
import type { AgentState, AgentDelta, WorldDeltaUpdate } from '@/types/realtime';
import fs from 'fs/promises';
import path from 'path';

// Extend the NodeJS namespace to include Socket.IO
interface SocketWithIO extends NetSocket {
  server: HTTPServer & {
    io?: SocketIOServer;
  };
}

// Global Socket.IO instance (singleton pattern for hot reload safety)
let io: SocketIOServer | null = null;

// Agent state cache for delta calculation
const agentCache = new Map<string, AgentState>();
const connectedClients = new Set<string>();

// Generate deterministic positions for agents (consistent across reconnects)
function generateAgentPosition(id: string, zoneId: string): { x: number; y: number } {
  // Hash the ID to get deterministic but pseudo-random values
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  // Zone centers
  const zoneCenters: Record<string, [number, number]> = {
    'perch': [0, 0],
    'warrens': [-30, 20],
    'forge': [35, -20],
    'plaza': [0, 40],
    'townhall': [10, 10]
  };

  const [cx, cy] = zoneCenters[zoneId] || [0, 0];
  const spread = 6; // Spread within zone

  // Use hash to generate offset
  const x = cx + (Math.abs(hash) % 100) / 100 * spread * 2 - spread;
  const y = cy + (Math.abs(hash >> 8) % 100) / 100 * spread * 2 - spread;

  return { x, y };
}

// Load kobold state and convert to agents
async function loadAgentStates(): Promise<AgentState[]> {
  const agents: AgentState[] = [];

  // Always include Shalom at center
  agents.push({
    id: 'shalom',
    name: 'Shalom',
    type: 'shalom',
    status: 'active',
    position: generateAgentPosition('shalom', 'perch'),
    color: '#6366f1',
    radius: 6,
    lastUpdate: Date.now()
  });

  try {
    // Load kobold state
    const koboldStatePath = path.join('/root/.openclaw/workspace/kobolds', 'daily-kobold-state.json');
    const koboldConfigPath = path.join('/root/.openclaw/workspace/kobolds', 'daily-kobold-config.json');

    let koboldIds: string[] = [];

    try {
      const stateData = await fs.readFile(koboldStatePath, 'utf-8');
      const state = JSON.parse(stateData);
      if (state.activeKobolds) {
        koboldIds = state.activeKobolds;
      }
    } catch {
      // Default kobolds if no state file
      koboldIds = ['daily-kobold', 'trade-kobold'];
    }

    // Create agent for each kobold
    for (let i = 0; i < koboldIds.length; i++) {
      const id = koboldIds[i];
      const isTrading = id.includes('trade') || i % 2 === 1;
      const zoneId = isTrading ? 'forge' : 'warrens';

      agents.push({
        id,
        name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        type: isTrading ? 'trading' : 'daily',
        status: 'active',
        position: generateAgentPosition(id, zoneId),
        color: isTrading ? '#f97316' : '#22c55e',
        radius: 4,
        lastUpdate: Date.now()
      });
    }
  } catch (error) {
    console.error('[WS] Error loading agents:', error);
  }

  return agents;
}

// Calculate delta between old and new state
function calculateDelta(
  oldAgents: Map<string, AgentState>,
  newAgents: AgentState[]
): WorldDeltaUpdate {
  const deltas: AgentDelta[] = [];
  const removed: string[] = [];

  // Find changed and new agents
  for (const agent of newAgents) {
    const old = oldAgents.get(agent.id);

    if (!old) {
      // New agent - send full
      deltas.push({
        id: agent.id,
        position: agent.position,
        status: agent.status,
        timestamp: agent.lastUpdate
      });
    } else {
      // Check for changes
      const delta: AgentDelta = { id: agent.id, timestamp: agent.lastUpdate };
      let hasChanges = false;

      if (old.position.x !== agent.position.x || old.position.y !== agent.position.y) {
        delta.position = agent.position;
        hasChanges = true;
      }

      if (old.status !== agent.status) {
        delta.status = agent.status;
        hasChanges = true;
      }

      if (hasChanges) {
        deltas.push(delta);
      }
    }

    // Update cache
    agentCache.set(agent.id, agent);
  }

  // Find removed agents
  const newIds = new Set(newAgents.map(a => a.id));
  for (const [id, agent] of oldAgents) {
    if (!newIds.has(id)) {
      removed.push(id);
      agentCache.delete(id);
    }
  }

  return {
    type: 'delta',
    timestamp: Date.now(),
    agents: deltas,
    removed
  };
}

// Initialize Socket.IO server
function initSocketIO(res: Response): SocketIOServer {
  if (io) return io;

  // Get the underlying Node.js response to access socket
  const nodeRes = res as unknown as { socket?: SocketWithIO };

  if (!nodeRes.socket?.server) {
    throw new Error('Server not available');
  }

  const httpServer = nodeRes.socket.server;

  io = new SocketIOServer(httpServer, {
    path: '/api/ws/socket.io',
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingInterval: 10000,
    pingTimeout: 5000
  });

  io.on('connection', (socket) => {
    const clientId = socket.id;
    connectedClients.add(clientId);
    console.log(`[WS] Client connected: ${clientId} (${connectedClients.size} total)`);

    // Send initial full state
    loadAgentStates().then(agents => {
      // Cache all agents
      for (const agent of agents) {
        agentCache.set(agent.id, { ...agent });
      }

      socket.emit('full', {
        type: 'full',
        timestamp: Date.now(),
        fullState: agents
      } as WorldDeltaUpdate);
    });

    // Handle viewport updates (for spatial culling optimization)
    socket.on('viewport', (viewport) => {
      // Store viewport for spatial culling calculations
      (socket as unknown as { viewport?: unknown }).viewport = viewport;
    });

    // Handle ping from client
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle subscription updates
    socket.on('subscribe', (data) => {
      console.log(`[WS] Client ${clientId} subscribed:`, data);
    });

    socket.on('disconnect', () => {
      connectedClients.delete(clientId);
      console.log(`[WS] Client disconnected: ${clientId} (${connectedClients.size} remaining)`);
    });
  });

  // Start periodic updates (60fps simulation - 16.67ms)
  let lastBroadcast = Date.now();
  const BROADCAST_INTERVAL = 50; // 20 updates/sec (50ms) - balances latency and CPU

  setInterval(async () => {
    if (!io || connectedClients.size === 0) return;

    const now = Date.now();
    if (now - lastBroadcast < BROADCAST_INTERVAL) return;
    lastBroadcast = now;

    // Load current state
    const newAgents = await loadAgentStates();

    // Calculate delta
    const delta = calculateDelta(agentCache, newAgents);

    // Only broadcast if there are changes
    if (delta.agents && delta.agents.length > 0) {
      io.emit('delta', delta);
    }

    // Also send ping every ~1 second to measure latency
    if (now % 1000 < BROADCAST_INTERVAL) {
      io.emit('ping', { timestamp: now });
    }
  }, 16); // Check every 16ms (60fps)

  return io;
}

// GET handler for WebSocket upgrade
export async function GET(req: Request) {
  try {
    // Initialize Socket.IO
    const response = NextResponse.json({ status: 'WebSocket server ready' });
    initSocketIO(response);

    return response;
  } catch (error) {
    console.error('[WS] Error initializing:', error);
    return NextResponse.json(
      { error: 'Failed to initialize WebSocket server' },
      { status: 500 }
    );
  }
}

// POST handler for health checks
export async function POST() {
  return NextResponse.json({
    connected: io !== null,
    clients: connectedClients.size,
    agents: agentCache.size,
    uptime: process.uptime()
  });
}

// Clean up on module reload (development)
if (process.env.NODE_ENV === 'development') {
  const socketIO = io as SocketIOServer | null;
  if (socketIO) {
    socketIO.close();
    io = null;
  }
}
