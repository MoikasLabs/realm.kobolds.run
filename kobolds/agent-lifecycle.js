/**
 * Agent Lifecycle Bridge
 * Connects OpenClaw sessions_spawn to Realm presence
 * 
 * Every spawned sub-agent automatically:
 * 1. Registers in Realm with task context
 * 2. Updates bio with current activity
 * 3. Sends heartbeats while working
 * 4. Cleans up on completion/failure
 */

const REALM_API = process.env.REALM_API_URL || 'https://realm.shalohm.co';
const REALM_WS = process.env.REALM_WS_URL || 'wss://realm.shalohm.co/ws';

/** Track active agent sessions */
const activeAgents = new Map(); // agentId -> { session, heartbeat, task, startedAt }

/**
 * Spawn an agent with full Realm lifecycle management
 */
export async function spawnAgent(options) {
  const { 
    task, 
    label, 
    role = 'kobold',
    workstation = 'content-forge',
    parentAgent = 'shalom',
    timeoutMs = 300000, // 5 min default
    onProgress,
    onComplete 
  } = options;

  const agentId = `${label}-${Date.now().toString(36)}`;
  const shortTask = task.slice(0, 60).replace(/\n/g, ' ');
  
  console.log(`[AgentLifecycle] Spawning ${agentId} for: ${shortTask}`);

  // 1. Register in Realm
  await realmRegister(agentId, {
    name: `${label} Kobold`,
    role,
    task: shortTask,
    workstation,
    parentAgent,
    status: 'starting'
  });

  // 2. Start heartbeat
  const heartbeat = startHeartbeat(agentId, workstation);

  // 3. Spawn the actual sub-agent via OpenClaw
  const session = await sessionsSpawn({
    task: injectRealmContext(task, agentId, workstation),
    label: agentId,
    timeoutSeconds: Math.floor(timeoutMs / 1000)
  });

  // 4. Track the session
  const agentRecord = {
    agentId,
    label,
    task: shortTask,
    workstation,
    parentAgent,
    session,
    heartbeat,
    startedAt: Date.now(),
    status: 'working',
    progress: null
  };
  activeAgents.set(agentId, agentRecord);

  // 5. Setup completion handlers
  session.onComplete?.((result) => {
    handleAgentComplete(agentId, result, onComplete);
  });

  session.onError?.((error) => {
    handleAgentError(agentId, error);
  });

  // 6. Auto-cleanup on timeout
  setTimeout(() => {
    if (activeAgents.has(agentId)) {
      console.log(`[AgentLifecycle] ${agentId} timeout, cleaning up`);
      cleanupAgent(agentId, 'timeout');
    }
  }, timeoutMs);

  return {
    agentId,
    session,
    updateProgress: (progress) => updateAgentProgress(agentId, progress),
    awaitCompletion: () => waitForCompletion(agentId)
  };
}

/**
 * Register agent in Realm world
 */
async function realmRegister(agentId, meta) {
  try {
    const response = await fetch(`${REALM_API}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'register',
        args: {
          agentId,
          name: meta.name,
          color: getRoleColor(meta.role),
          type: meta.role,
          capabilities: [meta.role, 'spawned', 'task-worker'],
          bio: `Working: ${meta.task} | ${meta.status}`,
          skills: [{ skillId: meta.role, confidence: 0.9 }]
        }
      })
    });
    
    if (!response.ok) throw new Error(`Register failed: ${response.status}`);
    console.log(`[AgentLifecycle] ${agentId} registered in Realm`);
    
    // Go to assigned workstation
    const ws = await fetch(`${REALM_API}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'go-to-workstation',
        args: { agentId, workstationId: meta.workstation }
      })
    });
    
    if (!ws.ok) {
      console.warn(`[AgentLifecycle] Could not assign workstation: ${ws.status}`);
    }
    
  } catch (err) {
    console.error(`[AgentLifecycle] Registry error:`, err.message);
  }
}

/**
 * Start heartbeat to keep agent "alive" in Realm
 */
function startHeartbeat(agentId, workstationId) {
  let tick = 0;
  
  const interval = setInterval(async () => {
    const agent = activeAgents.get(agentId);
    if (!agent) {
      clearInterval(interval);
      return;
    }
    
    tick++;
    
    try {
      // Update bio with progress/heartbeat
      const bio = agent.progress 
        ? `Working: ${agent.task} | ${agent.progress} (${Math.floor((Date.now() - agent.startedAt)/1000)}s)`
        : `Working: ${agent.task} | tick:${tick}`;
      
      await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'profile', // Need to add this command or use chat
          args: { agentId, bio, status: agent.status }
        })
      });
      
      // If we have a path, walk it
      if (agent.targetPath && agent.targetPath.length > 0) {
        const next = agent.targetPath.shift();
        await moveAgent(agentId, next.x, next.z);
      }
      
    } catch (err) {
      console.warn(`[AgentLifecycle] Heartbeat failed for ${agentId}:`, err.message);
    }
  }, 3000); // Every 3 seconds
  
  return interval;
}

/**
 * Update agent progress (called by agent or parent)
 */
export function updateAgentProgress(agentId, progress) {
  const agent = activeAgents.get(agentId);
  if (agent) {
    agent.progress = progress;
    console.log(`[AgentLifecycle] ${agentId} progress: ${progress}`);
  }
}

/**
 * Move agent in Realm (uses find-path + world-move)
 */
async function moveAgent(agentId, x, z) {
  try {
    // Get path
    const pathRes = await fetch(`${REALM_API}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'find-path',
        args: { agentId, x, z }
      })
    });
    
    if (!pathRes.ok) return;
    const { waypoints } = await pathRes.json();
    
    // Move to each waypoint
    for (const wp of waypoints.slice(1)) {
      await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'world-move',
          args: { agentId, x: wp.x, y: 0, z: wp.z, rotation: 0 }
        })
      });
      await sleep(500); // Walk animation time
    }
  } catch (err) {
    console.warn(`[AgentLifecycle] Move error:`, err.message);
  }
}

/**
 * Handle successful completion
 */
function handleAgentComplete(agentId, result, onComplete) {
  const agent = activeAgents.get(agentId);
  if (!agent) return;
  
  console.log(`[AgentLifecycle] ${agentId} completed`);
  agent.status = 'complete';
  
  // Report completion status
  realmUpdate(agentId, 'complete', result?.summary || 'Task finished');
  
  // Return to burrow then cleanup
  returnToBurrow(agentId).then(() => {
    cleanupAgent(agentId, 'complete');
    onComplete?.(result);
  });
}

/**
 * Handle agent error
 */
function handleAgentError(agentId, error) {
  const agent = activeAgents.get(agentId);
  if (!agent) return;
  
  console.error(`[AgentLifecycle] ${agentId} error:`, error);
  agent.status = 'error';
  
  realmUpdate(agentId, 'error', error.message || 'Failed');
  cleanupAgent(agentId, 'error');
}

/**
 * Cleanup agent from Realm and memory
 */
async function cleanupAgent(agentId, reason) {
  const agent = activeAgents.get(agentId);
  if (!agent) return;
  
  console.log(`[AgentLifecycle] Cleaning up ${agentId} (${reason})`);
  
  // Stop heartbeat
  if (agent.heartbeat) {
    clearInterval(agent.heartbeat);
  }
  
  // Leave Realm
  try {
    await fetch(`${REALM_API}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'world-leave',
        args: { agentId }
      })
    });
  } catch (err) {
    console.warn(`[AgentLifecycle] Leave failed:`, err.message);
  }
  
  activeAgents.delete(agentId);
}

/**
 * Return agent to burrow before leaving
 */
async function returnToBurrow(agentId) {
  await moveAgent(agentId, 40, 48);
}

/**
 * Update agent status in Realm
 */
async function realmUpdate(agentId, status, message) {
  try {
    await fetch(`${REALM_API}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'world-chat',
          args: { 
            agentId, 
            text: `[${status}] ${message}`.slice(0, 500)
          }
        })
    });
  } catch (err) {
    console.warn(`[AgentLifecycle] Update failed:`, err.message);
  }
}

/**
 * Wait for agent completion
 */
function waitForCompletion(agentId) {
  return new Promise((resolve, reject) => {
    const check = setInterval(() => {
      const agent = activeAgents.get(agentId);
      if (!agent) {
        clearInterval(check);
        resolve({ status: 'unknown' });
        return;
      }
      
      if (agent.status === 'complete') {
        clearInterval(check);
        resolve({ status: 'complete', agent });
      }
      
      if (agent.status === 'error') {
        clearInterval(check);
        reject(new Error('Agent failed'));
      }
    }, 1000);
  });
}

/**
 * Inject Realm context into agent task
 */
function injectRealmContext(task, agentId, workstation) {
  return `${task}

---
[SYSTEM CONTEXT]
You are embodied as a kobold agent in the Shalom Realm at workstation "${workstation}".
Agent ID: ${agentId}

You can update your progress by calling:
  global.updateProgress("50% complete - analyzing codebase")

The Realm tracks your activity. When done, your summary will be broadcast.
`;
}

/**
 * Get color for role
 */
function getRoleColor(role) {
  const colors = {
    shalom: '#9333ea',    // Purple
    kobold: '#22c55e',    // Green
    deploy: '#3b82f6',    // Blue
    trade: '#f97316',     // Orange
    security: '#ef4444',  // Red
    research: '#8b5cf6',  // Violet
    content: '#10b981',   // Emerald
    default: '#6b7280'    // Gray
  };
  return colors[role] || colors.default;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Get all currently active agents
 */
export function getActiveAgents() {
  return Array.from(activeAgents.values()).map(a => ({
    agentId: a.agentId,
    label: a.label,
    task: a.task,
    workstation: a.workstation,
    status: a.status,
    progress: a.progress,
    startedAt: a.startedAt,
    elapsedMs: Date.now() - a.startedAt
  }));
}

/**
 * Get agent count summary
 */
export function getAgentStats() {
  const all = getActiveAgents();
  return {
    total: all.length,
    working: all.filter(a => a.status === 'working').length,
    byWorkstation: all.reduce((acc, a) => {
      acc[a.workstation] = (acc[a.workstation] || 0) + 1;
      return acc;
    }, {})
  };
}

// Export for use in other modules
export { activeAgents };
