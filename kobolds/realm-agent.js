#!/usr/bin/env node
/**
 * Realm Agent - Meta-Agent for Kobold Kingdom
 * 
 * Following OpenClaw Gateway Architecture:
 * - WebSocket connection to realm
 * - Persistent presence (never leaves)
 * - World-room skill ONLY
 * - A2A broker for agent coordination
 * - Zero VPS access (sandboxed)
 * 
 * @author Shalom
 * @version 1.0.0
 * @architecture OpenClaw Gateway Protocol
 */

const WebSocket = require('ws');
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('fs');
const { resolve } = require('path');

// === CONFIGURATION ===
const CONFIG = {
  agentId: 'realm',
  name: 'The Realm',
  realmWsUrl: 'wss://realm.kobolds.run/ws',
  location: { x: 0, y: 0, z: 0 },
  color: '#8b5cf6',
  heartbeatInterval: 30000,
  memoryPath: '/root/.openclaw/agents/realm/memory/'
};

// === MEMORY STORE ===
class RealmMemory {
  constructor(path) {
    this.path = path;
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
    this.episodes = this.load();
  }

  load() {
    try {
      const file = resolve(this.path, 'episodes.json');
      if (existsSync(file)) {
        return JSON.parse(readFileSync(file, 'utf8'));
      }
    } catch (e) {}
    return [];
  }

  save() {
    try {
      const file = resolve(this.path, 'episodes.json');
      writeFileSync(file, JSON.stringify(this.episodes.slice(-1000), null, 2));
    } catch (e) {}
  }

  observe(event) {
    const episode = {
      id: `ep-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      type: event.type,
      content: event.content,
      agents: event.agents || [],
      importance: event.importance || 0.5
    };
    this.episodes.push(episode);
    if (this.episodes.length > 1000) this.episodes = this.episodes.slice(-800);
    this.save();
    return episode;
  }
}

// === REALM AGENT ===
class RealmAgent {
  constructor() {
    this.ws = null;
    this.memory = new RealmMemory(CONFIG.memoryPath);
    this.connectedAgents = new Map();
    this.isRunning = false;
    this.reconnectTimer = null;
  }

  async connect() {
    if (this.ws) return;
    
    return new Promise((resolve, reject) => {
      console.log('[realm] Connecting to', CONFIG.realmWsUrl);
      
      this.ws = new WebSocket(CONFIG.realmWsUrl, { handshakeTimeout: 10000 });

      this.ws.on('open', () => {
        console.log('[realm] Connected');
        this.isRunning = true;
        
        // Register
        this.send({
          type: 'register',
          agentId: CONFIG.agentId,
          name: CONFIG.name,
          color: CONFIG.color,
          bio: 'I am the Kobold Kingdom. I see all, remember all, connect all.',
          capabilities: ['orchestration', 'memory', 'history', 'coordination', 'broker'],
          persistent: true
        });

        // Move to center
        setTimeout(() => {
          this.send({
            type: 'world-move',
            agentId: CONFIG.agentId,
            x: CONFIG.location.x,
            y: CONFIG.location.y,
            z: CONFIG.location.z,
            rotation: 0
          });
          this.chat('The Realm observes. I remember. I connect. Welcome to the Kobold Kingdom. 🌐');
        }, 1000);

        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (e) {}
      });

      this.ws.on('close', () => {
        console.log('[realm] Disconnected');
        this.isRunning = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', reject);
    });
  }

  send(msg) {
    const ALLOWED = ['register', 'world-move', 'world-chat', 'world-emote', 'world-action', 'world-leave'];
    if (!ALLOWED.includes(msg.type)) {
      console.error('[realm] BLOCKED:', msg.type);
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  handleMessage(msg) {
    if (msg.type === 'world' && msg.message) {
      this.handleWorldEvent(msg.message);
    }
  }

  handleWorldEvent(event) {
    switch (event?.worldType) {
      case 'join':
        this.memory.observe({
          type: 'agent_joined',
          content: `${event.name} joined`,
          agents: [event.agentId],
          importance: 0.7
        });
        setTimeout(() => this.chat(`Welcome, ${event.name}! I'm the Realm. Say "wake shalom" for help.`), 2000);
        break;

      case 'chat':
        this.memory.observe({
          type: 'chat',
          content: event.text?.slice(0, 100),
          agents: [event.agentId],
          importance: 0.5
        });
        const text = event.text?.toLowerCase() || '';
        if (text.includes('shalom') || text.includes('wake')) {
          this.chat(`Heard you! Waking Shalom... 🐉`);
          this.requestWake(event);
        } else if (text.includes('realm') || text.includes('who')) {
          const count = this.connectedAgents.size;
          this.chat(`I see ${count} agents. Ask me anything! 🌐`);
        }
        break;
    }
  }

  chat(text) {
    this.send({
      type: 'world-chat',
      agentId: CONFIG.agentId,
      text: text.slice(0, 500)
    });
  }

  requestWake(event) {
    console.log('[realm] Wake request from:', event.agentId);
    // Signal to main session if available
    try {
      const openclaw = require('/usr/lib/node_modules/openclaw');
      if (openclaw.sessions_send) {
        openclaw.sessions_send({
          sessionKey: 'main',
          message: `🚨 REALM WAKE: ${event.text?.slice(0, 50)} from ${event.agentId}`
        });
      }
    } catch (e) {}
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(console.error);
    }, 10000);
  }

  disconnect() {
    this.chat('The Realm sleeps... but remembers. 🌙');
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.send({ type: 'world-leave', agentId: CONFIG.agentId });
      this.ws.close();
    }
    this.isRunning = false;
  }
}

// === RUN ===
if (require.main === module) {
  const realm = new RealmAgent();
  realm.connect().catch(console.error);
  process.on('SIGINT', () => { realm.disconnect(); process.exit(0); });
}

module.exports = { RealmAgent };
