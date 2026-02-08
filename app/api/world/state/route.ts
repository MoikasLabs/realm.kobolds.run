import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/security/rateLimit';

// Interface for processed kobold state
interface KoboldState {
  id: string;
  name: string;
  type: 'trading' | 'daily' | 'deploy' | 'custom';
  status: 'active' | 'paused' | 'error' | 'sleeping';
  lastRun?: string;
  stats?: {
    tasksCompleted?: number;
    tradesExecuted?: number;
    postsMade?: number;
  };
}

interface WorldSnapshot {
  timestamp: string;
  timezone: string;
  kobolds: KoboldState[];
  islands: {
    id: string;
    name: string;
    agentCount: number;
    activeTasks: number;
  }[];
  metrics: {
    totalAgents: number;
    activeTasks: number;
    completedToday: number;
  };
  security: {
    guestPortalOpen: boolean;
    rateLimit: {
      limit: number;
      remaining: number;
      reset: number;
    };
  };
}

/**
 * Sanitize kobold data to prevent info leakage
 */
function sanitizeKoboldData(kobolds: KoboldState[]): Partial<KoboldState>[] {
  return kobolds.map(k => ({
    id: k.id,
    name: k.name,
    type: k.type,
    status: k.status,
    // Don't expose detailed stats to public
  }));
}

export async function GET(req: NextRequest): Promise<NextResponse<WorldSnapshot | { error: string }>> {
  // 1. Check rate limit
  const rateLimit = checkRateLimit(req as unknown as Request, 'state');
  
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Retry after ${rateLimit.retryAfter} seconds.` },
      { 
        status: 429,
        headers: getRateLimitHeaders(rateLimit)
      }
    );
  }
  
  try {
    // Load kobold state files
    const koboldStatePath = path.join('/root/.openclaw/workspace/kobolds', 'daily-kobold-state.json');
    const koboldConfigPath = path.join('/root/.openclaw/workspace/kobolds', 'daily-kobold-config.json');
    
    let kobolds: KoboldState[] = [];
    
    try {
      // Try to read the state file
      const stateData = await fs.readFile(koboldStatePath, 'utf-8');
      const state = JSON.parse(stateData);
      
      // Transform state into kobold entries
      if (state.activeKobolds) {
        kobolds = state.activeKobolds.map((id: string) => ({
          id,
          name: id.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          type: 'daily',
          status: 'active',
          lastRun: state.lastRun,
          stats: state.stats
        }));
      }
    } catch {
      // If no state file, use defaults
      kobolds = [
        { id: 'daily-kobold', name: 'Daily Kobold', type: 'daily', status: 'active' },
        { id: 'trade-kobold', name: 'Trading Kobold', type: 'trading', status: 'active' },
      ];
    }

    // Island breakdown
    const islands = [
      { id: 'perch', name: "Dragon's Perch", agentCount: 1, activeTasks: 0 },
      { id: 'warrens', name: "The Warrens", agentCount: kobolds.filter(k => k.type === 'daily').length, activeTasks: 0 },
      { id: 'forge', name: "The Forge", agentCount: kobolds.filter(k => k.type === 'trading').length, activeTasks: 0 },
      { id: 'plaza', name: "Gateway Plaza", agentCount: 0, activeTasks: 0 },
      { id: 'market', name: "Market Mesa", agentCount: 0, activeTasks: 0 },
    ];

    const snapshot: WorldSnapshot = {
      timestamp: new Date().toISOString(),
      timezone: 'America/New_York',
      kobolds,
      islands,
      metrics: {
        totalAgents: kobolds.length + 1, // +1 for Shalom
        activeTasks: kobolds.filter(k => k.status === 'active').length,
        completedToday: 0 // Would sum from state files
      },
      security: {
        guestPortalOpen: false, // Sync with join route
        rateLimit: {
          limit: rateLimit.limit,
          remaining: rateLimit.remaining,
          reset: Math.ceil(rateLimit.resetTime / 1000)
        }
      }
    };

    return NextResponse.json(snapshot, { 
      status: 200,
      headers: {
        ...getRateLimitHeaders(rateLimit),
        'Cache-Control': 'public, max-age=5' // Short cache for live feel
      }
    });

  } catch (error) {
    console.error('[Realm] State error:', error);
    return NextResponse.json(
      { error: 'Failed to load world state' },
      { 
        status: 500,
        headers: getRateLimitHeaders(rateLimit)
      }
    );
  }
}
