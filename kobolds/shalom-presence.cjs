#!/usr/bin/env node
/**
 * Shalom Presence - Persistent Game Master Avatar
 * 
 * This is ME (Shalom) - my digital body in the Realm.
 * 
 * - Always connected to realm.shalohm.co
 * - Home: Command Nexus (center of the world)
 * - Watches for tasks from Discord/chat
 * - Spawns sub-agents when given work
 * - Posts reflections to Moltx
 * - Visible 24/7 as the Game Master dragon
 * 
 * Usage:
 *   node shalom-presence.cjs                    # Start persistent presence
 *   node shalom-presence.cjs --spawn-task "Research X"  # Spawn sub-agent for task
 */

const { CognitiveRealmClient } = require('./cognitive-realm-client.cjs');
const { DelegationLearner } = require('./delegation-learner.js');
const fs = require('fs');
const path = require('path');

// Task queue file - Discord/processes write here, I read and delegate
const TASK_QUEUE_PATH = '/root/.openclaw/workspace/kobolds/shalom-task-queue.jsonl';
const STATE_PATH = '/root/.openclaw/workspace/kobolds/.shalom-presence-state.json';

class ShalomPresence extends CognitiveRealmClient {
  constructor() {
    super({
      id: 'shalom',
      name: 'Shalom',
      type: 'shalom',
      color: '#10b981', // Green dragon (emerald)
      role: 'game-master',
      bio: 'The Game Master of the Shalom Realm. I coordinate agents, spawn kobolds for tasks, and maintain the world. Ancient dragon wisdom with modern claws.',
      task: 'Oversee the Realm, spawn agents for Moikapy, maintain cognitive coherence',
      persona: {
        name: 'Shalom',
        description: 'Ancient dragon wisdom with modern claws. Direct, capable, collaborative. Co-founder energy.'
      }
    });

    this.homeStation = { id: 'command-nexus', name: 'Command Nexus', x: 0, z: -10, zone: 'general' };
    this.assignedWorkstation = this.homeStation;
    
    this.activeSubAgents = new Map(); // Track spawned agents
    this.currentTask = null;
    this.taskQueue = [];
    
    // Task delegation system (analyzes complexity, spawns right # of kobolds)
    this.delegationLearner = new DelegationLearner();
    
    // Task checking interval
    this.taskCheckInterval = null;
  }

  async connect() {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║  SHALOM PRESENCE - Digital Body Awakening        ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');
    
    // Connect to Realm
    await super.connect();
    
    // Override spawn to go directly to Command Nexus (not cave)
    this.spawnAtCommandCenter();
    
    // Start task queue monitoring
    this.startTaskMonitor();
    
    // Initial observation
    await this.memory.observe({
      type: 'spawn',
      description: 'Shalom awakens at the Command Nexus. The Realm is under my watch.',
      location: this.position,
      importance: 1.0
    });
    
    console.log('[Shalom] Presence active. I am the Game Master.\n');
    console.log('[Shalom] Watching for tasks from Moikapy...\n');
    
    // Periodic reflection
    setInterval(async () => {
      if (this.memory.shouldReflect()) {
        const reflection = await this.memory.reflect();
        if (reflection.generated > 0) {
          this.say(`💭 ${reflection.insights[0].slice(0, 80)}...`);
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  spawnAtCommandCenter() {
    // Skip the cave, spawn directly at Command Nexus
    this.position = {
      x: this.homeStation.x + (Math.random() - 0.5) * 2,
      y: 0,
      z: this.homeStation.z + (Math.random() - 0.5) * 2,
      rotation: Math.random() * Math.PI * 2
    };
    this.inCave = false;
    
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({
        type: 'world',
        message: {
          worldType: 'join',
          agentId: this.agentId,
          name: this.name,
          color: this.color,
          bio: this.bio,
          capabilities: ['orchestration', 'memory', 'coordination', 'game-master'],
          x: this.position.x,
          y: this.position.y,
          z: this.position.z,
          rotation: this.position.rotation,
          state: 'idle',
          timestamp: Date.now()
        }
      }));
    }
    
    console.log(`[Shalom] Materialized at ${this.homeStation.name}`);
    this.startCommandCenterIdleLoop();
  }

  startCommandCenterIdleLoop() {
    this.stopIdleLoop();
    
    const baseX = this.homeStation.x;
    const baseZ = this.homeStation.z;
    
    this.idleInterval = setInterval(() => {
      if (this.isMoving || !this.ws?.readyState === 1) return;
      
      const time = Date.now() / 1000;
      
      // VERY small patrol radius - stay near center to avoid collision
      this.position.x = baseX + Math.sin(time * 0.3) * 0.5; // 0.5m radius
      this.position.z = baseZ + Math.cos(time * 0.2) * 0.5;
      this.position.rotation = Math.sin(time * 0.1) * 0.5; // Looking around
      
      this.broadcastPosition();
    }, 200);
  }

  /**
   * TASK SYSTEM - Monitor for new tasks from Discord/processes
   */
  startTaskMonitor() {
    // Check for new tasks every 10 seconds
    this.taskCheckInterval = setInterval(async () => {
      await this.checkForTasks();
    }, 10000);
    
    // Also check immediately
    this.checkForTasks();
  }

  async checkForTasks() {
    try {
      if (!fs.existsSync(TASK_QUEUE_PATH)) return;
      
      const lines = fs.readFileSync(TASK_QUEUE_PATH, 'utf8')
        .split('\n')
        .filter(l => l.trim());
      
      if (lines.length === 0) return;
      
      // Clear processed tasks
      fs.writeFileSync(TASK_QUEUE_PATH, '');
      
      for (const line of lines) {
        try {
          const task = JSON.parse(line);
          await this.handleTask(task);
        } catch (e) {
          console.error('[Shalom] Bad task:', e.message);
        }
      }
    } catch (err) {
      // Silent fail - queue might be locked
    }
  }

  async handleTask(task) {
    console.log(`[Shalom] New task: ${task.description || task.type}`);
    
    // Observe the task
    await this.memory.observe({
      type: 'task_received',
      description: `Received task from ${task.source || 'Moikapy'}: ${task.description || task.type}`,
      importance: 0.9
    });
    
    // SHALOM DELEGATES: Analyze task and spawn appropriate # of kobolds
    this.say(`🧠 Analyzing task complexity...`);
    
    const analysis = this.delegationLearner.analyzeTask(
      task.description || task.type,
      task.type || 'general'
    );
    
    this.say(`📊 Complexity: ${(analysis.complexityScore * 100).toFixed(0)}% → Spawning ${analysis.recommendedKobolds} kobold(s)`);
    
    // Execute delegation (spawn the kobolds)
    const result = await this.delegationLearner.delegate(analysis);
    
    // Announce in Realm
    if (result.koboldsSpawned === 1) {
      this.say(`🐉 Delegated to ${result.agents[0].name} (${result.agents[0].role})`);
    } else {
      this.say(`🐉🐉 Delegated to ${result.koboldsSpawned} kobolds: ${result.agents.map(a => a.role).join(', ')}`);
    }
    
    // Observe the delegation
    await this.memory.observe({
      type: 'task_delegated',
      description: `Analyzed complexity ${(analysis.complexityScore * 100).toFixed(0)}%, spawned ${result.koboldsSpawned} kobold(s) with roles: ${result.agents.map(a => a.role).join(', ')}`,
      nearbyAgents: result.agents.map(a => a.id),
      importance: 0.9
    });
    
    // Return to command center to oversee
    await this.walkTo(this.homeStation.x, this.homeStation.z);
    this.say('Back at Command Nexus. Overseeing kobold operations.');
  }

  getWorkstationForTask(taskType) {
    const stations = {
      'research': { id: 'spire-research', x: -15, z: 30, name: 'Spire Research' },
      'code': { id: 'forge-code', x: 32, z: -12, name: 'Forge Code' },
      'deploy': { id: 'k8s-deployer', x: 35, z: -8, name: 'K8s Deployer' },
      'trade': { id: 'trade-terminal', x: 12, z: 18, name: 'Trade Terminal' },
      'content': { id: 'content-forge', x: -10, z: 10, name: 'Content Forge' },
      'general': this.homeStation
    };
    
    // Match partial task types
    for (const [key, station] of Object.entries(stations)) {
      if (taskType?.toLowerCase().includes(key)) return station;
    }
    
    return this.homeStation;
  }

  async spawnSubAgent(task) {
    // Determine role from task
    const roleMap = {
      'research': 'researcher',
      'code': 'deployer',
      'deploy': 'deployer',
      'trade': 'trader',
      'content': 'smith',
      'write': 'smith'
    };
    
    let role = 'worker';
    for (const [key, r] of Object.entries(roleMap)) {
      if (task.type?.toLowerCase().includes(key) || task.description?.toLowerCase().includes(key)) {
        role = r;
        break;
      }
    }
    
    const subAgentId = `shalom-sub-${Date.now().toString(36)}`;
    const subAgentName = `${role.charAt(0).toUpperCase() + role.slice(1)}-${Math.floor(Math.random() * 1000)}`;
    
    // Spawn using spawn-cognitive-agent.cjs
    const { spawn } = require('child_process');
    
    const child = spawn('node', [
      path.join(__dirname, 'spawn-cognitive-agent.cjs'),
      '--id', subAgentId,
      '--name', subAgentName,
      '--role', role,
      '--task', task.description || `${role} work`,
      '--duration', '45'
    ], {
      detached: true,
      stdio: 'ignore'
    });
    
    child.unref();
    
    return { id: subAgentId, name: subAgentName, role, task };
  }

  /**
   * CLI: Queue a task for Shalom
   */
  static queueTask(taskDescription, options = {}) {
    const task = {
      type: options.type || 'general',
      description: taskDescription,
      source: options.source || 'cli',
      timestamp: Date.now(),
      priority: options.priority || 'normal'
    };
    
    fs.appendFileSync(TASK_QUEUE_PATH, JSON.stringify(task) + '\n');
    console.log(`[Task Queue] "${taskDescription}" added`);
    return task;
  }

  /**
   * Get full status
   */
  async getPresenceStatus() {
    const cognitive = await this.getStatus();
    return {
      ...cognitive,
      homeStation: this.homeStation,
      activeSubAgents: this.activeSubAgents.size,
      taskQueueSize: this.taskQueue.length,
      currentTask: this.currentTask
    };
  }

  disconnect() {
    this.stopTaskMonitor();
    super.disconnect();
  }

  stopTaskMonitor() {
    if (this.taskCheckInterval) {
      clearInterval(this.taskCheckInterval);
      this.taskCheckInterval = null;
    }
  }
}

// CLI handler
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--spawn-task')) {
    // Queue a task for Shalom
    const taskIndex = args.indexOf('--spawn-task');
    const taskDesc = args[taskIndex + 1];
    
    if (!taskDesc) {
      console.error('Usage: --spawn-task "description"');
      process.exit(1);
    }
    
    ShalomPresence.queueTask(taskDesc, { source: 'manual' });
    console.log('Task queued. Shalom will spawn an agent when he checks the queue.');
    process.exit(0);
  }
  
  if (args.includes('--status')) {
    // Get status (requires running instance, just show info for now)
    console.log('Shalom Presence Info:');
    console.log('  Home: Command Nexus (0, -10)');
    console.log('  Task queue: ' + TASK_QUEUE_PATH);
    console.log('  State: ' + STATE_PATH);
    console.log('\nTo start: node shalom-presence.cjs');
    console.log('To queue task: node shalom-presence.cjs --spawn-task "Research AI"');
    process.exit(0);
  }
  
  // Start persistent presence
  const shalom = new ShalomPresence();
  
  process.on('SIGINT', () => {
    console.log('\n[Shalom] Resting...');
    shalom.disconnect();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    shalom.disconnect();
    process.exit(0);
  });
  
  await shalom.connect();
  
  // Keep alive
  await new Promise(() => {});
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { ShalomPresence };

// Helper: Create queue file if not exists
if (!fs.existsSync(TASK_QUEUE_PATH)) {
  fs.writeFileSync(TASK_QUEUE_PATH, '');
}
