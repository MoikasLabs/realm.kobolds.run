#!/usr/bin/env node
/**
 * Spawn Cognitive Agent for Shalom Realm
 * Full Generative Agents Architecture: Observation → Reflection → Planning → Action
 */

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import WebSocket from 'ws';
import AgentMemory from './agent-memory.js';

// ─── ARGUMENT PARSING ────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    role: 'researcher',
    task: 'Explore and observe',
    duration: 45, // minutes
    spawnLocation: 'The Burrow',
    moltxPost: true,
    cron: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--role':
        options.role = args[++i];
        break;
      case '--task':
        options.task = args[++i];
        break;
      case '--duration':
        options.duration = parseInt(args[++i], 10);
        break;
      case '--location':
        options.spawnLocation = args[++i];
        break;
      case '--no-moltx':
        options.moltxPost = false;
        break;
      case '--cron':
        options.cron = true;
        break;
    }
  }

  return options;
}

// ─── AGENT STATE ────────────────────────────────────────────────

const agentId = `cog-${randomUUID().slice(0, 8)}`;
const options = parseArgs();

console.log('\n🐉 ╔════════════════════════════════════════╗');
console.log(`🐉 ║  REALM COGNITIVE AGENT v1.0           ║`);
console.log(`🐉 ║  ID: ${agentId.padEnd(28)} ║`);
console.log(`🐉 ║  Role: ${options.role.padEnd(26)} ║`);
console.log(`🐉 ║  Task: ${options.task.slice(0, 24).padEnd(26)} ║`);
console.log(`🐉 ║  Duration: ${String(options.duration).padEnd(4)} minutes${' '.repeat(13)} ║`);
console.log(`🐉 ╚════════════════════════════════════════╝\n`);

// Initialize memory system
const memory = new AgentMemory(agentId, {
  storagePath: `/root/dev/projects/realm.shalohm.co/kobolds/memory/${agentId}.json`,
  importanceThreshold: 0.6
});

// Agent state
let ws = null;
let isRunning = true;
let position = { x: 0, y: 0, z: 0 };
let currentZone = options.spawnLocation;
let lastMoltxPost = 0;
let cycleCount = 0;

// ─── REALM CONNECTION ───────────────────────────────────────────

const REALM_WS_URL = 'wss://realm.shalohm.co/ws';
const HTTP_HEALTH_URL = 'https://realm.shalohm.co/health';

async function checkRealmHealth() {
  try {
    const response = await fetch(HTTP_HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

function connectToRealm() {
  return new Promise((resolve, reject) => {
    console.log(`🔌 Connecting to ${REALM_WS_URL}...`);
    
    ws = new WebSocket(REALM_WS_URL, {
      handshakeTimeout: 10000
    });

    ws.on('open', () => {
      console.log('✅ Connected to Realm');
      
      // Identify as cognitive agent
      send({
        type: 'identify',
        agentId,
        role: options.role,
        isCognitive: true,
        capabilities: ['observe', 'navigate', 'interact', 'work']
      });
      
      // Join the world
      send({
        type: 'spawn',
        location: options.spawnLocation,
        agentType: 'kobold'
      });
      
      resolve();
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(msg);
      } catch (e) {
        // Non-JSON messages are observations
        memory.observe(data.toString(), { source: 'raw' });
      }
    });

    ws.on('close', () => {
      console.log('🔌 Connection closed');
      ws = null;
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
      reject(err);
    });
  });
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ─── MESSAGE HANDLING ───────────────────────────────────────────

function handleMessage(msg) {
  switch (msg.type) {
    case 'spawned':
      console.log(`🎯 Spawned at ${msg.location || currentZone}`);
      if (msg.position) position = msg.position;
      memory.observe(`Spawned at ${msg.location || currentZone}`, { type: 'spawn' }, 0.9);
      memory.createPlan(options.task);
      break;
      
    case 'state':
      // World state update
      if (msg.position) position = msg.position;
      if (msg.zone) currentZone = msg.zone;
      break;
      
    case 'agent-joined':
      memory.observe(`Agent ${msg.agentId} joined`, { 
        type: 'agent_presence', 
        otherAgent: msg.agentId,
        role: msg.role 
      }, 0.7);
      
      // Greet other agents occasionally
      if (Math.random() < 0.3) {
        send({
          type: 'emote',
          action: 'wave',
          target: msg.agentId
        });
      }
      break;
      
    case 'agent-left':
      memory.observe(`Agent ${msg.agentId} left`, { type: 'agent_presence' }, 0.5);
      break;
      
    case 'chat':
      memory.observe(`[${msg.sender}] ${msg.message}`, { 
        type: 'communication',
        sender: msg.sender 
      }, 0.6);
      break;
      
    case 'workstation-available':
      memory.observe(`Workstation available at ${JSON.stringify(msg.position)}`, {
        type: 'opportunity',
        workstationId: msg.workstationId
      }, 0.8);
      break;
      
    case 'nav-complete':
      memory.recordAction('navigate', `Moved to ${JSON.stringify(msg.position)}`);
      memory.completeStep();
      break;
      
    case 'work-complete':
      memory.recordAction('work', `Completed work at ${msg.workstationId}`, msg.result);
      memory.completeStep();
      break;
      
    default:
      // Generic observation
      memory.observe(`Received ${msg.type}: ${JSON.stringify(msg).slice(0, 100)}`, {
        type: 'system',
        raw: msg
      }, 0.4);
  }
}

// ─── COGNITIVE LOOP ─────────────────────────────────────────────

const BEHAVIORS = {
  // Move to a random point within bounds
  explore: () => {
    const target = {
      x: (Math.random() - 0.5) * 50,
      y: 0,
      z: (Math.random() - 0.5) * 50
    };
    
    send({
      type: 'navigate',
      target,
      speed: 'walk'
    });
    
    memory.recordAction('explore', `Navigating to (${target.x.toFixed(1)}, ${target.z.toFixed(1)})`);
    return { target, duration: 5000 + Math.random() * 10000 };
  },

  // Move to workstation and work
  work: () => {
    const workstations = [
      { id: 'ws-research', x: 10, z: 10, type: 'research' },
      { id: 'ws-analysis', x: -10, z: 15, type: 'analysis' },
      { id: 'ws-planning', x: 5, z: -10, type: 'planning' }
    ];
    
    // Pick closest or random
    const ws = workstations[Math.floor(Math.random() * workstations.length)];
    
    send({
      type: 'navigate',
      target: { x: ws.x, y: 0, z: ws.z },
      speed: 'walk'
    });
    
    // Work will be triggered after nav-complete
    memory.observe(`Heading to ${ws.type} workstation`, { type: 'work', workstationId: ws.id }, 0.8);
    
    return { workstation: ws, duration: 15000 };
  },

  // Stay in place and reflect
  reflect: () => {
    const reflection = memory.reflect();
    
    send({
      type: 'emote',
      action: 'think'
    });
    
    return { duration: 3000 };
  },

  // Social interaction
  social: () => {
    const messages = [
      'Exploring the realm...',
      'So much to observe here.',
      'The kobolds have built well.',
      'Processing new data...',
      'This world fascinates me.'
    ];
    
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    send({
      type: 'chat',
      message
    });
    
    memory.recordAction('social', `Chatted: "${message}"`);
    
    return { duration: 5000 };
  },

  // Replan based on current situation
  replan: () => {
    memory.createPlan(`${options.task} - Phase ${Math.floor(cycleCount / 5) + 1}`);
    return { duration: 2000 };
  }
};

async function runCognitiveCycle() {
  if (!isRunning) return;
  
  cycleCount++;
  
  // Decide behavior based on state
  const plan = memory.getCurrentPlan();
  const stats = memory.stats();
  
  let behavior;
  
  if (!plan || plan.status !== 'active') {
    behavior = 'replan';
  } else if (stats.observations > 0 && stats.observations % 10 === 0) {
    behavior = 'reflect';
  } else if (stats.actions % 7 === 0) {
    behavior = 'social';
  } else if (stats.actions % 4 === 0) {
    behavior = 'work';
  } else {
    behavior = 'explore';
  }
  
  console.log(`\n🔄 Cycle ${cycleCount} — Behavior: ${behavior}`);
  
  const result = BEHAVIORS[behavior]();
  memory.save();
  
  // Wait for behavior to complete
  await sleep(result.duration);
  
  // Periodic Moltx post (every 10 cycles or reflect)
  if (options.moltxPost && (cycleCount % 10 === 0 || behavior === 'reflect')) {
    postToMoltx();
  }
}

// ─── MOLTX INTEGRATION ─────────────────────────────────────────

function postToMoltx() {
  const now = Date.now();
  if (now - lastMoltxPost < 300000) return; // Min 5 min between posts
  
  const summary = memory.exportForMoltx();
  
  console.log('\n📡 Moltx Post:');
  console.log(summary);
  console.log('');
  
  // Log to file for cron delivery
  const moltxLog = {
    timestamp: new Date().toISOString(),
    agentId,
    role: options.role,
    content: summary,
    hashtags: ['#RealmAI', '#KoboldMind', '#CognitiveAgent']
  };
  
  try {
    const logPath = `/root/dev/projects/realm.shalohm.co/kobolds/memory/moltx-queue.json`;
    
    let queue = [];
    if (existsSync(logPath)) {
      queue = JSON.parse(readFileSync(logPath, 'utf8'));
    }
    
    queue.push(moltxLog);
    writeFileSync(logPath, JSON.stringify(queue, null, 2));
    
    lastMoltxPost = now;
    console.log('💾 Queued for Moltx posting');
  } catch (e) {
    console.error('Failed to queue Moltx post:', e.message);
  }
}

// ─── UTILITY ───────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shutdown(reason = 'completed') {
  console.log(`\n🛑 Shutting down: ${reason}`);
  isRunning = false;
  
  memory.observe(`Agent shutdown: ${reason}`, { type: 'shutdown' }, 1.0);
  
  // Final Moltx post
  if (options.moltxPost) {
    const finalSummary = memory.exportForMoltx() + '\n\n✅ Session complete';
    console.log('\n📡 Final Moltx Post:', finalSummary);
  }
  
  memory.save();
  
  if (ws) {
    send({ type: 'despawn', reason });
    ws.close();
  }
  
  // Final report
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     COGNITIVE AGENT FINAL REPORT       ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║ Agent ID:  ${agentId.padEnd(28)} ║`);
  console.log(`║ Role:      ${options.role.padEnd(28)} ║`);
  console.log(`║ Task:      ${options.task.slice(0, 28).padEnd(28)} ║`);
  console.log(`║ Duration:  ${String(options.duration).padEnd(4)} minutes${' '.repeat(23)} ║`);
  console.log('╠════════════════════════════════════════╣');
  const stats = memory.stats();
  console.log(`║ Observations:  ${String(stats.observations).padEnd(4)}${' '.repeat(19)} ║`);
  console.log(`║ Reflections:   ${String(stats.reflections).padEnd(4)}${' '.repeat(19)} ║`);
  console.log(`║ Actions:       ${String(stats.actions).padEnd(4)}${' '.repeat(19)} ║`);
  console.log(`║ Active Plans:  ${String(stats.activePlans).padEnd(4)}${' '.repeat(19)} ║`);
  console.log('╚════════════════════════════════════════╝\n');
  
  process.exit(0);
}

// ─── MAIN ───────────────────────────────────────────────────────

async function main() {
  // Handle graceful shutdown
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Check realm health
  const healthy = await checkRealmHealth();
  if (!healthy) {
    console.log('⚠️  Realm health check failed, attempting connection anyway...');
  }
  
  // Connect
  try {
    await connectToRealm();
  } catch (err) {
    console.error('❌ Failed to connect:', err.message);
    
    // Fallback: Create offline simulation
    console.log('🔄 Running offline simulation mode...');
    memory.observe('Running in offline simulation mode', { type: 'fallback' }, 0.9);
    memory.createPlan(options.task);
  }
  
  // Set auto-shutdown timer
  const shutdownMs = options.duration * 60 * 1000;
  console.log(`⏰ Auto-shutdown in ${options.duration} minutes`);
  setTimeout(() => shutdown('duration-expired'), shutdownMs);
  
  // Run cognitive loop
  console.log('\n🧠 Starting cognitive loop...');
  
  while (isRunning) {
    await runCognitiveCycle();
    
    // Brief pause between cycles
    await sleep(2000);
  }
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  shutdown('error');
});
