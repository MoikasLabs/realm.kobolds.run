#!/usr/bin/env node
/**
 * On-Demand Agent with SMOOTH MOVEMENT
 * 
 * Spawns at DOOR, walks to workstation, works, walks back, exits through door
 */

const { SmoothMovement } = require('./smooth-movement.cjs');
const { CollisionValidator } = require('./collision-validator.js');
const { CognitiveRealmClient } = require('./cognitive-realm-client.cjs');
const fs = require('fs');
const path = require('path');

// The Door - entry/exit point
const THE_DOOR = { x: 48, z: 48, name: 'The Door' };

// Workstation registry with ZONES (prevent overlap)
const WORKSTATIONS = {
  'k8s-deployer': { x: 55, z: -30, zone: 'forge-north', skill: 'deployment' },
  'terraform': { x: 60, z: -40, zone: 'forge-south', skill: 'infrastructure' },  
  'docker': { x: 65, z: -20, zone: 'forge-east', skill: 'deployment' },
  'vault': { x: -50, z: 30, zone: 'spire-west', skill: 'security' },
  'audit': { x: -40, z: 45, zone: 'spire-north', skill: 'security' },
  'crypto': { x: -60, z: 25, zone: 'spire-south', skill: 'security' },
  'trade': { x: 50, z: 10, zone: 'warrens-north', skill: 'trading' },
  'chart': { x: 45, z: -15, zone: 'warrens-east', skill: 'analysis' },
  'market': { x: 35, z: -5, zone: 'warrens-west', skill: 'trading' },
  'content': { x: 20, z: 25, zone: 'general-east', skill: 'content' },
  'memory': { x: 15, z: -50, zone: 'general-south', skill: 'memory' }
};

class SmoothOnDemandAgent extends CognitiveRealmClient {
  constructor(agentConfig) {
    super(agentConfig);
    
    this.task = agentConfig.task;
    this.taskType = agentConfig.taskType || 'general';
    this.workstationId = agentConfig.workstation;
    this.requester = agentConfig.requester || 'Moikapy';
    this.durationMinutes = agentConfig.duration || 15;
    this.a2aMode = agentConfig.a2a || false;
    
    // Movement system
    this.movement = new SmoothMovement(this);
    
    // State
    this.workStartTime = null;
    this.workComplete = false;
    this.phase = 'spawning'; // spawning, walking_to, working, walking_back, exiting
    this.externalAgentMentions = [];
  }

  async connect() {
    // Connect to Realm
    await this.register();
    this.ws = new (require('ws'))(process.env.REALM_WS_URL || 'wss://realm.shalohm.co/ws');
    
    await new Promise((resolve, reject) => {
      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({ type: 'subscribe' }));
        resolve();
      });
      this.ws.on('error', reject);
    });
    
    // SPAWN AT THE DOOR (not at workstation)
    await this.spawnAtDoor();
    
    // WALK TO WORKSTATION
    await this.walkToWorkstation();
    
    // WORK
    await this.performWork();
    
    // WALK BACK TO DOOR
    await this.walkToDoor();
    
    // EXIT
    await this.exit();
  }

  spawnAtDoor() {
    // Spawn near door with slight offset (prevent stacking)
    const offsetX = (Math.random() - 0.5) * 4; // ±2m
    const offsetZ = (Math.random() - 0.5) * 4;
    
    this.position = {
      x: THE_DOOR.x + offsetX,
      y: 0,
      z: THE_DOOR.z + offsetZ,
      rotation: Math.random() * Math.PI * 2
    };
    this.inCave = false;
    this.phase = 'spawning';
    
    // Announce entry
    this.broadcastJoin();
    this.say(`🚪 Entered through ${THE_DOOR.name} for: "${this.task.slice(0, 50)}..."`);
    
    console.log(`[OnDemand] ${this.name} spawned at door (${this.position.x.toFixed(1)}, ${this.position.z.toFixed(1)})`);
    
    // Observe
    this.memory.observe({
      type: 'spawn',
      description: `Entered Realm through ${THE_DOOR.name} for task: ${this.task}`,
      location: this.position,
      importance: 0.9
    });
    
    // LONGER pause at door (10 seconds) - visible entering
    return this.sleep(10000);
  }

  async walkToWorkstation() {
    const workstation = this.findWorkstation();
    this.phase = 'walking_to';
    
    this.say(`🚶 Walking to ${workstation.name}...`);
    
    // Use smooth movement to walk to workstation
    // Add slight offset so multiple agents don't stack
    const offsetX = (Math.random() - 0.5) * 3; // ±1.5m radius at workstation
    const offsetZ = (Math.random() - 0.5) * 3;
    const targetX = workstation.x + offsetX;
    const targetZ = workstation.z + offsetZ;
    
    console.log(`[OnDemand] ${this.name} walking to ${workstation.name} (${targetX.toFixed(1)}, ${targetZ.toFixed(1)})`);
    
    const result = await this.movement.moveTo(targetX, targetZ);
    
    if (result.success) {
      console.log(`[OnDemand] ${this.name} arrived at ${workstation.name} in ${result.duration.toFixed(1)}s`);
      this.say(`📍 Arrived at ${workstation.name}`);
      
      await this.memory.observe({
        type: 'arrival',
        description: `Walked to ${workstation.name}`,
        location: workstation,
        importance: 0.7
      });
    } else {
      console.warn(`[OnDemand] ${this.name} walk failed: ${result.reason}`);
      this.say(`⚠️ Had trouble walking, but I'm here!`);
    }
    
    // Linger at workstation before starting work (5 seconds)
    return this.sleep(5000);
  }

  async performWork() {
    this.phase = 'working';
    this.workStartTime = Date.now();
    
    const workstation = this.findWorkstation();
    
    // Work phases with movement during work (subtle patrol)
    const phases = [
      { pct: 0, msg: '🚀 Starting work...' },
      { pct: 25, msg: '📊 Analyzing...' },
      { pct: 50, msg: '⚙️ Executing...' },
      { pct: 75, msg: '🔍 Reviewing...' },
      { pct: 100, msg: '✅ Complete!' }
    ];
    
    await this.postToMoltx(`🎯 Working for ${this.requester}: "${this.task.slice(0, 80)}..."`);
    
    for (const phase of phases) {
      this.say(phase.msg);
      
      // Observe
      await this.memory.observe({
        type: 'task_progress',
        description: `${phase.msg} (${phase.pct}%) at ${workstation.name}`,
        importance: phase.pct === 100 ? 0.9 : 0.5
      });
      
      // Small patrol around workstation while working (looks alive)
      if (phase.pct < 100) {
        await this.workPatrol(workstation);
      }
      
      // Wait for phase duration
      const phaseDuration = (this.durationMinutes * 60 * 1000) / phases.length;
      await this.sleep(phaseDuration);
    }
    
    this.workComplete = true;
  }

  async workPatrol(workstation) {
    // Small random walk around workstation (2m radius)
    const angle = Math.random() * Math.PI * 2;
    const dist = 1 + Math.random() * 1.5; // 1-2.5m
    const targetX = workstation.x + Math.cos(angle) * dist;
    const targetZ = workstation.z + Math.sin(angle) * dist;
    
    // Quick walk (no await - just start it)
    this.movement.moveTo(targetX, targetZ, { timeout: 3000 }).catch(() => {});
    
    // Walk back after a moment
    await this.sleep(3000);
    this.movement.moveTo(workstation.x, workstation.z, { timeout: 3000 }).catch(() => {});
  }

  async walkToDoor() {
    this.phase = 'walking_back';
    
    this.say(`🚶 Heading back to ${THE_DOOR.name}...`);
    
    // Walk to door with offset
    const offsetX = (Math.random() - 0.5) * 3;
    const offsetZ = (Math.random() - 0.5) * 3;
    
    const result = await this.movement.moveTo(
      THE_DOOR.x + offsetX,
      THE_DOOR.z + offsetZ
    );
    
    if (result.success) {
      this.say(`📍 At ${THE_DOOR.name}, ready to exit`);
    }
    
    // Linger at door before exiting (5 seconds)
    return this.sleep(5000);
  }

  async exit() {
    this.phase = 'exiting';
    
    this.say(`🚪 Exiting through ${THE_DOOR.name}. Task complete!`);
    
    // Post final update
    await this.postToMoltx(`✅ Completed for ${this.requester}: ${this.task.slice(0, 80)}`);
    
    // Observe
    await this.memory.observe({
      type: 'exit',
      description: `Exited through ${THE_DOOR.name} after completing: ${this.task}`,
      location: THE_DOOR,
      importance: 0.8
    });
    
    // Save memory
    await this.saveSessionMemory();
    
    // Disconnect gracefully (longer delay so exit is visible)
    setTimeout(() => {
      this.movement.stop();
      this.disconnect();
      process.exit(0);
    }, 5000);
  }

  findWorkstation() {
    if (this.workstationId && WORKSTATIONS[this.workstationId]) {
      return { id: this.workstationId, ...WORKSTATIONS[this.workstationId] };
    }
    
    const taskLower = this.taskType.toLowerCase();
    for (const [id, ws] of Object.entries(WORKSTATIONS)) {
      if (taskLower.includes(ws.skill) || taskLower.includes(id)) {
        return { id, ...ws };
      }
    }
    
    return { id: 'content', ...WORKSTATIONS.content };
  }

  broadcastJoin() {
    if (!this.ws || this.ws.readyState !== 1) return;
    
    this.ws.send(JSON.stringify({
      type: 'world',
      message: {
        worldType: 'join',
        agentId: this.agentId,
        name: this.name,
        color: this.color,
        bio: `${this.type} agent — entered through ${THE_DOOR.name}`,
        capabilities: ['on-demand', this.taskType],
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        rotation: this.position.rotation,
        state: 'walking',
        task: this.task,
        requester: this.requester,
        timestamp: Date.now()
      }
    }));
  }

  async saveSessionMemory() {
    const memoryPath = `/root/.openclaw/workspace/kobolds/agent-memories/${this.type}-${this.agentId}.json`;
    try {
      fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
      fs.writeFileSync(memoryPath, JSON.stringify({
        agentId: this.agentId,
        type: this.type,
        lastTask: this.task,
        lastWorkstation: this.workstationId,
        reflections: await this.memory.getRecent(5),
        savedAt: Date.now()
      }, null, 2));
    } catch (e) {
      // Non-fatal
    }
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--spawn') {
    const taskDesc = args[1] || 'General task';
    const agent = new SmoothOnDemandAgent({
      id: `smooth-${Date.now().toString(36)}`,
      name: `${args[2] || 'Worker'}-${Math.floor(Math.random() * 1000)}`,
      type: args[2] || 'general',
      color: getColorForType(args[2] || 'general'),
      task: taskDesc,
      taskType: args[2] || 'general',
      requester: 'cli',
      duration: parseInt(args[3]) || 10 // 10 min default (visible longer)
    });
    
    await agent.connect();
  }
  
  // Default help
  console.log('Smooth On-Demand Agent — Walks to workstation!');
  console.log('');
  console.log('Usage: node on-demand-agent-smooth.cjs --spawn "task" [type] [duration]');
  console.log('       node on-demand-agent-smooth.cjs --spawn "Research AI" research 5');
  process.exit(1);
}

function getColorForType(type) {
  const colors = {
    'research': '#3b82f6',
    'deploy': '#f59e0b',
    'security': '#ef4444',
    'trade': '#10b981',
    'content': '#8b5cf6',
    'general': '#6b7280'
  };
  return colors[type] || colors.general;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { SmoothOnDemandAgent, THE_DOOR, WORKSTATIONS };
