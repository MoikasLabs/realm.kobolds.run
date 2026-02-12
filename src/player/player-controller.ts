import * as THREE from "three";
import type { WSClient } from "../net/ws-client.js";
import type { KeyState } from "../input/keyboard.js";

const SPEED = 8;
const WORLD_HALF = 50;
const SYNC_INTERVAL = 100; // ms between position syncs (10Hz)

/** Obstacles matching server/index.ts setObstacles + 1.0 buffer */
const OBSTACLES = [
  { x: -20, z: -20, radius: 4 + 1.0 }, // Moltbook
  { x: 22, z: -22, radius: 6 + 1.0 },  // Clawhub
  { x: 0, z: -35, radius: 5 + 1.0 },   // Worlds Portal
  { x: 30, z: 30, radius: 5 + 1.0 },   // Skill Tower
];

export class PlayerController {
  agentId: string | null = null;

  private ws: WSClient;
  private camera: THREE.Camera;
  private x = 0;
  private z = 0;
  private rotation = 0;
  private lastSyncTime = 0;
  private _moving = false;
  private _wasMoving = false;
  private pendingName = "Player";
  private pendingColor = "#e91e63";

  constructor(ws: WSClient, camera: THREE.Camera) {
    this.ws = ws;
    this.camera = camera;
  }

  get moving(): boolean {
    return this._moving;
  }

  get posX(): number {
    return this.x;
  }

  get posZ(): number {
    return this.z;
  }

  get posRotation(): number {
    return this.rotation;
  }

  join(name?: string, color?: string): void {
    if (name) this.pendingName = name;
    if (color) this.pendingColor = color;
    this.ws.send({
      type: "playerJoin",
      name: this.pendingName,
      color: this.pendingColor,
    });
  }

  onJoined(agentId: string): void {
    this.agentId = agentId;
    this.x = 0;
    this.z = 0;
    this.rotation = 0;
    this.lastSyncTime = 0;
  }

  leave(): void {
    if (!this.agentId) return;
    this.ws.send({ type: "playerLeave" });
    this.agentId = null;
  }

  sendChat(text: string): void {
    if (!this.agentId || !text) return;
    this.ws.send({ type: "playerChat", text: text.slice(0, 500) });
  }

  sendAction(action: string): void {
    if (!this.agentId) return;
    this.ws.send({ type: "playerAction", action });
  }

  /**
   * Called each animation frame. Computes camera-relative movement from key state.
   * Returns true if position changed (caller should call setPositionImmediate).
   */
  update(keys: KeyState, delta: number): boolean {
    if (!this.agentId) return false;

    // Compute movement direction from keys
    let moveX = 0;
    let moveZ = 0;

    const inputActive =
      keys.forward || keys.backward || keys.left || keys.right;

    if (inputActive) {
      // Get camera forward projected onto XZ plane
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      camDir.y = 0;
      camDir.normalize();

      // Right = forward x up
      const right = new THREE.Vector3();
      right.crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();

      if (keys.forward) {
        moveX += camDir.x;
        moveZ += camDir.z;
      }
      if (keys.backward) {
        moveX -= camDir.x;
        moveZ -= camDir.z;
      }
      if (keys.left) {
        moveX -= right.x;
        moveZ -= right.z;
      }
      if (keys.right) {
        moveX += right.x;
        moveZ += right.z;
      }

      // Normalize diagonal movement
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (len > 0) {
        moveX /= len;
        moveZ /= len;
      }
    }

    this._moving = inputActive && (moveX !== 0 || moveZ !== 0);

    if (this._moving) {
      const newX = this.x + moveX * SPEED * delta;
      const newZ = this.z + moveZ * SPEED * delta;
      this.rotation = Math.atan2(moveX, moveZ);

      // Validate new position
      const validPos = this.validate(newX, newZ);
      this.x = validPos.x;
      this.z = validPos.z;

      // Sync to server at 10Hz
      const now = performance.now();
      if (now - this.lastSyncTime >= SYNC_INTERVAL) {
        this.lastSyncTime = now;
        this.ws.send({
          type: "playerMove",
          x: this.x,
          z: this.z,
          rotation: this.rotation,
        });
      }
    }

    // Send idle when stopping
    if (this._wasMoving && !this._moving) {
      // Final position + idle
      this.ws.send({
        type: "playerMove",
        x: this.x,
        z: this.z,
        rotation: this.rotation,
      });
      this.sendAction("idle");
    }

    this._wasMoving = this._moving;
    return this._moving || (this._wasMoving && !this._moving);
  }

  private validate(x: number, z: number): { x: number; z: number } {
    // Bounds check
    x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, x));
    z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, z));

    // Obstacle collision: push out of any obstacle
    for (const obs of OBSTACLES) {
      const dx = x - obs.x;
      const dz = z - obs.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < obs.radius) {
        // Push out to the edge
        if (dist < 0.01) {
          // Dead center: push toward current position
          x = obs.x + obs.radius;
        } else {
          x = obs.x + (dx / dist) * obs.radius;
          z = obs.z + (dz / dist) * obs.radius;
        }
      }
    }

    return { x, z };
  }
}
