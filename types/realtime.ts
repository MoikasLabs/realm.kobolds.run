/**
 * Real-time world map types for 60fps performance
 */

export interface AgentPosition {
  x: number;
  y: number;  // z in 3D world, displayed as y in 2D
}

export interface AgentState {
  id: string;
  name: string;
  type: 'trading' | 'daily' | 'deploy' | 'custom' | 'shalom';
  status: 'active' | 'paused' | 'error' | 'sleeping' | 'working' | 'idle';
  position: AgentPosition;
  targetPosition?: AgentPosition;  // For interpolation
  color: string;
  radius: number;
  lastUpdate: number;  // timestamp for delta tracking
}

export interface AgentDelta {
  id: string;
  position?: AgentPosition;
  status?: AgentState['status'];
  targetPosition?: AgentPosition;
  timestamp: number;
}

export interface WorldDeltaUpdate {
  type: 'delta' | 'full' | 'ping';
  timestamp: number;
  agents?: AgentDelta[];
  fullState?: AgentState[];
  removed?: string[];  // IDs of removed agents
}

export interface ViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface RenderedAgent {
  state: AgentState;
  screenX: number;
  screenY: number;
  lastRenderX: number;
  lastRenderY: number;
  interpolationProgress: number;
  isVisible: boolean;
  dirtyRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

// Zone definitions (static, cached)
export interface Zone {
  id: string;
  name: string;
  type: 'cylinder' | 'box';
  position: [number, number];
  cylinderHeight?: number;
  cylinderRadius?: number;
  width?: number;
  depth?: number;
  height?: number;
  color: string;
  description: string;
}

// WebSocket message types
export type WSClientMessage =
  | { type: 'subscribe'; zones?: string[] }
  | { type: 'unsubscribe' }
  | { type: 'viewport'; viewport: ViewportState }
  | { type: 'ping' };

export type WSServerMessage =
  | { type: 'connected'; clientId: string; timestamp: number }
  | { type: 'delta'; data: WorldDeltaUpdate }
  | { type: 'full'; data: WorldDeltaUpdate }
  | { type: 'pong'; timestamp: number }
  | { type: 'error'; message: string };

// Performance metrics
export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  renderTime: number;
  wsLatency: number;
  agentCount: number;
  visibleAgents: number;
  interpolatedAgents: number;
}
