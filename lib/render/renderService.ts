/**
 * Canvas Rendering Service
 * 
 * Extracted render loop and canvas management logic for reusability.
 * Manages 60fps animation loop outside of React to avoid performance issues.
 */

import type { AgentState, ViewportState, Zone } from '@/types/realtime';

// Performance constants
export const RENDER_CONSTANTS = {
  TARGET_FPS: 60,
  FRAME_TIME: 1000 / 60,
  INTERPOLATION_DURATION: 100,
  METRICS_THROTTLE_MS: 100,
  DIRTY_RECT_PADDING: 10,
} as const;

/**
 * Interpolated position state for smooth agent movement
 */
export interface InterpolatedPosition {
  current: { x: number; y: number };
  target: { x: number; y: number };
  startTime: number;
  duration: number;
}

/**
 * Render state for the animation loop (kept outside React)
 */
export interface RenderState {
  rafId: number;
  frameCount: number;
  lastFpsUpdate: number;
  lastMetricsPush: number;
  renderTime: number;
  visibleCount: number;
  interpolatedCount: number;
  interpolatedPositions: Map<string, InterpolatedPosition>;
}

/**
 * Initialize render state
 */
export function createInitialRenderState(): RenderState {
  return {
    rafId: 0,
    frameCount: 0,
    lastFpsUpdate: performance.now(),
    lastMetricsPush: performance.now(),
    renderTime: 0,
    visibleCount: 0,
    interpolatedCount: 0,
    interpolatedPositions: new Map(),
  };
}

/**
 * Convert world coordinates to screen coordinates
 */
export function worldToScreen(
  x: number,
  y: number,
  viewport: ViewportState
): [number, number] {
  const screenX = viewport.width / 2 + (x * viewport.scale) + viewport.offsetX;
  const screenY = viewport.height / 2 - (y * viewport.scale) + viewport.offsetY;
  return [screenX, screenY];
}

/**
 * Convert screen coordinates to world coordinates
 */
export function screenToWorld(
  sx: number,
  sy: number,
  viewport: ViewportState
): [number, number] {
  const worldX = (sx - viewport.width / 2 - viewport.offsetX) / viewport.scale;
  const worldY = -(sy - viewport.height / 2 - viewport.offsetY) / viewport.scale;
  return [worldX, worldY];
}

/**
 * Check if an agent is visible in the current viewport
 */
export function isAgentVisible(
  agent: AgentState,
  viewport: ViewportState
): boolean {
  const [x, y] = worldToScreen(agent.position.x, agent.position.y, viewport);
  const margin = (agent.radius + RENDER_CONSTANTS.DIRTY_RECT_PADDING) * 2;
  return (
    x >= -margin &&
    x <= viewport.width + margin &&
    y >= -margin &&
    y <= viewport.height + margin
  );
}

/**
 * Find the closest zone to an agent
 */
export function getAgentZone(
  agent: AgentState,
  zones: readonly Zone[]
): string | null {
  let closestZone: string | null = null;
  let minDistance = Infinity;

  for (const zone of zones) {
    const dx = agent.position.x - zone.position[0];
    const dy = agent.position.y - zone.position[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < minDistance) {
      minDistance = distance;
      closestZone = zone.id;
    }
  }

  return closestZone;
}

/**
 * Ease out cubic easing function for smooth interpolation
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Calculate interpolated position for an agent
 */
export function getInterpolatedPosition(
  agent: AgentState,
  timestamp: number,
  interp: InterpolatedPosition | undefined
): { x: number; y: number } | null {
  if (!agent.targetPosition || !interp) {
    return null;
  }

  const elapsed = timestamp - interp.startTime;
  const progress = Math.min(1, elapsed / interp.duration);
  const easedProgress = easeOutCubic(progress);

  return {
    x: interp.current.x + (agent.targetPosition.x - interp.current.x) * easedProgress,
    y: interp.current.y + (agent.targetPosition.y - interp.current.y) * easedProgress,
  };
}

/**
 * Update interpolated position state
 */
export function updateInterpolatedPosition(
  agentId: string,
  existingAgent: AgentState | undefined,
  newPosition: { x: number; y: number },
  interpolatedPositions: Map<string, InterpolatedPosition>
): void {
  const current = interpolatedPositions.get(agentId);

  if (current) {
    // Update existing interpolation
    current.current = { ...current.target };
    current.target = newPosition;
    current.startTime = performance.now();
  } else if (existingAgent) {
    // Create new interpolation
    interpolatedPositions.set(agentId, {
      current: { ...existingAgent.position },
      target: newPosition,
      startTime: performance.now(),
      duration: RENDER_CONSTANTS.INTERPOLATION_DURATION,
    });
  }
}

/**
 * Create animation loop handler
 */
export type RenderCallback = (timestamp: number) => void;

export function createAnimationLoop(
  renderCallback: RenderCallback,
  metricsCallback?: (metrics: {
    fps: number;
    frameTime: number;
    renderTime: number;
    visibleCount: number;
    interpolatedCount: number;
  }) => void
) {
  const state = createInitialRenderState();

  const gameLoop = (timestamp: number) => {
    state.frameCount++;

    // Update FPS every second
    if (timestamp - state.lastFpsUpdate >= 1000) {
      state.lastFpsUpdate = timestamp;
      state.frameCount = 0;
    }

    // Render start
    const renderStart = performance.now();
    renderCallback(timestamp);
    state.renderTime = performance.now() - renderStart;

    // Throttle metrics push (every 100ms)
    if (
      metricsCallback &&
      timestamp - state.lastMetricsPush >= RENDER_CONSTANTS.METRICS_THROTTLE_MS
    ) {
      metricsCallback({
        fps: state.frameCount,
        frameTime: RENDER_CONSTANTS.FRAME_TIME,
        renderTime: state.renderTime,
        visibleCount: state.visibleCount,
        interpolatedCount: state.interpolatedCount,
      });
      state.lastMetricsPush = timestamp;
    }

    state.rafId = requestAnimationFrame(gameLoop);
  };

  return {
    start: () => {
      state.rafId = requestAnimationFrame(gameLoop);
    },
    stop: () => {
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = 0;
      }
    },
    getState: () => state,
  };
}