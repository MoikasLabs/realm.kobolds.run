import { Server as SocketIOServer } from 'socket.io';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Server as HTTPServer } from 'http';
import type { AgentState, AgentDelta, WorldDeltaUpdate } from '@/types/realtime';
import fs from 'fs/promises';
import path from 'path';

// Interface that extends HTTP server and adds socket.io property
interface ServerWithIO extends HTTPServer {
  io?: SocketIOServer;
}

// Use intersection type to add socket.server.io without conflicting with NextApiResponse.socket
type NextApiResponseServerIO = NextApiResponse & {
  socket: {
    server: ServerWithIO;
  };
};

// Global state management
let io: SocketIOServer | null = null;
const agentCache = new Map<string, AgentState>();
const connectedClients = new Set<string>();

// Zone centers for agent positioning
const ZONE_CENTERS: Record<string, [number, number]> = {
  'perch': [0, 0],
  'warrens': [-30, 20],
  'forge': [35, -20],
  'plaza': [0, 40],
  'townhall': [10, 10]
};

// Generate deterministic positions for agents
function generateAgentPosition(id: string, zoneId: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const [cx, cy] = ZONE_CENTERS[zoneId] || [0, 0];
  const spread = 6;

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
    const koboldStatePath = path.join('/root/.openclaw/workspace/kobolds', 'daily-kobold-state.json');
    let koboldIds: string[] = [];

    try {
      const stateData = await fs.readFile(koboldStatePath, 'utf-8');
      const state = JSON.parse(stateData);
      if (state.activeKobolds) {
        koboldIds = state.activeKobolds;
      }
    } catch {
      koboldIds = ['daily-kobold', 'trade-kobold'];
    }

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
    console.error('[Socket.IO] Error loading agents:', error);
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

  for (const agent of newAgents) {
    const old = oldAgents.get(agent.id);

    if (!old) {
      deltas.push({
        id: agent.id,
        position: agent.position,
        status: agent.status,
        timestamp: agent.lastUpdate
      });
    } else {
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

    agentCache.set(agent.id, agent);
  }

  const newIds = new Set(newAgents.map(a => a.id));
  for (const [id] of oldAgents) {
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

// Initialize Socket.IO handlers
function setupSocketHandlers(ioInstance: SocketIOServer) {
  ioInstance.on('connection', (socket) => {
    const clientId = socket.id;
    const transport = socket.conn.transport.name;
    connectedClients.add(clientId);
    console.log(`[Socket.IO] Client connected: ${clientId} (transport: ${transport}, total: ${connectedClients.size})`);

    // Send initial full state
    loadAgentStates().then(agents => {
      for (const agent of agents) {
        agentCache.set(agent.id, { ...agent });
      }

      socket.emit('full', {
        type: 'full',
        timestamp: Date.now(),
        fullState: agents
      } as WorldDeltaUpdate);
    });

    socket.conn.on('upgrade', (transport) => {
      console.log(`[Socket.IO] Client ${clientId} upgraded to ${transport.name}`);
    });

    socket.on('viewport', (viewport) => {
      (socket as unknown as { viewport?: unknown }).viewport = viewport;
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    socket.on('subscribe', (data) => {
      console.log(`[Socket.IO] Client ${clientId} subscribed:`, data);
    });

    socket.on('disconnect', (reason) => {
      connectedClients.delete(clientId);
      console.log(`[Socket.IO] Client disconnected: ${clientId} (reason: ${reason}, ${connectedClients.size} remaining)`);
    });

    socket.on('error', (err) => {
      console.error(`[Socket.IO] Client ${clientId} error:`, err);
    });
  });

  // Periodic updates (20 updates/sec)
  let lastBroadcast = Date.now();
  const BROADCAST_INTERVAL = 50;

  setInterval(async () => {
    if (connectedClients.size === 0) return;

    const now = Date.now();
    if (now - lastBroadcast < BROADCAST_INTERVAL) return;
    lastBroadcast = now;

    const newAgents = await loadAgentStates();
    const delta = calculateDelta(agentCache, newAgents);

    if (delta.agents && delta.agents.length > 0) {
      ioInstance.emit('delta', delta);
    }
  }, 50);
}

// Main handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponseServerIO
) {
  // CORS headers for Vercel preview deployments
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Initialize Socket.IO if not already done
  if (!res.socket.server.io) {
    const ioInstance = new SocketIOServer(res.socket.server, {
      path: '/api/socket',
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: false
      },
      transports: ['polling', 'websocket'],
      pingInterval: 10000,
      pingTimeout: 5000,
      allowUpgrades: true,
      perMessageDeflate: false,
      maxHttpBufferSize: 1e6
    });

    res.socket.server.io = ioInstance;
    io = ioInstance;
    
    setupSocketHandlers(ioInstance);
    console.log('[Socket.IO] Server initialized on /api/socket');
  }

  res.end();
}
