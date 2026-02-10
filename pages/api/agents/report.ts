/**
 * Agent Status Reporting API Endpoint
 * 
 * Receives status updates from kobolds and other agents.
 * Stores state in Redis for real-time map synchronization.
 * 
 * POST /api/agents/report
 * Body: {
 *   agentId: string,
 *   status?: 'active' | 'paused' | 'error' | 'sleeping' | 'working' | 'idle',
 *   task?: string,
 *   location?: { zone: 'warrens' | 'forge' | 'plaza' | 'home' },
 *   position?: { x: number, y: number },
 *   timestamp?: number
 * }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { 
  saveAgentState, 
  saveAgentPosition, 
  getAgentState,
  isRedisAvailable,
  AgentRedisState 
} from '@/lib/redis';

// Agent configuration defaults
const AGENT_DEFAULTS: Record<string, Partial<AgentRedisState>> = {
  'shalom': {
    name: 'Shalom',
    type: 'shalom',
    homeZone: 'plaza',
    color: '#6366f1',
  },
  'daily-kobold': {
    name: 'Daily Kobold',
    type: 'daily',
    homeZone: 'warrens',
    color: '#22c55e',
  },
  'trade-kobold': {
    name: 'Trade Kobold',
    type: 'trading',
    homeZone: 'forge',
    color: '#f97316',
  },
};

// Zone center positions (x, y)
const ZONE_CENTERS: Record<string, [number, number]> = {
  'warrens': [-30, 20],
  'forge': [35, -20],
  'plaza': [0, 40],
  'home': [0, 0], // Fallback
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Realm-Secret');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Optional secret validation
  const secret = req.headers['x-realm-secret'];
  const expectedSecret = process.env.REALM_API_SECRET;
  
  if (expectedSecret && secret !== expectedSecret) {
    // Log warning but don't block in development
    if (process.env.NODE_ENV !== 'development') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    console.warn('[Report] Invalid or missing secret in development mode - allowing');
  }

  // Parse request body
  const { 
    agentId, 
    status, 
    task, 
    location, 
    position, 
    timestamp 
  } = req.body;

  if (!agentId || typeof agentId !== 'string') {
    res.status(400).json({ error: 'Missing or invalid agentId' });
    return;
  }

  // Check Redis availability
  if (!isRedisAvailable()) {
    console.warn('[Report] Redis not available - report discarded');
    res.status(503).json({ error: 'Redis not available', agentId });
    return;
  }

  try {
    // Get existing state or create new
    let existingState = await getAgentState(agentId);
    const defaults = AGENT_DEFAULTS[agentId] || {
      name: agentId,
      type: 'custom' as const,
      homeZone: 'plaza' as const,
    };

    // Build updated state
    const updatedState: AgentRedisState = {
      ...defaults,
      ...existingState,
      agentId,
      lastUpdate: timestamp || Date.now(),
    };

    // Update status if provided
    if (status && isValidStatus(status)) {
      updatedState.status = status;
    }

    // Update task if provided
    if (task !== undefined) {
      updatedState.task = task;
    }

    // Update location/zone if provided
    if (location?.zone && isValidZone(location.zone)) {
      updatedState.location = { zone: location.zone };
    }

    // Save state to Redis
    const stateSaved = await saveAgentState(updatedState);

    // Save position if provided
    let positionSaved = false;
    if (position && typeof position.x === 'number' && typeof position.y === 'number') {
      positionSaved = await saveAgentPosition(agentId, position);
    }

    console.log(`[Report] Agent ${agentId} reported: status=${status}, zone=${location?.zone}, task=${task ? 'yes' : 'no'}`);

    res.status(200).json({
      success: true,
      agentId,
      stateSaved,
      positionSaved,
      timestamp: updatedState.lastUpdate,
    });

  } catch (err) {
    console.error('[Report] Error processing report:', err);
    res.status(500).json({ 
      error: 'Internal server error', 
      agentId,
      message: err instanceof Error ? err.message : 'Unknown error'
    });
  }
}

function isValidStatus(status: string): status is AgentRedisState['status'] {
  return ['active', 'paused', 'error', 'sleeping', 'working', 'idle'].includes(status);
}

function isValidZone(zone: string): zone is 'warrens' | 'forge' | 'plaza' | 'home' {
  return ['warrens', 'forge', 'plaza', 'home'].includes(zone);
}
