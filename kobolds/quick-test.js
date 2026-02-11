#!/usr/bin/env node
/**
 * Quick test of AgentMemory core functionality
 */

import { AgentMemory } from '../lib/agent-memory.js';

const agent = new AgentMemory('quick-test-agent', {
  role: 'tester',
  persona: { name: 'Tester' },
  spawnLocation: { x: 0, z: 0 }
});

console.log('Testing AgentMemory...\n');

// Test 1: Observe
console.log('1. Storing observation...');
await agent.observe({
  type: 'test',
  description: 'This is a test observation from the quick test script',
  importance: 0.7
});
console.log('   ✓ Observation stored\n');

// Test 2: Recall  
console.log('2. Recalling memory...');
const recall = await agent.recall('test observation', { limit: 5 });
console.log(`   ✓ Found ${recall.results.length} results\n`);

// Test 3: Status
console.log('3. Getting status...');
const status = await agent.getStatus();
console.log(`   ✓ Agent: ${status.agentId}`);
console.log(`   ✓ Observations: ${status.observations}`);
console.log(`   ✓ Has plan: ${status.hasPlan}\n`);

console.log('✅ AgentMemory core functions working!');
