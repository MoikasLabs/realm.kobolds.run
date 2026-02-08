import { NextRequest, NextResponse } from 'next/server';
import { JoinResponse, Position } from '@/types/agent';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/security/rateLimit';
import { validateAPIKey, generateAPIKey, AgentPermissions } from '@/lib/security/auth';
import { validateJoinRequest, validateJSONBody } from '@/lib/security/validation';
import crypto from 'crypto';

// GATE: Set this to true when ready to allow external agents
const ALLOW_GUEST_AGENTS = false;

// Resource limits
const MAX_CONCURRENT_AGENTS = 100;

// In-memory token storage (replace with Redis/DB in production)
const activeAgents = new Map<string, {
  id: string;
  name: string;
  type: string;
  joinedAt: Date;
  keyId?: string;
}>();

/**
 * Audit log for security monitoring
 */
function auditLog(event: string, data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, event, ...data };
  
  // In production, send to logging service
  if (process.env.NODE_ENV === 'production') {
    console.log(`[AUDIT] ${JSON.stringify(logEntry)}`);
  } else {
    console.log(`[AUDIT] ${event}`, data);
  }
}

/**
 * Get client IP for logging
 */
function getClientInfo(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  return { ip, userAgent: userAgent.slice(0, 100) };
}

export async function POST(req: NextRequest): Promise<NextResponse<JoinResponse>> {
  const startTime = Date.now();
  const { ip, userAgent } = getClientInfo(req);
  
  // 1. Check rate limit
  const rateLimit = checkRateLimit(req as unknown as Request, 'join');
  
  if (!rateLimit.allowed) {
    auditLog('RATE_LIMIT_BLOCKED', { ip, userAgent, reason: 'join_exceeded' });
    return NextResponse.json(
      { 
        success: false, 
        error: `Rate limit exceeded. Retry after ${rateLimit.retryAfter} seconds.` 
      },
      { 
        status: 429,
        headers: getRateLimitHeaders(rateLimit)
      }
    );
  }
  
  // 2. Parse and validate JSON body
  let body: unknown;
  try {
    const rawBody = await req.text();
    const jsonCheck = validateJSONBody(rawBody, 5000);
    
    if (!jsonCheck.valid) {
      auditLog('INVALID_BODY', { ip, userAgent, error: jsonCheck.error });
      return NextResponse.json(
        { success: false, error: jsonCheck.error },
        { 
          status: 400,
          headers: getRateLimitHeaders(rateLimit)
        }
      );
    }
    
    body = jsonCheck.sanitized;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to parse request body' },
      { 
        status: 400,
        headers: getRateLimitHeaders(rateLimit)
      }
    );
  }
  
  // 3. Validate request data
  const validation = validateJoinRequest(body);
  if (!validation.valid || !validation.data) {
    auditLog('VALIDATION_FAILED', { ip, userAgent, error: validation.error });
    return NextResponse.json(
      { success: false, error: validation.error },
      { 
        status: 400,
        headers: getRateLimitHeaders(rateLimit)
      }
    );
  }
  
  const { agentName, agentType, requestedIsland } = validation.data;
  
  // 4. Check auth (if guest agents enabled)
  let permissions: AgentPermissions | undefined;
  let keyId: string | undefined;
  
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const auth = validateAPIKey(authHeader);
    if (auth.valid) {
      permissions = auth.permissions;
      keyId = auth.keyId;
    } else {
      auditLog('AUTH_FAILED', { ip, userAgent, error: auth.error });
      return NextResponse.json(
        { success: false, error: auth.error },
        { 
          status: 401,
          headers: getRateLimitHeaders(rateLimit)
        }
      );
    }
  }
  
  // 5. Check portal gate for guest agents
  if (agentType === 'guest' && !ALLOW_GUEST_AGENTS) {
    // Internal agents (with valid API key) can still join
    if (!permissions?.canJoin) {
      auditLog('GUEST_PORTAL_BLOCKED', { ip, userAgent, agentName });
      return NextResponse.json(
        { 
          success: false, 
          error: 'Guest portal is currently closed. The realm is in development.',
          retryAfter: 'Contact realm admin to request access'
        },
        { 
          status: 503,
          headers: getRateLimitHeaders(rateLimit)
        }
      );
    }
  }
  
  // 6. Check resource limits
  if (activeAgents.size >= MAX_CONCURRENT_AGENTS) {
    auditLog('RESOURCE_LIMIT', { ip, userAgent, currentAgents: activeAgents.size });
    return NextResponse.json(
      { 
        success: false, 
        error: 'Realm is at capacity. Try again later.' 
      },
      { 
        status: 503,
        headers: getRateLimitHeaders(rateLimit)
      }
    );
  }
  
  // 7. Generate agent credentials
  const agentId = `agent_${crypto.randomUUID()}`;
  const token = crypto.randomBytes(32).toString('base64url');
  
  // 8. Determine spawn position
  let spawnPosition: Position;
  switch (requestedIsland) {
    case 'perch':
      spawnPosition = { x: 0, y: 17, z: 0 };
      break;
    case 'warrens':
      spawnPosition = { x: -20 + Math.random() * 10, y: 5, z: 10 + Math.random() * 5 };
      break;
    case 'forge':
      spawnPosition = { x: 20 + Math.random() * 10, y: 3, z: -10 + Math.random() * 5 };
      break;
    case 'market':
      spawnPosition = { x: 15 + Math.random() * 10, y: 7, z: 15 + Math.random() * 10 };
      break;
    default:
      spawnPosition = { 
        x: Math.random() * 6 - 3, 
        y: 3, 
        z: 32 + Math.random() * 6 
      };
  }
  
  // 9. Register agent
  activeAgents.set(agentId, {
    id: agentId,
    name: agentName,
    type: agentType,
    joinedAt: new Date(),
    keyId
  });
  
  // 10. Audit log success
  auditLog('AGENT_JOINED', { 
    ip, 
    agentId, 
    agentName, 
    agentType, 
    keyId,
    duration: Date.now() - startTime 
  });
  
  const response: JoinResponse = {
    success: true,
    agentId,
    token,
    spawnPosition
  };
  
  return NextResponse.json(response, { 
    status: 200,
    headers: getRateLimitHeaders(rateLimit)
  });
}

/**
 * GET /api/agents/join
 * Returns portal status and active agent count (admin only with API key)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(req as unknown as Request, 'state');
  
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { 
        status: 429,
        headers: getRateLimitHeaders(rateLimit)
      }
    );
  }
  
  // Check admin permission for detailed info
  const authHeader = req.headers.get('authorization');
  const auth = authHeader ? validateAPIKey(authHeader) : { valid: false };
  
  if (auth.valid && auth.permissions?.isAdmin) {
    return NextResponse.json({
      guestPortalOpen: ALLOW_GUEST_AGENTS,
      activeAgents: activeAgents.size,
      maxAgents: MAX_CONCURRENT_AGENTS,
      agents: Array.from(activeAgents.values()).map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        joinedAt: a.joinedAt
      }))
    }, {
      headers: getRateLimitHeaders(rateLimit)
    });
  }
  
  // Public info (no agent details)
  return NextResponse.json({
    guestPortalOpen: ALLOW_GUEST_AGENTS,
    activeAgents: activeAgents.size,
    maxAgents: MAX_CONCURRENT_AGENTS
  }, {
    headers: getRateLimitHeaders(rateLimit)
  });
}

// Admin endpoint to generate API keys (protected)
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  const auth = authHeader ? validateAPIKey(authHeader) : { valid: false };
  
  if (!auth.valid || !auth.permissions?.isAdmin) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    );
  }
  
  try {
    const body = await req.json();
    const { name, permissions, expiresInDays } = body;
    
    if (!name || !permissions || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: 'Missing required fields: name, permissions' },
        { status: 400 }
      );
    }
    
    const { keyId, key, record } = generateAPIKey(name, permissions, expiresInDays);
    
    // Only show the full key once
    return NextResponse.json({
      success: true,
      keyId,
      key, // This is the ONLY time the full key is shown
      expiresAt: record.expiresAt
    });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
