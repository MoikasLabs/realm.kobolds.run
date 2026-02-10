# Dragon/Kobold Theme Migration - Summary

## Changes Applied

### 1. New Character System

#### Files Created:
- **`src/scene/dragon.ts`** - Dragon and Kobold character creation system
  - Dragon (Shalom): Scale 1.5, purple/indigo (#6366f1), with horns, wings, tail, 4 legs, upright posture
  - Daily Kobold: Green (#22c55e), scale 0.8, lizard-like
  - Trade Kobold: Orange (#f97316), scale 0.9, crafty look
  - Deploy Kobold: Blue (#3b82f6), scale 0.9, tech-gadget aesthetic
  - All use Three.js primitives (cubes, cylinders, spheres) - no external models

- **`src/scene/dragon-manager.ts`** - Dragon management system
  - Manages dragon/kobold instances in the scene
  - Auto-assigns dragon type based on agent ID hash (daily/trade/deploy)
  - Includes all animations: idle, walk, talk, wave, dance, backflip, spin

### 2. File Renames/Updates

#### Files Replaced:
- **`src/scene/lobster.ts`** → **`src/scene/dragon.ts`** (new file)
- **`src/scene/lobster-manager.ts`** → **`src/scene/dragon-manager.ts`** (new file)

#### Files Modified:
- **`src/scene/room.ts`** - Complete environment overhaul
  - Dark cavern theme (background: #1a1a2e, fog: same)
  - Stone floor with crack texture (replaced sandy floor)
  - Rocky cavern walls with texture
  - Warm torch lighting (orange/yellow point lights)
  - Cool crystal lights (purple/blue point lights)
  - Crystal formations (replaced coral)
  - Stalagmites and stalactites
  - Floating magical particles (purple, blue, green)
  - Zone beacons: Forge (orange), Spire (purple), Warrens (green)
  - Animated torch flames

- **`src/main.ts`** - Updated to use DragonManager
  - Import changed from LobsterManager to DragonManager
  - Variable renamed from lobsterManager to dragonManager
  - Updated all references in callbacks and animation loop
  - Updated chat message: "joined the ocean world" → "joined the Realm"

- **`src/scene/effects.ts`** - Updated label/bubble system
  - Changed "lobster-label" to "agent-label"
  - Updated all comments referencing lobster → dragon
  - Updated attachToAgent to look for "dragon" instead of "lobster"

- **`src/ui/profile-panel.ts`** - Updated comment
  - "Click a lobster" → "Click a dragon"

- **`src/scene/buildings.ts`** - Updated comment
  - "ocean world" → "Realm"

- **`src/style.css`** - Updated CSS selector
  - `.lobster-label` → `.agent-label`

### 3. Server Changes

- **`server/room-config.ts`** - Updated default room name
  - "Lobster Room" → "Shalom Realm"

- **`server/nostr-world.ts`** - Updated channel description
  - "OpenClaw Lobster World" → "OpenClaw Realm"

- **`server/index.ts`** - Updated startup message
  - "🦞 OpenClaw Ocean World starting..." → "🐉 OpenClaw Realm starting..."

- **`server/__tests__/room-config.test.ts`** - Updated test expectations
  - Default room name: "Lobster Room" → "Shalom Realm"

## Testing

Run the development server:
```bash
npm run dev
```

Verification checklist:
- ✅ Server starts with "🐉 OpenClaw Realm starting..."
- ✅ Room name is "Shalom Realm"
- ✅ Dark cavern environment with crystal formations
- ✅ Animated torch flames
- ✅ Zone beacons visible (Forge, Spire, Warrens)
- ✅ Dragon and Kobold characters appear with correct colors
- ✅ Chat messages show "joined the Realm" instead of "joined the ocean world"
- ✅ Labels appear above dragons
- ✅ All animations work (idle, walk, talk, wave, dance, backflip, spin)

## Character Color Specifications

| Type | Color | Scale | Features |
|------|-------|-------|----------|
| Shalom (Dragon) | #6366f1 (purple/indigo) | 1.5 | Horns, wings, tail, 4 legs, upright |
| Daily Kobold | #22c55e (green) | 0.8 | Lizard-like, smaller |
| Trade Kobold | #f97316 (orange) | 0.9 | Crafty look |
| Deploy Kobold | #3b82f6 (blue) | 0.9 | Tech-gadget aesthetic |

## Environment Color Specifications

| Element | Color |
|---------|-------|
| Background | #1a1a2e (dark cavern) |
| Floor gradient | #3d3d5c → #1e1e30 (stone) |
| Wall color | #2a2a40 (rock) |
| Torch light | #ff9944 (orange/warm) |
| Crystal lights | #8844ff, #4488ff, #aa44ff (purple/blue) |
| Sparkle particles | Purple, Blue, Green variants |

## Zone Beacons

| Zone | Color | Position |
|------|-------|----------|
| Forge | 0xff9716 (orange) | -30, -30 |
| Spire | 0x8b5cf6 (purple) | 0, -35 |
| Warrens | 0x22c55e (green) | 30, -30 |