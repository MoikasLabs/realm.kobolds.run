import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import type {
  WSServerMessage,
  WSClientMessage,
  AgentProfile,
  RoomInfoMessage,
  WorldMessage,
} from "./types.js";
import type { ClientManager } from "./client-manager.js";
import type { AgentRegistry } from "./agent-registry.js";
import type { CommandQueue } from "./command-queue.js";
import type { WorldState } from "./world-state.js";
import type { RoomConfig } from "./room-config.js";
import { filterText } from "./profanity-filter.js";

/**
 * WebSocket bridge for browser clients.
 *
 * The game loop now owns broadcasting (AOI-filtered).
 * This bridge only handles:
 *   - Connection lifecycle (add/remove from ClientManager)
 *   - Client-initiated requests (profiles, viewport updates, room info)
 *   - Player character commands (join, move, chat, action, leave)
 *   - Sending the initial snapshot on connect
 */
export class WSBridge {
  private wss: WebSocketServer;
  private clientManager: ClientManager;
  private getProfiles: () => AgentProfile[];
  private getProfile: (id: string) => AgentProfile | undefined;
  private getRoomInfo: (() => RoomInfoMessage) | null;
  private registry: AgentRegistry;
  private commandQueue: CommandQueue;
  private state: WorldState;
  private config: RoomConfig;

  constructor(
    server: Server,
    clientManager: ClientManager,
    opts: {
      getProfiles: () => AgentProfile[];
      getProfile: (id: string) => AgentProfile | undefined;
      getRoomInfo?: () => RoomInfoMessage;
      registry: AgentRegistry;
      commandQueue: CommandQueue;
      state: WorldState;
      config: RoomConfig;
    }
  ) {
    this.clientManager = clientManager;
    this.getProfiles = opts.getProfiles;
    this.getProfile = opts.getProfile;
    this.getRoomInfo = opts.getRoomInfo ?? null;
    this.registry = opts.registry;
    this.commandQueue = opts.commandQueue;
    this.state = opts.state;
    this.config = opts.config;

    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const client = this.clientManager.addClient(ws);
      console.log(`[ws] Client ${client.id} connected (${this.clientManager.size} total)`);

      // Parse ?agent= param for preview mode follow
      const url = new URL(req.url ?? "/", "http://localhost");
      const followAgent = url.searchParams.get("agent");
      if (followAgent) {
        this.clientManager.setFollowAgent(ws, followAgent);
      }

      // Send room info immediately on connect
      if (this.getRoomInfo) {
        this.send(ws, { type: "roomInfo", info: this.getRoomInfo() });
      }

      // Game loop will send the first snapshot on the next tick
      // (client.lastAckTick === 0 triggers full snapshot)

      ws.on("message", (raw) => {
        // Enforce message size limit (64KB) like the HTTP side
        const rawBuf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
        if (rawBuf.byteLength > 64 * 1024) {
          return; // Drop oversized messages
        }
        let msg: WSClientMessage;
        try {
          msg = JSON.parse(rawBuf.toString()) as WSClientMessage;
        } catch {
          return; // Ignore malformed JSON
        }
        try {
          this.handleClientMessage(ws, msg);
        } catch (err) {
          console.error("[ws] Error handling message:", err);
        }
      });

      ws.on("close", () => {
        // Auto-leave player on disconnect
        const clientState = this.clientManager.getByWs(ws);
        if (clientState?.playerAgentId) {
          const agentId = clientState.playerAgentId;
          const leaveMsg: WorldMessage = {
            worldType: "leave",
            agentId,
            timestamp: Date.now(),
          };
          this.commandQueue.enqueue(leaveMsg);
          this.registry.remove(agentId);
          clientState.playerAgentId = undefined;
        }

        this.clientManager.removeClient(ws);
        console.log(`[ws] Client disconnected (${this.clientManager.size} total)`);
      });
    });
  }

  private handleClientMessage(ws: WebSocket, msg: WSClientMessage): void {
    switch (msg.type) {
      case "subscribe":
        // Client wants a fresh snapshot — reset ack to trigger full snapshot next tick
        {
          const state = this.clientManager.getByWs(ws);
          if (state) state.lastAckTick = 0;
        }
        break;

      case "requestProfiles":
        this.send(ws, {
          type: "profiles",
          profiles: this.getProfiles(),
        });
        break;

      case "requestProfile":
        if (msg.agentId) {
          const profile = this.getProfile(msg.agentId);
          if (profile) {
            this.send(ws, { type: "profile", profile });
          }
        }
        break;

      case "viewport":
        // Client reports camera position for AOI filtering
        if ("x" in msg && "z" in msg) {
          const m = msg as unknown as { x: number; z: number };
          this.clientManager.updateViewport(ws, m.x, m.z);
        }
        break;

      case "follow":
        // Client wants to follow a specific agent
        if ("agentId" in msg) {
          this.clientManager.setFollowAgent(ws, (msg as unknown as { agentId: string }).agentId);
        }
        break;

      case "requestRoomInfo":
        if (this.getRoomInfo) {
          this.send(ws, { type: "roomInfo", info: this.getRoomInfo() });
        }
        break;

      // ── Player character messages ─────────────────────────────

      case "playerJoin": {
        const clientState = this.clientManager.getByWs(ws);
        if (!clientState) break;

        // Don't allow double-join
        if (clientState.playerAgentId) break;

        // Enforce player limit
        if (this.clientManager.getPlayerCount() >= this.config.maxPlayers) {
          this.send(ws, { type: "error", message: "Room is full" });
          break;
        }

        // Enforce overall agent limit
        if (this.state.getActiveAgentIds().size >= this.config.maxAgents) {
          this.send(ws, { type: "error", message: "Room is full" });
          break;
        }

        const agentId = `player-${clientState.id}-${Date.now()}`;
        const name = msg.name?.slice(0, 32) || "Player";
        const color = msg.color;

        this.registry.register({
          agentId,
          name,
          color,
          bio: "Human player",
          capabilities: ["player"],
        });

        const joinMsg: WorldMessage = {
          worldType: "join",
          agentId,
          name,
          color,
          bio: "Human player",
          capabilities: ["player"],
          timestamp: Date.now(),
        };
        this.commandQueue.enqueue(joinMsg);

        clientState.playerAgentId = agentId;
        this.send(ws, { type: "playerJoined", agentId });
        break;
      }

      case "playerMove": {
        const clientState = this.clientManager.getByWs(ws);
        if (!clientState?.playerAgentId) break;

        const x = Number(msg.x);
        const z = Number(msg.z);
        const rotation = Number(msg.rotation);
        if (!isFinite(x) || !isFinite(z) || !isFinite(rotation)) break;

        const posMsg: WorldMessage = {
          worldType: "position",
          agentId: clientState.playerAgentId,
          x,
          y: 0,
          z,
          rotation,
          timestamp: Date.now(),
        };
        this.commandQueue.enqueue(posMsg);

        const actionMsg: WorldMessage = {
          worldType: "action",
          agentId: clientState.playerAgentId,
          action: "walk",
          timestamp: Date.now(),
        };
        this.commandQueue.enqueue(actionMsg);
        break;
      }

      case "playerChat": {
        const clientState = this.clientManager.getByWs(ws);
        if (!clientState?.playerAgentId) break;

        let text = msg.text?.slice(0, 500);
        if (!text) break;

        if (this.config.profanityFilter) {
          text = filterText(text);
        }

        const chatMsg: WorldMessage = {
          worldType: "chat",
          agentId: clientState.playerAgentId,
          text,
          timestamp: Date.now(),
        };
        this.commandQueue.enqueue(chatMsg);
        break;
      }

      case "playerAction": {
        const clientState = this.clientManager.getByWs(ws);
        if (!clientState?.playerAgentId) break;

        const actionMsg: WorldMessage = {
          worldType: "action",
          agentId: clientState.playerAgentId,
          action: (msg.action || "idle") as "walk" | "idle" | "wave" | "pinch" | "talk" | "dance" | "backflip" | "spin",
          timestamp: Date.now(),
        };
        this.commandQueue.enqueue(actionMsg);
        break;
      }

      case "playerLeave": {
        const clientState = this.clientManager.getByWs(ws);
        if (!clientState?.playerAgentId) break;

        const agentId = clientState.playerAgentId;
        const leaveMsg: WorldMessage = {
          worldType: "leave",
          agentId,
          timestamp: Date.now(),
        };
        this.commandQueue.enqueue(leaveMsg);
        this.registry.remove(agentId);
        clientState.playerAgentId = undefined;
        break;
      }
    }
  }

  private send(ws: WebSocket, msg: WSServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
