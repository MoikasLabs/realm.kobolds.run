import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  AgentState,
  AgentDelta,
  WorldDeltaUpdate,
  ViewportState,
  Zone,
  PerformanceMetrics
} from '@/types/realtime';

// Static zone definitions - cached, never changes at runtime
export const STATIC_ZONES: Zone[] = [
  {
    id: 'perch',
    name: "Dragon's Perch",
    type: 'cylinder',
    position: [0, 0],
    cylinderHeight: 2,
    cylinderRadius: 15,
    color: '#6366f1',
    description: 'Central hub where Shalom resides - moicad cylinder(2, 15, true)'
  },
  {
    id: 'warrens',
    name: "The Warrens",
    type: 'box',
    position: [-30, 20],
    width: 20,
    depth: 16,
    height: 2,
    color: '#22c55e',
    description: 'Home of Daily Kobold - moicad square([20, 16]).linearExtrude(2, true)'
  },
  {
    id: 'forge',
    name: "The Forge",
    type: 'box',
    position: [35, -20],
    width: 18,
    depth: 14,
    height: 2,
    color: '#f97316',
    description: 'Trading operations - moicad square([18, 14]).linearExtrude(2, true)'
  },
  {
    id: 'plaza',
    name: "Gateway Plaza",
    type: 'box',
    position: [0, 40],
    width: 25,
    depth: 20,
    height: 2,
    color: '#a855f7',
    description: 'Entry point for visitors - moicad square([25, 20]).linearExtrude(2, true)'
  },
  {
    id: 'townhall',
    name: "Town Hall",
    type: 'box',
    position: [10, 10],
    width: 12,
    depth: 12,
    height: 2,
    color: '#eab308',
    description: 'Administrative center - moicad square([12, 12]).linearExtrude(2, true)'
  }
];

// Agent object pool for canvas rendering
class AgentPool {
  private pool: Map<string, AgentState> = new Map();
  private active: Set<string> = new Set();

  acquire(id: string, initialState: Partial<AgentState>): AgentState {
    const existing = this.pool.get(id);
    if (existing) {
      this.active.add(id);
      return { ...existing, ...initialState, id };
    }

    const newAgent: AgentState = {
      id,
      name: initialState.name || 'Unknown',
      type: initialState.type || 'custom',
      status: initialState.status || 'idle',
      position: initialState.position || { x: 0, y: 0 },
      targetPosition: initialState.targetPosition,
      color: initialState.color || '#6b7280',
      radius: initialState.radius || 4,
      lastUpdate: Date.now()
    };

    this.pool.set(id, newAgent);
    this.active.add(id);
    return newAgent;
  }

  release(id: string): void {
    this.active.delete(id);
  }

  get(id: string): AgentState | undefined {
    return this.pool.get(id);
  }

  getActive(): AgentState[] {
    return Array.from(this.active).map(id => this.pool.get(id)!).filter(Boolean);
  }

  update(id: string, delta: AgentDelta): boolean {
    const agent = this.pool.get(id);
    if (!agent) return false;

    if (delta.position) {
      agent.position = delta.position;
    }
    if (delta.status) {
      agent.status = delta.status;
    }
    if (delta.targetPosition) {
      agent.targetPosition = delta.targetPosition;
    }
    agent.lastUpdate = delta.timestamp || Date.now();
    return true;
  }

  clear(): void {
    this.active.clear();
  }
}

// Store interface
interface RealtimeStore {
  // Agent state
  agentPool: AgentPool;
  agents: Map<string, AgentState>;

  // Viewport
  viewport: ViewportState;

  // Connection state
  isConnected: boolean;
  lastPing: number;
  wsLatency: number;

  // Performance metrics (throttled updates)
  metrics: PerformanceMetrics;

  // Visibility culling
  visibleAgentIds: Set<string>;

  // Zone selection
  selectedZone: Zone | null;
  hoveredZone: string | null;

  // Actions
  updateViewport: (viewport: Partial<ViewportState>) => void;
  applyDeltaUpdate: (update: WorldDeltaUpdate) => void;
  setConnectionState: (connected: boolean) => void;
  updatePing: (latency: number) => void;
  updateMetrics: (metrics: Partial<PerformanceMetrics>) => void;
  setVisibleAgents: (ids: Set<string>) => void;
  selectZone: (zone: Zone | null) => void;
  setHoveredZone: (zoneId: string | null) => void;
  worldToScreen: (x: number, y: number) => [number, number];
  screenToWorld: (sx: number, sy: number) => [number, number];
}

export const useRealtimeStore = create<RealtimeStore>()(
  subscribeWithSelector((set, get) => ({
    agentPool: new AgentPool(),
    agents: new Map(),

    viewport: {
      scale: 8,
      offsetX: 0,
      offsetY: 0,
      width: 800,
      height: 600
    },

    isConnected: false,
    lastPing: 0,
    wsLatency: 0,

    metrics: {
      fps: 0,
      frameTime: 0,
      renderTime: 0,
      wsLatency: 0,
      agentCount: 0,
      visibleAgents: 0,
      interpolatedAgents: 0
    },

    visibleAgentIds: new Set(),

    selectedZone: null,
    hoveredZone: null,

    updateViewport: (viewport) => {
      set((state) => ({
        viewport: { ...state.viewport, ...viewport }
      }));
    },

    applyDeltaUpdate: (update) => {
      const { agentPool, agents } = get();

      if (update.type === 'full' && update.fullState) {
        // Full state refresh
        agentPool.clear();
        agents.clear();

        for (const agent of update.fullState) {
          const pooled = agentPool.acquire(agent.id, agent);
          agents.set(agent.id, pooled);
        }
      } else if (update.type === 'delta' && update.agents) {
        // Delta update
        for (const delta of update.agents) {
          if (!agents.has(delta.id)) {
            // New agent
            const pooled = agentPool.acquire(delta.id, {
              position: delta.position,
              status: delta.status,
              targetPosition: delta.targetPosition
            });
            agents.set(delta.id, pooled);
          } else {
            // Update existing
            agentPool.update(delta.id, delta);
          }
        }
      }

      // Remove agents
      if (update.removed) {
        for (const id of update.removed) {
          agents.delete(id);
          agentPool.release(id);
        }
      }

      set({
        agents: new Map(agents),
        metrics: {
          ...get().metrics,
          agentCount: agents.size
        }
      });
    },

    setConnectionState: (connected) => {
      set({ isConnected: connected });
    },

    updatePing: (latency) => {
      set({
        lastPing: Date.now(),
        wsLatency: latency,
        metrics: { ...get().metrics, wsLatency: latency }
      });
    },

    // Throttled metrics update - prevents React Error #185
    updateMetrics: (metrics) => {
      set((state) => ({
        metrics: { ...state.metrics, ...metrics }
      }));
    },

    setVisibleAgents: (ids) => {
      set({
        visibleAgentIds: ids,
        metrics: {
          ...get().metrics,
          visibleAgents: ids.size
        }
      });
    },

    selectZone: (zone) => {
      set({ selectedZone: zone });
    },

    setHoveredZone: (zoneId) => {
      set({ hoveredZone: zoneId });
    },

    worldToScreen: (x, y) => {
      const v = get().viewport;
      const screenX = v.width / 2 + (x * v.scale) + v.offsetX;
      const screenY = v.height / 2 - (y * v.scale) + v.offsetY;
      return [screenX, screenY];
    },

    screenToWorld: (sx, sy) => {
      const v = get().viewport;
      const worldX = (sx - v.width / 2 - v.offsetX) / v.scale;
      const worldY = -(sy - v.height / 2 - v.offsetY) / v.scale;
      return [worldX, worldY];
    }
  }))
);

// Selector hooks for performance - only re-render when specific values change
export const useViewport = () => useRealtimeStore((state) => state.viewport);
export const useAgents = () => useRealtimeStore((state) => state.agents);
export const useVisibleAgentIds = () => useRealtimeStore((state) => state.visibleAgentIds);
export const useMetrics = () => useRealtimeStore((state) => state.metrics);
export const useConnectionState = () => useRealtimeStore((state) => state.isConnected);
export const useSelectedZone = () => useRealtimeStore((state) => state.selectedZone);
export const useHoveredZone = () => useRealtimeStore((state) => state.hoveredZone);
export const useZones = () => STATIC_ZONES;

// ======= NON-REACTIVE RENDER LOOP =======
// This runs completely outside React to avoid Error #185 (infinite loop)

export interface RenderLoopState {
  rafId: number;
  lastFrameTime: number;
  frameCount: number;
  lastFpsUpdate: number;
  lastMetricsPush: number;
  viewport: ViewportState;
  agents: Map<string, AgentState>;
  interpolatedPositions: Map<string, {
    current: { x: number; y: number };
    target: { x: number; y: number };
    startTime: number;
    duration: number;
  }>;
}

// Initialize the non-reactive render state
export function createRenderLoopState(initialViewport: ViewportState, initialAgents: Map<string, AgentState>): RenderLoopState {
  return {
    rafId: 0,
    lastFrameTime: 0,
    frameCount: 0,
    lastFpsUpdate: performance.now(),
    lastMetricsPush: performance.now(),
    viewport: initialViewport,
    agents: new Map(initialAgents),
    interpolatedPositions: new Map()
  };
}

// Update render state from React (call sparingly)
export function updateRenderState(loopState: RenderLoopState, update: {
  viewport?: ViewportState;
  agents?: Map<string, AgentState>;
}): void {
  if (update.viewport) {
    loopState.viewport = update.viewport;
  }
  if (update.agents) {
    loopState.agents = new Map(update.agents);
  }
}

// Get metrics to push to React (call at most every 100ms)
export function getThrottledMetrics(loopState: RenderLoopState, timestamp: number, metrics: {
  fps?: number;
  frameTime?: number;
  renderTime?: number;
  visibleAgents?: number;
  interpolatedAgents?: number;
  wsLatency?: number;
}): Partial<PerformanceMetrics> | null {
  // Only push metrics every 100ms (max 10 state updates/sec instead of 60)
  if (timestamp - loopState.lastMetricsPush < 100) {
    return null;
  }
  loopState.lastMetricsPush = timestamp;
  
  return {
    fps: metrics.fps ?? loopState.frameCount,
    frameTime: metrics.frameTime ?? 0,
    renderTime: metrics.renderTime ?? 0,
    visibleAgents: metrics.visibleAgents ?? 0,
    interpolatedAgents: metrics.interpolatedAgents ?? 0,
    wsLatency: metrics.wsLatency ?? 0
  };
}
