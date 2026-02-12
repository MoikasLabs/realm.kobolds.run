/**
 * Proximity Event System
 * 
 * Adds agent-moved events for retinal perception.
 * Integrates with existing game loop without breaking changes.
 */

import type { WorldMessage, AgentState } from "./types.js";

/**
 * Creates an agent-moved event for retinal perception
 */
export function createAgentMovedEvent(
  agentId: string,
  name: string,
  from: { x: number; z: number },
  to: { x: number; z: number },
  velocity?: { x: number; z: number }
): WorldMessage {
  return {
    worldType: "agent-moved",
    agentId,
    name,
    x: to.x,
    z: to.z,
    prevX: from.x,
    prevZ: from.z,
    velocityX: velocity?.x ?? 0,
    velocityZ: velocity?.z ?? 0,
    timestamp: Date.now(),
  };
}

/**
 * Track agent positions to detect movement
 */
export class AgentPositionTracker {
  private positions = new Map<string, { x: number; z: number; time: number }>();
  private velocities = new Map<string, { x: number; z: number }>();

  /**
   * Update position and calculate velocity
   * Returns movement delta if agent moved significantly
   */
  update(
    agentId: string,
    name: string,
    position: { x: number; z: number }
  ): WorldMessage | null {
    const prev = this.positions.get(agentId);
    const now = Date.now();

    // Calculate velocity if we have previous position
    let velocity = { x: 0, z: 0 };
    if (prev) {
      const dt = (now - prev.time) / 1000; // seconds
      if (dt > 0) {
        velocity = {
          x: (position.x - prev.x) / dt,
          z: (position.z - prev.z) / dt,
        };
      }
    }

    // Store new position
    this.positions.set(agentId, { ...position, time: now });
    this.velocities.set(agentId, velocity);

    // Only emit if position changed significantly (>0.1 units)
    if (prev) {
      const dx = position.x - prev.x;
      const dz = position.z - prev.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance > 0.1) {
        return createAgentMovedEvent(agentId, name, prev, position, velocity);
      }
    }

    return null;
  }

  /**
   * Get current velocity of an agent
   */
  getVelocity(agentId: string): { x: number; z: number } {
    return this.velocities.get(agentId) ?? { x: 0, z: 0 };
  }

  /**
   * Remove agent from tracking
   */
  remove(agentId: string): void {
    this.positions.delete(agentId);
    this.velocities.delete(agentId);
  }

  /**
   * Get all tracked positions
   */
  getAll(): Map<string, { x: number; z: number }> {
    const result = new Map();
    for (const [id, data] of this.positions) {
      result.set(id, { x: data.x, z: data.z });
    }
    return result;
  }
}
