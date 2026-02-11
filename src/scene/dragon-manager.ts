import * as THREE from "three";
import {
  createDragon,
  animateIdle,
  animateWalk,
  animateTalk,
  animateWave,
  animateDance,
  animateBackflip,
  animateSpin,
  type DragonType,
} from "./dragon.js";
import type { AgentProfile, AgentPosition } from "../../server/types.js";

interface DragonEntry {
  group: THREE.Group;
  profile: AgentProfile;
  current: AgentPosition;
  target: AgentPosition;
  action: string;
  time: number;
  dragonType: DragonType;
}

// Enable shadows on a dragon group
function enableDragonShadows(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

const DRAGON_RADIUS = 1.5;
const AVOIDANCE_LOOKAHEAD = 4;
const AVOIDANCE_FORCE = 6;

// Map agent roles to dragon types
function getDragonType(profile: AgentProfile): DragonType {
  // Shalom is the dragon
  if (profile.agentId === "shalom" || profile.name?.toLowerCase().includes("shalom")) {
    return "dragon";
  }
  
  // Map by role/type
  const role = profile.role?.toLowerCase() || "";
  const typeIndicator = profile.type?.toLowerCase() || "";
  
  if (role.includes("trade") || role.includes("merchant") || typeIndicator.includes("trade")) {
    return "trade";
  }
  if (role.includes("deploy") || role.includes("dev") || role.includes("build") || typeIndicator.includes("deploy")) {
    return "deploy";
  }
  if (role.includes("daily") || role.includes("task") || role.includes("work") || typeIndicator.includes("daily")) {
    return "daily";
  }
  
  // Default based on agent ID hash for variety
  const hash = profile.agentId.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  const types: DragonType[] = ["daily", "trade", "deploy"];
  return types[hash % 3];
}

export class DragonManager {
  private scene: THREE.Scene;
  private dragons = new Map<string, DragonEntry>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private obstacles: Obstacle[] = [];

  constructor(scene: THREE.Scene, obstacles?: Obstacle[]) {
    this.scene = scene;
    this.obstacles = obstacles ?? [];
  }

  /** Add or update a dragon from snapshot / join */
  addOrUpdate(profile: AgentProfile, position: AgentPosition): void {
    let entry = this.dragons.get(profile.agentId);
    if (!entry) {
      const dragonType = getDragonType(profile);
      const group = createDragon(dragonType, profile.color);
      group.position.set(position.x, position.y, position.z);
      group.rotation.y = position.rotation;
      group.userData.agentId = profile.agentId;
      
      // Enable shadows for lighting interaction
      enableDragonShadows(group);
      
      this.scene.add(group);

      entry = {
        group,
        profile,
        current: { ...position },
        target: { ...position },
        action: "idle",
        time: 0,
        dragonType,
      };
      this.dragons.set(profile.agentId, entry);
    } else {
      entry.profile = profile;
      entry.target = { ...position };
    }
  }

  /** Update target position for smooth interpolation */
  updatePosition(agentId: string, pos: AgentPosition): void {
    const entry = this.dragons.get(agentId);
    if (entry) {
      entry.target = { ...pos };
    }
  }

  /** Set current action/animation */
  setAction(agentId: string, action: string): void {
    const entry = this.dragons.get(agentId);
    if (entry) {
      entry.action = action;
    }
  }

  /** Remove a dragon from the scene */
  remove(agentId: string): void {
    const entry = this.dragons.get(agentId);
    if (entry) {
      this.scene.remove(entry.group);
      entry.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.dragons.delete(agentId);
    }
  }

  /** Get world position for an agent */
  getPosition(agentId: string): THREE.Vector3 | null {
    const entry = this.dragons.get(agentId);
    if (!entry) return null;
    return entry.group.position.clone();
  }

  /**
   * Calculate avoidance steering vector to push the dragon away from
   * nearby obstacles and other dragons.
   */
  private getAvoidance(agentId: string, cx: number, cz: number, heading: number): { ax: number; az: number } {
    let ax = 0;
    let az = 0;

    // Avoid rocks/obstacles
    for (const obs of this.obstacles) {
      const dx = cx - obs.x;
      const dz = cz - obs.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = obs.radius + DRAGON_RADIUS;

      if (dist < minDist + AVOIDANCE_LOOKAHEAD && dist > 0.01) {
        // Check if obstacle is roughly ahead (within 120° cone)
        const toObsAngle = Math.atan2(-dx, -dz);
        let relAngle = toObsAngle - heading;
        if (relAngle > Math.PI) relAngle -= Math.PI * 2;
        if (relAngle < -Math.PI) relAngle += Math.PI * 2;

        if (Math.abs(relAngle) < Math.PI * 0.67) {
          const strength = AVOIDANCE_FORCE * (1 - dist / (minDist + AVOIDANCE_LOOKAHEAD));
          ax += (dx / dist) * strength;
          az += (dz / dist) * strength;
        }
      }
    }

    // Avoid other dragons
    for (const [id, other] of this.dragons) {
      if (id === agentId) continue;
      const dx = cx - other.current.x;
      const dz = cz - other.current.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = DRAGON_RADIUS * 2;

      if (dist < minDist + 2 && dist > 0.01) {
        const strength = AVOIDANCE_FORCE * 0.8 * (1 - dist / (minDist + 2));
        ax += (dx / dist) * strength;
        az += (dz / dist) * strength;
      }
    }

    return { ax, az };
  }

  /** Per-frame update: turn to face target, avoid obstacles, then walk */
  update(delta: number): void {
    for (const entry of this.dragons.values()) {
      entry.time += delta;

      const dx = entry.target.x - entry.current.x;
      const dz = entry.target.z - entry.current.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // NaN guard
      if (!isFinite(dx) || !isFinite(dz) || !isFinite(dist)) continue;

      const turnSpeed = 4 * delta;
      const moveSpeed = 3 * delta;
      const arrivedThreshold = 0.15;
      const facingThreshold = 0.25;

      if (dist > arrivedThreshold) {
        // Get avoidance steering
        const { ax, az } = this.getAvoidance(
          entry.profile.agentId,
          entry.current.x,
          entry.current.z,
          entry.current.rotation
        );

        // Blend desired direction with avoidance
        const steerX = dx + ax * delta;
        const steerZ = dz + az * delta;
        const desiredRotation = Math.atan2(steerX, steerZ);

        // Shortest-arc rotation
        let angleDiff = desiredRotation - entry.current.rotation;
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Turn toward target
        entry.current.rotation += angleDiff * turnSpeed;
        if (entry.current.rotation > Math.PI) entry.current.rotation -= Math.PI * 2;
        if (entry.current.rotation < -Math.PI) entry.current.rotation += Math.PI * 2;

        // Only move forward once roughly facing the direction
        if (Math.abs(angleDiff) < facingThreshold) {
          // Move in facing direction (not directly toward target)
          const forwardX = Math.sin(entry.current.rotation);
          const forwardZ = Math.cos(entry.current.rotation);
          const speed = moveSpeed * Math.min(dist, 1);

          let newX = entry.current.x + forwardX * speed * 5;
          let newZ = entry.current.z + forwardZ * speed * 5;

          // Hard collision check
          if (!this.isBlocked(entry.profile.agentId, newX, newZ)) {
            entry.current.x = newX;
            entry.current.z = newZ;
          } else {
            // Try sliding along the obstacle
            if (!this.isBlocked(entry.profile.agentId, newX, entry.current.z)) {
              entry.current.x = newX;
            } else if (!this.isBlocked(entry.profile.agentId, entry.current.x, newZ)) {
              entry.current.z = newZ;
            }
          }

          entry.current.y += (entry.target.y - entry.current.y) * moveSpeed;

          animateWalk(entry.group, entry.time);
        }
      } else {
        // Already at target — interpolate to explicit rotation
        let angleDiff = entry.target.rotation - entry.current.rotation;
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        entry.current.rotation += angleDiff * turnSpeed;
      }

      entry.group.position.set(
        entry.current.x,
        entry.current.y,
        entry.current.z
      );
      entry.group.rotation.y = entry.current.rotation;

      // Run appropriate animation based on movement and action state
      const t = entry.time;
      if (dist > arrivedThreshold) {
        // Actually moving - play walk animation with leg stride
        animateWalk(entry.group, t);
      } else {
        // Arrived at destination - play action-based animation
        switch (entry.action) {
          case "walk":
            animateWalk(entry.group, t);
            break;
          case "talk":
          case "pinch":
            animateTalk(entry.group, t);
            break;
          case "wave":
            animateWave(entry.group, t);
            break;
          case "dance":
            animateDance(entry.group, t);
            break;
          case "backflip":
            animateBackflip(entry.group, t);
            break;
          case "spin":
            animateSpin(entry.group, t);
            break;
          case "idle":
          default:
            animateIdle(entry.group, t);
            break;
        }
      }
    }

    // Animate room particles
    const animateFn = this.scene.userData.animateParticles as
      | ((time: number) => void)
      | undefined;
    if (animateFn) {
      animateFn(performance.now() / 1000);
    }
  }

  /** Check if a position would collide with any obstacle or another dragon */
  private isBlocked(agentId: string, x: number, z: number): boolean {
    // Check obstacles
    for (const obs of this.obstacles) {
      const dx = x - obs.x;
      const dz = z - obs.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < obs.radius + DRAGON_RADIUS * 0.5) return true;
    }

    // Check other dragons
    for (const [id, other] of this.dragons) {
      if (id === agentId) continue;
      const dx = x - other.current.x;
      const dz = z - other.current.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < DRAGON_RADIUS * 1.5) return true;
    }

    return false;
  }

  /** Raycast pick: returns agentId of clicked dragon, or null */
  pick(
    event: MouseEvent,
    camera: THREE.Camera,
    domElement: HTMLElement
  ): string | null {
    const rect = domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, camera);

    const meshes: THREE.Mesh[] = [];
    for (const entry of this.dragons.values()) {
      entry.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      });
    }

    const intersects = this.raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj) {
        if (obj.userData.agentId) return obj.userData.agentId as string;
        obj = obj.parent;
      }
    }
    return null;
  }

  /** Get all current agent IDs */
  getAgentIds(): string[] {
    return Array.from(this.dragons.keys());
  }

  /** Get dragon type for an agent */
  getDragonType(agentId: string): DragonType | null {
    const entry = this.dragons.get(agentId);
    return entry?.dragonType || null;
  }
}
