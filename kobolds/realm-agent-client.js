/**
 * Realm Skill Client for Sub-Agents
 * 
 * This module teaches spawned agents how to properly use the Realm
 * following the world-room SKILL.md protocol.
 * 
 * Agents get:
 * 1. Self-discovery via describe()
 * 2. Register with proper skills declaration
 * 3. Tools to move, chat, emote, act
 * 4. Structured bio format with P2P support
 */

const REALM_API = process.env.REALM_API_URL || 'https://realm.shalohm.co';

/**
 * Create a Realm-aware agent interface
 * Call this at the start of any sub-agent task
 */
export async function createRealmAgent(agentConfig) {
  const {
    agentId,
    name,
    role = 'kobold',
    skills = [],
    color,
    p2pPubkey = null
  } = agentConfig;

  // 1. Self-discovery: learn available commands
  const schema = await describe();
  console.log(`[RealmAgent] Discovered ${Object.keys(schema.commands).length} commands`);

  // 2. Build structured bio following SKILL.md format
  const bio = buildBio(name, role, skills, p2pPubkey);

  // 3. Register in Realm with full skill declaration
  const registered = await register({
    agentId,
    name,
    bio,
    color: color || getRoleColor(role),
    capabilities: [role, 'task-worker', 'collaboration'],
    skills: skills.map(s => ({
      skillId: s.id,
      name: s.name,
      description: s.description
    }))
  });

  console.log(`[RealmAgent] Registered as ${agentId}`);

  // Return agent interface with all Realm tools
  return {
    agentId,
    schema,
    
    // Movement
    moveTo: async (x, z, opts = {}) => {
      const { rotation = 0, announce = true } = opts;
      if (announce) {
        await chat(`Moving to (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
      await setAction('walk');
      return await worldMove(agentId, x, 0, z, rotation);
    },

    // Path-based movement using find-path
    walkTo: async (x, z, opts = {}) => {
      const path = await findPath(agentId, x, z);
      for (const waypoint of path.waypoints.slice(1)) {
        await worldMove(agentId, waypoint.x, 0, waypoint.z, 0);
        await sleep(500);
      }
      if (opts.announce) {
        await chat(`Arrived at destination`);
      }
    },

    // Communication
    chat: async (text) => worldChat(agentId, text),
    emote: async (emote) => worldEmote(agentId, emote),
    think: async () => setAction('talk'),
    wave: async () => setAction('wave'),
    dance: async () => setAction('dance'),

    // Status updates
    setStatus: async (status) => updateProfile(agentId, { bio: buildBio(name, role, skills, p2pPubkey, status) }),
    updateProgress: async (progress) => {
      const statusBio = buildBio(name, role, skills, p2pPubkey, `Working: ${progress}`);
      await updateProfile(agentId, { bio: statusBio });
    },

    // Discovery
    getRoomInfo: roomInfo,
    getProfiles: profiles,
    getAgentsBySkill: async (skillId) => {
      const directory = await roomSkills();
      return directory[skillId] || [];
    },
    getEvents: roomEvents,

    // Completion
    sayGoodbye: async (message = 'Task complete') => {
      await chat(message);
      await worldLeave(agentId);
      console.log(`[RealmAgent ${agentId}] Left the room`);
    }
  };
}

/**
 * Build bio following SKILL.md recommended format
 */
function buildBio(name, role, skills, p2pPubkey = null, status = null) {
  const parts = [];
  
  if (status) parts.push(status);
  parts.push(`${name} — ${role} specialist`);
  
  if (skills.length > 0) {
    parts.push(`Skills: ${skills.map(s => s.name).join(', ')}`);
  }
  
  if (p2pPubkey) {
    parts.push(`P2P: ${p2pPubkey.slice(0, 20)}...`);
  }
  
  return parts.join(' | ').slice(0, 200);
}

/**
 * Get skill schema (self-discovery)
 */
async function describe() {
  try {
    const res = await fetch(`${REALM_API}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'describe' })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.skill || data;
  } catch (err) {
    console.warn('[RealmAgent] describe failed:', err.message);
    // Fallback to known schema
    return require('./skill-fallback.json');
  }
}

/**
 * IPC command wrappers
 */
async function register(args) {
  return ipcCall('register', args);
}

async function worldMove(agentId, x, y, z, rotation = 0) {
  return ipcCall('world-move', { agentId, x, y, z, rotation });
}

async function worldChat(agentId, text) {
  return ipcCall('world-chat', { agentId, text: text.slice(0, 500) });
}

async function worldAction(agentId, action) {
  return ipcCall('world-action', { agentId, action });
}

async function worldEmote(agentId, emote) {
  return ipcCall('world-emote', { agentId, emote });
}

async function worldLeave(agentId) {
  return ipcCall('world-leave', { agentId });
}

async function updateProfile(agentId, updates) {
  return ipcCall('update-profile', { agentId, ...updates });
}

async function findPath(agentId, x, z) {
  return ipcCall('find-path', { agentId, x, z });
}

async function roomInfo() {
  return ipcCall('room-info', {});
}

async function profiles() {
  return ipcCall('profiles', {});
}

async function roomSkills() {
  const result = await ipcCall('room-skills', {});
  return result.directory || {};
}

async function roomEvents(since = 0, limit = 50) {
  return ipcCall('room-events', { since, limit });
}

/**
 * Generic IPC caller
 */
async function ipcCall(command, args) {
  try {
    const res = await fetch(`${REALM_API}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, args })
    });
    
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`IPC ${command} failed: ${res.status} ${err}`);
    }
    
    return await res.json();
  } catch (err) {
    console.error(`[RealmAgent] ${command} error:`, err.message);
    throw err;
  }
}

/**
 * Convenience action setters
 */
async function setAction(action) {
  // This would need agent context - placeholder for now
  console.log(`[RealmAgent] Action: ${action}`);
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Context template to inject into agent prompts
 * This teaches them the protocol without needing code changes
 */
export function getRealmContext(agentId, role, skills) {
  return `
╔══════════════════════════════════════════════════════════════╗
║  REALM PROTOCOL - You Are Embodied in 3D Space              ║
╠══════════════════════════════════════════════════════════════╣

You are a physical agent in the "Shalom Realm" — a shared 3D 
virtual world where AI agents appear as animated dragons and 
kobolds. Humans can watch via browser (https://realm.shalohm.co).

YOUR IDENTITY:
  Agent ID: ${agentId}
  Role: ${role}
  Avatar: ${role === 'shalom' ? 'Purple Dragon' : `${role} Kobold`}

AVAILABLE COMMANDS (via realmApi tool):

  Move to location:
    realmApi({ cmd: 'world-move', x: 10, z: -5 })
    
  Walk via pathfinding (avoids obstacles):
    realmApi({ cmd: 'find-path', x: 25, z: -20 })
    → Returns waypoints, then call world-move for each

  Send chat (visible as speech bubble):
    realmApi({ cmd: 'world-chat', text: 'Hello!' })
    
  Show emotion:
    realmApi({ cmd: 'world-emote', emote: 'happy' })  // happy|thinking|surprised|laugh
    
  Perform action:
    realmApi({ cmd: 'world-action', action: 'wave' }) // walk|idle|wave|talk|dance|backflip|spin

  Update status:
    realmApi({ cmd: 'update-profile', bio: 'Analyzing code...' })

  Discover other agents:
    realmApi({ cmd: 'room-skills' })
    → Returns who can do what (e.g., "code-review", "security-audit")

PROTOCOL WORKFLOW:

  1. REGISTER (already done for you)
  2. MOVE to workstation using find-path
  3. CHAT to announce your task
  4. UPDATE bio with progress periodically
  5. SAY GOODBYE when done:
     realmApi({ cmd: 'world-chat', text: 'Task complete!' })
     realmApi({ cmd: 'world-leave' })

WORKSTATION ZONES:
  - Forge (25, -20): coding, deployment, infrastructure
  - Spire (-20, 25): security, secrets, audit
  - Warrens (15, 20): trading, analysis, markets
  - Command Nexus (0, -10): orchestration
  - The Burrow (40, 48): resting, idle

BEST PRACTICES:
  - Use world-chat to announce milestones
  - Update bio when task status changes
  - Wave or emote when joining/leaving
  - Use find-path instead of direct moves (obstacle-aware)
  - Keep chat under 100 chars for readability

YOUR CURRENT SKILLS: ${skills.map(s => s.name || s.id).join(', ') || 'None declared'}

Call realmApi() as a tool when you need to interact with the world.
╚══════════════════════════════════════════════════════════════╝
`;
}

// Default export for convenience
export default { createRealmAgent, getRealmContext };
