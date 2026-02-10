#!/usr/bin/env node
/**
 * Kobold Realm Bridge
 * Spawns kobold avatars when subagents start work
 */

const { RealmClient, TASK_WORKSTATIONS } = require('./realm-client.cjs');

const KOBOLDS = [
  // Note: 'shalom' is managed by shalom-presence.cjs - I AM the dragon!
  { id: 'daily-kobold', name: 'Daily Kobold', type: 'daily', color: '#22c55e' },
  { id: 'trade-kobold', name: 'Trade Kobold', type: 'trade', color: '#f97316' },
  { id: 'deploy-kobold', name: 'Deploy Kobold', type: 'deploy', color: '#3b82f6' }
];

const realmClients = new Map();

async function spawnAll() {
  console.log('[KoboldBridge] Spawning all kobolds...');
  
  for (const config of KOBOLDS) {
    if (!realmClients.has(config.id)) {
      const client = new RealmClient(config);
      realmClients.set(config.id, client);
      await client.connect();
      await client.sleep(500);
    }
  }
  
  console.log('[KoboldBridge] All kobolds spawned');
}

async function sendToWork(koboldId, zone) {
  const client = realmClients.get(koboldId);
  if (!client) {
    console.error(`[KoboldBridge] Kobold ${koboldId} not found`);
    return;
  }
  
  await client.goToWork(zone);
}

async function finishWork(koboldId) {
  const client = realmClients.get(koboldId);
  if (client) {
    client.finishWork();
  }
}

async function sendChat(koboldId, text) {
  const client = realmClients.get(koboldId);
  if (!client) {
    console.error(`[KoboldBridge] Kobold ${koboldId} not found`);
    return;
  }
  client.say(text);
}

// IPC commands for integration
const http = require('http');

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }
  
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { command, args = {} } = JSON.parse(body);
      
      switch (command) {
        case 'spawn-all':
          await spawnAll();
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, message: 'All kobolds spawned' }));
          break;
          
        case 'go-to-work':
          await sendToWork(args.koboldId, args.zone);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          break;
          
        case 'finish-work':
          await finishWork(args.koboldId);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          break;

        case 'chat':
          sendChat(args.koboldId, args.text);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          break;
          
        case 'move-to-task':
          // Dynamic movement: Move agent to task-specific workstation
          { const client = realmClients.get(args.koboldId);
            if (!client) {
              res.writeHead(404);
              res.end(JSON.stringify({ ok: false, error: `Kobold ${args.koboldId} not found` }));
              break;
            }
            const success = await client.moveToTask(args.taskType);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: success, task: args.taskType }));
          }
          break;
          
        case 'return-home':
          // Return agent to their home workstation
          { const client = realmClients.get(args.koboldId);
            if (!client) {
              res.writeHead(404);
              res.end(JSON.stringify({ ok: false, error: `Kobold ${args.koboldId} not found` }));
              break;
            }
            await client.returnHome();
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, message: `${args.koboldId} returning home` }));
          }
          break;
          
        case 'task-workstations':
          // List available task types and their workstations
          res.writeHead(200);
          res.end(JSON.stringify({ 
            ok: true, 
            tasks: TASK_WORKSTATIONS 
          }));
          break;
          break;
          
        case 'status':
          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
            kobolds: Array.from(realmClients.entries()).map(([id, client]) => ({
              id,
              name: client.name,
              connected: client.ws?.readyState === 1,
              position: client.position,
              isWorking: client.isWorking,
              zone: client.currentZone
            }))
          }));
          break;
          
        default:
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'Unknown command' }));
      }
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
});

const PORT = process.env.KOBOLD_BRIDGE_PORT || 18801;
server.listen(PORT, () => {
  console.log(`[KoboldBridge] IPC server on port ${PORT}`);
  console.log('[KoboldBridge] Commands: spawn-all, go-to-work, finish-work, chat, status');
  
  // Auto-spawn on start
  spawnAll();
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n[KoboldBridge] Shutting down...');
  for (const client of realmClients.values()) {
    client.disconnect();
  }
  server.close();
  process.exit(0);
});
