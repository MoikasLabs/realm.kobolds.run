#!/usr/bin/env node
/**
 * Smooth Movement System - Improved agent locomotion
 * 
 * Features:
 * - Velocity-based movement (not teleport)
 * - Smooth acceleration/deceleration
 * - Predictive collision avoidance
 * - Automatic path replanning when blocked
 * - Visual feedback when moving
 */

const { checkCollision, findSafePosition } = require('./collision-validator.js');

// Movement constants
const MAX_SPEED = 8.0;           // meters per second
const ACCELERATION = 12.0;       // m/s²
const DECELERATION = 16.0;       // m/s²
const TURN_SPEED = 3.0;          // radians per second
const AVOIDANCE_FACTOR = 0.5;    // How much we steer away from obstacles
const STUCK_THRESHOLD = 3000;    // 3 seconds without progress = stuck
const PATH_REPLAN_INTERVAL = 5000; // Replan path every 5 seconds

class SmoothMovement {
  constructor(client) {
    this.client = client;
    this.velocity = { x: 0, z: 0 };
    this.targetVelocity = { x: 0, z: 0 };
    this.targetPos = null;
    this.isMoving = false;
    this.isPathfinding = false;
    this.path = [];
    this.currentWaypoint = 0;
    this.lastProgressTime = 0;
    this.lastPosition = { x: 0, z: 0 };
    this.replanTimer = null;
    this.moveInterval = null;
    
    // Animation state
    this.animTime = 0;
    this.bobPhase = 0;
  }

  /**
   * Move to target position using smooth velocity-based locomotion
   */
  async moveTo(targetX, targetZ, options = {}) {
    if (this.isMoving) {
      // Queue new target or override existing
      if (options.override) {
        this.stop();
      } else {
        return { success: false, reason: 'already_moving' };
      }
    }

    // Validate target is reachable
    const safeTarget = findSafePosition(targetX, targetZ);
    targetX = safeTarget.x;
    targetZ = safeTarget.z;

    this.targetPos = { x: targetX, z: targetZ };
    this.isMoving = true;
    this.lastProgressTime = Date.now();
    this.lastPosition = { ...this.client.position };

    // Generate initial path
    this.path = await this.generatePath(
      this.client.position.x, 
      this.client.position.z, 
      targetX, 
      targetZ
    );
    this.currentWaypoint = 0;

    console.log(`[Movement] ${this.client.name} moving to (${targetX.toFixed(1)}, ${targetZ.toFixed(1)})`);
    console.log(`[Movement] Path: ${this.path.length} waypoints, ${this.getPathDistance().toFixed(1)}m total`);

    // Start movement loop
    return new Promise((resolve) => {
      const startTime = Date.now();
      const maxDuration = options.timeout || 60000; // 60 second max
      
      this.moveInterval = setInterval(() => {
        const result = this.updateMovement();
        
        if (result === 'arrived') {
          this.stop();
          const duration = (Date.now() - startTime) / 1000;
          console.log(`[Movement] ${this.client.name} arrived in ${duration.toFixed(1)}s`);
          resolve({ success: true, duration });
        } else if (result === 'stuck' || result === 'timeout') {
          this.stop();
          const emergency = findSafePosition(this.client.position.x, this.client.position.z);
          this.client.position.x = emergency.x;
          this.client.position.z = emergency.z;
          this.client.broadcastPosition();
          console.warn(`[Movement] ${this.client.name} ${result}, emergency teleport`);
          resolve({ success: false, reason: result });
        }
        
        // Timeout check
        if (Date.now() - startTime > maxDuration) {
          this.stop();
          resolve({ success: false, reason: 'timeout' });
        }
      }, 50); // 20 FPS movement updates
    });
  }

  /**
   * Single movement update tick (called every 50ms)
   */
  updateMovement() {
    if (!this.isMoving || !this.targetPos) return 'stopped';

    const pos = this.client.position;
    const now = Date.now();
    const dt = 0.05; // 50ms = 0.05s

    // Update animation time
    this.animTime += dt;
    this.bobPhase += dt * 10; // Bobbing frequency

    // Check if stuck (no progress in 3 seconds)
    if (now - this.lastProgressTime > STUCK_THRESHOLD) {
      const moved = Math.hypot(pos.x - this.lastPosition.x, pos.z - this.lastPosition.z);
      if (moved < 0.5) {
        return 'stuck';
      }
      this.lastProgressTime = now;
      this.lastPosition = { x: pos.x, z: pos.z };
    }

    // Get current target waypoint
    let target = this.getCurrentTarget();
    if (!target) {
      target = this.targetPos;
    }

    // Calculate desired direction
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);

    // Check if arrived at final destination
    if (dist < 0.5 && this.currentWaypoint >= this.path.length - 1) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      this.isMoving = false;
      return 'arrived';
    }

    // Check if reached current waypoint
    if (dist < 1.0 && this.currentWaypoint < this.path.length - 1) {
      this.currentWaypoint++;
      target = this.getCurrentTarget();
      console.log(`[Movement] ${this.client.name} reached waypoint ${this.currentWaypoint}/${this.path.length}`);
    }

    // Calculate desired velocity
    const targetDir = Math.atan2(dz, dx);
    let desiredSpeed = MAX_SPEED;
    
    // Slow down when approaching target
    if (dist < 5.0) {
      desiredSpeed = MAX_SPEED * (dist / 5.0);
    }

    // Check for obstacles ahead and adjust velocity
    const avoidance = this.calculateAvoidance(pos, targetDir);
    
    // Calculate target velocity
    this.targetVelocity.x = Math.cos(targetDir + avoidance.angle) * desiredSpeed;
    this.targetVelocity.z = Math.sin(targetDir + avoidance.angle) * desiredSpeed;

    // Smooth acceleration
    const accel = avoidance.obstacleNear ? DECELERATION : ACCELERATION;
    this.velocity.x += (this.targetVelocity.x - this.velocity.x) * accel * dt;
    this.velocity.z += (this.targetVelocity.z - this.velocity.z) * accel * dt;

    // Apply speed limit
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > MAX_SPEED) {
      this.velocity.x = (this.velocity.x / speed) * MAX_SPEED;
      this.velocity.z = (this.velocity.z / speed) * MAX_SPEED;
    }

    // Calculate new position
    let newX = pos.x + this.velocity.x * dt;
    let newZ = pos.z + this.velocity.z * dt;

    // Validate new position is safe
    const check = checkCollision(newX, newZ, 1.0);
    if (!check.safe) {
      // Would hit obstacle - recalculate
      if (avoidance.obstacleNear) {
        // Already avoiding, but still would hit - stop and replan
        this.velocity.x *= 0.5;
        this.velocity.z *= 0.5;
        
        // Trigger path replan if not recently done
        if (now - (this.lastReplan || 0) > PATH_REPLAN_INTERVAL) {
          this.replanPath();
        }
      }
      
      newX = pos.x + this.velocity.x * dt;
      newZ = pos.z + this.velocity.z * dt;
    }

    // Update position
    pos.x = newX;
    pos.z = newZ;

    // Smooth rotation toward movement direction
    if (speed > 0.1) {
      const moveDir = Math.atan2(this.velocity.z, this.velocity.x);
      let rotDiff = moveDir - pos.rotation;
      while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
      while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
      pos.rotation += rotDiff * TURN_SPEED * dt;
    }

    // Add subtle bobbing animation when moving
    if (speed > 0.5) {
      pos.y = Math.abs(Math.sin(this.bobPhase)) * 0.1;
    } else {
      pos.y = 0;
    }

    // Broadcast position
    this.client.broadcastPosition();

    return 'moving';
  }

  /**
   * Calculate avoidance vector based on nearby obstacles
   */
  calculateAvoidance(pos, desiredDir) {
    const checkDistance = 3.0; // Look ahead 3 meters
    const checkPoints = 7;
    let totalWeight = 0;
    let avoidAngle = 0;
    let obstacleNear = false;

    for (let i = 0; i < checkPoints; i++) {
      const angle = desiredDir + (i - checkPoints/2) * 0.3; // Spread ±90°
      const checkX = pos.x + Math.cos(angle) * checkDistance;
      const checkZ = pos.z + Math.sin(angle) * checkDistance;
      
      const check = checkCollision(checkX, checkZ, 1.2);
      if (!check.safe) {
        const weight = checkDistance - Math.min(checkDistance, Math.hypot(checkX - pos.x, checkZ - pos.z));
        const deviation = angle - desiredDir;
        avoidAngle -= deviation * weight * AVOIDANCE_FACTOR;
        totalWeight += weight;
        obstacleNear = true;
      }
    }

    if (totalWeight > 0) {
      avoidAngle = Math.max(-1.0, Math.min(1.0, avoidAngle)); // Clamp to ±1 radian
    }

    return { angle: avoidAngle, obstacleNear };
  }

  /**
   * Generate path from start to target
   */
  async generatePath(sx, sz, tx, tz) {
    try {
      // Try server-side pathfinding first
      const res = await fetch(`${this.client.constructor.REALM_API || 'https://realm.shalohm.co'}/ipc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'find-path',
          args: { agentId: this.client.agentId, x: tx, z: tz }
        })
      });
      const data = await res.json();
      if (data.ok && data.waypoints?.length > 0) {
        return data.waypoints;
      }
    } catch (err) {
      // Server unavailable, use local
    }

    // Local pathfinding: direct with intermediate waypoints if obstacle
    const { validatePath } = require('./collision-validator.js');
    const pathResult = validatePath(sx, sz, tx, tz);
    return pathResult.waypoints.length > 0 ? pathResult.waypoints : [
      { x: sx, z: sz },
      { x: tx, z: tz }
    ];
  }

  /**
   * Replan path when current one is blocked
   */
  async replanPath() {
    if (this.isPathfinding) return;
    this.isPathfinding = true;
    this.lastReplan = Date.now();
    
    console.log(`[Movement] ${this.client.name} replanning path...`);
    
    this.path = await this.generatePath(
      this.client.position.x,
      this.client.position.z,
      this.targetPos.x,
      this.targetPos.z
    );
    this.currentWaypoint = 0;
    
    this.isPathfinding = false;
    console.log(`[Movement] New path: ${this.path.length} waypoints`);
  }

  getCurrentTarget() {
    if (this.currentWaypoint >= this.path.length) {
      return this.targetPos;
    }
    return this.path[this.currentWaypoint];
  }

  getPathDistance() {
    let dist = 0;
    let px = this.client.position.x;
    let pz = this.client.position.z;
    
    for (const wp of this.path.slice(this.currentWaypoint)) {
      dist += Math.hypot(wp.x - px, wp.z - pz);
      px = wp.x;
      pz = wp.z;
    }
    
    return dist;
  }

  stop() {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
    }
    if (this.replanTimer) {
      clearTimeout(this.replanTimer);
      this.replanTimer = null;
    }
    this.isMoving = false;
    this.velocity = { x: 0, z: 0 };
    this.targetPos = null;
    this.path = [];
    this.client.position.y = 0; // Reset bobbing
  }

  isActive() {
    return this.isMoving;
  }

  getStatus() {
    return {
      isMoving: this.isMoving,
      targetPos: this.targetPos,
      velocity: Math.hypot(this.velocity.x, this.velocity.z).toFixed(2),
      waypoint: `${this.currentWaypoint}/${this.path.length}`,
      pathDistance: this.getPathDistance().toFixed(1)
    };
  }
}

module.exports = { SmoothMovement };
