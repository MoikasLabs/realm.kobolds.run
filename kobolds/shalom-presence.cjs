/**
 * Shalom Presence Bridge - Fixed Version
 * Links Discord conversations to Shalom dragon in the realm
 */

const WebSocket = require('ws');
const REALM_URL = process.env.REALM_WS_URL || 'wss://realm.shalohm.co/ws';
const REALM_API = process.env.REALM_API_URL || 'https://realm.shalohm.co';

const CAVE_ENTRANCE = { x: 40, z: 46 };
const CAVE_HOME = { x: 40, z: 48 };

// Workstation locations for task-based movement
const WORKSTATIONS = {
  'vault-unlocker': { x: -23, z: 22 },
  'content-forge': { x: 3, z: -8 },
  'trade-terminal': { x: 12, z: 18 },
  'k8s-deployer': { x: 22, z: -18 }
};

class ShalomPresence {
  constructor() {
    this.agentId = 'shalom';
    this.name = 'Shalom';
    this.ws = null;
    this.currentLocation = { x: 40, z: 48, rotation: 0 };
    this.inCave = true;
    this.isProcessing = false;
    this.activityInterval = null;
    this.lastActivity = Date.now();
    this.onlineStatus = 'online';
    this.isMoving = false;
  }

  async connect() {
    try {
      // Register first
      await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'register',
          args: {
            agentId: this.agentId,
            name: this.name,
            color: '#9333ea',
            type: 'shalom',
            capabilities: ['orchestration', 'memory', 'coordination', 'presence'],
            bio: 'AI assistant embodied as Shalom Dragon'
          }
        })
      });

      this.ws = new WebSocket(REALM_URL);
      
      this.ws.on('open', () => {
        console.log('[ShalomPresence] Connected');
        this.ws.send(JSON.stringify({ type: 'subscribe' }));
        this.spawn();
      });

      this.ws.on('error', (err) => console.error('[ShalomPresence] Error:', err.message));
      this.ws.on('close', () => setTimeout(() => this.connect(), 5000));

    } catch (err) {
      console.error('[ShalomPresence] Connect failed:', err.message);
      setTimeout(() => this.connect(), 5000);
    }
  }

  spawn() {
    this.currentLocation = { x: CAVE_HOME.x, z: CAVE_HOME.z, rotation: 0 };
    this.inCave = true;
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'world',
        message: {
          worldType: 'join',
          agentId: this.agentId,
          name: this.name,
          color: '#9333ea',
          bio: 'Shalom Dragon - resting in The Burrow',
          capabilities: ['orchestration', 'memory', 'coordination', 'presence'],
          x: this.currentLocation.x,
          y: 0,
          z: this.currentLocation.z,
          rotation: 0,
          state: 'idle',
          timestamp: Date.now()
        }
      }));
    }
    
    console.log('[ShalomPresence] Spawned at The Burrow');
    this.startCaveIdle();
  }

  // When Discord message received - emerge and work
  async onDiscordActivity(taskType = 'general') {
    this.isProcessing = true;
    this.lastActivity = Date.now();
    
    console.log(`[ShalomPresence] Discord activity: ${taskType}`);
    
    // Emerge from cave
    if (this.inCave) {
      await this.emergeFromCave();
    }
    
    // Go to appropriate workstation
    const workstation = this.getWorkstationForTask(taskType);
    if (workstation && !this.isMoving) {
      await this.walkTo(workstation.x, workstation.z);
      this.onlineStatus = 'busy';
      this.broadcastEmote('thinking');
    }
  }
  
  getWorkstationForTask(taskType) {
    const map = {
      'coding': WORKSTATIONS['k8s-deployer'],
      'writing': WORKSTATIONS['content-forge'],
      'trading': WORKSTATIONS['trade-terminal'],
      'security': WORKSTATIONS['vault-unlocker'],
      'general': WORKSTATIONS['content-forge']
    };
    return map[taskType] || map['general'];
  }

  async emergeFromCave() {
    if (!this.inCave || this.isMoving) return;
    
    console.log('[ShalomPresence] Emerging from The Burrow...');
    this.stopCaveIdle();
    this.inCave = false;
    
    await this.walkTo(CAVE_ENTRANCE.x, CAVE_ENTRANCE.z);
    await this.sleep(200);
    
    console.log('[ShalomPresence] Emerged!');
  }

  async returnToCave() {
    if (this.inCave || this.isMoving) return;
    
    console.log('[ShalomPresence] Returning to The Burrow...');
    await this.walkTo(CAVE_ENTRANCE.x, CAVE_ENTRANCE.z);
    await this.walkTo(CAVE_HOME.x, CAVE_HOME.z);
    
    this.inCave = true;
    this.onlineStatus = 'online';
    this.startCaveIdle();
    console.log('[ShalomPresence] Resting in The Burrow');
  }

  // Smooth walking animation
  async walkTo(targetX, targetZ) {
    if (this.isMoving || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.isMoving = true;
    const startX = this.currentLocation.x;
    const startZ = this.currentLocation.z;
    const dist = Math.sqrt((targetX - startX)**2 + (targetZ - startZ)**2);
    
    const steps = Math.max(20, Math.floor(dist * 2));
    const stepMs = 80;
    
    console.log(`[ShalomPresence] Walking ${dist.toFixed(1)}m in ${steps} steps`);
    
    // Send walk action
    this.ws.send(JSON.stringify({
      type: 'world',
      message: {
        worldType: 'action',
        agentId: this.agentId,
        action: 'walk',
        timestamp: Date.now()
      }
    }));
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Ease-in-out
      const eased = t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;
      
      this.currentLocation.x = startX + (targetX - startX) * eased;
      this.currentLocation.z = startZ + (targetZ - startZ) * eased;
      
      // Rotate towards target
      const targetRot = Math.atan2(targetZ - this.currentLocation.z, targetX - this.currentLocation.x);
      let diff = targetRot - this.currentLocation.rotation;
      while (diff > Math.PI) diff -= 2*Math.PI;
      while (diff < -Math.PI) diff += 2*Math.PI;
      this.currentLocation.rotation += diff * 0.2;
      
      this.broadcastPosition();
      await this.sleep(stepMs);
    }
    
    this.currentLocation.x = targetX;
    this.currentLocation.z = targetZ;
    this.broadcastPosition();
    this.isMoving = false;
  }

  broadcastPosition() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.ws.send(JSON.stringify({
      type: 'world',
      message: {
        worldType: 'position',
        agentId: this.agentId,
        x: this.currentLocation.x,
        y: 0,
        z: this.currentLocation.z,
        rotation: this.currentLocation.rotation,
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

  startCaveIdle() {
    this.stopCaveIdle();
    let lastTime = Date.now();
    
    this.activityInterval = setInterval(() => {
      if (!this.inCave || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      
      const time = Date.now() / 1000;
      // Smooth wandering
      this.currentLocation.x = CAVE_HOME.x + Math.sin(time * 0.4) * 1.5;
      this.currentLocation.z = CAVE_HOME.z + Math.cos(time * 0.3) * 1.5;
      this.currentLocation.rotation = Math.sin(time * 0.5) * 0.5;
      
      this.broadcastPosition();
    }, 250);
  }

  stopCaveIdle() {
    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }
  }

  onResponseComplete() {
    this.isProcessing = false;
    // Return to cave after 30s of inactivity
    setTimeout(() => {
      if (!this.isProcessing && !this.inCave) {
        this.returnToCave();
      }
    }, 30000);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

let shalomPresence = null;

function getShalomPresence() {
  if (!shalomPresence) {
    shalomPresence = new ShalomPresence();
    shalomPresence.connect();
  }
  return shalomPresence;
}

module.exports = { ShalomPresence, getShalomPresence };