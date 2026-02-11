/**
 * Collision Validator for Realm Agents
 * Helps agents detect and avoid obstacles before moving
 */

const REALM_API = process.env.REALM_API_URL || 'https://realm.shalohm.co';

// Obstacle definitions (must match server)
const OBSTACLES = [
  { name: 'Moltbook', x: -20, z: -20, radius: 4 },
  { name: 'Clawhub', x: 22, z: -22, radius: 6 },
  { name: 'Portal', x: 0, z: -35, radius: 5 },
  { name: 'Burrow', x: 40, z: 40, radius: 8 }
];

const WORLD_BOUNDS = 50; // +/- 50

/**
 * Check if a position would collide with any obstacle
 * Returns { safe: boolean, obstacles: [{name, distance, threshold}] }
 */
export function checkCollision(x, z, buffer = 1.0) {
  const collisions = [];
  
  // Check world bounds
  if (Math.abs(x) > WORLD_BOUNDS || Math.abs(z) > WORLD_BOUNDS) {
    collisions.push({
      name: 'WORLD_BOUNDS',
      distance: Math.max(Math.abs(x), Math.abs(z)),
      threshold: WORLD_BOUNDS,
      isSafe: false
    });
  }
  
  // Check obstacles
  for (const obs of OBSTACLES) {
    const dx = x - obs.x;
    const dz = z - obs.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    const threshold = obs.radius + buffer;
    const isSafe = dist >= threshold;
    
    if (!isSafe) {
      collisions.push({
        name: obs.name,
        distance: dist,
        threshold: threshold,
        isSafe: false
      });
    }
  }
  
  return {
    safe: collisions.length === 0,
    obstacles: collisions
  };
}

/**
 * Find the nearest safe position from a target
 * If target is inside obstacle, returns closest point on the edge
 */
export function findSafePosition(targetX, targetZ, preferredDirection = null, maxIterations = 5) {
  let currentX = targetX;
  let currentZ = targetZ;
  
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const check = checkCollision(currentX, currentZ);
    if (check.safe) {
      // Calculate how far we moved
      const distance = Math.sqrt((currentX - targetX)**2 + (currentZ - targetZ)**2);
      return { x: currentX, z: currentZ, original: distance < 0.1, distance };
    }
    
    // For each colliding obstacle, push away
    for (const collision of check.obstacles) {
      if (collision.name === 'WORLD_BOUNDS') {
        // Clamp to world bounds
        currentX = Math.max(-WORLD_BOUNDS + 1, Math.min(WORLD_BOUNDS - 1, currentX));
        currentZ = Math.max(-WORLD_BOUNDS + 1, Math.min(WORLD_BOUNDS - 1, currentZ));
        continue;
      }
      
      const obs = OBSTACLES.find(o => o.name === collision.name);
      if (!obs) continue;
      
      // Vector from obstacle center to current position
      const dx = currentX - obs.x;
      const dz = currentZ - obs.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      
      if (dist === 0) {
        // Exactly at center - push in preferred direction or +x
        currentX = obs.x + obs.radius + 1.5;
        currentZ = obs.z;
      } else {
        // Push to edge of obstacle + buffer
        const safeDist = obs.radius + 1.5;
        const ratio = safeDist / Math.max(dist, 0.1); // Avoid div by zero
        currentX = obs.x + dx * ratio;
        currentZ = obs.z + dz * ratio;
      }
    }
  }
  
  // Max iterations reached - return best effort position
  const distance = Math.sqrt((currentX - targetX)**2 + (currentZ - targetZ)**2);
  return { x: currentX, z: currentZ, original: false, distance, approximate: true };
}

/**
 * Validate a path between two points
 * Returns array of safe waypoints avoiding obstacles
 * Uses non-recursive approach to prevent stack overflow
 */
export function validatePath(startX, startZ, endX, endZ, minSteps = 10) {
  const waypoints = [{ x: startX, z: startZ }];
  
  // Check if direct path is clear with ray samples
  const checkRay = (x1, z1, x2, z2, samples = 10) => {
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      if (!checkCollision(x, z).safe) return false;
    }
    return true;
  };
  
  // Try direct path first
  if (checkRay(startX, startZ, endX, endZ, 20)) {
    waypoints.push({ x: endX, z: endZ });
    return { waypoints, direct: true };
  }
  
  // Find a safe waypoint to route around obstacle
  // Try midpoint with various offsets
  const midX = (startX + endX) / 2;
  const midZ = (startZ + endZ) / 2;
  
  // Direction from start to end
  const dirX = endX - startX;
  const dirZ = endZ - startZ;
  const dirLen = Math.sqrt(dirX*dirX + dirZ*dirZ);
  const perpX = dirLen > 0 ? -dirZ / dirLen : 0;
  const perpZ = dirLen > 0 ? dirX / dirLen : 0;
  
  // Try perpendicular offsets at midpoint
  const offsets = [12, 8, 15, 5, 20];
  let safeMidpoint = null;
  
  for (const offset of offsets) {
    // Try both perpendicular directions
    for (const sign of [-1, 1]) {
      const testX = midX + perpX * offset * sign;
      const testZ = midZ + perpZ * offset * sign;
      
      // Check if this midpoint is safe
      const safeCheck = findSafePosition(testX, testZ);
      if (safeCheck.original || safeCheck.distance < 20) {
        // Check both path segments
        if (checkRay(startX, startZ, safeCheck.x, safeCheck.z, 10) &&
            checkRay(safeCheck.x, safeCheck.z, endX, endZ, 10)) {
          safeMidpoint = safeCheck;
          break;
        }
      }
    }
    if (safeMidpoint) break;
  }
  
  if (safeMidpoint) {
    waypoints.push({ x: safeMidpoint.x, z: safeMidpoint.z });
    waypoints.push({ x: endX, z: endZ });
    return { waypoints, direct: false };
  }
  
  // Fallback: go directly to safe version of target
  const safeTarget = findSafePosition(endX, endZ);
  waypoints.push({ x: safeTarget.x, z: safeTarget.z });
  return {
    waypoints,
    direct: false,
    partial: !safeTarget.original
  };
}

/**
 * Real-time position validator for agents
 * Checks current position and suggests correction if stuck
 */
export async function validateAgentPosition(agentId, currentX, currentZ) {
  const check = checkCollision(currentX, currentZ);
  
  if (check.safe) {
    return { safe: true, position: { x: currentX, z: currentZ } };
  }
  
  // Agent is stuck - find nearest safe position
  const safe = findSafePosition(currentX, currentZ);
  
  console.warn(`[CollisionValidator] ${agentId} is stuck at (${currentX.toFixed(1)}, ${currentZ.toFixed(1)})!`);
  console.warn(`[CollisionValidator] Suggested safe position: (${safe.x.toFixed(1)}, ${safe.z.toFixed(1)})`);
  
  // Log collision details
  for (const obs of check.obstacles) {
    console.warn(`  → ${obs.name}: ${obs.distance.toFixed(1)}m (need ${obs.threshold.toFixed(1)}m)`);
  }
  
  return {
    safe: false,
    stuck: true,
    position: safe,
    original: { x: currentX, z: currentZ },
    obstacles: check.obstacles
  };
}

/**
 * Get safe spawn position near a target area
 */
export function findSafeSpawn(preferredX = 0, preferredZ = 0, radius = 20) {
  // Try preferred location first
  const preferred = findSafePosition(preferredX, preferredZ);
  if (preferred.original) {
    return preferred;
  }
  
  // Try random positions in radius
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const x = preferredX + Math.cos(angle) * dist;
    const z = preferredZ + Math.sin(angle) * dist;
    
    const safe = findSafePosition(x, z);
    if (safe.original) {
      return safe;
    }
  }
  
  // Fallback to command nexus area
  return findSafePosition(0, -10);
}

/**
 * Diagnostic tool - check all agent positions
 */
export async function checkAllAgents() {
  try {
    const res = await fetch(`${REALM_API}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'profiles' })
    });
    const data = await res.json();
    
    const problems = [];
    
    for (const profile of data.profiles || []) {
      // Would need position data from world-state
      // This is a placeholder for a full diagnostic
      console.log(`[Check] ${profile.agentId}: ${profile.bio?.slice(0, 50)}`);
    }
    
    return problems;
  } catch (err) {
    console.error('[CollisionValidator] Check failed:', err.message);
    return [];
  }
}

// Export for use
export { OBSTACLES, WORLD_BOUNDS };
export default {
  checkCollision,
  findSafePosition,
  validatePath,
  validateAgentPosition,
  findSafeSpawn,
  checkAllAgents
};
