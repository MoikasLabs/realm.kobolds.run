# 60fps Real-Time World Map

## Overview
The 2D top-down world map has been optimized for 60-120fps real-time performance using WebSocket real-time updates and layered canvas architecture.

## Architecture

### 1. WebSocket Server (`/app/api/ws/route.ts`)
- Socket.IO server at `/api/ws/socket.io`
- Delta updates: Only sends changed agent data (position, status)
- Full state sync on initial connection
- 20 updates/second (50ms interval) - balances latency and CPU

### 2. Layered Canvas (`/components/realm/WorldMap2D.tsx`)
- **Bottom layer (static)**: Zones, grid, background - cached, never redraws
- **Top layer (dynamic)**: Agents only - 60fps RAF updates
- Spatial culling: Only renders visible agents
- Dirty-rectangle rendering: Only clears changed regions

### 3. Real-Time Store (`/lib/store/realtimeStore.ts`)
- Object pooling for agent dots (reuse canvas objects)
- Interpolated positions for smooth movement
- Viewport state management
- Performance metrics tracking

### 4. RequestAnimationFrame Game Loop
- 60fps target (16.67ms frame time)
- Position interpolation between updates
- FPS counter and render time metrics
- Automatic fallback to 30fps if needed

## Key Features

| Feature | Before | After |
|---------|--------|-------|
| Update Frequency | 3-second polling | 50ms WebSocket push |
| Render Strategy | Full canvas redraw | Layered + dirty-rect |
| FPS Target | ~1fps | 60fps |
| Latency | 3000ms | <50ms |
| Architecture | Single canvas | Layered canvases |

## Performance Metrics
The debug overlay shows:
- **FPS**: Current frame rate
- **Frame Time**: Time per frame (target: 16.67ms)
- **Render Time**: Agent layer render time
- **WS Latency**: WebSocket round-trip time
- **Agent Count**: Total agents in world
- **Visible**: Agents currently visible in viewport
- **Interp**: Agents being interpolated

## Usage

```typescript
import { WorldMap2D } from '@/components/realm/WorldMap2D';

// In your page:
<WorldMap2D />
```

## Build
```bash
npm run build
```

## Development
```bash
npm run dev
```

## WebSocket Events

### Client → Server
- `subscribe`: Subscribe to zone updates
- `viewport`: Send viewport for spatial culling
- `ping`: Measure latency

### Server → Client
- `full`: Full state sync (initial connection)
- `delta`: Incremental agent updates
- `pong`: Latency measurement response
- `ping`: Server heartbeat

## Configuration

The WebSocket endpoint uses Socket.IO with fallback to polling:
- Path: `/api/ws/socket.io`
- Transports: `['websocket', 'polling']`
- Reconnection: Enabled with 5 attempts

## Optimization Details

### Position Interpolation
When a delta update arrives with a new position:
1. Store current position as `current`
2. Set new position as `target`
3. Interpolate over 100ms using ease-out-cubic easing
4. Results in smooth agent movement between updates

### Spatial Culling
Agents outside the viewport (plus margin) are skipped during rendering:
```typescript
if (!isAgentVisible(agent)) return;
```

### Dirty Rectangle Rendering
Instead of clearing the entire canvas each frame:
1. Calculate bounding box of previous position
2. Calculate bounding box of current position
3. Clear union of both rectangles
4. Redraw only affected agents

### Object Pooling
Agent objects are reused via the `AgentPool` class to minimize garbage collection:
- New agents: Retrieved from pool or created
- Removed agents: Returned to pool for reuse
- State updates: In-place mutation of pooled objects

## Browser Compatibility
- Chrome/Edge: Full support (60fps)
- Firefox: Full support (60fps)
- Safari: Full support (60fps)
- Mobile: Adaptive frame rate (30-60fps)

## Known Limitations
- Vercel serverless functions have WebSocket time limits (~60s idle)
- Fallback to polling automatically handles reconnection
- For persistent connections, consider self-hosting or using a dedicated WebSocket server
