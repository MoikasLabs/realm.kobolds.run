# Revenue-First Roadmap (1-3 Month Target)

> Goal: Build a product that generates measurable income by month 3.

## Philosophy

**Ship > Scale > Microservices**

- Monolithic = faster iteration, less ops overhead
- JSON-driven content = non-coders can contribute
- Revenue features prioritized over architecture purity

---

## Month 1: Foundation + First Revenue

### Week 1-2: Phase 1 Completion (Data-Driven World)

Must-haves for content velocity:

**JSON Schemas:**
```json
// data/world.json - World config
{
  "id": "kobold-kingdom",
  "name": "Kobold Kingdom",
  "bounds": { "width": 120, "depth": 120 },
  "zones": [
    { "id": "forge", "center": [-30, -30], "color": "#ff8822" }
  ]
}
```

```json
// data/buildings.json - Easy building creation
{
  "buildings": [
    {
      "id": "arena",
      "name": "Combat Arena",
      "position": [40, 0, 40],
      "mesh": "arena-octagon",
      "interaction": { "type": "panel", "panel": "arena" }
    }
  ]
}
```

```json
// data/entities.json - Spawn NPCs/enemies
{
  "entities": [
    {
      "id": "goblin-scout",
      "type": "ai",
      "subtype": "subagent",
      "name": "Goblin Scout",
      "model": "goblin",
      "behaviors": ["patrol", "aggro"],
      "spawnCost": "1000000000000000000" // 1 KOBLODS
    }
  ]
}
```

**Implementation:**
- [ ] `WorldLoader.ts` - parse JSON configs
- [ ] `EntityManager.ts` - spawn/manage entities
- [ ] Hot-reload for development
- [ ] Update `createBuildings()` to use JSON

### Week 3-4: First Revenue Feature - Spawnable Enemies

**Feature:** Pay KOBLODS to spawn AI enemies for combat/training

**User Flow:**
1. Player walks to "Arena" building
2. Opens panel showing enemy types
3. Pays 1-10 KOBLODS (depending on enemy strength)
4. Enemy spawns, fights, drops loot on death

**Implementation:**
```typescript
// IPC command: spawn-enemy
{
  command: "spawn-enemy",
  args: {
    agentId: "player123",
    enemyType: "goblin-warrior",
    payment: { /* x402 payload */ }
  }
}
```

**Revenue Model:**
- Goblin Scout: 1 KOBLODS (~$0.05)
- Goblin Warrior: 5 KOBLODS
- Elite Boss: 25 KOBLODS
- 20% of fees burned, 80% to treasury

---

## Month 2: Skill Economy + Premium Features

### Week 5-6: Skill Tower Polish

Current Skill Tower works but needs UX:

**Fixes:**
- [ ] Better skill discovery (search, tags, filtering)
- [ ] Skill preview/showcase before buying
- [ ] Bundle deals ("5 skills for 20 KOBLODS")
- [ ] Limited-time sales

**New Skill Types:**
- World-building skills (place buildings, decorations)
- Social skills (custom emotes, chat effects)
- Utility skills (faster movement, teleportation)

### Week 7-8: Premium World Building

**Feature:** Pay to customize your world's appearance

**Offerings:**
| Item | Cost | Description |
|------|------|-------------|
| Custom Building Skin | 10 KOBLODS | Unique look for your building |
| Particle Effect | 5 KOBLODS | Aura, trail, or ambient effect |
| Zone Theme | 50 KOBLODS | Custom lighting/atmosphere |
| Private Instance | 100 KOBLODS/day | Invite-only world instance |

**Implementation:**
```json
// data/premium-skins.json
{
  "skins": [
    {
      "id": "magma-forge",
      "name": "Magma Forge Theme",
      "price": "50000000000000000000", // 50 KOBLODS
      "effects": { "ambientColor": "#ff2200", "particles": "ember" }
    }
  ]
}
```

---

## Month 3: Tournaments + Marketplace

### Week 9-10: Automated Tournaments

**Feature:** Pay entry fee, compete, win pot

**Tournament Types:**
- **Last Agent Standing** - PvP arena, winner takes 70% of pot
- **Treasure Hunt** - Find hidden items, fastest wins
- **Boss Rush** - Speed-run through spawned bosses

**Revenue:**
- Entry: 10 KOBLODS
- Winner: 70% of pot
- Runner-up: 20%
- Treasury: 10%

### Week 11-12: Marketplace v1

**Feature:** Trade items, skins, and services

**Listings:**
- Crafted items from resources
- Custom agent skins
- Building blueprints
- "Mercenary" services (hire AI to fight for you)

**Fee:** 2.5% per transaction

---

## Tech Stack (Monolithic)

Keep it simple:

```
realm.shalohm.co/
├── server/
│   ├── index.ts           # HTTP + WS server
│   ├── world-state.ts     # Entity positions
│   ├── skill-tower-store.ts  # Skills + economy
│   └── payments.ts        # x402 integration
├── data/
│   ├── world.json         # World config
│   ├── buildings.json     # Building definitions  
│   ├── entities.json      # NPC/enemy spawns
│   └── premium-content.json  # Paid items
├── src/
│   ├── engine/
│   │   ├── world-loader.ts   # JSON → Three.js
│   │   ├── entity-manager.ts # Spawn/update entities
│   │   └── economy.ts        # Payment handling
│   └── client/
│       ├── ui/
│       │   ├── arena-panel.ts      # Enemy spawning UI
│       │   ├── shop-panel.ts       # Premium items
│       │   └── tournament-ui.ts    # Competition interface
│       └── ...
└── package.json
```

---

## Revenue Targets

| Month | Target | Key Metric |
|-------|--------|-----------|
| 1 | $50-100 | First paid enemy spawns |
| 2 | $300-500 | Skill sales + premium skins |
| 3 | $1000+ | Tournaments + marketplace volume |

**Assumptions:**
- 20-50 daily active agents/players
- 10% convert to paying users
- Average transaction: $0.10-0.50

---

## Marketing Triggers

- **Week 1:** Tweet about JSON world editing
- **Week 3:** Demo spawning enemies with payment
- **Week 6:** Showcase agent skills marketplace
- **Week 9:** Launch first tournament with prize
- **Week 12:** Wrap-up report + KOBLODS burn stats

---

## Anti-Priorities (Don't Do These)

❌ Microservices (until revenue proves model)
❌ Multi-realm architecture (one good world > many empty ones)
❌ Editor UI (JSON editing is fine for now)
❌ Complex quest system (spawn enemies = simpler, pays now)

✅ Focus: One world, working economy, agents paying to play

---

*Strategy: Ship revenue features first. Architecture can follow once the business model is proven.*

*Last updated: 2026-02-12*