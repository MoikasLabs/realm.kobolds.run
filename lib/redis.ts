/**
 * Upstash Redis Client for Realm
 * 
 * Provides Redis connection for persistent agent state storage.
 * Uses Upstash Redis for serverless compatibility on Vercel.
 */

import { Redis } from '@upstash/redis';

// Redis client singleton
let redis: Redis | null = null;

/**
 * Get or create Redis client
 */
export function getRedisClient(): Redis | null {
  if (redis) return redis;

  // Support both Upstash KV naming conventions
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('[Redis] Missing KV_REST_API_URL/KV_REST_API_TOKEN');
    return null;
  }

  redis = new Redis({
    url,
    token,
  });

  return redis;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
         !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Agent state stored in Redis
 */
export interface AgentRedisState {
  agentId: string;
  name: string;
  type: 'trading' | 'daily' | 'deploy' | 'custom' | 'shalom';
  status: 'active' | 'paused' | 'error' | 'sleeping' | 'working' | 'idle';
  color?: string;
  radius?: number;
  task?: string;
  location?: {
    zone: 'warrens' | 'forge' | 'plaza' | 'home';
  };
  position?: {
    x: number;
    y: number;
  };
  homeZone?: 'warrens' | 'forge' | 'plaza';
  lastUpdate: number;
}

/**
 * Redis key helpers
 */
export const redisKeys = {
  agentState: (agentId: string) => `realm:agent:${agentId}`,
  agentPosition: (agentId: string) => `realm:agent:${agentId}:position`,
  allAgents: () => 'realm:agents:active',
};

/**
 * Save agent state to Redis
 */
export async function saveAgentState(state: AgentRedisState): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.set(redisKeys.agentState(state.agentId), JSON.stringify(state));
    await client.sadd(redisKeys.allAgents(), state.agentId);
    return true;
  } catch (err) {
    console.error('[Redis] Failed to save agent state:', err);
    return false;
  }
}

/**
 * Get agent state from Redis
 */
export async function getAgentState(agentId: string): Promise<AgentRedisState | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(redisKeys.agentState(agentId));
    if (!data) return null;
    return typeof data === 'string' ? JSON.parse(data) : data as AgentRedisState;
  } catch (err) {
    console.error('[Redis] Failed to get agent state:', err);
    return null;
  }
}

/**
 * Get all active agent states from Redis
 */
export async function getAllAgentStates(): Promise<AgentRedisState[]> {
  const client = getRedisClient();
  if (!client) return [];

  try {
    const agentIds = await client.smembers(redisKeys.allAgents());
    if (!agentIds || agentIds.length === 0) return [];

    const states: AgentRedisState[] = [];
    for (const agentId of agentIds) {
      const state = await getAgentState(agentId);
      if (state) states.push(state);
    }
    return states;
  } catch (err) {
    console.error('[Redis] Failed to get all agent states:', err);
    return [];
  }
}

/**
 * Save agent position to Redis
 */
export async function saveAgentPosition(
  agentId: string,
  position: { x: number; y: number }
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.set(redisKeys.agentPosition(agentId), JSON.stringify(position));
    return true;
  } catch (err) {
    console.error('[Redis] Failed to save agent position:', err);
    return false;
  }
}

/**
 * Get agent position from Redis
 */
export async function getAgentPosition(agentId: string): Promise<{ x: number; y: number } | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(redisKeys.agentPosition(agentId));
    if (!data) return null;
    return typeof data === 'string' ? JSON.parse(data) : data as { x: number; y: number };
  } catch (err) {
    console.error('[Redis] Failed to get agent position:', err);
    return null;
  }
}
