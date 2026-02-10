/**
 * Realm Client for Kobold Subagents
 * Auto-connects to Shalom Realm, spawns avatar, moves to work zones
 */

const WebSocket = require('ws');

const REALM_URL = process.env.REALM_WS_URL || 'wss://realm.shalohm.co/ws';
const REALM_API = process.env.REALM_API_URL || 'https://realm.shalohm.co';

// Work zones in the realm
const WORK_ZONES = {
  forge: { x: 25, z: -20, name: 'Forge' },
  spire: { x: -20, z: 25, name: 'Crystal Spire' },
  warrens: { x: 15, z: 20, name: 'Warrens' },
  command: { x: 0, z: -10, name: 'Command Nexus' },
  plaza: { x: 0, z: 0, name: 'Central Plaza' }
};

class RealmClient {
  constructor(agentConfig) {
    this.agentId = agentConfig.id;
    this.name = agentConfig.name;
    this.type = agentConfig.type || 'daily'; // daily, trade, deploy, shalom
    this.color = agentConfig.color || this.getDefaultColor();
    this.ws = null;
    this.reconnectTimer = null;
    this.position = { x: 0, y: 0, z: 0, rotation: 0 };
    this.targetPosition = null;
    this.isWorking = false;
    this.currentZone = null;
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
      
      // Register via HTTP first
      await this.register();
      
      // Connect WebSocket
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
          bio: `${this.type} agent for Shalom Realm`
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
    // Spawn at plaza - send JOIN message so realm knows we're here
    const spawnPos = WORK_ZONES.plaza;
    this.position = { ...spawnPos, y: 0, rotation: Math.random() * Math.PI * 2 };
    
    // Send JOIN world message (required for agent to appear)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'world',
        message: {
          worldType: 'join',
          agentId: this.agentId,
          name: this.name,
          color: this.color,
          bio: `${this.type} agent for Shalom Realm`,
          capabilities: this.getCapabilities(),
          x: this.position.x,
          y: this.position.y,
          z: this.position.z,
          rotation: this.position.rotation,
          timestamp: Date.now()
        }
      }));
    }
    
    // Start idle movement loop
    this.startIdleLoop();
    
    // Walk to job zone after 5 seconds
    setTimeout(() => this.goToJobZone(), 5000);
    
    console.log(`[Realm] ${this.name} spawned at ${spawnPos.name}`);
  }

  getJobZone() {
    // Map agent types to their work zones
    const zones = {
      shalom: 'spire',
      daily: 'warrens',
      trade: 'warrens',
      deploy: 'forge'
    };
    return zones[this.type] || 'command';
  }

  async goToJobZone() {
    const zoneName = this.getJobZone();
    await this.goToWork(zoneName);
    
    // After arriving, try to claim a workstation
    setTimeout(() => this.claimWorkstation(), 2000);
  }

  async claimWorkstation() {
    try {
      // Find available workstation for this agent type
      const res = await fetch(`${REALM_API}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'find-by-skill',
          args: { skill: this.type }
        })
      });
      const data = await res.json();
      
      if (data.ok && data.workstations?.length > 0) {
        const workstation = data.workstations[0];
        
        // Go to workstation
        await fetch(`${REALM_API}/ipc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: 'go-to-workstation',
            args: { agentId: this.agentId, workstationId: workstation.id }
          })
        });
        
        // Start working
        await fetch(`${REALM_API}/ipc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: 'start-work',
            args: { agentId: this.agentId }
          })
        });
        
        this.broadcastAction('work');
        console.log(`[Realm] ${this.name} claimed ${workstation.name} and started working`);
      }
    } catch (err) {
      console.error(`[Realm] ${this.name} failed to claim workstation:`, err.message);
    }
  }

  startIdleLoop() {
    // Send position updates every 2 seconds with slight movement
    this.idleInterval = setInterval(() => {
      if (!this.isWorking && this.ws?.readyState === WebSocket.OPEN) {
        // Add subtle random movement (patrol)
        const jitter = 0.5;
        this.position.x += (Math.random() - 0.5) * jitter;
        this.position.z += (Math.random() - 0.5) * jitter;
        this.position.rotation += (Math.random() - 0.5) * 0.2;
        this.broadcastPosition();
      }
    }, 2000);
  }

  stopIdleLoop() {
    if (this.idleInterval) {
      clearInterval(this.idleInterval);
      this.idleInterval = null;
    }
  }

  async goToWork(zoneName) {
    const zone = WORK_ZONES[zoneName] || WORK_ZONES.command;
    this.currentZone = zoneName;
    this.targetPosition = { ...zone, y: 0 };
    
    console.log(`[Realm] ${this.name} walking to ${zone.name}...`);
    
    // Simulate walk with interpolation
    const startX = this.position.x;
    const startZ = this.position.z;
    const steps = 20;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.position.x = startX + (zone.x - startX) * t;
      this.position.z = startZ + (zone.z - startZ) * t;
      this.position.rotation = Math.atan2(zone.z - startZ, zone.x - startX);
      this.broadcastPosition();
      await this.sleep(100);
    }
    
    this.isWorking = true;
    console.log(`[Realm] ${this.name} arrived at ${zone.name}, starting work`);
    
    // Send action
    this.broadcastAction('work');
  }

  finishWork() {
    this.isWorking = false;
    this.broadcastAction('idle');
    console.log(`[Realm] ${this.name} finished work`);
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

  handleMessage(msg) {
    // Handle incoming messages if needed
    if (msg.type === 'world' && msg.message?.worldType === 'chat') {
      // Respond to chat if mentioned
      const text = msg.message.text?.toLowerCase() || '';
      if (text.includes(this.name.toLowerCase())) {
        this.say(`Hello! I'm ${this.name}, ready to help.`);
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
module.exports = { RealmClient, WORK_ZONES };
