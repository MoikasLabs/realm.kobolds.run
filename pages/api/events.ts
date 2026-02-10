/**
 * Server-Sent Events (SSE) API Endpoint for Realm
 *
 * Replaces Socket.IO for serverless compatibility.
 * Provides deterministic zone-to-zone patrol system for agents.
 *
 * Features:
 * - Full state push on connection with deterministic positions
 * - Zone-to-zone patrol routes (Shalom patrols all zones, kobolds patrol their areas)
 * - Constant speed travel between connected zones
 * - Dwell time at zones (idle/pausing animation)
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

// Zone graph - defines connections and dwell times
const ZONE_GRAPH: Record<string, { connections: string[]; dwellTime: number }> = {
  'plaza': { connections: ['warrens', 'forge'], dwellTime: 5000 },
  'warrens': { connections: ['plaza', 'forge'], dwellTime: 3000 },
  'forge': { connections: ['plaza', 'warrens'], dwellTime: 4000 },
  'home': { connections: ['plaza'], dwellTime: 2000 },
};

// Agent patrol routes - each zone includes travel time + dwell time
const AGENT_ROUTES: Record<string, string[]> = {
  'shalom': ['plaza', 'warrens', 'plaza', 'forge', 'plaza'], // full patrol circuit
  'daily-kobold': ['warrens', 'plaza', 'warrens'], // home patrol
  'trade-kobold': ['forge', 'plaza', 'forge'], // forge patrol
};

// Travel speed: units per second
const TRAVEL_SPEED = 2; // units/sec
// Dwell ratio: what % of segment is spent dwelling at zone (vs traveling)
const DWELL_RATIO = 0.3;

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

// Maximum distance before teleport (for resync)
const MAX_DISTANCE = 80;

/**
 * Calculate distance between two zones (straight line)
 */
function getZoneDistance(zoneA: string, zoneB: string): number {
  const [ax, ay] = ZONE_CENTERS[zoneA] || ZONE_CENTERS['home'];
  const [bx, by] = ZONE_CENTERS[zoneB] || ZONE_CENTERS['home'];
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate segment duration for traveling between two zones
 * Includes travel time + dwell time at destination
 *
 * Formula: time = distance / speed + dwellTime
 */
function getSegmentDuration(fromZone: string, toZone: string): number {
  const distance = getZoneDistance(fromZone, toZone);
  const travelTime = (distance / TRAVEL_SPEED) * 1000; // ms
  const dwellTime = ZONE_GRAPH[toZone]?.dwellTime || 3000;
  return travelTime + dwellTime;
}

/**
 * Calculate agent position based on zone-to-zone travel (deterministic)
 *
 * Rules:
 * - Follow predefined patrol route
 * - Travel in straight line between zones at constant speed
 * - Dwell at zones for configured time
 * - Continuous movement, no jumps on reconnect
 */
function calculateZoneTravel(agentId: string, timestamp: number): {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  status: 'working' | 'idle';
  currentZone: string;
  nextZone: string;
} {
  const route = AGENT_ROUTES[agentId] || ['plaza', 'home', 'plaza'];

  // Calculate total patrol cycle duration
  let totalCycleTime = 0;
  const segmentDurations: number[] = [];

  for (let i = 0; i < route.length; i++) {
    const fromZone = route[i];
    const toZone = route[(i + 1) % route.length];
    const duration = getSegmentDuration(fromZone, toZone);
    segmentDurations.push(duration);
    totalCycleTime += duration;
  }

  // Determine current position in patrol cycle
  const cyclePosition = timestamp % totalCycleTime;

  // Find current segment
  let accumulatedTime = 0;
  let currentSegmentIndex = 0;

  for (let i = 0; i < segmentDurations.length; i++) {
    if (cyclePosition < accumulatedTime + segmentDurations[i]) {
      currentSegmentIndex = i;
      break;
    }
    accumulatedTime += segmentDurations[i];
  }

  const currentZone = route[currentSegmentIndex];
  const nextZone = route[(currentSegmentIndex + 1) % route.length];
  const segmentDuration = segmentDurations[currentSegmentIndex];
  const segmentProgress = cyclePosition - accumulatedTime;

  const [currentX, currentY] = ZONE_CENTERS[currentZone];
  const [nextX, nextY] = ZONE_CENTERS[nextZone];

  // Travel time portion of segment
  const distance = getZoneDistance(currentZone, nextZone);
  const travelTime = (distance / TRAVEL_SPEED) * 1000;

  // Calculate progress: 0-1 during travel, then dwell at destination
  let progress: number;
  let status: 'working' | 'idle';

  if (segmentProgress < travelTime) {
    // Currently traveling
    progress = segmentProgress / travelTime;
    status = 'working';
  } else {
    // Currently dwelling at destination
    progress = 1;
    status = 'idle';
  }

  // Linear interpolation between zones
  const x = currentX + (nextX - currentX) * progress;
  const y = currentY + (nextY - currentY) * progress;

  return {
    x,
    y,
    targetX: nextX,
    targetY: nextY,
    status,
    currentZone,
    nextZone,
  };
}

/**
 * Generate full agent states using zone-to-zone patrol system
 *
 * Deterministic based on timestamp - same timestamp = same position
 * This ensures smooth movement with no jumps on reconnect
 */
async function generateAgentStates(): Promise<AgentState[]> {
  const timestamp = Date.now();

  // Generate states for all configured agents using patrol system
  const agentStates: AgentState[] = [];

  for (const [agentId, visuals] of Object.entries(AGENT_VISUALS)) {
    // Calculate position based on zone patrol route
    const travel = calculateZoneTravel(agentId, timestamp);

    agentStates.push({
      id: agentId,
      name: visuals.name,
      type: visuals.type,
      status: travel.status,
      position: { x: travel.x, y: travel.y },
      targetPosition: { x: travel.targetX, y: travel.targetY },
      color: visuals.color,
      radius: visuals.radius,
      lastUpdate: timestamp,
    });
  }

  return agentStates;
}

/**
 * Fallback state generator (uses same patrol system)
 *
 * This is now redundant since generateAgentStates handles all cases,
 * but kept for API compatibility. Uses deterministic patrol routes.
 */
function generateFallbackStates(timestamp: number): AgentState[] {
  return Object.entries(AGENT_VISUALS).map(([agentId, visuals]) => {
    const travel = calculateZoneTravel(agentId, timestamp);

    return {
      id: agentId,
      name: visuals.name,
      type: visuals.type,
      status: travel.status,
      position: { x: travel.x, y: travel.y },
      targetPosition: { x: travel.targetX, y: travel.targetY },
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
