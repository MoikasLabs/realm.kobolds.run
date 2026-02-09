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

  // Socket.IO configuration with Vercel-friendly settings
  io = new SocketIOServer(httpServer, {
    path: '/api/ws/socket.io',
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    // Priority: polling first for Vercel (no WebSocket support), then websocket for local/dev
    transports: ['polling', 'websocket'],
    pingInterval: 10000,
    pingTimeout: 5000,
    // Allow upgrades from polling to websocket on non-Vercel platforms
    allowUpgrades: true,
    // Vercel specific: disable per-message deflate for better compatibility
    perMessageDeflate: false,
    // Max HTTP buffer for polling
    maxHttpBufferSize: 1e6
  });

  io.on('connection', (socket) => {
    const clientId = socket.id;
    const transport = socket.conn.transport.name;
    connectedClients.add(clientId);
    console.log(`[WS] Client connected: ${clientId} (transport: ${transport}, total: ${connectedClients.size})`);

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

    // Handle transport upgrades
    socket.conn.on('upgrade', (transport) => {
      console.log(`[WS] Client ${clientId} upgraded to ${transport.name}`);
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

    socket.on('disconnect', (reason) => {
      connectedClients.delete(clientId);
      console.log(`[WS] Client disconnected: ${clientId} (reason: ${reason}, ${connectedClients.size} remaining)`);
    });

    socket.on('error', (err) => {
      console.error(`[WS] Client ${clientId} error:`, err);
    });
  });

  // Start periodic updates (20 updates/sec = 50ms)
  let lastBroadcast = Date.now();
  const BROADCAST_INTERVAL = 50;

  // Use setInterval with 50ms for polling-friendly updates
  // This works better on Vercel than trying to do 60fps
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
  }, 50);

  return io;
}

// GET handler for WebSocket/Socket.IO initialization AND REST polling fallback
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode');
    
    // REST polling mode for Vercel (when Socket.IO polling doesn't work)
    if (mode === 'poll' || mode === 'state') {
      const agents = await loadAgentStates();
      
      // Update cache for delta calculation
      for (const agent of agents) {
        agentCache.set(agent.id, { ...agent });
      }

      // Check for client's last known timestamp for delta response
      const since = url.searchParams.get('since');
      
      if (since) {
        const sinceTime = parseInt(since);
        // Compare agent cache timestamps to find changed agents
        const changedAgents: AgentDelta[] = [];
        
        for (const [id, agent] of agentCache) {
          if (agent.lastUpdate > sinceTime) {
            changedAgents.push({
              id: agent.id,
              position: agent.position,
              status: agent.status,
              timestamp: agent.lastUpdate
            });
          }
        }

        return NextResponse.json({
          type: 'delta',
          timestamp: Date.now(),
          agents: changedAgents,
          connected: connectedClients.size
        });
      }

      // Full state response
      return NextResponse.json({
        type: 'full',
        timestamp: Date.now(),
        fullState: agents,
        connected: connectedClients.size
      });
    }

    // Socket.IO initialization mode
    const response = NextResponse.json({ 
      status: 'Socket.IO server ready',
      transports: ['polling', 'websocket'],
      clients: connectedClients.size,
      agents: agentCache.size
    });
    initSocketIO(response);

    return response;
  } catch (error) {
    console.error('[WS] Error in GET handler:', error);
    return NextResponse.json(
      { error: 'Failed to process request', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST handler for health checks and REST fallback
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    
    // Handle ping via REST for polling clients
    if (body.action === 'ping') {
      return NextResponse.json({
        pong: true,
        timestamp: Date.now(),
        connected: connectedClients.size,
        agents: agentCache.size
      });
    }

    // Return current state for polling clients
    if (body.action === 'state') {
      const agents = await loadAgentStates();
      return NextResponse.json({
        type: 'full',
        timestamp: Date.now(),
        fullState: agents,
        serverTime: Date.now()
      });
    }

    // Default health check
    return NextResponse.json({
      connected: io !== null,
      clients: connectedClients.size,
      agents: agentCache.size,
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[WS] Error in POST handler:', error);
    return NextResponse.json(
      { error: 'Failed to process POST request' },
      { status: 500 }
    );
  }
}

// Clean up on module reload (development)
if (process.env.NODE_ENV === 'development') {
  const socketIO = io as SocketIOServer | null;
  if (socketIO) {
    socketIO.close();
    io = null;
  }
}
