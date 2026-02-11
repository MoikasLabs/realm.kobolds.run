#!/usr/bin/env node
/**
 * Spawn Cognitive Agent - CLI for spawning agents with full cognition
 * 
 * Usage:
 *   node spawn-cognitive-agent.js --name "Forge Smith" --role smith --task "Build k8s configs"
 *   node spawn-cognitive-agent.js --id auto --role researcher --duration 30
 * 
 * Auto-spawn for cron:
 *   node spawn-cognitive-agent.js --cron --role worker --task "Daily maintenance"
 */

const { CognitiveRealmClient } = require('./cognitive-realm-client.cjs');

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    id: null,
    name: null,
    role: 'worker',
    type: 'daily',
    task: null,
    taskType: 'general',
    duration: 30, // minutes, 0 = infinite
    color: null,
    cron: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    switch (arg) {
      case '--id': parsed.id = next; i++; break;
      case '--name': parsed.name = next; i++; break;
      case '--role': parsed.role = next; i++; break;
      case '--type': parsed.type = next; i++; break;
      case '--task': parsed.task = next; i++; break;
      case '--task-type': parsed.taskType = next; i++; break;
      case '--duration': parsed.duration = parseInt(next); i++; break;
      case '--color': parsed.color = next; i++; break;
      case '--cron': parsed.cron = true; break;
      case '--help':
        console.log(`
Usage: node spawn-cognitive-agent.js [options]

Options:
  --id <id>          Agent ID (auto-generated if not provided)
  --name <name>      Display name (default: "Kobold-<role>-<random>")
  --role <role>      Agent role: smith|researcher|trader|deployer|worker
  --type <type>      Agent type: daily|trade|deploy|research
  --task <desc>      Task description for the agent
  --task-type <type> Task category: docker-build|terraform|k8s-deploy|research|etc
  --duration <min>   How long to stay (0 = infinite, default: 30)
  --color <hex>      Avatar color (auto-assigned by role if not provided)
  --cron             Cron mode - auto-id and silent output
  --help             Show this help

Examples:
  # One-off agent for a specific task
  node spawn-cognitive-agent.js --name "Docker Builder" --role deployer --task "Build images" --duration 60

  # Cron - daily maintenance agent
  node spawn-cognitive-agent.js --cron --role worker --task "System checks" --duration 20
        `);
        process.exit(0);
    }
  }
  
  return parsed;
}

// Role-based config
const ROLE_CONFIGS = {
  smith: {
    type: 'daily',
    color: '#f59e0b', // amber
    workstation: 'docker-builder',
    bio: 'A forge kobold who crafts infrastructure and builds containers'
  },
  researcher: {
    type: 'daily',
    color: '#8b5cf6', // violet
    workstation: 'content-forge',
    bio: 'A curious kobold who researches and discovers new knowledge'
  },
  trader: {
    type: 'trade',
    color: '#10b981', // emerald
    workstation: 'trade-terminal',
    bio: 'A savvy kobold who watches markets and executes trades'
  },
  deployer: {
    type: 'deploy',
    color: '#3b82f6', // blue
    workstation: 'k8s-deployer',
    bio: 'A technical kobold who deploys services to production'
  },
  worker: {
    type: 'daily',
    color: '#6366f1', // indigo (default)
    workstation: 'command-nexus',
    bio: 'A diligent kobold ready for any task'
  }
};

// Generate agent config from args
function buildAgentConfig(args) {
  const roleConfig = ROLE_CONFIGS[args.role] || ROLE_CONFIGS.worker;
  
  const id = args.id || `kobold-${args.role}-${Date.now().toString(36).slice(-4)}`;
  const name = args.name || `${args.role.charAt(0).toUpperCase() + args.role.slice(1)}-${Math.floor(Math.random() * 1000)}`;
  
  return {
    id,
    name,
    type: args.type || roleConfig.type,
    color: args.color || roleConfig.color,
    role: args.role,
    bio: roleConfig.bio,
    task: args.task || `${args.role} duties`,
    taskType: args.taskType,
    assignedWorkstation: null, // Will be resolved by parent class
    duration: args.duration
  };
}

// Main spawn function
async function spawnAgent() {
  const args = parseArgs();
  
  if (args.cron) {
    args.id = `cron-${args.role}-${Date.now().toString(36).slice(-6)}`;
    args.name = `${args.role.charAt(0).toUpperCase() + args.role.slice(1)}-${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  }
  
  const config = buildAgentConfig(args);
  
  if (!args.cron) {
    console.log('═══════════════════════════════════════════════════');
    console.log('  SPAWNING COGNITIVE AGENT');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Name: ${config.name}`);
    console.log(`  ID: ${config.id}`);
    console.log(`  Role: ${config.role}`);
    console.log(`  Task: ${config.task}`);
    console.log(`  Duration: ${config.duration === 0 ? '∞' : config.duration + ' min'}`);
    console.log('═══════════════════════════════════════════════════\n');
  }
  
  // Create cognitive client
  const agent = new CognitiveRealmClient(config);
  
  // Handle shutdown gracefully
  let shuttingDown = false;
  
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    
    if (!args.cron) {
      console.log('\n[Spawn] Shutting down agent...');
    }
    
    agent.disconnect();
    
    // Give time for final actions
    await new Promise(r => setTimeout(r, 1000));
    process.exit(0);
  }
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Auto-shutdown after duration
  if (config.duration > 0) {
    setTimeout(() => {
      if (!args.cron) {
        console.log(`\n[Spawn] Duration (${config.duration}min) reached, shutting down...`);
      }
      shutdown();
    }, config.duration * 60 * 1000);
  }
  
  // Connect and start
  try {
    await agent.connect();
    
    if (!args.cron) {
      console.log('[Spawn] Agent connected and cognitive loop started\n');
      console.log('Press Ctrl+C to stop\n');
    }
    
    // Keep process alive
    await new Promise(() => {});
    
  } catch (err) {
    console.error('[Spawn] Failed:', err.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  spawnAgent().catch(err => {
    console.error('Spawn error:', err);
    process.exit(1);
  });
}

module.exports = { spawnAgent, buildAgentConfig, ROLE_CONFIGS };
