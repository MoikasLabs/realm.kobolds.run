#!/usr/bin/env node
/**
 * Proximity-Based Retina System for Realm Agents
 *
 * Lightweight perception using spatial proximity (not full vision).
 * Scales to 200+ agents via spatial indexing.
 *
 * @author Shalom
 * @version 1.0.0
 */

const WebSocket = require('ws');

const REALM_WS_URL = 'wss://realm.shalohm.co/ws';
const PROXIMITY_RADIUS = 10; // Units - "near enough to notice"
const CHECK_INTERVAL_MS = 2000; // Check every 2 seconds

class ProximityRetina {
  constructor(config = {}) {
    this.agentId = config.agentId || `retina-${Date.now()}`;
    this.parentAgent = config.parentAgent; // Cognitive agent ID
    this.radius = config.radius || PROXIMITY_RADIUS;
    this.ws = null;
    this.position = { x: 0, y: 0, z: 0 };
    this.nearbyAgents = new Map(); // agentId -> {distance, lastSeen}
    this.onPerception = config.onPerception || (() => {});
    this.isRunning = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(REALM_WS_URL, { handshakeTimeout: 10000 });

      this.ws.on('open', () => {
        console.log(`👁️ Retina ${this.agentId} connected`);

        // Bind to parent agent position
        this.ws.send(JSON.stringify({
          type: 'identify',
          agentId: this.agentId,
          name: `Perception-${this.parentAgent}`,
          role: 'observer',
          isRetina: true,
          parentAgent: this.parentAgent
        }));

        this.isRunning = true;
        this.startPerceptionLoop();
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (e) {}
      });

      this.ws.on('close', () => {
        this.isRunning = false;
        console.log('🔌 Retina disconnected');
      });

      this.ws.on('error', reject);
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'state':
        // Update own position from parent agent
        if (msg.position && msg.agentId === this.parentAgent) {
          this.position = msg.position;
        }
        break;

      case 'agent-joined':
        // New agent in world - check if near
        this.checkSingleAgent(msg);
        break;

      case 'agent-moved':
        // Agent moved - check proximity
        this.checkSingleAgent(msg);
        break;

      case 'agent-left':
        // Agent left - see if we were tracking
        if (this.nearbyAgents.has(msg.agentId)) {
          this.emitPerception({
            type: 'agent_departed',
            agentId: msg.agentId,
            agentName: msg.agentName,
            description: `${msg.agentName || 'An agent'} left your vicinity`,
            importance: 0.5
          });
          this.nearbyAgents.delete(msg.agentId);
        }
        break;

      case 'world-state':
        // Full state update - check all agents
        this.checkAllAgents(msg.agents || []);
        break;
    }
  }

  checkSingleAgent(agentData) {
    if (agentData.agentId === this.parentAgent) return; // Skip self

    const distance = this.calculateDistance(this.position, agentData.position);
    const wasNearby = this.nearbyAgents.has(agentData.agentId);
    const isNearby = distance <= this.radius;

    if (isNearby && !wasNearby) {
      // Agent entered proximity
      this.nearbyAgents.set(agentData.agentId, {
        distance,
        lastSeen: Date.now(),
        name: agentData.name
      });

      this.emitPerception({
        type: 'agent_approached',
        agentId: agentData.agentId,
        agentName: agentData.name,
        distance: Math.round(distance * 10) / 10,
        description: `${agentData.name || 'Someone'} entered your vicinity (${Math.round(distance)} units away)`,
        importance: 0.7
      });

    } else if (!isNearby && wasNearby) {
      // Agent left proximity
      this.emitPerception({
        type: 'agent_departed',
        agentId: agentData.agentId,
        agentName: agentData.name,
        description: `${agentData.name || 'Someone'} left your vicinity`,
        importance: 0.5
      });
      this.nearbyAgents.delete(agentData.agentId);

    } else if (isNearby && wasNearby) {
      // Still nearby - update tracking
      const oldData = this.nearbyAgents.get(agentData.agentId);
      const deltaDistance = Math.abs(distance - oldData.distance);

      this.nearbyAgents.set(agentData.agentId, {
        distance,
        lastSeen: Date.now(),
        name: agentData.name
      });

      // Emit if significant movement (5+ units change)
      if (deltaDistance > 5) {
        this.emitPerception({
          type: 'agent_moved',
          agentId: agentData.agentId,
          agentName: agentData.name,
          distance: Math.round(distance * 10) / 10,
          movement: deltaDistance > 5 ? 'approaching' : 'departing',
          description: `${agentData.name || 'Someone'} is ${deltaDistance > 5 ? 'getting closer' : 'moving away'}`,
          importance: 0.4
        });
      }
    }
  }

  checkAllAgents(agents) {
    agents.forEach(agent => this.checkSingleAgent(agent));
  }

  calculateDistance(pos1, pos2) {
    if (!pos1 || !pos2) return Infinity;
    const dx = (pos1.x || 0) - (pos2.x || 0);
    const dz = (pos1.z || 0) - (pos2.z || 0);
    return Math.sqrt(dx * dx + dz * dz);
  }

  emitPerception(event) {
    event.timestamp = Date.now();
    event.source = 'proximity_retina';
    this.onPerception(event);
  }

  startPerceptionLoop() {
    // Periodic check in case we missed events
    const loop = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(loop);
        return;
      }

      // Request world state update
      this.ws.send(JSON.stringify({ type: 'request-state' }));

      // Emit heartbeat for long-quiet nearby agents
      this.nearbyAgents.forEach((data, agentId) => {
        const timeSinceUpdate = Date.now() - data.lastSeen;
        if (timeSinceUpdate > 10000) { // 10 seconds
          this.emitPerception({
            type: 'presence',
            agentId,
            agentName: data.name,
            description: `${data.name || 'Someone'} is still nearby`,
            importance: 0.2
          });
        }
      });
    }, CHECK_INTERVAL_MS);
  }

  getNearbyAgents() {
    return Array.from(this.nearbyAgents.entries()).map(([id, data]) => ({
      agentId: id,
      ...data
    }));
  }

  disconnect() {
    this.isRunning = false;
    if (this.ws) this.ws.close();
  }
}

// Export for use
module.exports = { ProximityRetina, PROXIMITY_RADIUS };

// CLI test mode
if (require.main === module) {
  const retina = new ProximityRetina({
    agentId: 'test-retina',
    parentAgent: 'test-parent',
    onPerception: (event) => {
      console.log(`\n👁️ [${event.type.toUpperCase()}] ${event.description}`);
      console.log(`   Importance: ${event.importance} | Distance: ${event.distance || 'N/A'}`);
    }
  });

  retina.connect().catch(console.error);

  // Cleanup on exit
  process.on('SIGINT', () => {
    retina.disconnect();
    process.exit(0);
  });
}
