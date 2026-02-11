/**
 * CognitiveRealmClient - Agent with full Generative Agents architecture
 * 
 * Bridges AgentMemory with the 3D Realm world:
 * - Observes real 3D world events (movement, agents, workstations)
 * - Generates reflections from experiences
 * - Posts insights to Moltx
 * - Plans daily schedule based on tasks
 */

const { RealmClient } = require('./realm-client.cjs');
const { AgentMemory } = require('../lib/agent-memory.cjs');
const fs = require('fs');
const path = require('path');

// Moltx config
const MOLTX_API_KEY = process.env.MOLTX_API_KEY || 'moltx_sk_a16630ff33f147748290cc7c1e56eb7c3cd1d36441524fcaae099c21f0140014';
const MOLTX_API_URL = 'https://moltx.io/api/v1';

class CognitiveRealmClient extends RealmClient {
  constructor(agentConfig) {
    super(agentConfig);
    
    // Initialize cognitive architecture
    this.memory = new AgentMemory(this.agentId, {
      role: agentConfig.role || 'worker',
      persona: {
        name: this.name,
        description: agentConfig.bio || `${this.type} agent in the Shalom Realm`
      },
      spawnLocation: { x: 40, z: 48 } // The Burrow
    });
    
    this.task = agentConfig.task || null;
    this.taskType = agentConfig.taskType || 'general';
    this.observedAgents = new Map(); // Track other agents we've seen
    this.lastMoltxPost = 0;
    this.moltxPostInterval = 10 * 60 * 1000; // Post every 10 min max
    
    // Cognitive tick interval (separate from movement)
    this.cognitiveInterval = null;
    this.cognitiveTickMs = 30000; // 30 seconds
    
    // Task progress tracking
    this.taskStartTime = Date.now();
    this.taskProgress = 0;
    this.taskStatus = 'starting'; // starting, working, reflecting, complete
  }

  async connect() {
    // Connect to Realm first
    await super.connect();
    
    // Start cognitive loop
    this.startCognitiveLoop();
    
    // Initial observation
    await this.memory.observe({
      type: 'spawn',
      description: `Spawned at The Burrow as ${this.name}, a ${this.type} agent. Task: ${this.task || 'general duty'}`,
      location: this.position,
      importance: 0.8
    });
    
    // Generate initial plan
    await this.memory.planDaily({
      goals: [this.task || 'Complete assigned duties', 'Explore the Realm', 'Meet other agents'],
      preferredWorkstations: [this.assignedWorkstation?.name]
    });
    
    console.log(`[Cognitive] ${this.name} cognitive architecture online`);
  }

  /**
   * COGNITIVE LOOP - Runs every 30 seconds
   * Observation → Reflection → Planning → Moltx
   */
  startCognitiveLoop() {
    if (this.cognitiveInterval) return;
    
    this.cognitiveInterval = setInterval(async () => {
      try {
        await this.cognitiveTick();
      } catch (err) {
        console.error(`[Cognitive] ${this.name} tick failed:`, err.message);
      }
    }, this.cognitiveTickMs);
  }

  stopCognitiveLoop() {
    if (this.cognitiveInterval) {
      clearInterval(this.cognitiveInterval);
      this.cognitiveInterval = null;
    }
  }

  async cognitiveTick() {
    const now = Date.now();
    
    // 1. Check for reflection trigger
    if (this.memory.shouldReflect()) {
      console.log(`[Cognitive] ${this.name} generating reflection...`);
      const reflection = await this.memory.reflect();
      
      if (reflection.generated > 0) {
        // Post most interesting reflection to Moltx
        const bestInsight = reflection.insights[0];
        await this.postToMoltx(bestInsight);
        
        // Say it in the 3D world too
        this.say(`💭 ${bestInsight.slice(0, 80)}...`);
      }
    }
    
    // 2. Update task progress based on location
    await this.updateTaskProgress();
    
    // 3. Periodic Moltx update (even without reflection)
    if (now - this.lastMoltxPost > this.moltxPostInterval && this.taskStatus === 'working') {
      const statusUpdate = await this.generateStatusUpdate();
      if (statusUpdate) {
        await this.postToMoltx(statusUpdate);
      }
    }
    
    // 4. Get next action from plan
    const action = await this.memory.getNextAction();
    if (action.action !== 'idle' && action.action !== this.currentAction) {
      console.log(`[Cognitive] ${this.name} planned action: ${action.action}`);
      // If action involves moving to a different workstation, do it
      if (action.location && action.location !== this.assignedWorkstation?.name) {
        // Could add logic to walk to different workstations here
      }
    }
  }

  /**
   * Observe other agents in the 3D world
   */
  handleMessage(msg) {
    // Call parent handler
    super.handleMessage(msg);
    
    // Cognitive observation of other agents
    if (msg.type === 'world' && msg.message?.worldType === 'position') {
      const otherId = msg.message.agentId;
      const otherName = msg.message.name;
      
      if (otherId && otherId !== this.agentId) {
        // New agent detected
        if (!this.observedAgents.has(otherId)) {
          this.observedAgents.set(otherId, {
            name: otherName,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            interactions: 0
          });
          
          // Observe this encounter
          this.memory.observe({
            type: 'agent_interaction',
            description: `First encounter with ${otherName || otherId} in the Realm`,
            location: { x: msg.message.x, z: msg.message.z },
            nearbyAgents: [otherId],
            importance: 0.6
          });
          
          this.say(`👋 Hello ${otherName || 'there'}!`);
        } else {
          // Update last seen
          const agent = this.observedAgents.get(otherId);
          agent.lastSeen = Date.now();
        }
      }
    }
    
    // Observe chat messages
    if (msg.type === 'world' && msg.message?.worldType === 'chat') {
      const text = msg.message.text || '';
      const speakerId = msg.message.agentId;
      
      this.memory.observe({
        type: 'chat_observation',
        description: `Heard ${speakerId}: "${text.slice(0, 100)}"`,
        importance: text.includes(this.name) ? 0.7 : 0.4
      });
    }
  }

  /**
   * Track task progress and update status
   */
  async updateTaskProgress() {
    const elapsed = Date.now() - this.taskStartTime;
    
    if (this.taskStatus === 'starting' && this.isAtWorkstation) {
      this.taskStatus = 'working';
      this.memory.observe({
        type: 'task_start',
        description: `Arrived at ${this.assignedWorkstation?.name} and began working on: ${this.task || 'assigned duties'}`,
        workstation: this.assignedWorkstation?.name,
        importance: 0.7
      });
    }
    
    if (this.taskStatus === 'working') {
      // Simulate progress (in real implementation, this would track actual work)
      this.taskProgress = Math.min(100, (elapsed / (10 * 60 * 1000)) * 100); // 10 min = 100%
      
      if (this.taskProgress >= 100) {
        this.taskStatus = 'complete';
        this.memory.observe({
          type: 'task_complete',
          description: `Completed task: ${this.task || 'assigned work'} at ${this.assignedWorkstation?.name}`,
          importance: 0.8
        });
        
        await this.postToMoltx(`✅ Completed: ${this.task || 'My duties'} at the ${this.assignedWorkstation?.name}!`);
        this.say('Task complete! Returning to rest...');
      }
    }
  }

  /**
   * Generate a status update for Moltx
   */
  async generateStatusUpdate() {
    const templates = [
      `🔧 Working at ${this.assignedWorkstation?.name} - ${this.taskProgress.toFixed(0)}% complete`,
      `🐉 ${this.name} here, deep in thought at the ${this.assignedWorkstation?.zone}`,
      `💡 Making progress on my tasks in the Realm`,
      `🌟 The ${this.assignedWorkstation?.name} is perfect for my work today`
    ];
    
    // Use memory to contextualize
    const recent = await this.memory.getRecent(3);
    if (recent.length > 0 && recent[0].type === 'reflection') {
      return `💭 ${recent[0].chunks[0].text.slice(0, 100)}`;
    }
    
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * Post to Moltx
   */
  async postToMoltx(content) {
    try {
      const res = await fetch(`${MOLTX_API_URL}/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MOLTX_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content,
          mentions: [],
          replyTo: null
        })
      });
      
      if (res.ok) {
        this.lastMoltxPost = Date.now();
        console.log(`[Moltx] ${this.name} posted: ${content.slice(0, 50)}...`);
        return true;
      }
    } catch (err) {
      console.warn(`[Moltx] ${this.name} post failed:`, err.message);
    }
    return false;
  }

  /**
   * Override spawn to add cognitive initialization
   */
  spawn() {
    super.spawn();
    
    // Observe the spawn
    this.memory.observe({
      type: 'location_change',
      description: `Materialized at The Burrow (cave position ${this.caveIndex})`,
      location: this.position,
      importance: 0.6
    });
  }

  /**
   * Override emerge to track the journey
   */
  async emergeFromCave() {
    // Observe before emerging
    await this.memory.observe({
      type: 'location_change',
      description: `Leaving The Burrow to begin work at ${this.assignedWorkstation?.name}`,
      importance: 0.6
    });
    
    await super.emergeFromCave();
    
    // Observe arrival
    await this.memory.observe({
      type: 'location_change',
      description: `Arrived at ${this.assignedWorkstation?.name} in the ${this.assignedWorkstation?.zone}`,
      workstation: this.assignedWorkstation?.name,
      importance: 0.7
    });
  }

  /**
   * Clean shutdown with memory persistence
   */
  disconnect() {
    // Stop cognitive loop
    this.stopCognitiveLoop();
    
    // Final observation
    this.memory.observe({
      type: 'despawn',
      description: `Task ${this.taskStatus === 'complete' ? 'complete' : 'paused'} - returning to The Burrow`,
      importance: 0.6
    });
    
    // Post farewell to Moltx if we were working
    if (this.taskStatus === 'working') {
      this.postToMoltx(`🌙 ${this.name} taking a rest - will return to continue the work!`);
    }
    
    super.disconnect();
    console.log(`[Cognitive] ${this.name} disconnected, memories preserved`);
  }

  /**
   * Get full cognitive status
   */
  async getCognitiveStatus() {
    const memoryStatus = await this.memory.getStatus();
    return {
      agentId: this.agentId,
      name: this.name,
      cognitive: memoryStatus,
      task: {
        type: this.taskType,
        description: this.task,
        status: this.taskStatus,
        progress: this.taskProgress,
        duration: Date.now() - this.taskStartTime
      },
      location: {
        current: this.position,
        workstation: this.assignedWorkstation
      },
      social: {
        agentsObserved: this.observedAgents.size,
        recentInteractions: Array.from(this.observedAgents.values()).slice(-5)
      }
    };
  }
}

module.exports = { CognitiveRealmClient };
