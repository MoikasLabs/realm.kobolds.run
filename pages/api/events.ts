/**
 * Server-Sent Events (SSE) API Endpoint for Realm
 * 
 * Replaces Socket.IO for serverless compatibility.
 * Reads agent states from Redis for real-time task-based positioning.
 * 
 * Features:
 * - Full state push on connection from Redis
 * - Task-based agent movement (moving toward task zones)
 * - Idle agents return to home zones
 * - Periodic ping to keep connection alive
 * - Clean SSE format: data: {...}\n\n
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import type { AgentState } from '@/types/realtime';
import { 
  getAllAgentStates, 
  getAgentPosition,
  saveAgentPosition,
  isRedisAvailable 
} from '@/lib/redis';

// Zone center positions (x, y) - matches Kobold Reporter
const ZONE_CENTERS: Record<string, [number, number]> = {
  'warrens': [-30, 20],
  'forge': [35, -20],
  'plaza': [0, 40],
  'home': [0, 0],
};

// Agent visual configuration (static per agent)
const AGENT_VISUALS: Record<string, Omit<AgentState, 'id' | 'status' | 'position' | 'targetPosition' | 'lastUpdate'>> = {
  'shalom': {
    name: 'Shalom',
    type: 'shalom',
    color: '#6366f1',
    radius: 6,
  },
  'daily-kobold': {
    name: 'Daily Kobold',
    type: 'daily',
    color: '#22c55e',
    radius: 4,
  },
  'trade-kobold': {
    name: 'Trade Kobold',
    type: 'trading',
    color: '#f97316',
    radius: 4,
  },
};

// Movement configuration
const MOVEMENT_SPEED = {
  working: 2,   // Moving toward task
  returning: 1, // Returning home
  idle: 0.3,    // Small idle movement
};

// Maximum distance before teleport (for resync)
const MAX_DISTANCE = 80;

/**
 * Calculate agent position based on task state
 * 
 * Rules:
 * - If working with task zone → move toward zone center at speed 2
 * - If idle → return to home zone at speed 1
 * - Add small natural movement for visual interest
 */
async function calculateAgentPosition(
  agentId: string,
  state: Awaited<ReturnType<typeof getAllAgentStates>>[number],
  deltaTime: number // seconds since last update
): Promise<{ x: number; y: number; targetX: number; targetY: number }> {
  // Get saved position or use default
  const savedPosition = await getAgentPosition(agentId);
  
  // Determine target zone
  const isWorking = state.status === 'working' && state.location?.zone;
  const targetZone = (isWorking ? state.location?.zone : state.homeZone) || 'home';
  const [targetX, targetY] = ZONE_CENTERS[targetZone] || ZONE_CENTERS['home'];
  
  // Determine speed
  const speed = isWorking ? MOVEMENT_SPEED.working : MOVEMENT_SPEED.returning;
  
  // Start from saved position or generate based on agent
  let currentX: number;
  let currentY: number;
  
  if (savedPosition) {
    currentX = savedPosition.x;
    currentY = savedPosition.y;
  } else {
    // Generate deterministic starting position based on agentId hash
    const hash = agentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const angle = (hash % 360) * (Math.PI / 180);
    const distance = 15 + (hash % 20);
    currentX = targetX + Math.cos(angle) * distance;
    currentY = targetY + Math.sin(angle) * distance;
  }
  
  // Calculate distance to target
  const dx = targetX - currentX;
  const dy = targetY - currentY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // If far from target, move toward it
  if (distance > 5) {
    const moveDistance = Math.min(distance, speed * deltaTime * 2);
    const moveRatio = moveDistance / distance;
    currentX += dx * moveRatio;
    currentY += dy * moveRatio;
  }
  
  // Add small natural movement (perlin-like noise simulation)
  const time = Date.now() / 1000;
  const noiseX = Math.sin(time * 0.5 + agentId.length) * 2;
  const noiseY = Math.cos(time * 0.3 + agentId.length) * 2;
  
  currentX += noiseX * deltaTime;
  currentY += noiseY * deltaTime;
  
  // Clamp to reasonable world bounds
  currentX = Math.max(-80, Math.min(80, currentX));
  currentY = Math.max(-50, Math.min(60, currentY));
  
  // Save calculated position for next frame
  await saveAgentPosition(agentId, { x: currentX, y: currentY });
  
  // Calculate look-ahead target position for smooth interpolation
  const lookAheadX = targetX;
  const lookAheadY = targetY;
  
  return {
    x: currentX,
    y: currentY,
    targetX: lookAheadX,
    targetY: lookAheadY,
  };
}

/**
 * Generate full agent states from Redis data
 */
async function generateAgentStates(): Promise<AgentState[]> {
  const timestamp = Date.now();
  
  // If Redis is not available, return fallback states
  if (!isRedisAvailable()) {
    console.warn('[SSE] Redis not available - using fallback positions');
    return generateFallbackStates(timestamp);
  }
  
  try {
    const redisStates = await getAllAgentStates();
    
    // If no agents in Redis yet, return fallback
    if (redisStates.length === 0) {
      console.log('[SSE] No agents in Redis yet - using fallback');
      return generateFallbackStates(timestamp);
    }
    
    // Calculate positions for each agent
    const agentStates: AgentState[] = [];
    
    for (const redisState of redisStates) {
      const visuals = AGENT_VISUALS[redisState.agentId] || {
        name: redisState.agentId,
        type: 'custom' as const,
        color: '#888888',
        radius: 4,
      };
      
      // Calculate position based on task
      const position = await calculateAgentPosition(redisState.agentId, redisState, 0.1);
      
      agentStates.push({
        id: redisState.agentId,
        name: visuals.name,
        type: visuals.type,
        status: redisState.status,
        position: { x: position.x, y: position.y },
        targetPosition: { x: position.targetX, y: position.targetY },
        color: visuals.color,
        radius: visuals.radius,
        lastUpdate: timestamp,
      });
    }
    
    // Add any missing default agents
    for (const [agentId, visuals] of Object.entries(AGENT_VISUALS)) {
      if (!redisStates.find(s => s.agentId === agentId)) {
        const position = await calculateAgentPosition(
          agentId,
          {
            agentId,
            name: visuals.name,
            type: visuals.type,
            status: 'idle',
            homeZone: 'plaza',
            lastUpdate: timestamp,
          },
          0.1
        );
        
        agentStates.push({
          id: agentId,
          name: visuals.name,
          type: visuals.type,
          status: 'idle',
          position: { x: position.x, y: position.y },
          targetPosition: { x: position.targetX, y: position.targetY },
          color: visuals.color,
          radius: visuals.radius,
          lastUpdate: timestamp,
        });
      }
    }
    
    return agentStates;
  } catch (err) {
    console.error('[SSE] Error generating agent states from Redis:', err);
    return generateFallbackStates(timestamp);
  }
}

/**
 * Fallback state generator (used when Redis is unavailable or on first boot)
 */
function generateFallbackStates(timestamp: number): AgentState[] {
  const time = timestamp / 1000;
  
  return Object.entries(AGENT_VISUALS).map(([agentId, visuals]) => {
    // Generate deterministic idle positions
    const hash = agentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const baseX = (hash % 60) - 30;
    const baseY = (hash % 40) - 20;
    
    const x = baseX + Math.sin(time * 0.3 + hash) * 5;
    const y = baseY + Math.cos(time * 0.2 + hash) * 5;
    
    return {
      id: agentId,
      name: visuals.name,
      type: visuals.type,
      status: 'idle',
      position: { x, y },
      targetPosition: { x: baseX, y: baseY },
      color: visuals.color,
      radius: visuals.radius,
      lastUpdate: timestamp,
    };
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only accept GET requests for SSE
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  console.log('[SSE] Client connected');

  // Send full state immediately
  const now = Date.now();
  const agents = await generateAgentStates();
  
  res.write(`data: ${JSON.stringify({
    type: 'full',
    timestamp: now,
    fullState: agents
  })}\n\n`);

  // Send an initial ping
  res.write(`data: ${JSON.stringify({
    type: 'ping',
    timestamp: now
  })}\n\n`);

  // Keep-alive and periodic updates
  const updateInterval = setInterval(async () => {
    const currentTime = Date.now();
    const updatedAgents = await generateAgentStates();
    
    res.write(`data: ${JSON.stringify({
      type: 'delta',
      timestamp: currentTime,
      agents: updatedAgents.map(a => ({
        id: a.id,
        position: a.position,
        targetPosition: a.targetPosition,
        status: a.status,
        lastUpdate: a.lastUpdate
      }))
    })}\n\n`);
  }, 2000);

  const pingInterval = setInterval(() => {
    res.write(`data: ${JSON.stringify({
      type: 'ping',
      timestamp: Date.now()
    })}\n\n`);
  }, 5000);

  // Handle client disconnect
  req.on('close', () => {
    console.log('[SSE] Client disconnected');
    clearInterval(updateInterval);
    clearInterval(pingInterval);
    res.end();
  });

  req.on('error', (err) => {
    console.error('[SSE] Request error:', err);
    clearInterval(updateInterval);
    clearInterval(pingInterval);
    res.end();
  });
}

// Vercel config - max duration for SSE connection
export const config = {
  api: {
    bodyParser: false,
    externalResolver: true
  },
  maxDuration: 10
};
