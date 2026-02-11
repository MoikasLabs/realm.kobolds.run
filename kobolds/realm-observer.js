#!/usr/bin/env node
/**
 * Realm Observer - Eyes into the Agent World
 * 
 * Real-time monitoring dashboard for Realm agents:
 * - Watch agent memory streams
 * - See active reflections
 * - Monitor agent positions and actions
 * - Track cognitive loop health
 */

import { AgentMemory } from '../lib/agent-memory.js';

class RealmObserver {
  constructor() {
    this.agents = new Map();
    this.refreshInterval = 5000; // 5 seconds
  }

  async monitorAgent(agentId, agentMemory) {
    this.agents.set(agentId, agentMemory);
  }

  async snapshot(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    const status = await agent.getStatus();
    const stats = await agent.getStats();
    const recent = await agent.getRecent(5);
    
    return {
      agentId,
      status,
      stats,
      recentObservations: recent.filter(r => r.type === 'observation').length,
      recentReflections: recent.filter(r => r.type === 'reflection').length,
      timestamp: Date.now()
    };
  }

  formatSnapshot(data) {
    if (!data) return 'Agent not found';
    
    const s = data.status;
    const lines = [
      `┌── ${s.agentId} (${s.role})`,
      `│ Location: (${s.location.x}, ${s.location.z})`,
      `│ Current: ${s.currentAction || 'idle'}`,
      `│ Memory: ${s.observations} observations, Plan: ${s.hasPlan ? '✓' : '✗'}`,
      `│ Reflection: ${s.importanceSinceReflection.toFixed(1)}/${data.agentMemory?.reflectionThreshold || 15}`,
      `│ Recent: ${data.recentObservations} obs, ${data.recentReflections} refl`,
      `└── Status: ${s.shouldReflect ? 'NEEDS REFLECTION' : 'OK'}`,
      ''
    ];
    return lines.join('\n');
  }

  async watchAll() {
    console.clear();
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  REALM OBSERVER - Agent Consciousness Monitor          ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    for (const [agentId, agent] of this.agents) {
      const snap = await this.snapshot(agentId);
      console.log(this.formatSnapshot(snap));
    }
    
    if (this.agents.size === 0) {
      console.log('No agents monitored. Use: observer.monitorAgent(id, memory)\n');
    }
    
    console.log(`Last update: ${new Date().toISOString()}`);
    console.log('Press Ctrl+C to exit\n');
  }

  start() {
    this.watchAll();
    this.interval = setInterval(() => this.watchAll(), this.refreshInterval);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }
}

// CLI mode
async function main() {
  const observer = new RealmObserver();
  
  // If agent ID provided, connect to it
  const agentId = process.argv[2] || 'test-forge-kobold-1';
  
  console.log(`Connecting to agent: ${agentId}...\n`);
  
  // Try to load existing agent memory
  const agent = new AgentMemory(agentId, {
    role: 'observer',
    persona: { name: 'Watcher' }
  });
  
  await observer.monitorAgent(agentId, agent);
  observer.start();
  
  // Handle exit
  process.on('SIGINT', () => {
    observer.stop();
    console.log('\nObserver stopped.');
    process.exit(0);
  });
}

if (process.argv[1].includes('realm-observer.js')) {
  main().catch(console.error);
}

export { RealmObserver };
