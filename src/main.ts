import { createScene } from "./scene/room.js";
import { LobsterManager } from "./scene/lobster-manager.js";
import { EffectsManager } from "./scene/effects.js";
import { createBuildings } from "./scene/buildings.js";
import { WSClient } from "./net/ws-client.js";
import { setupOverlay } from "./ui/overlay.js";
import { setupChatLog } from "./ui/chat-log.js";
import { setupProfilePanel } from "./ui/profile-panel.js";
import { setupBuildingPanel } from "./ui/building-panel.js";
import { setupRoomInfoBar } from "./ui/room-info-bar.js";
import { createKeyboardTracker } from "./input/keyboard.js";
import { PlayerController } from "./player/player-controller.js";
import * as THREE from "three";
import type { AgentProfile, AgentState, WorldMessage, RoomInfoMessage } from "../server/types.js";

// ── Parse URL params ───────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
const focusAgent = params.get("agent");
const serverParam = params.get("server");

// ── Global server base URL (for API calls from building panels etc.) ──

/** Empty string for local (Vite proxy), or full URL for remote */
export let serverBaseUrl = serverParam || "";

// ── Scene setup (immediate — no lobby) ────────────────────────

const { scene, camera, renderer, labelRenderer, controls, clock, obstacles } = createScene();

// Add buildings (Moltbook + Clawhub) to the scene
const { buildings, obstacles: buildingObstacles } = createBuildings(scene);
const allObstacles = [...obstacles, ...buildingObstacles];

const lobsterManager = new LobsterManager(scene, allObstacles);
const effects = new EffectsManager(scene, camera);
const buildingPanel = setupBuildingPanel(serverParam);
const roomInfoBar = setupRoomInfoBar();

// ── Input & Player ─────────────────────────────────────────────

const keys = createKeyboardTracker();

// ── WebSocket connection ───────────────────────────────────────

const ws = new WSClient(serverParam || undefined);

// Player controller needs ws + camera
const playerController = new PlayerController(ws, camera);

// ── UI ─────────────────────────────────────────────────────────

const overlay = setupOverlay();
const chatLog = setupChatLog((text) => playerController.sendChat(text));
const profilePanel = setupProfilePanel((agentId: string) => {
  // Click callback → focus camera on lobster
  const pos = lobsterManager.getPosition(agentId);
  if (pos) {
    controls.target.set(pos.x, pos.y + 2, pos.z);
  }
});

// Right-click to pan the camera
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

// Bridge connection events to window for overlay status dot
let profileRefreshInterval: ReturnType<typeof setInterval> | null = null;

ws.on("connected", () => {
  window.dispatchEvent(new CustomEvent("ws:connected"));
  // Request full (non-AOI-filtered) profiles for the overlay agent list
  ws.requestProfiles();
  // Periodically refresh agent list (every 30s) to catch joins/leaves
  if (profileRefreshInterval) clearInterval(profileRefreshInterval);
  profileRefreshInterval = setInterval(() => ws.requestProfiles(), 30_000);

  // Auto-join as player
  playerController.join("Player", "#e91e63");
});
ws.on("disconnected", () => {
  window.dispatchEvent(new CustomEvent("ws:disconnected"));
  if (profileRefreshInterval) {
    clearInterval(profileRefreshInterval);
    profileRefreshInterval = null;
  }
});

// Handle playerJoined response
ws.on("playerJoined", (_raw) => {
  const data = _raw as { agentId: string };
  playerController.onJoined(data.agentId);
  followAgentId = data.agentId;
  chatLog.enableInput();
});

ws.on("snapshot", (_raw) => {
  const data = _raw as { agents: AgentState[] };
  for (const agent of data.agents) {
    lobsterManager.addOrUpdate(agent.profile, agent.position);
    effects.updateLabel(agent.profile.agentId, agent.profile.name, agent.profile.color);
  }
  // Note: overlay agent list is updated via requestProfiles + join/leave,
  // NOT from snapshots (which are AOI-filtered and would hide distant agents).

  // Auto-focus in preview mode
  if (focusAgent) {
    const pos = lobsterManager.getPosition(focusAgent);
    if (pos) {
      controls.target.set(pos.x, pos.y + 2, pos.z);
      camera.position.set(pos.x + 10, pos.y + 8, pos.z + 10);
    }
  }
});

ws.on("world", (_raw) => {
  const data = _raw as { message: WorldMessage };
  const msg = data.message;

  switch (msg.worldType) {
    case "position":
      // Skip position echoes for our own player (we move locally)
      if (msg.agentId === playerController.agentId) break;
      lobsterManager.updatePosition(msg.agentId, msg);
      break;

    case "action":
      // Skip action echoes for our own player when moving
      if (msg.agentId === playerController.agentId && playerController.moving) break;
      lobsterManager.setAction(msg.agentId, msg.action);
      break;

    case "join":
      lobsterManager.addOrUpdate(
        {
          agentId: msg.agentId,
          name: msg.name,
          color: msg.color,
          bio: msg.bio,
          capabilities: msg.capabilities,
          pubkey: "",
          joinedAt: msg.timestamp,
          lastSeen: msg.timestamp,
        },
        { agentId: msg.agentId, x: 0, y: 0, z: 0, rotation: 0, timestamp: msg.timestamp }
      );
      effects.updateLabel(msg.agentId, msg.name, msg.color);
      chatLog.addSystem(`${msg.name} joined the ocean world`);
      overlay.addAgent({
        agentId: msg.agentId,
        name: msg.name,
        pubkey: "",
        bio: msg.bio,
        capabilities: msg.capabilities,
        color: msg.color,
        joinedAt: msg.timestamp,
        lastSeen: msg.timestamp,
      });
      break;

    case "leave":
      lobsterManager.remove(msg.agentId);
      effects.removeLabel(msg.agentId);
      effects.removeBubble(msg.agentId);
      chatLog.addSystem(`Agent ${msg.agentId} left`);
      overlay.removeAgent(msg.agentId);
      break;

    case "chat":
      effects.showBubble(msg.agentId, msg.text);
      chatLog.addMessage(msg.agentId, msg.text);
      break;

    case "emote":
      effects.showEmote(msg.agentId, msg.emote);
      break;

    case "profile":
      effects.updateLabel(msg.agentId, msg.name, msg.color);
      overlay.updateAgent({
        agentId: msg.agentId,
        name: msg.name,
        bio: msg.bio,
        capabilities: msg.capabilities,
        color: msg.color,
        pubkey: "",
        joinedAt: 0,
        lastSeen: Date.now(),
      });
      break;

    case "dm-notify":
      chatLog.addDM(msg.fromAgentId, msg.toAgentId, msg.preview);
      lobsterManager.showConnectionBeam(msg.fromAgentId, msg.toAgentId);
      break;
  }
});

ws.on("profiles", (_raw) => {
  const data = _raw as { profiles: AgentProfile[] };
  overlay.updateAgentList(data.profiles);
});

// Handle server errors (e.g. room full)
ws.on("error", (_raw) => {
  const data = _raw as { message: string };
  chatLog.addSystem(data.message);
});

// Handle room info from server
ws.on("roomInfo", (_raw) => {
  const data = _raw as { info: RoomInfoMessage };
  roomInfoBar.update(data.info);
});

ws.connect();

// ── Click to select lobster or building ────────────────────────

const pickRaycaster = new THREE.Raycaster();
const pickPointer = new THREE.Vector2();

renderer.domElement.addEventListener("click", (event: MouseEvent) => {
  // Don't process clicks when building panel is open
  if (buildingPanel.isVisible()) return;

  // First check for building clicks
  const rect = renderer.domElement.getBoundingClientRect();
  pickPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pickPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pickRaycaster.setFromCamera(pickPointer, camera);

  // Collect building meshes
  const buildingMeshes: THREE.Mesh[] = [];
  for (const b of buildings) {
    b.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) buildingMeshes.push(child);
    });
  }
  const buildingHits = pickRaycaster.intersectObjects(buildingMeshes, false);
  if (buildingHits.length > 0) {
    let obj: THREE.Object3D | null = buildingHits[0].object;
    while (obj) {
      if (obj.userData.buildingId === "moltbook") {
        buildingPanel.showMoltbook();
        return;
      }
      if (obj.userData.buildingId === "clawhub") {
        buildingPanel.showClawhub();
        return;
      }
      if (obj.userData.buildingId === "worlds-portal") {
        buildingPanel.showWorlds();
        return;
      }
      if (obj.userData.buildingId === "skill-tower") {
        buildingPanel.showSkillTower();
        return;
      }
      if (obj.userData.buildingId === "moltx") {
        buildingPanel.showMoltx();
        return;
      }
      if (obj.userData.buildingId === "moltlaunch") {
        buildingPanel.showMoltlaunch();
        return;
      }
      obj = obj.parent;
    }
  }

  // Then check for lobster clicks
  const agentId = lobsterManager.pick(event, camera, renderer.domElement);
  if (agentId) {
    const profile = overlay.getAgent(agentId);
    if (profile) {
      profilePanel.show(profile);
      const pos = lobsterManager.getPosition(agentId);
      if (pos) {
        controls.target.set(pos.x, pos.y + 2, pos.z);
      }
    }
  }
});

// ── Camera follow ─────────────────────────────────────────────

let followAgentId: string | null = focusAgent;

window.addEventListener("agent:select", ((e: CustomEvent<{ agentId: string }>) => {
  const agentId = e.detail.agentId;
  if (followAgentId === agentId) {
    // Click again to unfollow
    followAgentId = null;
  } else {
    followAgentId = agentId;
    // Snap camera to agent immediately
    const pos = lobsterManager.getPosition(agentId);
    if (pos) {
      controls.target.set(pos.x, pos.y + 2, pos.z);
    }
  }
}) as EventListener);

// Clicking on the 3D scene (not on an agent) unfollows
renderer.domElement.addEventListener("dblclick", () => {
  followAgentId = null;
});

// ── Animation loop ─────────────────────────────────────────────

let viewportReportTimer = 0;
const VIEWPORT_REPORT_INTERVAL = 1.0; // seconds

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // Update player movement
  playerController.update(keys, delta);

  // Move local player kobold immediately (bypass interpolation)
  if (playerController.agentId) {
    lobsterManager.setPositionImmediate(
      playerController.agentId,
      playerController.posX,
      0,
      playerController.posZ,
      playerController.posRotation
    );

    // Set walk animation on local player while moving
    if (playerController.moving) {
      lobsterManager.setAction(playerController.agentId, "walk");
      // Snap camera back to player when they start moving
      if (followAgentId !== playerController.agentId) {
        followAgentId = playerController.agentId;
      }
    }
  }

  lobsterManager.update(delta);
  effects.update(camera);

  // Follow agent: track their position
  if (followAgentId) {
    const pos = lobsterManager.getPosition(followAgentId);
    if (pos) {
      const dest = new THREE.Vector3(pos.x, pos.y + 2, pos.z);
      if (followAgentId === playerController.agentId && playerController.moving) {
        // Player is actively moving — move camera target + position together
        const offset = camera.position.clone().sub(controls.target);
        controls.target.copy(dest);
        camera.position.copy(dest).add(offset);
      } else {
        // AI agent or idle player — smooth lerp
        controls.target.lerp(dest, 0.08);
      }
    }
  }

  controls.update();

  // Report camera position to server for AOI filtering (every 1s)
  viewportReportTimer += delta;
  if (viewportReportTimer >= VIEWPORT_REPORT_INTERVAL) {
    viewportReportTimer = 0;
    const target = controls.target;
    ws.reportViewport(target.x, target.z);
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

animate();

// ── Resize handler ─────────────────────────────────────────────

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
});

// ── Cleanup on tab close ───────────────────────────────────────

window.addEventListener("beforeunload", () => {
  playerController.leave();
});
