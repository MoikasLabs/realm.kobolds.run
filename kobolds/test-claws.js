#!/usr/bin/env node
/**
 * Test CLAWS memory directly
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ClawsMemory } = require('/root/.openclaw/workspace/lib/memory.js');

console.log('Testing CLAWS memory...\n');

// Disable embeddings for speed
const mem = new ClawsMemory('test-direct', { useEmbeddings: false });

console.log('1. Storing memory...');
await mem.remember('Test observation for direct CLAWS test', {
  type: 'observation',
  importance: 0.7,
  tags: ['test']
});
console.log('   ✓ Stored\n');

console.log('2. Recalling...');
const results = await mem.recall('test observation', { limit: 5 });
console.log(`   ✓ Found ${results.results.length} results\n`);

console.log('3. Stats...');
const stats = await mem.getStats();
console.log(`   ✓ Total: ${stats.totalEpisodes}\n`);

console.log('✅ CLAWS basic test passed!');
