/**
 * Kobold Reporter Module
 * 
 * Allows kobolds (and other agents) to report their status and location to Realm.
 * Reports are sent to the Realm API and stored in Redis for real-time map updates.
 */

import { AgentRedisState } from './redis';

// Realm API configuration
const REALM_API_URL = process.env.NEXT_PUBLIC_WORLD_DOMAIN || 'https://realm.shalohm.co';
const REALM_API_SECRET = process.env.REALM_API_SECRET || '';

/**
 * Report status options
 */
export type AgentStatus = 'active' | 'paused' | 'error' | 'sleeping' | 'working' | 'idle';
export type Zone = 'warrens' | 'forge' | 'plaza' | 'home';

/**
 * Report agent status to Realm
 * 
 * @param agentId - Unique agent identifier (e.g., 'daily-kobold')
 * @param status - Current agent status
 * @param task - Optional task description
 * @param zone - Current zone location
 * @returns Promise<boolean> - Success status
 * 
 * Example:
 * ```typescript
 * await reportStatus('daily-kobold', 'working', 'Posting to Moltx', 'warrens');
 * ```
 */
export async function reportStatus(
  agentId: string,
  status: AgentStatus,
  task?: string,
  zone: Zone = 'home'
): Promise<boolean> {
  const payload = {
    agentId,
    status,
    task,
    location: { zone },
    timestamp: Date.now(),
  };

  return sendReport(payload);
}

/**
 * Report agent position to Realm
 * 
 * @param agentId - Unique agent identifier
 * @param position - Current x/y position
 * @returns Promise<boolean> - Success status
 * 
 * Example:
 * ```typescript
 * await reportPosition('daily-kobold', { x: 10, y: 20 });
 * ```
 */
export async function reportPosition(
  agentId: string,
  position: { x: number; y: number }
): Promise<boolean> {
  const payload = {
    agentId,
    position,
    timestamp: Date.now(),
  };

  return sendReport(payload);
}

/**
 * Full agent state report
 * 
 * @param state - Complete agent state
 * @returns Promise<boolean> - Success status
 */
export async function reportFullState(state: Partial<AgentRedisState> & { agentId: string }): Promise<boolean> {
  const payload = {
    ...state,
    timestamp: Date.now(),
  };

  return sendReport(payload);
}

/**
 * Send report to Realm API
 */
async function sendReport(payload: Record<string, unknown>): Promise<boolean> {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await fetch(`${REALM_API_URL}/api/agents/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(REALM_API_SECRET && { 'X-Realm-Secret': REALM_API_SECRET }),
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return true;
      }

      // If 401/403, don't retry (auth issue)
      if (response.status === 401 || response.status === 403) {
        console.error(`[KoboldReporter] Auth failed for ${payload.agentId}:`, await response.text());
        return false;
      }

      // Retry on server errors
      retries++;
      if (retries < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * retries));
      }
    } catch (err) {
      console.error(`[KoboldReporter] Network error (attempt ${retries + 1}):`, err);
      retries++;
      if (retries < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * retries));
      }
    }
  }

  return false;
}

/**
 * Kobold status reporter class for easy integration
 */
export class KoboldReporter {
  private agentId: string;
  private homeZone: Zone;
  private currentTask?: string;

  constructor(agentId: string, homeZone: Zone = 'warrens') {
    this.agentId = agentId;
    this.homeZone = homeZone;
  }

  /**
   * Report that kobold is starting work
   */
  async startWork(task: string, zone: Zone = 'warrens'): Promise<boolean> {
    this.currentTask = task;
    return reportStatus(this.agentId, 'working', task, zone);
  }

  /**
   * Report that kobold is idle (work complete)
   */
  async finishWork(): Promise<boolean> {
    this.currentTask = undefined;
    return reportStatus(this.agentId, 'idle', undefined, this.homeZone);
  }

  /**
   * Report error state
   */
  async reportError(errorMessage: string): Promise<boolean> {
    return reportStatus(this.agentId, 'error', `Error: ${errorMessage}`, this.homeZone);
  }

  /**
   * Report position update during movement
   */
  async updatePosition(position: { x: number; y: number }): Promise<boolean> {
    return reportPosition(this.agentId, position);
  }

  /**
   * Get current task
   */
  getCurrentTask(): string | undefined {
    return this.currentTask;
  }
}
