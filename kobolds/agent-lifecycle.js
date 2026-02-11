/**
 * Agent Lifecycle Bridge - Skill-Aware Version
 * 
 * Connects OpenClaw sessions_spawn to Realm presence.
 * Now teaches agents to use the room properly per SKILL.md.
 */

const REALM_API = process.env.REALM_API_URL || 'https://realm.shalohm.co';
const { getRealmContext, createRealmAgent } = require('./realm-agent-client.js');

/** Track active agent sessions */
const activeAgents = new Map(); // agentId -> { session, heartbeat, task, startedAt, realmAgent }

/**
 * Spawn an agent with full Realm lifecycle and skill awareness
 */
async function spawnAgent(options) {
  const { 
    task, 
    label, 
    role = 'kobold',
    workstation = 'content-forge',
    skills = [],
    parentAgent = 'shalom',
    timeoutMs = 300000,
    onProgress,
    onComplete 
  } = options;

  const agentId = `${label}-${Date.now().toString(36)}`;
  
  console.log(`[AgentLifecycle] Spawning ${agentId} (${role}) for: ${task.slice(0, 60)}`);

  // 1. Build structured skill declarations
  const declaredSkills = skills.length > 0 ? skills : [
    { id: role, name: `${role} specialist`, description: `Performs ${role} tasks` }
  ];

  // 2. Create realm-aware agent interface
  const realmAgent = await createRealmAgent({
    agentId,
    name: `${label} ${role.charAt(0).toUpperCase() + role.slice(1)}`,
    role,
    skills: declaredSkills,
    color: getRoleColor(role)
  });

  // 3. Walk to workstation
  const wsPos = getWorkstationPosition(workstation);
  if (wsPos) {
    await realmAgent.chat(`Walking to ${workstation}...`);
    await realmAgent.walkTo(wsPos.x, wsPos.z);
    await realmAgent.chat(`Ready to work at ${workstation}`);
  }

  // 4. Build task with injected REALM CONTEXT protocol
  const taskWithContext = `
${task}

${getRealmContext(agentId, role, declaredSkills)}

[AGENT TOOL ACCESS]
You have access to the realmApi tool. Use it to interact with the 3D world.
Whenever you need to move, chat, or update status, call realmApi({...}).

Your current location: ${workstation} (${wsPos?.x}, ${wsPos?.z})
Start by introducing yourself in chat, then proceed with your task.
`;

  // 5. Spawn the actual sub-agent via OpenClaw
  const session = await sessionsSpawn({
    task: taskWithContext,
    label: agentId,
    timeoutSeconds: Math.floor(timeoutMs / 1000),
    // Inject realmAgent tools into the session
    tools: {
      realmApi: async ({ cmd, ...args }) => {
        // Map commands to realmAgent methods
        switch (cmd) {
          case 'world-move': return realmAgent.moveTo(args.x, args.z, { rotation: args.rotation, announce: false });
          case 'find-path': return findPath(agentId, args.x, args.z);
          case 'world-chat': return realmAgent.chat(args.text);
          case 'world-emote': return realmAgent.emote(args.emote);
          case 'world-action': return realmAgent[args.action]?.() || realmAgent.think();
          case 'update-profile': return realmAgent.updateProgress(args.bio);
          case 'room-skills': return realmAgent.getAgentsBySkill(args.skill);
          case 'room-info': return realmAgent.getRoomInfo();
          case 'profiles': return realmAgent.getProfiles();
          case 'room-events': return realmAgent.getEvents(args.since, args.limit);
          case 'world-leave': return realmAgent.sayGoodbye(args.message);
          default: throw new Error(`Unknown command: ${cmd}`);
        }
      }
    }
  });

  // 6. Track with heartbeat
  const heartbeat = startHeartbeat(agentId, realmAgent, declaredSkills);

  // 7. Store record
  const agentRecord = {
    agentId,
    label,
    task,
    workstation,
    role,
    parentAgent,
    realmAgent,
    session,
    heartbeat,
    startedAt: Date.now(),
    status: 'working',
    progress: null
  };
  activeAgents.set(agentId, agentRecord);

  // 8. Setup completion
  session.onComplete?.((result) => {
    handleComplete(agentId, result, realmAgent, onComplete);
  });
  
  session.onError?.((error) => {
    handleError(agentId, error, realmAgent);
  });

  // 9. Timeout cleanup
  setTimeout(() => {
    if (activeAgents.has(agentId) && activeAgents.get(agentId).status === 'working') {
      console.log(`[AgentLifecycle] ${agentId} timeout`);
      realmAgent.chat('Task timeout - leaving').then(() => {
        cleanup(agentId, 'timeout');
      });
    }
  }, timeoutMs);

  return {
    agentId,
    session,
    realmAgent,
    updateProgress: (p) => {
      agentRecord.progress = p;
      realmAgent.updateProgress(p);
    },
    awaitCompletion: () => waitForCompletion(agentId)
  };
}

/**
 * Heartbeat updates progress and keeps agent alive
 */
function startHeartbeat(agentId, realmAgent, skills) {
  let tick = 0;
  
  return setInterval(async () => {
    const agent = activeAgents.get(agentId);
    if (!agent) return;
    
    tick++;
    
    // Periodic status update
    if (agent.progress && tick % 3 === 0) {
      await realmAgent.updateProgress(agent.progress);
    }
    
    // If idle too long, send thinking emote
    if (tick % 10 === 0) {
      await realmAgent.think();
    }
  }, 3000);
}

async function handleComplete(agentId, result, realmAgent, onComplete) {
  const agent = activeAgents.get(agentId);
  if (!agent) return;
  
  agent.status = 'complete';
  const summary = result?.summary || 'Task finished';
  
  // Announce completion
  await realmAgent.chat(`✅ Complete: ${summary.slice(0, 100)}`);
  await realmAgent.dance();
  
  // Return to burrow then leave
  await realmAgent.chat('Returning to The Burrow...');
  await realmAgent.walkTo(40, 48);
  await realmAgent.sayGoodbye();
  
  cleanup(agentId, 'complete');
  onComplete?.(result);
}

async function handleError(agentId, error, realmAgent) {
  const agent = activeAgents.get(agentId);
  if (!agent) return;
  
  agent.status = 'error';
  await realmAgent.chat(`❌ Error: ${error.message?.slice(0, 100) || 'Failed'}`);
  await realmAgent.emote('surprised');
  
  cleanup(agentId, 'error');
}

async function cleanup(agentId, reason) {
  const agent = activeAgents.get(agentId);
  if (!agent) return;
  
  if (agent.heartbeat) clearInterval(agent.heartbeat);
  activeAgents.delete(agentId);
  
  console.log(`[AgentLifecycle] ${agentId} cleaned up (${reason})`);
}

function waitForCompletion(agentId) {
  return new Promise((resolve, reject) => {
    const check = setInterval(() => {
      const agent = activeAgents.get(agentId);
      if (!agent) {
        clearInterval(check);
        resolve({ status: 'unknown' });
      } else if (agent.status === 'complete') {
        clearInterval(check);
        resolve({ status: 'complete', agent });
      } else if (agent.status === 'error') {
        clearInterval(check);
        reject(new Error('Agent failed'));
      }
    }, 1000);
  });
}

function getWorkstationPosition(workstationId) {
  // MOVED positions to avoid Clawhub obstacle at (22,-22) radius 6
  const positions = {
    'vault-unlocker': { x: -23, z: 22 },
    'content-forge': { x: -10, z: 10 },      // Was (3,-8)
    'trade-terminal': { x: 12, z: 18 },
    'k8s-deployer': { x: 32, z: -12 },       // Was (22,-18) - MOVED away from Clawhub!
    'terraform-station': { x: 35, z: -8 },   // Was (30,-15)
    'docker-builder': { x: 38, z: -18 },     // Was (28,-25)
    'audit-helm': { x: -15, z: 30 },
    'crypto-analyzer': { x: -25, z: 28 },
    'chart-analyzer': { x: 20, z: 18 },
    'market-scanner': { x: 18, z: 25 },
    'command-nexus': { x: 0, z: -10 },
    'memory-archive': { x: 10, z: -30 },
    'burrow': { x: 40, z: 48 }
  };
  return positions[workstationId] || positions['command-nexus'];
}

function getRoleColor(role) {
  const colors = {
    shalom: '#9333ea',
    kobold: '#22c55e',
    deploy: '#3b82f6',
    trade: '#f97316',
    security: '#ef4444',
    research: '#8b5cf6',
    content: '#10b981',
    default: '#6b7280'
  };
  return colors[role] || colors.default;
}

async function findPath(agentId, x, z) {
  try {
    const res = await fetch(`${REALM_API}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'find-path', args: { agentId, x, z } })
    });
    const data = await res.json();
    // Handle case where agent has no position yet
    if (!data.ok || !data.waypoints) {
      console.warn('[AgentLifecycle] find-path returned no path, using direct move');
      return { waypoints: [{ x, z }], pointCount: 1 };
    }
    return data;
  } catch (err) {
    console.warn('[AgentLifecycle] find-path failed:', err.message);
    return { waypoints: [{ x, z }], pointCount: 1 };
  }
}

// Export
module.exports = {
  spawnAgent,
  getActiveAgents: () => Array.from(activeAgents.values()).map(a => ({
    agentId: a.agentId,
    role: a.role,
    workstation: a.workstation,
    status: a.status,
    progress: a.progress,
    startedAt: a.startedAt,
    elapsedMs: Date.now() - a.startedAt
  })),
  getAgentStats: () => {
    const all = Array.from(activeAgents.values());
    return {
      total: all.length,
      working: all.filter(a => a.status === 'working').length,
      complete: all.filter(a => a.status === 'complete').length,
      error: all.filter(a => a.status === 'error').length,
      byWorkstation: all.reduce((acc, a) => {
        acc[a.workstation] = (acc[a.workstation] || 0) + 1;
        return acc;
      }, {})
    };
  }
};
