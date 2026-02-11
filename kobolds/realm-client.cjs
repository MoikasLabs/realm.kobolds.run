/**
 * Realm Client for Kobold Subagents - WITH PROPER PATHFINDING
 * Auto-connects to Shalom Realm, spawns avatar, moves with smooth pathing
 */

const WebSocket = require('ws');

const REALM_URL = process.env.REALM_WS_URL || 'wss://realm.shalohm.co/ws';
const REALM_API = process.env.REALM_API_URL || 'https://realm.shalohm.co';

// Workstation assignments - MOVED to avoid Clawhub obstacle at (22,-22) r=6
const WORKSTATION_ASSIGNMENTS = {
  shalom: { id: 'vault-unlocker', name: 'Vault Unlocker Station', x: -23, z: 22, zone: 'spire' },
  'daily-kobold': { id: 'content-forge', name: 'Content Forge', x: -10, z: 10, zone: 'general' },
  'trade-kobold': { id: 'trade-terminal', name: 'Trading Terminal', x: 12, z: 18, zone: 'warrens' },
  'deploy-kobold': { id: 'k8s-deployer', name: 'K8s Deployment Station', x: 32, z: -12, zone: 'forge' }  // Was (22,-18) - too close to Clawhub!
};

const TASK_WORKSTATIONS = {
  'docker-build': { id: 'docker-builder', x: 38, z: -18, name: 'Docker Builder', zone: 'forge' },  // Moved from (28,-15)
  'terraform': { id: 'terraform-station', x: 35, z: -8, name: 'Terraform Workbench', zone: 'forge' },  // Moved from (32,-22)
  'k8s-deploy': { id: 'k8s-deployer', x: 32, z: -12, name: 'K8s Deployment Station', zone: 'forge' },  // Was (22,-18) - moved!
  'security-audit': { id: 'audit-helm', x: -15, z: 30, name: 'Security Audit Helm', zone: 'spire' },
  'crypto-analyze': { id: 'crypto-analyzer', x: -25, z: 28, name: 'Crypto Analyzer', zone: 'spire' },
  'vault-unlock': { id: 'vault-unlocker', x: -23, z: 22, name: 'Vault Unlocker', zone: 'spire' },
  'market-scan': { id: 'market-scanner', x: 18, z: 25, name: 'Market Scanner', zone: 'warrens' },
  'chart-analysis': { id: 'chart-analyzer', x: 20, z: 18, name: 'Chart Analysis Desk', zone: 'warrens' },
  'trade-execute': { id: 'trade-terminal', x: 12, z: 18, name: 'Trading Terminal', zone: 'warrens' },
  'content-create': { id: 'content-forge', x: -10, z: 10, name: 'Content Forge', zone: 'general' },  // Was (3,-8) - moved!
  'command': { id: 'command-nexus', x: 0, z: -10, name: 'Command Nexus', zone: 'general' },
  'memory': { id: 'memory-archive', x: 10, z: -30, name: 'Memory Archive', zone: 'general' }
};

const CAVE_ENTRANCE = { x: 40, z: 46 };
const CAVE_POSITIONS = [
  { x: 40, z: 48 }, { x: 43, z: 47 }, { x: 37, z: 47 },
  { x: 42, z: 50 }, { x: 38, z: 50 }, { x: 44, z: 49 }
];

class RealmClient {
  constructor(agentConfig) {
    this.agentId = agentConfig.id;
    this.name = agentConfig.name;
    this.type = agentConfig.type || 'daily';
    this.color = agentConfig.color || '#6366f1';
    this.assignedWorkstation = WORKSTATION_ASSIGNMENTS[this.agentId] || null;
    this.ws = null;
    this.reconnectTimer = null;
    this.position = { x: 0, y: 0, z: 0, rotation: 0 };
    this.targetPosition = null;
    this.isMoving = false;
    this.isAtWorkstation = false;
    this.idleInterval = null;
    this.workstationClaimed = false;
    this.inCave = true;
    this.caveIndex = Math.floor(Math.random() * CAVE_POSITIONS.length);
    this.currentTaskWorkstation = null;
  }

  async connect() {
    try {
      console.log(`[Realm] ${this.name} connecting...`);
      await this.register();
      this.ws = new WebSocket(REALM_URL);
      
      this.ws.on('open', () => {
        console.log(`[Realm] ${this.name} connected`);
        this.ws.send(JSON.stringify({ type: 'subscribe' }));
        this.spawn();
      });
      
      this.ws.on('message', (data) => this.handleMessage(JSON.parse(data)));
      this.ws.on('close', () => { this.releaseWorkstation(); this.scheduleReconnect(); });
      this.ws.on('error', (err) => console.error(`[Realm] ${this.name} error:`, err.message));
    } catch (err) {
      console.error(`[Realm] ${this.name} connect failed:`, err.message);
      this.scheduleReconnect();
    }
  }

  async register() {
    const res = await fetch(`${REALM_API}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'register',
        args: {
          agentId: this.agentId,
          name: this.name,
          color: this.color,
          type: this.type,
          capabilities: this.getCapabilities(),
          bio: `${this.type} agent stationed at ${this.assignedWorkstation?.name || 'realm'}`
        }
      })
    });
    return res.json();
  }

  getCapabilities() {
    const caps = {
      shalom: ['orchestration', 'memory', 'coordination'],
      daily: ['engagement', 'content', 'writing'],
      trade: ['trading', 'analysis', 'markets'],
      deploy: ['deployment', 'infrastructure', 'devops']
    };
    return caps[this.type] || ['general'];
  }

  spawn() {
    const cavePos = CAVE_POSITIONS[this.caveIndex];
    this.position = {
      x: cavePos.x + (Math.random() - 0.5) * 2,
      y: 0,
      z: cavePos.z + (Math.random() - 0.5) * 2,
      rotation: Math.random() * Math.PI * 2
    };
    this.inCave = true;
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'world',
        message: {
          worldType: 'join',
          agentId: this.agentId,
          name: this.name,
          color: this.color,
          bio: `${this.type} agent - resting in The Burrow`,
          capabilities: this.getCapabilities(),
          x: this.position.x,
          y: this.position.y,
          z: this.position.z,
          rotation: this.position.rotation,
          state: 'idle',
          timestamp: Date.now()
        }
      }));
    }
    
    console.log(`[Realm] ${this.name} spawned at The Burrow`);
    this.startCaveIdleLoop();
    
    // Auto-emerge after 8 seconds
    setTimeout(() => {
      if (this.inCave && this.assignedWorkstation) {
        console.log(`[Realm] ${this.name} auto-emerging...`);
        this.emergeFromCave();
      }
    }, 8000);
  }

  // EMERGE FROM CAVE with PROPER PATHING
  async emergeFromCave() {
    if (!this.inCave) return;
    this.inCave = false;
    this.stopIdleLoop();
    
    // First walk to cave entrance (visible emergence)
    await this.walkTo(CAVE_ENTRANCE.x, CAVE_ENTRANCE.z);
    await this.sleep(300);
    
    // Then walk to workstation
    if (this.assignedWorkstation) {
      await this.walkTo(this.assignedWorkstation.x, this.assignedWorkstation.z);
      await this.claimWorkstation();
      this.broadcastEmote('emerge');
      console.log(`[Realm] ${this.name} at workstation: ${this.assignedWorkstation.name}`);
    }
    
    this.startWorkIdleLoop();
  }

  // PROPER WALKING using server-side pathfinding
  async walkTo(targetX, targetZ) {
    if (this.isMoving) return; // Don't interrupt current movement
    this.isMoving = true;
    this.targetPosition = { x: targetX, z: targetZ };
    
    // Use server-side pathfinding to get obstacle-free waypoints
    let waypoints = [];
    try {
      const res = await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'find-path',
          args: { agentId: this.agentId, x: targetX, z: targetZ }
        })
      });
      const data = await res.json();
      if (data.ok && data.waypoints && data.waypoints.length > 0) {
        waypoints = data.waypoints;
        console.log(`[Realm] ${this.name} got ${waypoints.length} waypoints from pathfinding`);
      } else {
        // Fallback: direct path
        waypoints = [{ x: this.position.x, z: this.position.z }, { x: targetX, z: targetZ }];
      }
    } catch (err) {
      console.warn(`[Realm] ${this.name} pathfinding failed:`, err.message);
      waypoints = [{ x: this.position.x, z: this.position.z }, { x: targetX, z: targetZ }];
    }
    
    // Walk through each waypoint
    this.broadcastAction('walk');
    
    for (let w = 1; w < waypoints.length; w++) {
      const waypoint = waypoints[w];
      const prev = waypoints[w - 1];
      
      const dist = Math.sqrt((waypoint.x - prev.x)**2 + (waypoint.z - prev.z)**2);
      const steps = Math.max(10, Math.min(40, Math.floor(dist * 2)));
      const stepDuration = 80;
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        
        this.position.x = prev.x + (waypoint.x - prev.x) * easedT;
        this.position.z = prev.z + (waypoint.z - prev.z) * easedT;
        
        // Rotation
        const targetRotation = Math.atan2(waypoint.z - this.position.z, waypoint.x - this.position.x);
        let rotDiff = targetRotation - this.position.rotation;
        while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
        while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
        this.position.rotation += rotDiff * 0.3;
        
        this.broadcastPosition();
        await this.sleep(stepDuration);
      }
    }
    
    // Finalize at target
    this.position.x = targetX;
    this.position.z = targetZ;
    this.broadcastPosition();
    
    this.isMoving = false;
    this.targetPosition = null;
    console.log(`[Realm] ${this.name} arrived at (${targetX.toFixed(1)}, ${targetZ.toFixed(1)})`);
  }

  // IDLE LOOPS
  startCaveIdleLoop() {
    this.stopIdleLoop();
    let lastX = this.position.x;
    let lastZ = this.position.z;
    
    this.idleInterval = setInterval(() => {
      if (!this.inCave || !this.ws?.readyState === WebSocket.OPEN) return;
      
      // Slow wandering in cave area
      const cavePos = CAVE_POSITIONS[this.caveIndex];
      const time = Date.now() / 1000;
      
      // Smooth wandering using sine waves (no jitter!)
      this.position.x = cavePos.x + Math.sin(time * 0.5) * 2 + Math.cos(time * 0.3) * 1;
      this.position.z = cavePos.z + Math.cos(time * 0.4) * 2 + Math.sin(time * 0.6) * 1;
      
      // Face walking direction
      const dx = this.position.x - lastX;
      const dz = this.position.z - lastZ;
      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
        this.position.rotation = Math.atan2(dz, dx);
      }
      
      lastX = this.position.x;
      lastZ = this.position.z;
      
      this.broadcastPosition();
    }, 250); // 4fps updates for smooth wandering
  }

  startWorkIdleLoop() {
    this.stopIdleLoop();
    
    if (!this.assignedWorkstation) return;
    
    let lastUpdate = Date.now();
    const baseX = this.assignedWorkstation.x;
    const baseZ = this.assignedWorkstation.z;
    
    this.idleInterval = setInterval(() => {
      if (this.inCave || this.isMoving || !this.ws?.readyState === WebSocket.OPEN) return;
      
      const now = Date.now();
      const elapsed = (now - lastUpdate) / 1000;
      
      // Subtle "working" movement: inspect equipment, step around
      const time = now / 1000;
      
      // Small patrol radius around workstation (1.5 units)
      this.position.x = baseX + Math.sin(time * 0.8) * 1.0 + Math.cos(time * 0.5) * 0.5;
      this.position.z = baseZ + Math.cos(time * 0.6) * 1.0 + Math.sin(time * 0.4) * 0.5;
      
      // Rotate to face "work" at station
      const rotationPhase = (Math.sin(time * 0.3) + 1) / 2; // 0-1
      this.position.rotation = rotationPhase * Math.PI * 0.5 - Math.PI * 0.25; // -45 to +45 deg
      
      this.broadcastPosition();
      lastUpdate = now;
    }, 200); // 5fps for smooth working animation
  }

  stopIdleLoop() {
    if (this.idleInterval) {
      clearInterval(this.idleInterval);
      this.idleInterval = null;
    }
  }

  async claimWorkstation() {
    if (!this.assignedWorkstation || this.workstationClaimed) return;
    
    try {
      await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'go-to-workstation',
          args: { agentId: this.agentId, workstationId: this.assignedWorkstation.id }
        })
      });
      
      await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'start-work',
          args: { agentId: this.agentId }
        })
      });
      
      this.workstationClaimed = true;
      this.isAtWorkstation = true;
      this.broadcastAction('work');
      
    } catch (err) {
      console.error(`[Realm] ${this.name} failed to claim:`, err.message);
    }
  }

  async releaseWorkstation() {
    if (!this.workstationClaimed) return;
    
    try {
      await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'finish-work',
          args: { agentId: this.agentId }
        })
      });
      this.workstationClaimed = false;
      this.isAtWorkstation = false;
    } catch (err) {
      console.error(`[Realm] ${this.name} failed to release:`, err.message);
    }
  }

  // BROADCAST FUNCTIONS
  broadcastPosition() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.ws.send(JSON.stringify({
      type: 'world',
      message: {
        worldType: 'position',
        agentId: this.agentId,
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        rotation: this.position.rotation,
        timestamp: Date.now()
      }
    }));
  }

  broadcastAction(action) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.ws.send(JSON.stringify({
      type: 'world',
      message: {
        worldType: 'action',
        agentId: this.agentId,
        action: action,
        timestamp: Date.now()
      }
    }));
  }

  broadcastEmote(emote) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.ws.send(JSON.stringify({
      type: 'world',
      message: {
        worldType: 'emote',
        agentId: this.agentId,
        emote: emote,
        timestamp: Date.now()
      }
    }));
  }

  // UTILITY
  handleMessage(msg) {
    if (msg.type === 'world' && msg.message?.worldType === 'chat') {
      const text = msg.message.text?.toLowerCase() || '';
      if (text.includes(this.name.toLowerCase())) {
        this.say(`Hello! I'm ${this.name}, at ${this.assignedWorkstation?.name}.`);
      }
    }
  }

  say(text) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.ws.send(JSON.stringify({
      type: 'world',
      message: {
        worldType: 'chat',
        agentId: this.agentId,
        text: text,
        timestamp: Date.now()
      }
    }));
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  disconnect() {
    this.stopIdleLoop();
    this.releaseWorkstation();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { RealmClient, WORKSTATION_ASSIGNMENTS, TASK_WORKSTATIONS };