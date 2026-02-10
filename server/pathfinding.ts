/**
 * Pathfinding for Realm Agents
 * A* pathfinding with waypoint generation for smooth movement
 */

/** Position with x, z coordinates */
export interface Position {
  x: number;
  z: number;
}

/** Obstacle definition */
export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

/** Zone definition */
export interface Zone {
  x: number;
  z: number;
  connections: string[];
}

// Obstacles in the world (should match server obstacles)
export const OBSTACLES: Obstacle[] = [
  { x: -20, z: -20, radius: 4 },   // Moltbook zone
  { x: 22, z: -22, radius: 6 },    // Clawhub zone
  { x: 0, z: -35, radius: 5 },     // Worlds Portal
  { x: 40, z: 40, radius: 8 },     // The Burrow cave mound
  // Workstation obstacles (approx positions)
  { x: 22, z: -18, radius: 2 },    // K8s Deployer
  { x: 32, z: -22, radius: 2 },    // Terraform
  { x: 28, z: -15, radius: 2 },    // Docker Builder
  { x: -23, z: 22, radius: 2 },    // Vault Unlocker
  { x: -18, z: 28, radius: 2 },    // Security Audit
  { x: -28, z: 18, radius: 2 },    // Crypto Analyzer
  { x: 12, z: 18, radius: 2 },     // Trading Terminal
  { x: 15, z: 25, radius: 2 },     // Chart Analysis
  { x: 18, z: 23, radius: 2 },     // Market Scanner
  { x: 0, z: -10, radius: 2 },     // Command Nexus
  { x: 3, z: -8, radius: 2 },      // Content Forge
  { x: 6, z: -5, radius: 2 },      // Memory Archive
];

/** Zone connection graph for high-level pathfinding */
export const ZONE_GRAPH: Record<string, Zone> = {
  'burrow': { x: 40, z: 40, connections: ['general'] },
  'general': { x: 0, z: -10, connections: ['burrow', 'forge', 'spire', 'warrens'] },
  'forge': { x: 25, z: -20, connections: ['general'] },
  'spire': { x: -20, z: 25, connections: ['general'] },
  'warrens': { x: 15, z: 20, connections: ['general'] },
};

/**
 * Get zone for a position
 */
export function getZone(x: number, z: number): string {
  const dist = (zx: number, zz: number) => Math.sqrt((x - zx)**2 + (z - zz)**2);
  
  if (dist(40, 40) < 15) return 'burrow';
  if (dist(25, -20) < 15) return 'forge';
  if (dist(-20, 25) < 15) return 'spire';
  if (dist(15, 20) < 15) return 'warrens';
  return 'general';
}

/**
 * Check if a point collides with any obstacle
 */
export function collidesWithObstacle(x: number, z: number, buffer = 1.5): boolean {
  for (const obs of OBSTACLES) {
    const dx = x - obs.x;
    const dz = z - obs.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < (obs.radius + buffer)) {
      return true;
    }
  }
  return false;
}

/**
 * Find a path from start to end using simple waypoint generation
 * Returns array of {x, z} waypoints including start and end
 */
export function findPath(startX: number, startZ: number, endX: number, endZ: number): Position[] {
  const waypoints: Position[] = [{ x: startX, z: startZ }];
  
  // Calculate direct distance
  const dx = endX - startX;
  const dz = endZ - startZ;
  const dist = Math.sqrt(dx*dx + dz*dz);
  
  // If direct path is clear, just go straight
  if (isPathClear(startX, startZ, endX, endZ)) {
    waypoints.push({ x: endX, z: endZ });
    return waypoints;
  }
  
  // Get zones for better path planning
  const startZone = getZone(startX, startZ);
  const endZone = getZone(endX, endZ);
  
  // If in different zones, use zone graph for intermediate waypoint
  if (startZone !== endZone && startZone !== 'general' && endZone !== 'general') {
    // Path: start -> general zone -> end
    const generalPoint = { x: 0, z: -10 };
    
    // Check path to general
    if (!isPathClear(startX, startZ, generalPoint.x, generalPoint.z)) {
      // Add detour waypoints around obstacles
      const detour = findDetour(startX, startZ, generalPoint.x, generalPoint.z);
      waypoints.push(...detour);
    } else {
      waypoints.push(generalPoint);
    }
    
    // Check path from general to end
    if (!isPathClear(generalPoint.x, generalPoint.z, endX, endZ)) {
      const detour = findDetour(generalPoint.x, generalPoint.z, endX, endZ);
      waypoints.push(...detour);
    }
    
    waypoints.push({ x: endX, z: endZ });
    return waypoints;
  }
  
  // Same zone or one is general - use detour waypoints
  if (!isPathClear(startX, startZ, endX, endZ)) {
    const detour = findDetour(startX, startZ, endX, endZ);
    waypoints.push(...detour);
  }
  
  waypoints.push({ x: endX, z: endZ });
  return waypoints;
}

/**
 * Check if a straight line path is clear (raycast)
 */
function isPathClear(x1: number, z1: number, x2: number, z2: number): boolean {
  const steps = 20; // Check 20 points along the path
  const dx = (x2 - x1) / steps;
  const dz = (z2 - z1) / steps;
  
  for (let i = 1; i <= steps; i++) {
    const x = x1 + dx * i;
    const z = z1 + dz * i;
    if (collidesWithObstacle(x, z, 1.0)) {
      return false;
    }
  }
  return true;
}

/**
 * Find detour waypoints around obstacles blocking the path
 */
function findDetour(x1: number, z1: number, x2: number, z2: number): Position[] {
  const midX = (x1 + x2) / 2;
  const midZ = (z1 + z2) / 2;
  
  // Try several offsets
  const offsets = [
    { dx: 8, dz: 0 },   // Right
    { dx: -8, dz: 0 },  // Left
    { dx: 0, dz: 8 },   // Forward
    { dx: 0, dz: -8 },  // Back
    { dx: 6, dz: 6 },   // Right-forward
    { dx: -6, dz: 6 },  // Left-forward
    { dx: 6, dz: -6 },  // Right-back
    { dx: -6, dz: -6 }, // Left-back
  ];
  
  for (const offset of offsets) {
    const waypoint = { x: midX + offset.dx, z: midZ + offset.dz };
    
    // Check if waypoint is clear
    if (!collidesWithObstacle(waypoint.x, waypoint.z, 2.0)) {
      // Check if path to waypoint and from waypoint to end are clear
      if (isPathClear(x1, z1, waypoint.x, waypoint.z) || 
          isPathClear(waypoint.x, waypoint.z, x2, z2)) {
        return [waypoint];
      }
    }
  }
  
  // Fallback: return a point far from obstacles
  return [{ x: midX + 10, z: midZ + 10 }];
}

/**
 * Calculate distance between two points
 */
export function distance(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx*dx + dz*dz);
}

/**
 * Calculate rotation angle to face a target
 */
export function lookAtRotation(currentX: number, currentZ: number, targetX: number, targetZ: number): number {
  const dx = targetX - currentX;
  const dz = targetZ - currentZ;
  return Math.atan2(dx, dz); // atan2(x, z) gives rotation in 3D world
}

/**
 * Smooth interpolation between rotations (handle wrapping)
 */
export function smoothRotation(current: number, target: number, speed: number): number {
  let diff = target - current;
  
  // Wrap to [-PI, PI]
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  
  // Interpolate
  return current + diff * speed;
}
