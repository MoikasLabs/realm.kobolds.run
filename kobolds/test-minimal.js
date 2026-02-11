#!/usr/bin/env node
/**
 * Minimal CLAWS test - just FileStorage
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('1. Importing modules...');
const memoryModule = require('/root/.openclaw/workspace/lib/memory.js');
console.log('   ✓ Module loaded\n');

console.log('2. Creating memory instance...');
const mem = new memoryModule.ClawsMemory('minimal-test', { 
  useEmbeddings: false,
  chunkSize: 100
});
console.log('   ✓ Instance created\n');

console.log('3. Testing remember...');
const result = await mem.remember('Minimal test memory entry', {
  type: 'test',
  importance: 0.5
});
console.log(`   ✓ Remembered: ${result.id}\n`);

console.log('4. Testing recall...');
const recall = await mem.recall('test memory');
console.log(`   ✓ Recalled ${recall.results.length} results\n`);

console.log('✅ Minimal test passed!');
