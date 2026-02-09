import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/security/rateLimit';
import { validateAPIKey } from '@/lib/security/auth';

// Unified agent registry (replaces kobold-specific one)
interface AgentStatus {
  id: string;
  name: string;
  type: string;  // 'kobold', 'subagent', 'guest', etc.
  subtype: string; // 'daily', 'cmo', 'trading', etc.
  status: 'idle' | 'working' | 'traveling' | 'error' | 'sleeping';
  zone: string;
  currentTask?: {
    id: string;
    name: string;
    type: string;
    progress: number;
  };
  position: {
    x: number;
    y: number;
    z: number;
  };
  lastHeartbeat: string;
  stats: {
    tasksCompleted: number;
    postsMade?: number;
    tradesExecuted?: number;
  };
  metadata?: {
    color?: string;
    [key: string]: unknown;
  };
}

const agentRegistry = new Map<string, AgentStatus>();

// Zone positions
const ZONE_POSITIONS: Record<string, { x: number; z: number; radius: number }> = {
  warrens: { x: -35, z: 15, radius: 8 },
  forge: { x: 35, z: -15, radius: 7 },
  plaza: { x: 0, z: 50, radius: 10 },
  market: { x: 30, z: 30, radius: 9 },
  perch: { x: 0, z: 0, radius: 12 }
};

// Agent colors by subtype
const AGENT_COLORS: Record<string, string> = {
  // Kobolds
  daily: '#22c55e',
  trading: '#f97316',
  deploy: '#3b82f6',
  // C-Suite
  cmo: '#ec4899',
  cio: '#06b6d4',
  cso: '#dc2626',
  cfo: '#16a34a',
  coo: '#7c3aed',
  ceo: '#f59e0b',
  // Other
  guest: '#94a3b8',
  default: '#64748b'
};

function getPositionInZone(zone: string, existingPosition?: { x: number; y: number; z: number } | null): { x: number; y: number; z: number } {
  const zoneInfo = ZONE_POSITIONS[zone] || ZONE_POSITIONS.warrens;
  
  if (existingPosition) {
    // Small jitter for smooth movement within zone
    const jitter = 1.5;
    return {
      x: existingPosition.x + (Math.random() - 0.5) * jitter,
      y: 0.8,
      z: existingPosition.z + (Math.random() - 0.5) * jitter
    };
  }
  
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * zoneInfo.radius * 0.6;
  
  return {
    x: zoneInfo.x + Math.cos(angle) * distance,
    y: 0.8,
    z: zoneInfo.z + Math.sin(angle) * distance
  };
}

/**
 * POST /api/agent/webhook
 * All agent types report here: kobolds, sub-agents, guests
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(req as unknown as Request, 'state');
  
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: rateLimit.retryAfter },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }
  
  // Validate API key for writes
  const authHeader = req.headers.get('authorization');
  const auth = authHeader ? validateAPIKey(authHeader) : { valid: false };
  
  if (!auth.valid || !auth.permissions?.canEdit) {
    return NextResponse.json(
      { error: 'Invalid or missing API key' },
      { status: 401, headers: getRateLimitHeaders(rateLimit) }
    );
  }
  
  try {
    const body = await req.json();
    
    if (!body.id || !body.name || !body.status) {
      return NextResponse.json(
        { error: 'Missing required fields: id, name, status' },
        { status: 400, headers: getRateLimitHeaders(rateLimit) }
      );
    }
    
    // Get position
    let position = body.position;
    if (!position) {
      const existing = agentRegistry.get(body.id);
      position = getPositionInZone(body.zone || 'warrens', existing?.position);
    }
    
    // Determine color
    const color = body.metadata?.color || 
                  AGENT_COLORS[body.subtype] || 
                  AGENT_COLORS[body.type] || 
                  AGENT_COLORS.default;
    
    // Update or create agent record
    const existing = agentRegistry.get(body.id);
    const agent: AgentStatus = {
      id: body.id,
      name: body.name,
      type: body.type || 'kobold',
      subtype: body.subtype || body.type || 'unknown',
      status: body.status,
      zone: body.zone || 'warrens',
      currentTask: body.currentTask,
      position,
      lastHeartbeat: new Date().toISOString(),
      stats: body.stats || existing?.stats || { tasksCompleted: 0 },
      metadata: {
        ...body.metadata,
        color
      }
    };
    
    agentRegistry.set(body.id, agent);
    
    console.log(`[AgentWebhook] ${agent.name} (${agent.type}/${agent.subtype}) is ${agent.status} in ${agent.zone}`);
    
    return NextResponse.json(
      { 
        success: true, 
        agentId: agent.id,
        position,
        color 
      },
      { status: 200, headers: getRateLimitHeaders(rateLimit) }
    );
    
  } catch (error) {
    console.error('[AgentWebhook] Error:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400, headers: getRateLimitHeaders(rateLimit) }
    );
  }
}

/**
 * GET /api/agent/webhook
 * Public read of all agent states (no API key needed)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(req as unknown as Request, 'state');
  
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }
  
  // Mark stale agents as sleeping (5 minute timeout)
  const now = Date.now();
  const staleThreshold = 5 * 60 * 1000;
  
  for (const [id, agent] of agentRegistry) {
    const lastHeartbeat = new Date(agent.lastHeartbeat).getTime();
    if (now - lastHeartbeat > staleThreshold && agent.status !== 'sleeping') {
      agent.status = 'sleeping';
    }
  }
  
  // Group by type for easier consumption
  const agents = Array.from(agentRegistry.values());
  const grouped = {
    kobolds: agents.filter(a => a.type === 'kobold'),
    subagents: agents.filter(a => a.type === 'subagent'),
    guests: agents.filter(a => a.type === 'guest'),
    all: agents
  };
  
  return NextResponse.json(
    {
      ...grouped,
      counts: {
        total: agents.length,
        kobolds: grouped.kobolds.length,
        subagents: grouped.subagents.length,
        guests: grouped.guests.length
      },
      lastUpdate: new Date().toISOString()
    },
    { 
      status: 200,
      headers: {
        ...getRateLimitHeaders(rateLimit),
        'Cache-Control': 'public, max-age=2'
      }
    }
  );
}

export function getAgentRegistry(): Map<string, AgentStatus> {
  return agentRegistry;
}
