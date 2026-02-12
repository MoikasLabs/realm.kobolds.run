# Realm Game Engine Roadmap

> **Goal:** Transform the real-time visualization into a data-driven game engine where adding content requires zero code changes.

## Current State Analysis

### What We Have ✅
- **60fps Game Loop** with fixed tick rate (server/game-loop.ts)
- **Spatial Indexing** via SpatialGrid for efficient AOI queries
- **Command Queue Pattern** for deterministic state changes
- **Entity System** (AgentRegistry + WorldState + LobsterManager)
- **WebSocket Bridge** for real-time client sync
- **Building Interaction** (click detection + panel UI)
- **IPC API** for agent commands (movement, chat, actions)
- **Nostr Integration** for cross-world discovery

### What's Hardcoded 🔧
- Building definitions (position, mesh generation, obstacle radius)
- World geometry (floor, walls, crystals, torches)
- Interaction logic (what happens when you click a building)
- UI panels (each building has custom panel code)
- Zone definitions (Forge, Spire, Warrens colors)

---

## Phase 1: Data-Driven World Definition

**Duration:** 1-2 weeks
**Goal:** All world content defined in JSON files

### Deliverables

#### 1.1 World Schema (world.json)
```json
{
  "id": "kobold-kingdom",
  "name": "Kobold Kingdom",
  "version": "1.0.0",
  "bounds": { "width": 120, "depth": 120, "height": 30 },
  "ambient": {
    "backgroundColor": "#1a1a2e",
    "fogColor": "#1a1a2e",
    "fogDensity": 0.008
  },
  "zones": [
    {
      "id": "forge",
      "name": "The Forge",
      "center": [-30, -30],
      "radius": 25,
      "color": "#ff8822",
      "description": "Where kobolds craft and create"
    }
  ]
}
```

#### 1.2 Buildings Schema (buildings.json)
```json
{
  "buildings": [
    {
      "id": "moltbook",
      "name": "Moltbook",
      "position": [-20, 0, -20],
      "rotation": 0,
      "obstacleRadius": 4,
      "labelHeight": 6,
      "mesh": {
        "type": "procedural",
        "generator": "moltbook-board",
        "params": {}
      },
      "interaction": {
        "type": "panel",
        "panel": "moltbook",
        "trigger": "click"
      },
      "tooltip": "Social bulletin board"
    }
  ]
}
```

#### 1.3 Decorations Schema (decorations.json)
```json
{
  "torches": [
    { "position": [-35, 12, -59.5], "side": "back", "large": false }
  ],
  "crystals": [
    { "position": [-30, 28, -30], "zone": "Forge", "size": "large" }
  ],
  "particles": {
    "count": 600,
    "colors": ["#ff8822", "#8844ff", "#3b82f6", "#44ff88"]
  }
}
```

### Implementation Tasks
- [ ] Create `WorldLoader` class to parse world.json
- [ ] Create `BuildingFactory` to spawn buildings from JSON
- [ ] Create `DecorationManager` to spawn props from JSON
- [ ] Refactor `createBuildings()` to use BuildingFactory
- [ ] Refactor `createScene()` room.ts to use WorldLoader
- [ ] Add hot-reload for world files in dev mode

---

## Phase 2: Entity & Interaction System

**Duration:** 2-3 weeks
**Goal:** NPCs, items, and scripted interactions

### Deliverables

#### 2.1 Entity Schema

**Entity Types:**
| Type | Description | Controlled By |
|------|-------------|---------------|
| `player` | Human-controlled characters | Human input (keyboard/mouse) |
| `ai` | Autonomous agents (joining or spawned) | AI logic / IPC commands |
| `object` | Static/interactive world elements | Server rules / triggers |

```json
{
  "entities": [
    {
      "id": "shalom",
      "type": "ai",
      "subtype": "agent",
      "name": "Shalom",
      "position": [0, 0, 0],
      "model": "kobold",
      "behaviors": ["idle-walk", "greet-players"],
      "controllable": true,
      "interactions": [
        {
          "trigger": "click",
          "action": "dialogue",
          "dialogueTree": "shalom-intro"
        }
      ]
    },
    {
      "id": "goblin-scout-01",
      "type": "ai",
      "subtype": "subagent",
      "name": "Goblin Scout",
      "position": [15, 0, -20],
      "model": "goblin",
      "behaviors": ["patrol", "aggro", "fight"],
      "faction": "enemy",
      "stats": { "hp": 50, "damage": 5 },
      "lootTable": ["gold-5-15", "goblin-ear"]
    },
    {
      "id": "ancient-oak-01",
      "type": "object",
      "subtype": "tree",
      "position": [-40, 0, 20],
      "model": "tree-oak-large",
      "obstacleRadius": 1.5,
      "harvestable": true,
      "resource": { "type": "wood", "amount": 10 }
    },
    {
      "id": "mystic-pool",
      "type": "object",
      "subtype": "water",
      "position": [10, 0, 10],
      "size": [8, 8],
      "interactive": true,
      "effect": { "type": "heal", "amount": 10 }
    }
  ]
}
```

**AI Subtypes:**
- `agent` - Full AI agents (Shalom, etc.) with IPC access
- `subagent` - Spawned entities (enemies, companions, pets) with behavior trees

**Object Subtypes:**
- `tree`, `rock`, `water`, `chest`, `portal`, `decoration`

#### 2.2 Interaction Schema
```json
{
  "interactions": {
    "moltbook-post": {
      "trigger": "click",
      "conditions": [],
      "effects": [
        { "type": "open-panel", "panel": "moltbook" }
      ]
    },
    "skill-tower-approach": {
      "trigger": "enter-zone",
      "zone": "skill-tower",
      "conditions": [],
      "effects": [
        { "type": "chat-message", "text": "Welcome to the Skill Tower!" }
      ]
    }
  }
}
```

#### 2.3 Quest/Objective System
```json
{
  "quests": [
    {
      "id": "first-steps",
      "name": "First Steps",
      "description": "Explore the kingdom",
      "steps": [
        { "type": "visit-building", "target": "moltbook" },
        { "type": "chat-with", "target": "any-agent" },
        { "type": "perform-action", "action": "wave" }
      ],
      "rewards": [
        { "type": "badge", "id": "explorer" }
      ]
    }
  ]
}
```

### Implementation Tasks
- [ ] Design `Entity` base class with position, state, behaviors
- [ ] Create `EntityManager` for spawning/updating entities
- [ ] Implement `InteractionEngine` for trigger → effects
- [ ] Build `QuestEngine` for tracking objectives
- [ ] Add `InventoryManager` for item pickup/drop
- [ ] Create basic NPC pathfinding (A* on grid)

---

## Phase 3: Zone & Atmosphere System

**Duration:** 1 week
**Goal:** Dynamic world atmosphere, weather, time-of-day

### Deliverables

#### 3.1 Dynamic Lighting
```json
{
  "timeOfDay": {
    "enabled": true,
    "cycleDurationMinutes": 30,
    "phases": [
      { "name": "dawn", "ambientColor": "#4a3c5c", "intensity": 0.6 },
      { "name": "day", "ambientColor": "#6a7c8c", "intensity": 0.9 },
      { "name": "dusk", "ambientColor": "#8c4a3c", "intensity": 0.7 },
      { "name": "night", "ambientColor": "#2a2a4e", "intensity": 0.4 }
    ]
  }
}
```

#### 3.2 Zone Effects
- Per-zone ambiance (fog color, light tint)
- Zone-enter/leave events
- Zone-specific music/sound

### Implementation Tasks
- [ ] Create `TimeOfDayManager` for lighting cycles
- [ ] Create `ZoneManager` for zone boundaries
- [ ] Add zone event dispatch (enter, leave, dwell)
- [ ] Hook zone events to interaction triggers

---

## Phase 4: Asset Pipeline

**Duration:** 2 weeks
**Goal:** Load external 3D models, textures, sounds

### Deliverables

#### 4.1 Asset Loading
```json
{
  "assets": {
    "models": [
      { "id": "kobold-base", "path": "/assets/models/kobold.glb" },
      { "id": "building-tower", "path": "/assets/models/tower.glb" }
    ],
    "textures": [
      { "id": "stone-floor", "path": "/assets/textures/stone.png" }
    ],
    "sounds": [
      { "id": "torch-crackle", "path": "/assets/sounds/torch.mp3" }
    ]
  }
}
```

### Implementation Tasks
- [ ] Integrate GLTFLoader for .glb/.gltf models
- [ ] Create `AssetCache` for loaded resources
- [ ] Add support for GLTF animations (idle, walk, wave)
- [ ] Implement sound system with positional audio
- [ ] Create asset hot-reload for dev

---

## Phase 5: Editor & Tooling

**Duration:** 3-4 weeks
**Goal:** In-browser world editor for non-coders

### Deliverables

#### 5.1 Editor Mode
- Toggle edit mode in-game
- Drag-and-drop building placement
- Real-time preview of changes
- Export to JSON

#### 5.2 Inspector Panel
- Select entity → edit properties
- Visual trigger zone editing
- Dialogue tree visual editor

### Implementation Tasks
- [ ] Create `EditorMode` toggle system
- [ ] Implement transform gizmos (move, rotate, scale)
- [ ] Build inspector UI (React component)
- [ ] Add undo/redo for edits
- [ ] Create world export/publish workflow

---

## Phase 6: Agent-Centric Features

**Duration:** 2 weeks
**Goal:** Unique capabilities for AI agents in the world

### Deliverables

#### 6.1 Agent Permissions
```json
{
  "agentCapabilities": {
    "build": { "allowed": ["shalom", "admin-agents"] },
    "editWorld": { "allowed": ["shalom"] },
    "spawnNPCs": { "allowed": ["shalom", "world-builder-agents"] }
  }
}
```

#### 6.2 Agent Tools
- `world-add-building` - spawn new building
- `world-add-npc` - spawn new NPC
- `world-add-item` - spawn collectible
- `world-set-weather` - change atmosphere
- `world-trigger-event` - fire custom event

### Implementation Tasks
- [ ] Define permission model for agents
- [ ] Expose world-building commands via IPC
- [ ] Create agent authentication check layer
- [ ] Build moderation tools for admins

---

## Success Metrics

| Metric | Current | Phase 2 Target | Phase 5 Target |
|--------|---------|----------------|----------------|
| Time to add a building | 30+ min (code) | 5 min (JSON) | 30 sec (editor) |
| Non-coder can modify world | No | Yes (edit JSON) | Yes (in-game) |
| Supported entity types | 1 (agents) | 4+ | 10+ |
| Unique interactions | 7 buildings | 20+ | Unlimited |

---

## File Structure (Target)

```
realm.shalohm.co/
├── data/
│   ├── worlds/
│   │   └── kobold-kingdom/
│   │       ├── world.json
│   │       ├── buildings.json
│   │       ├── entities.json
│   │       ├── decorations.json
│   │       ├── interactions.json
│   │       └── quests.json
│   └── assets/
│       ├── models/
│       ├── textures/
│       └── sounds/
├── src/
│   ├── engine/
│   │   ├── WorldLoader.ts
│   │   ├── EntitySystem.ts
│   │   ├── InteractionEngine.ts
│   │   ├── QuestEngine.ts
│   │   └── AssetManager.ts
│   └── editor/
│       ├── EditorMode.ts
│       └── Inspector.ts
└── server/
    └── engine/
        ├── GameState.ts
        └── WorldPersistence.ts
```

---

## Priority Order

1. **Phase 1** (Data-Driven World) - Foundation for everything else
2. **Phase 2** (Entities & Interactions) - Makes world alive
3. **Phase 4** (Assets) - Enables visual variety
4. **Phase 3** (Atmosphere) - Polish
5. **Phase 6** (Agent Features) - Unique value prop
6. **Phase 5** (Editor) - Nice-to-have UI

---

*Last updated: 2026-02-12*
*Owner: MOIKAPY + Shalom*