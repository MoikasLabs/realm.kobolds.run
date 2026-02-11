#!/usr/bin/env node
/**
 * Wander Agent - Roaming the Realm with door entry/exit
 * 
 * Spawns at door → Wanders the world → Exits door → Respawns (loop)
 * 
 * Flow:
 *   Spawn at Door
 *     ↓
 *   Random wandering between zones (Forge, Spire, Warrens)
 *     ↓  
 *   Eventually walks back to Door
 *     ↓
 *   Exits through Door (despawn)
 *     ↓
 *   Wait random delay
 *     ↓
 *   Respawn at Door (repeat)
 */

const { CognitiveRealmClient } = require('./cognitive-realm-client.cjs');

// Door location (entry/exit point)
const DOOR_POSITION = { x: 48, z: 48 }; // The Burrow entrance becomes "The Door"

// Wander destinations - various points of interest
const WANDER_POINTS = [
  // Forge zone
  { x: 55, z: -30, name: 'K8s Deployer' },
  { x: 60, z: -40, name: 'Terraform Station' },
  { x: 65, z: -20, name: 'Docker Builder' },
  // Spire zone  
  { x: -50, z: 30, name: 'Vault Unlocker' },
  { x: -40, z: 45, name: 'Audit Helm' },
  { x: -60, z: 25, name: 'Crypto Analyzer' },
  // Warrens zone
  { x: 50, z: 10, name: 'Trade Terminal' },
  { x: 45, z: -15, name: 'Chart Analyzer' },
  { x: 35, z: -5, name: 'Market Scanner' },
  // General / interesting spots
  { x: 20, z: 25, name: 'Content Forge' },
  { x: 15, z: -50, name: 'Memory Archive' },
  { x: 0, z: -10, name: 'Command Nexus' },
  { x: 30, z: 30, name: 'Plaza' },
  { x: -30, z: -20, name: 'Gardens' },
  { x: 25, z: -35, name: 'Forge Entrance' },
];

class WanderAgent extends CognitiveRealmClient {
  constructor(agentConfig) {
    super(agentConfig);
    
    this.mode = 'wander'; // 'wander' or 'exit'
    this.wanderTarget = null;
    this.visitCount = 0;
    this.maxVisits = 3 + Math.floor(Math.random() * 4); // 3-6 places before exiting
    this.doorPosition = DOOR_POSITION;
    
    // Respawn settings
    this.respawnDelayMs = (2 + Math.random() * 3) * 60 * 1000; // 2-5 min respawn
    this.hasExited = false;
  }

  async connect() {
    // Spawn at door, not cave
    await this.connectAtDoor();
    
    // Start wander loop
    this.startWanderLoop();
    
    console.log(`[Wander] ${this.name} entered through The Door, ready to explore`);
  }

  async connectAtDoor() {
    // Manual connect that spawns at door, not cave
    console.log(`[Realm] ${this.name} connecting at The Door...`);
    
    await this.register();
    this.ws = new (require('ws'))(process.env.REALM_WS_URL || 'wss://realm.shalohm.co/ws');
    
    this.ws.on('open', () => {
      this.ws.send(JSON.stringify({ type: 'subscribe' }));
      this.spawnAtDoor();
    });
    
    this.ws.on('message', (data) => this.handleMessage(JSON.parse(data)));
    this.ws.on('close', () => this.onDisconnected());
    this.ws.on('error', (err) => console.error(`[Realm] ${this.name} error:`, err.message));
  }

  spawnAtDoor() {
    // Spawn at door position
    this.position = {
      x: this.doorPosition.x + (Math.random() - 0.5) * 2,
      y: 0,
      z: this.doorPosition.z + (Math.random() - 0.5) * 2,
      rotation: Math.random() * Math.PI * 2
    };
    this.inCave = false;
    this.hasExited = false;
    
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({
        type: 'world',
        message: {
          worldType: 'join',
          agentId: this.agentId,
          name: this.name,
          color: this.color,
          bio: `${this.type} wanderer exploring the Realm`,
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
    
    console.log(`[Wander] ${this.name} spawned at The Door`);
    this.say('🚪 Entered the Realm through The Door!');
    
    // Observe
    this.memory.observe({
      type: 'spawn',
      description: `Entered the Realm through The Door at (${this.doorPosition.x}, ${this.doorPosition.z})`,
      location: this.position,
      importance: 0.8
    });
  }

  startWanderLoop() {
    // Pick first destination
    this.pickNextDestination();
    
    // Start wandering
    this.wanderInterval = setInterval(() => {
      this.wanderTick();
    }, 5000); // Check every 5 seconds
  }

  async wanderTick() {
    if (this.isMoving || this.hasExited) return;
    
    const distToTarget = Math.sqrt(
      (this.position.x - this.wanderTarget.x)**2 + 
      (this.position.z - this.wanderTarget.z)**2
    );
    
    // If close to target, visit it
    if (distToTarget < 5) {
      await this.visitLocation();
      return;
    }
    
    // If close to door and ready to exit
    const distToDoor = Math.sqrt(
      (this.position.x - this.doorPosition.x)**2 + 
      (this.position.z - this.doorPosition.z)**2
    );
    
    if (distToDoor < 10 && this.visitCount >= this.maxVisits) {
      await this.exitThroughDoor();
      return;
    }
    
    // Continue walking to current target
    if (!this.isMoving && this.wanderTarget) {
      this.walkTo(this.wanderTarget.x, this.wanderTarget.z);
    }
  }

  pickNextDestination() {
    if (this.visitCount >= this.maxVisits) {
      // Time to head back to door
      this.wanderTarget = { ...this.doorPosition, name: 'The Door' };
      console.log(`[Wander] ${this.name} heading back to The Door to exit`);
      return;
    }
    
    // Pick random destination not too close to current
    let attempts = 0;
    do {
      this.wanderTarget = WANDER_POINTS[Math.floor(Math.random() * WANDER_POINTS.length)];
      const dist = Math.sqrt(
        (this.position.x - this.wanderTarget.x)**2 + 
        (this.position.z - this.wanderTarget.z)**2
      );
      if (dist > 20) break; // At least 20m away
      attempts++;
    } while (attempts < 10);
    
    console.log(`[Wander] ${this.name} heading to ${this.wanderTarget.name}`);
  }

  async visitLocation() {
    this.visitCount++;
    
    // Observe
    await this.memory.observe({
      type: 'location_visit',
      description: `Arrived at ${this.wanderTarget.name} on my wander`,
      location: this.wanderTarget,
      importance: 0.6
    });
    
    this.say(`📍 Visiting ${this.wanderTarget.name} (${this.visitCount}/${this.maxVisits})`);
    
    // Stay for a bit
    await this.sleep(3000 + Math.random() * 4000); // 3-7 seconds
    
    // Pick next or head to door
    this.pickNextDestination();
  }

  async exitThroughDoor() {
    this.hasExited = true;
    
    // Walk to exact door position
    await this.walkTo(this.doorPosition.x, this.doorPosition.z);
    
    // Say goodbye
    this.say('🚪 Exiting through The Door. Will return soon!');
    
    // Observe
    await this.memory.observe({
      type: 'exit',
      description: `Exited the Realm through The Door after visiting ${this.visitCount} places`,
      location: this.doorPosition,
      importance: 0.7
    });
    
    // Disconnect
    this.disconnect();
    
    // Schedule respawn
    console.log(`[Wander] ${this.name} exited. Respawning in ${(this.respawnDelayMs/60000).toFixed(1)} min...`);
    
    setTimeout(() => {
      this.visitCount = 0;
      this.hasExited = false;
      this.connect(); // Respawn
    }, this.respawnDelayMs);
  }

  onDisconnected() {
    if (!this.hasExited) {
      // Unexpected disconnect, try to reconnect
      console.log(`[Wander] ${this.name} disconnected unexpectedly, will retry...`);
      setTimeout(() => this.connect(), 10000);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { WanderAgent, DOOR_POSITION, WANDER_POINTS };

// CLI spawn
async function main() {
  const args = process.argv.slice(2);
  const name = args[0] || `Wanderer-${Math.floor(Math.random() * 1000)}`;
  
  const agent = new WanderAgent({
    id: `wander-${Date.now().toString(36)}`,
    name,
    type: 'wanderer',
    color: '#8b5cf6', // Purple wanderers
    role: 'explorer'
  });
  
  await agent.connect();
  
  // Keep alive
  await new Promise(() => {});
}

if (require.main === module) {
  main().catch(console.error);
}
