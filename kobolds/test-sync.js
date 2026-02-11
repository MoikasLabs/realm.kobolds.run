#!/usr/bin/env node
/**
 * Synchronous test
 */

console.log('Step 1: Before import');

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('Step 2: After import setup');

const mod = require('/root/.openclaw/workspace/lib/memory.js');
console.log('Step 3: Module loaded:', Object.keys(mod).slice(0, 5));

console.log('Step 4: Creating instance...');
const mem = new mod.ClawsMemory('sync-test', { useEmbeddings: false });
console.log('Step 5: Instance created, agentId:', mem.agentId);

// Try just one operation with timeout
console.log('Step 6: Calling remember...');
const timeout = setTimeout(() => {
  console.log('ERROR: Operation timed out after 10s');
  process.exit(1);
}, 10000);

try {
  const result = await mem.remember('Sync test', { type: 'test' });
  clearTimeout(timeout);
  console.log('Step 7: Success:', result.id);
} catch (e) {
  clearTimeout(timeout);
  console.log('Step 7: Error:', e.message);
}

console.log('Done');
