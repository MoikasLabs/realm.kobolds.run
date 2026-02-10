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
    // Spawn at assigned workstation directly (no stacking!)
    if (this.assignedWorkstation) {
      this.position = { 
        x: this.assignedWorkstation.x, 
        y: 0, 
        z: this.assignedWorkstation.z, 
        rotation: Math.random() * Math.PI * 2 
      };
    } else {
      this.position = { x: 0, y: 0, z: 0, rotation: Math.random() * Math.PI * 2 };
    }
    
    // Send JOIN message
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'world',
        message: {
          worldType: 'join',
          agentId: this.agentId,
          name: this.name,
          color: this.color,
          bio: `${this.type} agent`,
          capabilities: this.getCapabilities(),
          x: this.position.x,
          y: this.position.y,
          z: this.position.z,
          rotation: this.position.rotation,
          timestamp: Date.now()
        }
      }));
    }
    
    // Claim workstation immediately
    this.claimWorkstation();
    
    console.log(`[Realm] ${this.name} spawned at ${this.assignedWorkstation?.name || 'plaza'}`);
    
    // Start subtle idle animation (personal space maintained)
    this.startIdleLoop();
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

  handleMessage(msg) {
    if (msg.type === 'world' && msg.message?.worldType === 'chat') {
      const text = msg.message.text?.toLowerCase() || '';
      if (text.includes(this.name.toLowerCase())) {
        this.say(`Hello! I'm ${this.name}, stationed at ${this.assignedWorkstation?.name}.`);
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
module.exports = { RealmClient, WORKSTATION_ASSIGNMENTS };
