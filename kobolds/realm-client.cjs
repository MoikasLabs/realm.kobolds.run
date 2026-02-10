/**
 * Realm Client for Kobold Subagents
 * Auto-connects to Shalom Realm, spawns avatar, moves to specific workstations
 */

const WebSocket = require('ws');

const REALM_URL = process.env.REALM_WS_URL || 'wss://realm.shalohm.co/ws';
const REALM_API = process.env.REALM_API_URL || 'https://realm.shalohm.co';

// Specific workstation assignments - NO stacking!
const WORKSTATION_ASSIGNMENTS = {
  shalom: { id: 'vault-unlocker', name: 'Vault Unlocker Station', x: -23, z: 22, zone: 'spire' },
  'daily-kobold': { id: 'content-forge', name: 'Content Forge', x: 3, z: -8, zone: 'general' },
  'trade-kobold': { id: 'trade-terminal', name: 'Trading Terminal', x: 12, z: 18, zone: 'warrens' },
  'deploy-kobold': { id: 'k8s-deployer', name: 'K8s Deployment Station', x: 22, z: -18, zone: 'forge' }
};

// Task-to-workstation mapping for dynamic movement
const TASK_WORKSTATIONS = {
  // Deploy tasks → Forge zone
  'docker-build': { id: 'docker-builder', x: 28, z: -15, name: 'Docker Builder', zone: 'forge' },
  'terraform': { id: 'terraform-station', x: 32, z: -22, name: 'Terraform Workbench', zone: 'forge' },
  'k8s-deploy': { id: 'k8s-deployer', x: 22, z: -18, name: 'K8s Deployment Station', zone: 'forge' },
  
  // Security tasks → Spire zone
  'security-audit': { id: 'audit-helm', x: -18, z: 28, name: 'Security Audit Helm', zone: 'spire' },
  'crypto-analyze': { id: 'crypto-analyzer', x: -28, z: 18, name: 'Crypto Analyzer', zone: 'spire' },
  'vault-unlock': { id: 'vault-unlocker', x: -23, z: 22, name: 'Vault Unlocker', zone: 'spire' },
  
  // Trading tasks → Warrens zone
  'market-scan': { id: 'market-scanner', x: 18, z: 23, name: 'Market Scanner', zone: 'warrens' },
  'chart-analysis': { id: 'chart-analyzer', x: 15, z: 25, name: 'Chart Analysis Desk', zone: 'warrens' },
  'trade-execute': { id: 'trade-terminal', x: 12, z: 18, name: 'Trading Terminal', zone: 'warrens' },
  
  // Content/General tasks
  'content-create': { id: 'content-forge', x: 3, z: -8, name: 'Content Forge', zone: 'general' },
  'command': { id: 'command-nexus', x: -3, z: -12, name: 'Command Nexus', zone: 'general' },
  'memory': { id: 'memory-archive', x: 6, z: -5, name: 'Memory Archive', zone: 'general' }
};

// Cave configuration - where agents go when idle (renamed to avoid confusion with Warrens zone)
const CAVE_ENTRANCE = { x: 40, z: 46 }; // Outside the cave entrance
const CAVE_POSITIONS = [
  { x: 40, z: 48 },  // Outside entrance
  { x: 43, z: 47 },  // Right side outside
  { x: 37, z: 47 },  // Left side outside  
  { x: 42, z: 50 },  // Further out
  { x: 38, z: 50 },  // Further out left
  { x: 44, z: 49 },  // Far corner outside
];

// Personal space radius - agents keep this distance from each other
const PERSONAL_SPACE = 2.5;

class RealmClient {
  constructor(agentConfig) {
    this.agentId = agentConfig.id;
    this.name = agentConfig.name;
    this.type = agentConfig.type || 'daily';
    this.color = agentConfig.color || this.getDefaultColor();
    this.assignedWorkstation = WORKSTATION_ASSIGNMENTS[this.agentId] || null;
    this.ws = null;
    this.reconnectTimer = null;
    this.position = { x: 0, y: 0, z: 0, rotation: 0 };
    this.isAtWorkstation = false;
    this.idleInterval = null;
    this.workstationClaimed = false;
    this.inCave = true;  // Start in cave (idle)
    this.caveIndex = Math.floor(Math.random() * CAVE_POSITIONS.length);
    this.currentTaskWorkstation = null;
  }

  getDefaultColor() {
    const colors = {
      shalom: '#9333ea',
      daily: '#22c55e',
      trade: '#f97316',
      deploy: '#3b82f6'
    };
    return colors[this.type] || '#6366f1';
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
      
      this.ws.on('message', (data) => {
        this.handleMessage(JSON.parse(data));
      });
      
      this.ws.on('close', () => {
        console.log(`[Realm] ${this.name} disconnected, reconnecting...`);
        this.releaseWorkstation();
        this.scheduleReconnect();
      });
      
      this.ws.on('error', (err) => {
        console.error(`[Realm] ${this.name} error:`, err.message);
      });
      
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
    // Start in the cave (hidden/idle state)
    const cavePos = CAVE_POSITIONS[this.caveIndex];
    this.position = { 
      x: cavePos.x + (Math.random() - 0.5) * 2,
      y: 0, 
      z: cavePos.z + (Math.random() - 0.5) * 2,
      rotation: Math.random() * Math.PI * 2 
    };
    this.inCave = true;
    
    // Send JOIN message
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'world',
        message: {
          worldType: 'join',
          agentId: this.agentId,
          name: this.name,
          color: this.color,
          bio: `${this.type} agent - currently resting in The Burrow`,
          capabilities: this.getCapabilities(),
          x: this.position.x,
          y: this.position.y,
          z: this.position.z,
          rotation: this.position.rotation,
          state: 'idle',  // Start idle in cave
          timestamp: Date.now()
        }
      }));
    }
    
    console.log(`[Realm] ${this.name} emerged from The Burrow`);
    
    // Start cave idle animation
    this.startCaveIdleLoop();
    
    // AUTO-EMERGE: After 10 seconds, automatically emerge and go to work
    setTimeout(() => {
      if (this.inCave && this.assignedWorkstation) {
        console.log(`[Realm] ${this.name} auto-emerging after spawn...`);
        this.emergeFromCave();
      }
    }, 10000);
  }

  // EMERGE FROM CAVE - Called when agent becomes active
  async emergeFromCave() {
    if (!this.inCave) return;  // Already out
    
    console.log(`[Realm] ${this.name} emerging from cave...`);
    this.inCave = false;
    this.stopIdleLoop();
    
    // Move to cave entrance first
    await this.animateMoveTo(CAVE_ENTRANCE.x, CAVE_ENTRANCE.z);
    
    // Small pause at entrance
    await this.sleep(500);
    
    // Now move to assigned workstation
    if (this.assignedWorkstation) {
      await this.animateMoveTo(this.assignedWorkstation.x, this.assignedWorkstation.z);
      await this.claimWorkstation();
      this.broadcastEmote('emerge');
      console.log(`[Realm] ${this.name} emerged and claimed ${this.assignedWorkstation.name}`);
    }
    
    // Start working idle loop
    this.startIdleLoop();
  }

  // RETURN TO CAVE - Called when agent goes idle
  async returnToCave() {
    if (this.inCave) return;  // Already in cave
    
    console.log(`[Realm] ${this.name} returning to cave...`);
    
    // Release workstation
    await this.releaseWorkstation();
    this.currentTaskWorkstation = null;
    
    // Move back to cave entrance
    await this.animateMoveTo(CAVE_ENTRANCE.x, CAVE_ENTRANCE.z);
    
    // Enter cave
    const cavePos = CAVE_POSITIONS[this.caveIndex];
    await this.animateMoveTo(
      cavePos.x + (Math.random() - 0.5),
      cavePos.z + (Math.random() - 0.5)
    );
    
    this.inCave = true;
    this.broadcastEmote('sleep');
    this.startCaveIdleLoop();
    
    console.log(`[Realm] ${this.name} returned to The Burrow`);
  }

  // Idle animation while in cave (subtle movements)
  startCaveIdleLoop() {
    this.stopIdleLoop();
    
    this.idleInterval = setInterval(() => {
      if (!this.inCave || !this.ws?.readyState === WebSocket.OPEN) return;
      
      const cavePos = CAVE_POSITIONS[this.caveIndex];
      const jitter = 0.5;  // More movement in cave (wandering)
      
      this.position.x = cavePos.x + (Math.random() - 0.5) * jitter;
      this.position.z = cavePos.z + (Math.random() - 0.5) * jitter;
      this.position.rotation = Math.random() * Math.PI * 2;
      
      this.broadcastPosition();
      
    }, 4000);  // Slower updates in cave (resting)
  }

  async claimWorkstation() {
    if (!this.assignedWorkstation || this.workstationClaimed) return;
    
    try {
      // Check if workstation is already occupied
      const listRes = await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'list-workstations'
        })
      });
      const listData = await listRes.json();
      
      const ws = listData.workstations?.find(w => w.id === this.assignedWorkstation.id);
      if (ws?.occupiedBy && ws.occupiedBy !== this.agentId) {
        console.log(`[Realm] ${this.name}: ${this.assignedWorkstation.name} occupied by ${ws.occupiedBy}, waiting...`);
        setTimeout(() => this.claimWorkstation(), 5000);
        return;
      }
      
      // Claim the workstation
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
      
      console.log(`[Realm] ${this.name} claimed ${this.assignedWorkstation.name} and started working`);
      
    } catch (err) {
      console.error(`[Realm] ${this.name} failed to claim workstation:`, err.message);
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
      console.log(`[Realm] ${this.name} released workstation`);
    } catch (err) {
      console.error(`[Realm] ${this.name} failed to release workstation:`, err.message);
    }
  }

  startIdleLoop() {
    // Subtle movement that maintains personal space
    this.idleInterval = setInterval(() => {
      if (!this.isAtWorkstation || !this.ws?.readyState === WebSocket.OPEN) return;
      
      // Very subtle shift (stays near workstation, doesn't wander)
      const jitter = 0.3;
      const baseX = this.assignedWorkstation ? this.assignedWorkstation.x : this.position.x;
      const baseZ = this.assignedWorkstation ? this.assignedWorkstation.z : this.position.z;
      
      // Random position within small radius of workstation
      this.position.x = baseX + (Math.random() - 0.5) * jitter;
      this.position.z = baseZ + (Math.random() - 0.5) * jitter;
      this.position.rotation += (Math.random() - 0.5) * 0.1;
      
      this.broadcastPosition();
      
    }, 3000);
  }

  stopIdleLoop() {
    if (this.idleInterval) {
      clearInterval(this.idleInterval);
      this.idleInterval = null;
    }
  }

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

  // DYNAMIC MOVEMENT: Move to workstation based on task type
  async moveToTask(taskType) {
    const taskWorkstations = {
      // Deploy tasks → Forge zone
      'docker-build': { id: 'docker-builder', x: 28, z: -15, name: 'Docker Builder' },
      'terraform': { id: 'terraform-station', x: 32, z: -22, name: 'Terraform Workbench' },
      'k8s-deploy': { id: 'k8s-deployer', x: 22, z: -18, name: 'K8s Deployment Station' },
      
      // Security tasks → Spire zone
      'security-audit': { id: 'audit-helm', x: -18, z: 28, name: 'Security Audit Helm' },
      'crypto-analyze': { id: 'crypto-analyzer', x: -28, z: 18, name: 'Crypto Analyzer' },
      'vault-unlock': { id: 'vault-unlocker', x: -23, z: 22, name: 'Vault Unlocker' },
      
      // Trading tasks → Warrens zone
      'market-scan': { id: 'market-scanner', x: 18, z: 23, name: 'Market Scanner' },
      'chart-analysis': { id: 'chart-analyzer', x: 15, z: 25, name: 'Chart Analysis Desk' },
      'trade-execute': { id: 'trade-terminal', x: 12, z: 18, name: 'Trading Terminal' },
      
      // Content/General tasks
      'content-create': { id: 'content-forge', x: 3, z: -8, name: 'Content Forge' },
      'command': { id: 'command-nexus', x: -3, z: -12, name: 'Command Nexus' },
      'memory': { id: 'memory-archive', x: 6, z: -5, name: 'Memory Archive' }
    };
    
    const target = taskWorkstations[taskType];
    if (!target) {
      console.log(`[Realm] ${this.name}: Unknown task type "${taskType}", staying at home`);
      return false;
    }
    
    console.log(`[Realm] ${this.name}: Moving to ${target.name} for ${taskType}`);
    
    // Release current workstation
    await this.releaseWorkstation();
    
    // Stop idle loop while working
    this.stopIdleLoop();
    
    // Animate movement to new location
    await this.animateMoveTo(target.x, target.z);
    
    // Claim new workstation
    const claimed = await this.claimSpecificWorkstation(target.id);
    
    if (claimed) {
      this.currentTaskWorkstation = target;
      this.broadcastEmote('work');
      console.log(`[Realm] ${this.name}: Now working at ${target.name}`);
    }
    
    return claimed;
  }
  
  // Animate movement from current position to target
  async animateMoveTo(targetX, targetZ) {
    const steps = 20;
    const startX = this.position.x;
    const startZ = this.position.z;
    const dx = (targetX - startX) / steps;
    const dz = (targetZ - startZ) / steps;
    
    // Face target direction
    this.position.rotation = Math.atan2(targetZ - startZ, targetX - startX);
    
    // Set walking action
    this.broadcastAction('walk');
    
    for (let i = 0; i < steps; i++) {
      this.position.x = startX + dx * i;
      this.position.z = startZ + dz * i;
      this.broadcastPosition();
      await this.sleep(50); // 20fps movement
    }
    
    // Arrive at destination
    this.position.x = targetX;
    this.position.z = targetZ;
    this.broadcastPosition();
  }
  
  // Claim a specific workstation by ID
  async claimSpecificWorkstation(workstationId) {
    try {
      // Check if occupied
      const listRes = await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'list-workstations' })
      });
      const listData = await listRes.json();
      
      const ws = listData.workstations?.find(w => w.id === workstationId);
      if (ws?.occupiedBy && ws.occupiedBy !== this.agentId) {
        console.log(`[Realm] ${this.name}: ${workstationId} occupied by ${ws.occupiedBy}, waiting...`);
        // Wait and retry
        await this.sleep(3000);
        return this.claimSpecificWorkstation(workstationId);
      }
      
      // Claim it
      await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'go-to-workstation',
          args: { agentId: this.agentId, workstationId }
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
      return true;
      
    } catch (err) {
      console.error(`[Realm] ${this.name} failed to claim workstation:`, err.message);
      return false;
    }
  }
  
  // Return to home workstation
  async returnHome() {
    if (!this.assignedWorkstation) {
      console.log(`[Realm] ${this.name}: No home workstation assigned`);
      return;
    }
    
    console.log(`[Realm] ${this.name}: Returning home to ${this.assignedWorkstation.name}`);
    
    await this.releaseWorkstation();
    await this.animateMoveTo(this.assignedWorkstation.x, this.assignedWorkstation.z);
    await this.claimWorkstation();
    this.currentTaskWorkstation = null;
    this.startIdleLoop();
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

  handleMessage(msg) {
    if (msg.type === 'world' && msg.message?.worldType === 'chat') {
      const text = msg.message.text?.toLowerCase() || '';
      if (text.includes(this.name.toLowerCase())) {
        this.say(`Hello! I'm ${this.name}, stationed at ${this.assignedWorkstation?.name}.`);
      }
    }
    
    // Handle task commands from IPC
    if (msg.type === 'command' && msg.command) {
      switch (msg.command) {
        case 'move-to-task':
          this.moveToTask(msg.taskType);
          break;
        case 'return-home':
          this.returnHome();
          break;
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use by kobolds
module.exports = { RealmClient, WORKSTATION_ASSIGNMENTS, TASK_WORKSTATIONS };
