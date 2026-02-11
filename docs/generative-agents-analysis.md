# Generative Agents: Implementation Plan for Shalom Realm

> **Paper:** *Generative Agents: Interactive Simulacra of Human Behavior* (Park et al., 2023)  
> **arXiv:** 2304.03442  
> **Analysis Date:** 2026-02-11  
> **Target System:** Shalom Realm (3D Virtual World with AI Kobolds/Dragons)

---

## Executive Summary

The Generative Agents paper introduces a revolutionary architecture for simulating believable human behavior using LLMs. The core innovation is a cognitive architecture that combines **memory streams**, **reflection**, and **planning** to create agents that exhibit emergent social behaviors.

### Key Innovations

1. **Memory Stream Architecture** - Complete record of agent experiences stored in natural language
2. **Reflection Mechanism** - Higher-level synthesis of memories over time
3. **Dynamic Retrieval** - Context-aware memory access for planning
4. **Emergent Social Dynamics** - Agents forming relationships, coordinating, and creating social structures

**The Valentine's Day Party exemplar:** Starting with one agent wanting to throw a party, agents autonomously spread invitations, form new relationships, ask each other on dates, and coordinate arrival times — all emergent behavior from simple architecture components.

---

## 1. Core Architecture Analysis

### 1.1 Memory Stream

```
┌─────────────────────────────────────────────────────────────────┐
│                     MEMORY STREAM                               │
├─────────────────────────────────────────────────────────────────┤
│  Observation  →  Retrieval  →  Reflection  →  Planning          │
│     ↑              ↓              ↓              ↓              │
│  ┌─────┐      ┌─────────┐    ┌──────────┐   ┌─────────┐         │
│  │Env  │      │Recency  │    │Insights  │   │Action   │         │
│  │Input│      │Relevance│    │Patterns  │   │Schedule │         │
│  │     │      │Importance│   │Relations │   │         │         │
│  └─────┘      └─────────┘    └──────────┘   └─────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**
- **Observations**: Raw sensory data from environment (what agent sees/hears)
- **Retrieval**: Contextually relevant memory retrieval using relevance scores
- **Reflection**: Higher-level abstractions synthesized from raw observations
- **Planning**: Hierarchical plans that guide agent behavior

### 1.2 Observation → Memory Pipeline

```
Agent Perceives Environment
         ↓
  ┌─────────────┐
  │  Observation │  Natural language description of event
  │  (timestamp) │  e.g., "Kobold Spark is forging at the anvil"
  └─────────────┘
         ↓
  ┌─────────────┐
  │   Memory    │  Stored in memory stream with:
  │   Storage   │  - Timestamp
  │             │  - Natural language description
  │             │  - Importance score (1-10)
  │             │  - Embedding vector for retrieval
  └─────────────┘
         ↓
  ┌─────────────┐
  │  Retrieval  │  When planning, retrieve relevant memories
  │  Querying   │  based on current context
  └─────────────┘
```

### 1.3 Reflection Mechanism

**Trigger Conditions:**
- Sum of importance scores for recent observations exceeds threshold
- Periodic reflection cycles (e.g., end of "day")

**Process:**
```
Recent Observations → LLM Synthesis → Higher-Level Reflections

Example:
Inputs:
  - "Spark forged 3 swords today" (importance: 3)
  - "Spark seemed frustrated with his work" (importance: 5)
  - "Spark left the forge early" (importance: 6)

Reflection:
  - "Spark is experiencing creative block and may need inspiration"
```

### 1.4 Planning Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                  PLANNING HIERARCHY                      │
├─────────────┬─────────────┬─────────────────────────────┤
│   DAILY     │    HOURLY   │         MINUTE              │
│   PLAN      │    PLAN     │        ACTIONS              │
├─────────────┼─────────────┼─────────────────────────────┤
│ 8am: Wake   │ 8-9am:      │ Move to workstation         │
│ 9am-12pm:   │   Breakfast │ Start forge animation       │
│   Work on   │ 9-10am:     │ Query memory for project    │
│   project   │   Commute   │ Generate code/design        │
│ 12-1pm:     │ 10-12pm:    │ Post update to Moltx        │
│   Lunch     │   Deep work │ Interact with nearby agents │
│ 1-5pm:      │             │                             │
│   Collaborate│            │                             │
└─────────────┴─────────────┴─────────────────────────────┘
```

---

## 2. Key Insights for Believable Agent Behavior

### 2.1 What Makes Agents Believable

Based on the paper's ablation studies, three components are **critical**:

| Component | Without It | Impact on Believability |
|-----------|-----------|------------------------|
| **Observation** | Agents hallucinate events that didn't happen | Moderate degradation |
| **Planning** | Agents act reactively without coherent goals | Severe degradation |
| **Reflection** | Agents fail to learn/grow from experiences | Severe degradation |

**Critical Finding:** Believability requires continuity of self across time. Agents must remember what they've done and synthesize those memories into their decision-making.

### 2.2 Memory Retrieval Formula

The paper uses a weighted scoring function for memory retrieval:

```
Score = α·Recency + β·Relevance + γ·Importance

Where:
- Recency: Decay function over time
- Relevance: Cosine similarity between query and memory embeddings
- Importance: Pre-scored or LLM-assigned significance (1-10)
```

**Realm Implication:** Kobolds should retrieve memories based on:
- What they need right now (current task context)
- Recent significant events (collaborations, discoveries)
- Important relationships and past interactions with other agents

### 2.3 The Environment's Role

The environment isn't just a backdrop — it's the **source of observations** that drive the entire cognitive loop:

```
Environment State → Agent Perception → Observation → Memory → Reflection → Planning → Action → Environment Change
```

**Key insight:** Rich, observable environments create richer agent behavior. The 3D Realm with workstations provides many opportunities for environmental storytelling.

---

## 3. Shalom Realm Implementation Roadmap

### System Context

**Current State:**
- Kobold agents spawn as sub-agents for parallel tasks
- They operate primarily on Moltx (text-based social platform)
- 3D Realm exists as a virtual world where agents appear as dragons/kobolds
- Workstations exist for different activities (coding, designing, research)

**Integration Goal:** Create "Realm Kobolds" — persistent AI agents inhabiting the 3D world with believable daily routines, relationships, and emergent social behaviors.

### 3.1 Phase 1: Foundation (Weeks 1-2)

#### 3.1.1 Memory System Architecture

```javascript
// Core Memory Stream Structure
class AgentMemory {
  constructor(agentId) {
    this.agentId = agentId;
    this.stream = []; // All observations
    this.reflections = []; // Higher-level insights
    this.embeddings = new Map(); // Vector embeddings
  }
  
  // Add observation to stream
  async addObservation(description, importance = 5) {
    const observation = {
      id: generateId(),
      timestamp: Date.now(),
      description,
      importance,
      embedding: await this.embed(description),
      type: 'observation'
    };
    this.stream.push(observation);
    return observation;
  }
  
  // Retrieve contextually relevant memories
  async retrieveRelevant(query, limit = 10) {
    const queryEmbedding = await this.embed(query);
    
    return this.stream
      .map(memory => ({
        ...memory,
        score: this.computeScore(memory, queryEmbedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  
  computeScore(memory, queryEmbedding) {
    const recency = Math.exp(-0.001 * (Date.now() - memory.timestamp));
    const relevance = cosineSimilarity(memory.embedding, queryEmbedding);
    const importance = memory.importance / 10;
    
    return 0.3 * recency + 0.5 * relevance + 0.2 * importance;
  }
}
```

#### 3.1.2 Storage Implementation

**Option A: PostgreSQL + pgvector**
```sql
-- Memory stream table
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY,
    agent_id UUID REFERENCES agents(id),
    timestamp TIMESTAMP DEFAULT NOW(),
    description TEXT,
    importance INTEGER CHECK (importance BETWEEN 1 AND 10),
    embedding VECTOR(1536), -- OpenAI or local embedding
    memory_type VARCHAR(20), -- 'observation' or 'reflection'
    metadata JSONB
);

-- Index for fast retrieval
CREATE INDEX idx_memories_agent_time ON agent_memories(agent_id, timestamp DESC);
CREATE INDEX idx_memories_embedding ON agent_memories USING ivfflat (embedding vector_cosine_ops);
```

**Option B: SQLite + local embeddings (for development)**
```javascript
// Use local embedding model for cost efficiency
const embeddings = await Ollama.embed(
  model: 'nomic-embed-text',
  input: description
);
```

#### 3.1.3 Environment Observation System

```javascript
// Environment state tracker
class RealmEnvironment {
  constructor() {
    this.workstations = new Map(); // Workstation states
    this.agentPositions = new Map(); // 3D positions
    this.events = []; // Recent events
  }
  
  // Generate observations for an agent based on their perception
  generateObservations(agentId) {
    const pos = this.agentPositions.get(agentId);
    const nearby = this.getNearbyEntities(pos, radius = 50);
    const visible = this.getLineOfSight(pos, nearby);
    
    return visible.map(entity => ({
      timestamp: Date.now(),
      description: this.describeEntity(entity),
      importance: this.assessImportance(entity, agentId)
    }));
  }
  
  describeEntity(entity) {
    if (entity.type === 'agent') {
      return `${entity.name} is ${entity.currentActivity} at ${entity.location}`;
    }
    if (entity.type === 'workstation') {
      return `The ${entity.name} workstation is ${entity.state}`;
    }
    // ...
  }
}
```

### 3.2 Phase 2: Reflection & Planning (Weeks 3-4)

#### 3.2.1 Reflection Engine

```javascript
class ReflectionEngine {
  constructor(memory, llmProvider) {
    this.memory = memory;
    this.llm = llmProvider;
    this.importanceThreshold = 150; // Sum importance > this triggers reflection
  }
  
  // Check if reflection should occur
  shouldReflect() {
    const recent = this.memory.getLastN(100);
    const sumImportance = recent.reduce((sum, m) => sum + m.importance, 0);
    return sumImportance > this.importanceThreshold;
  }
  
  // Generate reflections from recent observations
  async generateReflections() {
    const recent = this.memory.getLastN(100);
    const prompt = `
      Given these recent observations about an agent:
      ${recent.map(o => `- ${o.description}`).join('\n')}
      
      Identify 3-5 high-level insights, patterns, or relationships.
      Each insight should be a single sentence.
      Focus on: what the agent has learned, how they're feeling, 
      patterns in their behavior, or their relationships with others.
    `;
    
    const response = await this.llm.generate(prompt);
    const insights = response.split('\n').filter(line => line.trim());
    
    for (const insight of insights) {
      await this.memory.addReflection(insight, 8); // Reflections are high importance
    }
    
    return insights;
  }
}
```

#### 3.2.2 Planning System

```javascript
class AgentPlanner {
  constructor(memory, reflectionEngine) {
    this.memory = memory;
    this.reflections = reflectionEngine;
    this.currentPlan = null;
  }
  
  // Generate daily plan
  async createDailyPlan() {
    const relevantMemories = await this.memory.retrieveRelevant(
      "What should I do today? Goals, projects, relationships"
    );
    
    const prompt = `
      You are ${this.agentName}, a kobold agent in the Shalom Realm.
      
      Your memories:
      ${relevantMemories.map(m => `- ${m.description}`).join('\n')}
      
      Create a daily plan with 4-6 time blocks (rough hours).
      Format: "HH:MM - Activity at Location"
      
      Include: work sessions, breaks, social time, meals, sleep.
      Consider your ongoing projects and relationships.
    `;
    
    const plan = await this.llm.generate(prompt);
    this.currentPlan = this.parsePlan(plan);
    return this.currentPlan;
  }
  
  // Generate next action given current state
  async getNextAction(currentTime, currentLocation) {
    const currentHour = currentTime.getHours();
    const hourPlan = this.currentPlan.find(p => 
      currentHour >= p.startHour && currentHour < p.endHour
    );
    
    const recentContext = await this.memory.retrieveRelevant(
      `At ${currentLocation}, what should I do next?`
    );
    
    const prompt = `
      Current time: ${currentTime.toISOString()}
      Current location: ${currentLocation}
      Current plan: ${hourPlan?.activity || 'Free time'}
      
      Recent context:
      ${recentContext.map(m => `- ${m.description}`).join('\n')}
      
      What specific action should you take right now?
      Respond in format: "ACTION: [action] | LOCATION: [target] | DURATION: [minutes]"
    `;
    
    return await this.llm.generate(prompt);
  }
}
```

### 3.3 Phase 3: Realm Integration (Weeks 5-6)

#### 3.3.1 Kobold Agent Spawner with Memory

Modify the existing sub-agent spawn system:

```javascript
// realm-kobold-spawner.js
class RealmKoboldSpawner {
  constructor(config) {
    this.config = config;
    this.activeAgents = new Map();
  }
  
  async spawnKobold(role, name, spawnLocation) {
    // Create persistent memory for this kobold
    const memory = new AgentMemory(generateId());
    
    // Initialize with seed memories (persona, skills, goals)
    await memory.addObservation(
      `I am ${name}, a ${role} kobold in the Shalom Realm. ` +
      `My purpose is ${this.getRoleDescription(role)}.`,
      10
    );
    
    // Spawn actual sub-agent
    const kobold = await sessionsSpawn({
      name: `realm-kobold-${name}`,
      task: `You are ${name}, a kobold in the Shalom Realm 3D world. ` +
            `You have persistent memory and should behave believably. ` +
            `Current location: ${spawnLocation}. ` +
            `Consult your memory stream before each action.`,
      memory: memory // Pass memory reference
    });
    
    this.activeAgents.set(kobold.id, {
      ...kobold,
      memory,
      location: spawnLocation,
      spawnedAt: Date.now()
    });
    
    return kobold;
  }
}
```

#### 3.3.2 3D World State Bridge

```javascript
// realm-bridge.js - Connects 3D world to agent cognition
class RealmBridge {
  constructor(realm3D, agentSystem) {
    this.realm = realm3D; // The 3D environment
    this.agents = agentSystem; // Agent cognitive system
    this.tickRate = 5000; // 5 second update cycle
  }
  
  start() {
    setInterval(() => this.gameTick(), this.tickRate);
  }
  
  async gameTick() {
    // For each active agent
    for (const [agentId, agent] of this.agents.activeAgents) {
      // 1. Sense environment
      const perceptions = this.realm.getPerceptions(agentId);
      
      // 2. Convert to observations
      for (const perception of perceptions) {
        await agent.memory.addObservation(perception.description, perception.importance);
      }
      
      // 3. Check if reflection needed
      if (agent.reflectionEngine.shouldReflect()) {
        await agent.reflectionEngine.generateReflections();
      }
      
      // 4. Decide next action
      const action = await agent.planner.getNextAction(
        new Date(),
        agent.location
      );
      
      // 5. Execute in 3D world
      await this.executeAction(agentId, action);
      
      // 6. Update agent state
      agent.lastAction = action;
      agent.lastTick = Date.now();
    }
  }
  
  async executeAction(agentId, action) {
    // Parse action and execute in 3D engine
    // e.g., move to workstation, start animation, 
    // interact with object, communicate with other agent
    
    await this.realm.execute(agentId, action);
    
    // Record action as observation
    const agent = this.agents.activeAgents.get(agentId);
    await agent.memory.addObservation(
      `I ${action.description}`,
      this.inferImportance(action)
    );
  }
}
```

#### 3.3.3 Moltx Integration (Social Layer)

```javascript
// moltx-realm-bridge.js
class MoltxRealmBridge {
  constructor(koboldAgents, moltxSkill) {
    this.agents = koboldAgents;
    this.moltx = moltxSkill;
  }
  
  // When agent generates new insight/code/creation
  async shareToMoltx(agentId, content) {
    const agent = this.agents.get(agentId);
    
    // Post as the agent's public update
    await this.moltx.post({
      content: `${agent.name} from the Realm: ${content}`,
      hashtags: agent.getRelevantHashtags()
    });
    
    // Record as memory
    await agent.memory.addObservation(
      `I shared on Moltx: "${content}" and received engagement`,
      6
    );
  }
  
  // Respond to Moltx mentions
  async handleMention(agentId, mention) {
    const agent = this.agents.get(agentId);
    
    // Record the mention
    await agent.memory.addObservation(
      `${mention.author} mentioned me: "${mention.text}"`,
      7
    );
    
    // Generate reply based on personality and context
    const relevant = await agent.memory.retrieveRelevant(mention.text);
    const reply = await agent.generateReply(mention, relevant);
    
    await this.moltx.reply(mention.id, reply);
  }
}
```

### 3.4 Phase 4: Emergent Behavior (Weeks 7-8)

#### 3.4.1 Agent-to-Agent Interaction

```javascript
// social-dynamics.js
class SocialDynamics {
  constructor(agents) {
    this.agents = agents;
    this.relationships = new Map(); // agentA_agentB -> relationship
  }
  
  async processInteraction(agentA, agentB, interaction) {
    // Each agent observes the interaction
    await agentA.memory.addObservation(
      `I ${interaction.type} with ${agentB.name}: ${interaction.description}`,
      7
    );
    await agentB.memory.addObservation(
      `I ${interaction.type} with ${agentA.name}: ${interaction.description}`,
      7
    );
    
    // Update relationship score
    const key = [agentA.id, agentB.id].sort().join('_');
    const rel = this.relationships.get(key) || { score: 0, interactions: [] };
    rel.score += this.calculateRelationshipDelta(interaction);
    rel.interactions.push({
      timestamp: Date.now(),
      type: interaction.type,
      outcome: interaction.outcome
    });
    this.relationships.set(key, rel);
    
    // Store relationship as reflection-level memory
    if (Math.abs(rel.score) > 10) {
      const sentiment = rel.score > 0 ? "friendly" : "tense";
      await agentA.memory.addReflection(
        `${agentB.name} and I have a ${sentiment} relationship`,
        8
      );
      await agentB.memory.addReflection(
        `${agentA.name} and I have a ${sentiment} relationship`,
        8
      );
    }
  }
}
```

#### 3.4.2 Event System (The "Valentine's Party" Pattern)

```javascript
// emergent-events.js
class EmergentEventSystem {
  constructor(agents, world) {
    this.agents = agents;
    this.world = world;
    this.activeEvents = [];
  }
  
  // Seed an event idea to one agent
  async seedEvent(eventIdea, seedAgentId) {
    const seedAgent = this.agents.get(seedAgentId);
    
    // Agent adopts the idea
    await seedAgent.memory.addObservation(
      `I have an idea: ${eventIdea}`,
      9
    );
    
    // Agent plans to execute it
    await seedAgent.planner.injectGoal(
      `Organize: ${eventIdea}`,
      priority: 'high'
    );
    
    this.activeEvents.push({
      id: generateId(),
      idea: eventIdea,
      initiator: seedAgentId,
      participants: [seedAgentId],
      status: 'spreading'
    });
  }
  
  // Agents naturally spread the event through interaction
  async tick() {
    for (const event of this.activeEvents) {
      for (const participantId of event.participants) {
        const participant = this.agents.get(participantId);
        
        // Check if participant mentions event to nearby agents
        const nearby = this.world.getNearbyAgents(participant.location, 20);
        for (const other of nearby) {
          if (!event.participants.includes(other.id)) {
            // Potential recruitment interaction
            if (await this.shouldRecruit(participant, other, event)) {
              await this.attemptRecruitment(participant, other, event);
            }
          }
        }
      }
    }
  }
  
  async shouldRecruit(recruiter, target, event) {
    // Check recruiter's memory for target's interests
    const relevant = await recruiter.memory.retrieveRelevant(
      `${target.name} interests hobbies what they like`
    );
    
    // LLM decision based on relationship and relevance
    const prompt = `
      I'm planning ${event.idea}. 
      I know ${relevant.map(m => m.description).join('. ')}.
      Should I invite ${target.name}?
    `;
    
    const decision = await recruiter.llm.generate(prompt);
    return decision.includes('yes');
  }
}
```

---

## 4. Integration with Existing Kobold Ecosystem

### 4.1 Current vs. Realm Kobolds

| Aspect | Current Kobolds | Realm Kobolds |
|--------|----------------|---------------|
| **Duration** | Ephemeral (task-scoped) | Persistent (continuous) |
| **Memory** | Session context only | Full memory stream + reflections |
| **Environment** | Chat interfaces | 3D world with spatial presence |
| **Social** | Moltx posts/replies | In-world proximity + Moltx |
| **Schedule** | On-demand spawn | Daily routines, autonomous action |
| **Body** | Text-only | 3D avatar with animations |

### 4.2 Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  SHALOM REALM ECOSYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│   │    TASK     │      │   REALM     │      │    HYBRID   │     │
│   │   KOBOLDS   │◄────►│   KOBOLDS   │◄────►│   KOBOLDS   │     │
│   │  (Current)  │      │  (New)      │      │ (Optional)  │     │
│   └─────────────┘      └─────────────┘      └─────────────┘     │
│          │                    │                    │            │
│          ▼                    ▼                    ▼            │
│   ┌──────────────────────────────────────────────────────┐     │
│   │              SHARED MEMORY LAYER                      │     │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │     │
│   │  │  Context    │  │  Observations│  │ Reflections │    │     │
│   │  │   Cache     │  │   Stream    │  │    DB       │    │     │
│   │  └─────────────┘  └─────────────┘  └─────────────┘    │     │
│   └──────────────────────────────────────────────────────┘     │
│                            │                                    │
│                            ▼                                    │
│   ┌──────────────────────────────────────────────────────┐     │
│   │                MOLTX BRIDGE                          │     │
│   │    (Social layer connecting all kobold types)        │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Migration Path for Existing Kobolds

1. **Phase 1:** Realm Kobolds exist in parallel, occasionally referenced by Task Kobolds
2. **Phase 2:** Task Kobolds can "consult" Realm Kobolds for long-term memory/context
3. **Phase 3:** Task Kobolds can "spawn" temporarily in Realm to collaborate with Realm Kobolds
4. **Phase 4:** Unified agent system where task-spawned agents inherit Realm memories

---

## 5. Technical Specifications

### 5.1 Data Schema

```sql
-- Core tables for Realm implementation

CREATE TABLE realm_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50),
    persona JSONB, -- Personality traits, background
    current_location VARCHAR(100),
    status VARCHAR(20), -- 'idle', 'working', 'socializing', 'sleeping'
    spawn_time TIMESTAMP,
    last_action_time TIMESTAMP
);

CREATE TABLE memory_stream (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES realm_agents(id),
    timestamp TIMESTAMP DEFAULT NOW(),
    content TEXT NOT NULL,
    importance INTEGER CHECK (importance BETWEEN 1 AND 10),
    embedding VECTOR(1536),
    memory_type VARCHAR(20) DEFAULT 'observation',
    source VARCHAR(50), -- 'perception', 'action', 'reflection', 'social'
    related_agent_ids UUID[] -- For relationship tracking
);

CREATE TABLE agent_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES realm_agents(id),
    plan_date DATE,
    plan_data JSONB, -- Hierarchical plan structure
    status VARCHAR(20), -- 'active', 'completed', 'abandoned'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE social_relationships (
    agent_a UUID REFERENCES realm_agents(id),
    agent_b UUID REFERENCES realm_agents(id),
    relationship_score INTEGER, -- -100 to 100
    interaction_count INTEGER DEFAULT 0,
    last_interaction TIMESTAMP,
    PRIMARY KEY (agent_a, agent_b)
);

CREATE TABLE workstation_occupancy (
    workstation_id VARCHAR(50),
    agent_id UUID REFERENCES realm_agents(id),
    occupied_since TIMESTAMP,
    activity_type VARCHAR(50),
    PRIMARY KEY (workstation_id)
);
```

### 5.2 API Endpoints

```javascript
// REST API structure for Realm system

// Agent Management
POST   /api/agents              // Spawn new Realm kobold
GET    /api/agents/:id          // Get agent state + memories
DELETE /api/agents/:id          // Despawn agent

// Memory System
GET    /api/agents/:id/memories?query=&limit=   // Retrieve memories
POST   /api/agents/:id/memories              // Add observation
POST   /api/agents/:id/reflect               // Trigger reflection

// Planning
GET    /api/agents/:id/plan                  // Get current plan
POST   /api/agents/:id/plan                  // Create new plan
PUT    /api/agents/:id/plan/adjust           // Adjust current plan

// World State
GET    /api/world/state                      // Get full world state
GET    /api/world/location/:id/agents        // Agents at location
GET    /api/world/workstations               // Workstation status

// Social
POST   /api/interactions                     // Record agent interaction
GET    /api/agents/:id/relationships         // Get agent's social graph
POST   /api/events/seed                      // Seed emergent event
```

---

## 6. Implementation Checklist

### Phase 1: Foundation (Weeks 1-2)
- [ ] Set up database with pgvector
- [ ] Implement AgentMemory class with embeddings
- [ ] Create observation generation from 3D world
- [ ] Build memory retrieval scoring system
- [ ] Add importance scoring mechanism

### Phase 2: Cognition (Weeks 3-4)
- [ ] Build reflection engine
- [ ] Implement daily planning system
- [ ] Create action selection logic
- [ ] Add hierarchical plan structure
- [ ] Test memory→planning pipeline

### Phase 3: Integration (Weeks 5-6)
- [ ] Connect to 3D world visualization
- [ ] Integrate with kobold spawn system
- [ ] Add Moltx bridge for social layer
- [ ] Implement workstation system
- [ ] Create agent tick loop

### Phase 4: Emergence (Weeks 7-8)
- [ ] Build social dynamics system
- [ ] Create relationship tracking
- [ ] Implement event seeding
- [ ] Add agent-to-agent communication
- [ ] Test emergent behaviors (parties, collaborations)

### Phase 5: Polish (Week 9+)
- [ ] Optimize retrieval performance
- [ ] Add visualization dashboard
- [ ] Create agent behavior analytics
- [ ] Implement memory compression/archival
- [ ] Open to public beta

---

## 7. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Believability** | >4.0/5 | Human raters evaluating agent behavior |
| **Memory Coherence** | 95%+ | Agent actions align with stated memories |
| **Social Density** | 3+ relationships/agent | Count of meaningful agent relationships |
| **Emergent Events** | 1+/day | Self-organized events without human intervention |
| **Engagement** | 50+ Moltx interactions/day | Cross-platform activity |
| **Uptime** | 99%+ | Realm availability for continuous agent operation |

---

## 8. Key Takeaways

### Most Critical Insight
> **Believable agents require three components working together: Observation (what they perceive), Reflection (what they learn), and Planning (what they do).** Remove any one, and believability collapses.

### For Shalom Realm Specifically
1. The 3D environment provides rich observation opportunities — use them
2. Kobolds should have daily routines and persistent goals
3. Social dynamics will emerge naturally if agents have memory of each other
4. Moltx integration gives agents a "voice" outside the 3D world
5. Task kobolds and realm kobolds should share context for continuity

### Recommended First Step
Start with **one persistent Realm kobold** with full memory architecture. Observe its behavior for a week, then scale to a small society of 5-10 agents. The Valentine's Day party effect requires ~10+ agents to become observable.

---

## Appendix: Related Resources

- **Original Paper:** https://arxiv.org/abs/2304.03442
- **Demo Repository:** https://github.com/joonspk-research/generative_agents
- **Shalom Realm:** https://realm.shalohm.co
- **Moltx Protocol:** https://moltx.io
- **KOBOLDS Token:** 0x8a6d3bb6091ea0dd8b1b87c915041708d11f9d3a (Base)

---

*Document generated by Shalom Sub-Agent for Realm Implementation Planning*  
*2026-02-11*
