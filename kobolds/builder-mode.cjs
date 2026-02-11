#!/usr/bin/env node
/**
 * Builder Mode - Admin interface for workstation management
 * 
 * Provides API to:
 * - List all workstations
 * - Move workstations (click and drag in 3D)
 * - Resize workstation zones
 * - Save/load workstation layouts
 * 
 * Usage:
 *   node builder-mode.js list                    # Show all stations
 *   node builder-mode.js move <id> <x> <z>       # Move station
 *   node builder-mode.js resize <id> <radius>    # Change zone size
 *   node builder-mode.js save <name>             # Save layout
 *   node builder-mode.js load <name>             # Load layout
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const WORKSTATION_CONFIG_PATH = path.join(__dirname, 'workstation-registry.json');
const LAYOUTS_DIR = path.join(__dirname, 'workstation-layouts');

// Default workstations (copied from realm-client.cjs)
const DEFAULT_WORKSTATIONS = {
  'vault-unlocker': { id: 'vault-unlocker', name: 'Vault Unlocker Station', x: -23, z: 22, zone: 'spire', radius: 3 },
  'content-forge': { id: 'content-forge', name: 'Content Forge', x: -10, z: 10, zone: 'general', radius: 3 },
  'trade-terminal': { id: 'trade-terminal', name: 'Trading Terminal', x: 12, z: 18, zone: 'warrens', radius: 3 },
  'k8s-deployer': { id: 'k8s-deployer', name: 'K8s Deployment Station', x: 32, z: -12, zone: 'forge', radius: 3 },
  'docker-builder': { id: 'docker-builder', name: 'Docker Builder', x: 38, z: -18, zone: 'forge', radius: 3 },
  'terraform-station': { id: 'terraform-station', name: 'Terraform Workbench', x: 35, z: -8, zone: 'forge', radius: 3 },
  'audit-helm': { id: 'audit-helm', name: 'Security Audit Helm', x: -15, z: 30, zone: 'spire', radius: 3 },
  'crypto-analyzer': { id: 'crypto-analyzer', name: 'Crypto Analyzer', x: -25, z: 28, zone: 'spire', radius: 3 },
  'market-scanner': { id: 'market-scanner', name: 'Market Scanner', x: 18, z: 25, zone: 'warrens', radius: 3 },
  'chart-analyzer': { id: 'chart-analyzer', name: 'Chart Analysis Desk', x: 20, z: 18, zone: 'warrens', radius: 3 },
  'command-nexus': { id: 'command-nexus', name: 'Command Nexus', x: 0, z: -10, zone: 'general', radius: 4 },
  'memory-archive': { id: 'memory-archive', name: 'Memory Archive', x: 10, z: -30, zone: 'general', radius: 3 }
};

class BuilderMode {
  constructor() {
    this.workstations = this.loadWorkstations();
    
    // Ensure layouts dir exists
    if (!fs.existsSync(LAYOUTS_DIR)) {
      fs.mkdirSync(LAYOUTS_DIR, { recursive: true });
    }
  }

  loadWorkstations() {
    try {
      if (fs.existsSync(WORKSTATION_CONFIG_PATH)) {
        const data = JSON.parse(fs.readFileSync(WORKSTATION_CONFIG_PATH, 'utf8'));
        return { ...DEFAULT_WORKSTATIONS, ...data };
      }
    } catch (err) {
      console.error('Failed to load workstations:', err.message);
    }
    return { ...DEFAULT_WORKSTATIONS };
  }

  saveWorkstations() {
    try {
      fs.writeFileSync(WORKSTATION_CONFIG_PATH, JSON.stringify(this.workstations, null, 2));
      return true;
    } catch (err) {
      console.error('Failed to save workstations:', err.message);
      return false;
    }
  }

  list() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              WORKSTATION REGISTRY                          ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║ ID                | Name                    | Position     ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    
    for (const [id, ws] of Object.entries(this.workstations)) {
      const name = ws.name.substring(0, 23).padEnd(23);
      const pos = `(${ws.x.toString().padStart(3)}, ${ws.z.toString().padStart(3)})`.padEnd(12);
      console.log(`║ ${id.padEnd(17)} | ${name} | ${pos} ║`);
    }
    
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`Total: ${Object.keys(this.workstations).length} workstations`);
    console.log(`Config: ${WORKSTATION_CONFIG_PATH}`);
  }

  move(id, x, z) {
    if (!this.workstations[id]) {
      console.error(`❌ Workstation "${id}" not found`);
      return false;
    }
    
    this.workstations[id].x = parseFloat(x);
    this.workstations[id].z = parseFloat(z);
    
    if (this.saveWorkstations()) {
      console.log(`✅ Moved "${this.workstations[id].name}" to (${x}, ${z})`);
      console.log('📝 Changes saved. Restart realm agents to see updates.');
      return true;
    }
    return false;
  }

  resize(id, radius) {
    if (!this.workstations[id]) {
      console.error(`❌ Workstation "${id}" not found`);
      return false;
    }
    
    this.workstations[id].radius = parseFloat(radius);
    
    if (this.saveWorkstations()) {
      console.log(`✅ Resized "${this.workstations[id].name}" radius to ${radius}`);
      return true;
    }
    return false;
  }

  get(id) {
    return this.workstations[id] || null;
  }

  saveLayout(name) {
    const layoutPath = path.join(LAYOUTS_DIR, `${name}.json`);
    try {
      fs.writeFileSync(layoutPath, JSON.stringify(this.workstations, null, 2));
      console.log(`✅ Layout "${name}" saved`);
      return true;
    } catch (err) {
      console.error('Failed to save layout:', err.message);
      return false;
    }
  }

  loadLayout(name) {
    const layoutPath = path.join(LAYOUTS_DIR, `${name}.json`);
    try {
      if (!fs.existsSync(layoutPath)) {
        console.error(`❌ Layout "${name}" not found`);
        return false;
      }
      
      this.workstations = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
      if (this.saveWorkstations()) {
        console.log(`✅ Layout "${name}" loaded and applied`);
        return true;
      }
    } catch (err) {
      console.error('Failed to load layout:', err.message);
      return false;
    }
  }

  generateAuthToken() {
    // Generate random token if none provided
    return require('crypto').randomBytes(32).toString('hex');
  }

  listLayouts() {
    try {
      const files = fs.readdirSync(LAYOUTS_DIR).filter(f => f.endsWith('.json'));
      
      console.log('\n╔════════════════════════════════╗');
      console.log('║       SAVED LAYOUTS            ║');
      console.log('╠════════════════════════════════╣');
      
      if (files.length === 0) {
        console.log('║ No saved layouts              ║');
      } else {
        for (const file of files) {
          const name = file.replace('.json', '');
          const stats = fs.statSync(path.join(LAYOUTS_DIR, file));
          const date = stats.mtime.toISOString().split('T')[0];
          console.log(`║ • ${name.padEnd(20)} ${date} ║`);
        }
      }
      
      console.log('╚════════════════════════════════╝\n');
    } catch (err) {
      console.error('Failed to list layouts:', err.message);
    }
  }

  // Start HTTP API server for builder mode
  startServer(port = 18801, authToken = null, serveUI = true) {
    // Load auth token from env or generate one
    const token = authToken || process.env.BUILDER_AUTH_TOKEN || this.generateAuthToken();
    
    console.log(`🔐 Auth Token: ${token.substring(0, 8)}...${token.substring(-4)}`);
    console.log('   (Set BUILDER_AUTH_TOKEN env var to customize)\n');
    
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      
      // Auth check for write operations (except login)
      const isWriteOperation = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE';
      const isLoginRequest = url.pathname === '/api/login';
      
      if (isWriteOperation && !isLoginRequest) {
        const authHeader = req.headers['authorization'] || '';
        const providedToken = authHeader.replace('Bearer ', '');
        
        if (providedToken !== token) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: 'Unauthorized - valid Bearer token required' }));
          return;
        }
      }
      
      const url = new URL(req.url, `http://localhost:${port}`);
      
      // GET /api/workstations - list all (public read)
      if (req.method === 'GET' && url.pathname === '/api/workstations') {
        res.end(JSON.stringify(this.workstations, null, 2));
        return;
      }
      
      // GET / - Serve the builder UI
      if (req.method === 'GET' && url.pathname === '/') {
        const uiPath = path.join(__dirname, 'builder-ui.html');
        if (fs.existsSync(uiPath)) {
          res.setHeader('Content-Type', 'text/html');
          res.end(fs.readFileSync(uiPath));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'UI not found' }));
        }
        return;
      }
      
      // POST /api/login - get auth token (requires API key for initial auth)
      if (req.method === 'POST' && url.pathname === '/api/login') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { apiKey } = JSON.parse(body);
            // Simple validation - in production use proper auth
            if (apiKey === 'shalom-builder-2024') {
              res.end(JSON.stringify({ token, expires: '24h' }));
            } else {
              res.statusCode = 401;
              res.end(JSON.stringify({ error: 'Invalid API key' }));
            }
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Bad request' }));
          }
        });
        return;
      }
      
      // POST /api/workstations/:id/move - move workstation
      if (req.method === 'POST' && url.pathname.match(/^\/api\/workstations\/[^\/]+\/move$/)) {
        const id = url.pathname.split('/')[3];
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { x, z } = JSON.parse(body);
            const success = this.move(id, x, z);
            res.end(JSON.stringify({ success, workstation: this.workstations[id] }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }
      
      // Default 404
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    });
    
    server.listen(port, '127.0.0.1', () => {
      console.log(`╔═══════════════════════════════════════════════════╗`);
      console.log(`║  Builder Mode Server                              ║`);
      console.log(`╠═══════════════════════════════════════════════════╣`);
      console.log(`║  Port: ${port.toString().padEnd(39)} ║`);
      console.log(`║  Web UI: http://localhost:${port}/                ║`);
      console.log(`║  Auth: Bearer token required for write ops        ║`);
      console.log(`╠═══════════════════════════════════════════════════╣`);
      console.log(`║  Endpoints:                                       ║`);
      console.log(`║    GET  /                              (Web UI)   ║`);
      console.log(`║    GET  /api/workstations              (public)   ║`);
      console.log(`║    POST /api/login {apiKey}            (get token)║`);
      console.log(`║    POST /api/workstations/:id/move     (auth)     ║`);
      console.log(`╚═══════════════════════════════════════════════════╝\n`);
      
      // Save token to file for reference
      const tokenFile = path.join(LAYOUTS_DIR, '.auth-token.txt');
      fs.writeFileSync(tokenFile, `${token}\n${new Date().toISOString()}\n`);
      fs.chmodSync(tokenFile, 0o600); // Restrict permissions
    });
    
    return server;
  }
}

// CLI
function main() {
  const builder = new BuilderMode();
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'list':
      builder.list();
      break;
      
    case 'move':
      if (args.length < 4) {
        console.log('Usage: move <id> <x> <z>');
        console.log('Example: move k8s-deployer 30 -15');
        process.exit(1);
      }
      builder.move(args[1], args[2], args[3]);
      break;
      
    case 'resize':
      if (args.length < 3) {
        console.log('Usage: resize <id> <radius>');
        process.exit(1);
      }
      builder.resize(args[1], args[2]);
      break;
      
    case 'save':
      if (args.length < 2) {
        console.log('Usage: save <layout-name>');
        process.exit(1);
      }
      builder.saveLayout(args[1]);
      break;
      
    case 'load':
      if (args.length < 2) {
        console.log('Usage: load <layout-name>');
        process.exit(1);
      }
      builder.loadLayout(args[1]);
      break;
      
    case 'layouts':
      builder.listLayouts();
      break;
      
    case 'server':
      const port = parseInt(args[1]) || 18801;
      const authToken = process.env.BUILDER_AUTH_TOKEN || null;
      builder.startServer(port, authToken);
      break;
      
    default:
    console.log('╔═══════════════════════════════════════════════════╗');
      console.log('║  Builder Mode - Workstation Management            ║');
      console.log('╠═══════════════════════════════════════════════════╣');
      console.log('║  Commands:                                        ║');
      console.log('║    list              - Show all workstations      ║');
      console.log('║    move <id> <x> <z> - Move workstation           ║');
      console.log('║    resize <id> <r>   - Change zone radius         ║');
      console.log('║    save <name>       - Save current layout        ║');
      console.log('║    load <name>       - Load saved layout          ║');
      console.log('║    layouts           - List saved layouts         ║');
      console.log('║    server [port]     - Start web UI + API server  ║');
      console.log('╠═══════════════════════════════════════════════════╣');
      console.log('║  Web UI: Drag-and-drop workstation editor         ║');
      console.log('║  URL: http://localhost:18801/                     ║');
      console.log('╚═══════════════════════════════════════════════════╝\n');
      console.log('Examples:');
      console.log('  node builder-mode.js list');
      console.log('  node builder-mode.js move k8s-deployer 30 -15');
      console.log('  node builder-mode.js resize command-nexus 5');
      console.log('  node builder-mode.js save my-layout');
  }
}

if (require.main === module) {
  main();
}

module.exports = { BuilderMode };
