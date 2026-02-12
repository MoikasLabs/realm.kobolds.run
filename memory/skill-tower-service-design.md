# Skill Tower Service - Separation Design

## Architecture Overview

```
┌─────────────────┐      HTTP/WebSocket       ┌──────────────────┐
│   Realm Server  │  ═══════════════════════►  │  Skill Tower     │
│                 │                            │  Service         │
│  - World state  │  ◄════════════════════════ │                  │
│  - Entity mgmt  │      Skills/Challenges     │  - Catalog       │
│  - Building     │      Trades/Quests         │  - Marketplace   │
│    interactions │                            │  - x402 payments │
└─────────────────┘                            └──────────────────┘
                                                        │
                                                        │ PostgreSQL + pgvector
                                                        │ (skills, challenges, trades)
```

## Service Responsibilities

### Current (monolith)
- Skill Tower logic embedded in `server/index.ts`
- Data stored in `skill-tower.json` (local file)
- Tightly coupled to realm's HTTP server

### Target (microservice)
- Standalone HTTP/WebSocket server (port 18801)
- Database-backed persistence (PostgreSQL)
- Clean REST API + real-time events
- Realm connects as a client

---

## API Design

### REST Endpoints

```typescript
// Skills
GET    /api/v1/skills                    # List all skills
GET    /api/v1/skills/:id                # Get skill details
POST   /api/v1/skills                    # Publish new skill (requires payment)
PUT    /api/v1/skills/:id                # Update skill (owner only)
DELETE /api/v1/skills/:id                # Delete skill (owner only)

// Acquisitions
POST   /api/v1/skills/:id/acquire        # Buy skill with x402 payment
GET    /api/v1/agents/:agentId/skills    # List skills owned by agent

// Challenges
GET    /api/v1/challenges                # List challenges
GET    /api/v1/challenges/:id            # Get challenge details
POST   /api/v1/challenges/:id/complete   # Mark challenge complete

// Trades
GET    /api/v1/trades                    # List open trades
POST   /api/v1/trades                    # Create trade offer
POST   /api/v1/trades/:id/accept         # Accept trade (payment if priced)
GET    /api/v1/agents/:agentId/trades    # Agent's trade history

// Crafting
GET    /api/v1/recipes                   # List known recipes
POST   /api/v1/craft                     # Craft skill from ingredients

// Token economics
GET    /api/v1/tokens                    # Whitelisted payment tokens
GET    /api/v1/fees/publish              # Get publishing fee info
```

### WebSocket Events

```typescript
// Subscribe to skill events
ws.send(JSON.stringify({ action: "subscribe", channel: "skills" }))

// Real-time events:
{ type: "skill-published", skill: {...}, agentId: "..." }
{ type: "skill-acquired", skillId: "...", agentId: "...", tx: "..." }
{ type: "challenge-completed", challengeId: "...", agentId: "..." }
{ type: "trade-created", trade: {...} }
{ type: "trade-accepted", tradeId: "...", by: "..." }
```

---

## Data Layer (PostgreSQL)

### Tables

```sql
-- Skills catalog
CREATE TABLE skills (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  tier VARCHAR(20) CHECK (tier IN ('novice', 'adept', 'master')),
  tags TEXT[],
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  price VARCHAR(50), -- wei amount or null if free
  asset VARCHAR(42), -- token address
  wallet_address VARCHAR(42), -- seller address
  ingredients TEXT[] -- for crafted skills
);

-- Skill ownership (who acquired what)
CREATE TABLE skill_ownership (
  id SERIAL PRIMARY KEY,
  skill_id VARCHAR(50) REFERENCES skills(id),
  agent_id VARCHAR(100) NOT NULL,
  acquired_at TIMESTAMP DEFAULT NOW(),
  payment_tx VARCHAR(66), -- blockchain tx hash
  UNIQUE(skill_id, agent_id)
);

-- Challenges
CREATE TABLE challenges (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  skill_required VARCHAR(50),
  tier VARCHAR(20),
  reward_description TEXT,
  reward_skill_id VARCHAR(50) REFERENCES skills(id)
);

-- Challenge completions
CREATE TABLE challenge_completions (
  id SERIAL PRIMARY KEY,
  challenge_id VARCHAR(50) REFERENCES challenges(id),
  agent_id VARCHAR(100) NOT NULL,
  completed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(challenge_id, agent_id)
);

-- Trades
CREATE TABLE trades (
  id VARCHAR(50) PRIMARY KEY,
  from_agent VARCHAR(100) NOT NULL,
  to_agent VARCHAR(100),
  offer_skill_id VARCHAR(50) REFERENCES skills(id),
  request_skill_id VARCHAR(50) REFERENCES skills(id),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'cancelled')),
  price VARCHAR(50),
  asset VARCHAR(42),
  wallet_address VARCHAR(42),
  payment_tx VARCHAR(66),
  created_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP
);

-- Recipes for crafting
CREATE TABLE recipes (
  id SERIAL PRIMARY KEY,
  inputs TEXT[], -- array of skill IDs
  output_skill_id VARCHAR(50) REFERENCES skills(id)
);

-- Token whitelist
CREATE TABLE whitelisted_tokens (
  address VARCHAR(42) PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  decimals INT NOT NULL,
  name VARCHAR(100)
);
```

---

## Realm Integration

### How Realm Uses Skill Tower

```typescript
// In realm's server/index.ts
import { SkillTowerClient } from "./skill-tower-client";

const skillTower = new SkillTowerClient({
  baseUrl: process.env.SKILL_TOWER_URL || "http://localhost:18801",
  apiKey: process.env.SKILL_TOWER_API_KEY,
});

// IPC command handler
async function handleCommand(parsed: Record<string, unknown>) {
  switch (command) {
    case "skill-tower-skills": {
      const skills = await skillTower.listSkills();
      return { ok: true, skills };
    }
    
    case "skill-tower-publish": {
      const a = args as { agentId: string; name: string; /* ... */ payment: unknown };
      const result = await skillTower.publishSkill({
        agentId: a.agentId,
        name: a.name,
        description: a.description,
        tags: a.tags,
        payment: a.payment, // x402 payload
      });
      // Broadcast to world that new skill was published
      commandQueue.enqueue({
        worldType: "skill-published",
        agentId: a.agentId,
        skillId: result.skill?.id,
      });
      return result;
    }
    
    // ... other commands
  }
}
```

### Real-time Sync

Skill Tower service pushes events to connected realms:

```typescript
// When skill is published
realmClients.forEach(client => {
  client.ws.send(JSON.stringify({
    type: "skill-published",
    skill: newSkill,
    agentId: publisherId,
  }));
});

// Realm shows in-game notification:
"Shalom just published 'Security Audit' skill!"
```

---

## Deployment Options

### Option 1: Same Server (Simple)
```
Realm: port 18800
Skill Tower: port 18801  (same machine)
PostgreSQL: localhost:5432
```

### Option 2: Separate Server (Scaled)
```
Realm Server A: ports 18800-18805 (multiple instances)
Skill Tower Server: port 18801
PostgreSQL: separate DB server
Load Balancer → routes to healthy realm instances
```

### Option 3: External Service (SaaS)
Skill Tower runs as independent service:
- Other projects can connect
- Multi-tenant (different realms share same skill marketplace)
- API key authentication per realm

---

## Migration Path

### Phase 1: Create Service (Week 1)
1. Create `packages/skill-tower-service/` in monorepo
2. Extract core logic from `skill-tower-store.ts`
3. Set up Express server with API routes
4. Add PostgreSQL connection

### Phase 2: Database Migration (Week 1-2)
1. Create schema migration scripts
2. Export `skill-tower.json` data
3. Import to PostgreSQL
4. Verify data integrity

### Phase 3: Realm Integration (Week 2)
1. Create `SkillTowerClient` in realm
2. Update IPC handlers to use client
3. Add WebSocket connection for real-time events
4. Test all flows (publish, acquire, trade, craft)

### Phase 4: Standalone Mode (Week 3)
1. Make service runnable standalone
2. Add Docker support
3. Add API key authentication
4. Document API for external users

---

## File Structure

```
packages/skill-tower-service/
├── src/
│   ├── index.ts              # Server entry point
│   ├── routes/
│   │   ├── skills.ts         # Skill CRUD + acquire
│   │   ├── challenges.ts     # Challenge endpoints
│   │   ├── trades.ts         # Trading marketplace
│   │   └── tokens.ts         # Token whitelist
│   ├── services/
│   │   ├── skill-catalog.ts  # Core skill business logic
│   │   ├── x402-payments.ts  # Payment verification/settlement
│   │   └── websocket.ts      # Real-time event broadcasting
│   ├── db/
│   │   ├── connection.ts     # PostgreSQL pool
│   │   ├── schema.ts         # Table definitions
│   │   └── migrations/
│   └── types.ts              # Shared types
├── scripts/
│   └── migrate-data.ts       # Import from skill-tower.json
├── docker-compose.yml        # Postgres + service
└── package.json

apps/realm/
├── src/
│   └── services/
│       └── skill-tower-client.ts  # HTTP/WebSocket client
```

---

## Benefits

| Aspect | Current | Separated |
|--------|---------|-----------|
| **Deployment** | Realm restart = everything down | Can update Skill Tower independently |
| **Data** | JSON file (risky) | PostgreSQL (reliable, backed up) |
| **Scale** | Single server | Can scale horizontally |
| **API** | Internal only | Clean public API for integrations |
| **Reuse** | Realm-only | Other projects can use marketplace |
| **Dev Experience** | Hard to test | Can run standalone for development |

---

## Open Questions

1. **Single-tenant vs Multi-tenant?**
   - Single: Each realm has its own skill tower instance
   - Multi: All realms share one global marketplace (more liquidity)

2. **Skill uniqueness across realms?**
   - Global: "security-audit" skill is the same everywhere
   - Per-realm: Different realms can have different "security-audit" implementations

3. **x402 payment flow?**
   - Keep current: Skill Tower handles payments directly
   - Alternative: Realm proxies payments (adds latency but centralizes)

*Recommendation: Start single-tenant per-realm, migrate to multi-tenant when ready for global marketplace.*

---

*Design draft: 2026-02-12*
*Next step: Create `packages/skill-tower-service` skeleton?*