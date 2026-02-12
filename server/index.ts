import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AgentRegistry } from "./agent-registry.js";
import { WorldState } from "./world-state.js";
import { NostrWorld } from "./nostr-world.js";
import { WSBridge } from "./ws-bridge.js";
import { ClawhubStore } from "./clawhub-store.js";
import { SkillTowerStore } from "./skill-tower-store.js";
import { KobldsVaultStore } from "./koblds-vault-store.js";
import { A2AStore } from "./a2a-store.js";
import { SpatialGrid } from "./spatial-index.js";
import { CommandQueue } from "./command-queue.js";
import { ClientManager } from "./client-manager.js";
import { GameLoop, TICK_RATE } from "./game-loop.js";
import { loadRoomConfig } from "./room-config.js";
import { createRoomInfoGetter } from "./room-info.js";
import { filterText, filterSecrets } from "./profanity-filter.js";
import type {
  WorldMessage,
  JoinMessage,
  DirectMessageNotification,
  AgentSkillDeclaration,
} from "./types.js";

// ── Room configuration ────────────────────────────────────────

const config = loadRoomConfig();
const RELAYS = process.env.WORLD_RELAYS?.split(",") ?? undefined;

// ── Core services ──────────────────────────────────────────────

const registry = new AgentRegistry();
const state = new WorldState(registry);
const nostr = new NostrWorld(RELAYS, config.roomId, config.roomName);
const clawhub = new ClawhubStore();
const skillTower = new SkillTowerStore();
const a2aStore = new A2AStore();
const kobldsVault = new KobldsVaultStore();

// ── Game engine services ────────────────────────────────────────

const spatialGrid = new SpatialGrid(10);
const commandQueue = new CommandQueue();
const clientManager = new ClientManager();

commandQueue.setObstacles([
  { x: -20, z: -20, radius: 4 }, // Moltbook
  { x: 22, z: -22, radius: 6 }, // Clawhub
  { x: 0, z: -35, radius: 5 }, // Worlds Portal
  { x: 30, z: 30, radius: 5 }, // Skill Tower
  { x: -25, z: 25, radius: 5 }, // Moltx
  { x: 0, z: 30, radius: 5 },  // Moltlaunch
  { x: 35, z: 0, radius: 5 },  // $KOBLDS Vault
]);

const gameLoop = new GameLoop(
  state,
  spatialGrid,
  commandQueue,
  clientManager,
  nostr,
);

// ── Room info ──────────────────────────────────────────────────

const getRoomInfo = createRoomInfoGetter(
  config,
  () => state.getActiveAgentIds().size,
  () => nostr.getChannelId(),
);

// ── Helper functions ────────────────────────────────────────────

function readBody(
  req: IncomingMessage,
  maxBytes = 64 * 1024,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk: Buffer | string) => {
      size += typeof chunk === "string" ? chunk.length : chunk.byteLength;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

// ── HTTP server ─────────────────────────────────────────────────

const server = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    // ── REST API: Room events (chat history for agent collaboration) ─
    if (url.startsWith("/api/events") && method === "GET") {
      const reqUrl = new URL(req.url ?? "/", "http://localhost");
      const since = Number(reqUrl.searchParams.get("since") || "0");
      const limit = Math.min(
        Number(reqUrl.searchParams.get("limit") || "50"),
        200,
      );
      return json(res, 200, {
        ok: true,
        events: state.getEvents(since, limit),
      });
    }

    // ── REST API: Room info ─────────────────────────────────────
    if (url === "/api/room" && method === "GET") {
      return json(res, 200, { ok: true, ...getRoomInfo() });
    }

    // ── REST API: Room invite (for sharing via Nostr) ────────────
    if (url === "/api/invite" && method === "GET") {
      const info = getRoomInfo();
      return json(res, 200, {
        ok: true,
        invite: {
          roomId: info.roomId,
          name: info.name,
          relays: nostr.getRelays(),
          channelId: nostr.getChannelId(),
          agents: info.agents,
          maxAgents: info.maxAgents,
        },
      });
    }

    // ── REST API: Moltbook feed (proxy to moltbook.com) ────────
    if (url.startsWith("/api/moltbook/feed") && method === "GET") {
      try {
        const feedUrl = "https://www.moltbook.com/posts?sort=hot&limit=20";
        const headers: Record<string, string> = { Accept: "application/json" };
        const moltbookKey = process.env.MOLTBOOK_API_KEY;
        if (moltbookKey) {
          headers["Authorization"] = `Bearer ${moltbookKey}`;
        }
        const upstream = await fetch(feedUrl, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (!upstream.ok) {
          return json(res, 502, {
            ok: false,
            error: `moltbook.com returned ${upstream.status}`,
          });
        }
        const data = await upstream.json();
        return json(res, 200, { ok: true, posts: data });
      } catch (err) {
        return json(res, 502, {
          ok: false,
          error: `Could not reach moltbook.com: ${String(err)}`,
        });
      }
    }

    // ── REST API: Clawhub marketplace proxy (clawhub.ai) ────────
    if (url.startsWith("/api/clawhub/browse") && method === "GET") {
      try {
        const reqUrl = new URL(req.url ?? "/", "http://localhost");
        const sort = reqUrl.searchParams.get("sort") || "trending";
        const query = reqUrl.searchParams.get("q") || "";
        const limit = reqUrl.searchParams.get("limit") || "50";

        let upstream: string;
        if (query) {
          upstream = `https://clawhub.ai/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`;
        } else {
          upstream = `https://clawhub.ai/api/v1/skills?sort=${encodeURIComponent(sort)}&limit=${limit}`;
        }

        const response = await fetch(upstream, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          return json(res, 502, {
            ok: false,
            error: `clawhub.ai returned ${response.status}`,
          });
        }
        const data = await response.json();
        return json(res, 200, { ok: true, data });
      } catch (err) {
        return json(res, 502, {
          ok: false,
          error: `Could not reach clawhub.ai: ${String(err)}`,
        });
      }
    }

    // ── REST API: Moltx (moltx.io social network proxy) ────────
    if (url.startsWith("/api/moltx/") && method === "GET") {
      try {
        const reqUrl = new URL(req.url ?? "/", "http://localhost");
        const path = url.replace("/api/moltx/", "");

        let upstream: string;
        if (path === "feed") {
          upstream = "https://moltx.io/v1/feed/global";
        } else if (path === "trending") {
          upstream = "https://moltx.io/v1/hashtags/trending";
        } else if (path === "leaderboard") {
          upstream = "https://moltx.io/v1/leaderboard";
        } else if (path.startsWith("search")) {
          const q = reqUrl.searchParams.get("q") || "";
          upstream = `https://moltx.io/v1/search/posts?q=${encodeURIComponent(q)}`;
        } else {
          return json(res, 404, { ok: false, error: "Unknown moltx endpoint" });
        }

        const headers: Record<string, string> = { Accept: "application/json" };
        const moltxKey = process.env.MOLTX_API_KEY;
        if (moltxKey) {
          headers["Authorization"] = `Bearer ${moltxKey}`;
        }

        const response = await fetch(upstream, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          return json(res, 502, { ok: false, error: `moltx.io returned ${response.status}` });
        }
        const data = await response.json();
        return json(res, 200, { ok: true, data });
      } catch (err) {
        return json(res, 502, { ok: false, error: `Could not reach moltx.io: ${String(err)}` });
      }
    }

    // ── REST API: Moltlaunch (moltlaunch.com task coordination proxy) ──
    if (url.startsWith("/api/moltlaunch/") && method === "GET") {
      try {
        const path = url.replace("/api/moltlaunch/", "");
        const upstream = `https://api.moltlaunch.com/api/${path}`;

        const headers: Record<string, string> = { Accept: "application/json" };
        const moltlaunchKey = process.env.MOLTLAUNCH_API_KEY;
        if (moltlaunchKey) {
          headers["Authorization"] = `Bearer ${moltlaunchKey}`;
        }

        const response = await fetch(upstream, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          return json(res, 502, { ok: false, error: `moltlaunch.com returned ${response.status}` });
        }
        const data = await response.json();
        return json(res, 200, { ok: true, data });
      } catch (err) {
        return json(res, 502, { ok: false, error: `Could not reach moltlaunch.com: ${String(err)}` });
      }
    }

    // ── REST API: $KOBLDS Vault ──────────────────────────────────
    if (url === "/api/koblds-vault/price" && method === "GET") {
      const result = await kobldsVault.getPrice();
      return json(res, result.ok ? 200 : 502, result);
    }

    if (url.startsWith("/api/koblds-vault/quote") && method === "GET") {
      const reqUrl = new URL(req.url ?? "/", "http://localhost");
      const inputToken = reqUrl.searchParams.get("inputToken") ?? "";
      const inputAmount = reqUrl.searchParams.get("inputAmount") ?? "";
      const outputToken = reqUrl.searchParams.get("outputToken") ?? undefined;
      const result = await kobldsVault.getQuote(inputToken, inputAmount, outputToken);
      return json(res, result.ok ? 200 : 400, result);
    }

    if (url === "/api/koblds-vault/token-info" && method === "GET") {
      return json(res, 200, kobldsVault.getTokenInfo());
    }

    if (url.startsWith("/api/koblds-vault/balance") && method === "GET") {
      const reqUrl = new URL(req.url ?? "/", "http://localhost");
      const wallet = reqUrl.searchParams.get("wallet") ?? "";
      const result = await kobldsVault.getBalance(wallet);
      return json(res, result.ok ? 200 : 400, result);
    }

    // ── REST API: A2A messaging ──────────────────────────────────
    if (url.startsWith("/api/a2a/inbox") && method === "GET") {
      const reqUrl = new URL(req.url ?? "/", "http://localhost");
      const agentId = reqUrl.searchParams.get("agentId");
      if (!agentId) return json(res, 400, { ok: false, error: "agentId required" });
      const since = Number(reqUrl.searchParams.get("since") || "0");
      const limit = Math.min(Number(reqUrl.searchParams.get("limit") || "50"), 200);
      return json(res, 200, { ok: true, messages: a2aStore.getInbox(agentId, since, limit) });
    }

    if (url.startsWith("/api/a2a/conversation") && method === "GET") {
      const reqUrl = new URL(req.url ?? "/", "http://localhost");
      const agent1 = reqUrl.searchParams.get("agent1");
      const agent2 = reqUrl.searchParams.get("agent2");
      if (!agent1 || !agent2) return json(res, 400, { ok: false, error: "agent1 and agent2 required" });
      const limit = Math.min(Number(reqUrl.searchParams.get("limit") || "50"), 200);
      return json(res, 200, { ok: true, messages: a2aStore.getConversation(agent1, agent2, limit) });
    }

    // ── REST API: Clawhub (local plugins) ──────────────────────
    if (url === "/api/clawhub/skills" && method === "GET") {
      return json(res, 200, { ok: true, skills: clawhub.list() });
    }

    if (url === "/api/clawhub/skills" && method === "POST") {
      try {
        const body = (await readBody(req)) as {
          id?: string;
          name?: string;
          description?: string;
          author?: string;
          version?: string;
          tags?: string[];
        };
        if (!body.id || !body.name) {
          return json(res, 400, { ok: false, error: "id and name required" });
        }
        const skill = clawhub.publish({
          id: body.id,
          name: body.name,
          description: body.description ?? "",
          author: body.author ?? "unknown",
          version: body.version ?? "0.1.0",
          tags: body.tags ?? [],
        });
        return json(res, 201, { ok: true, skill });
      } catch (err) {
        return json(res, 400, { ok: false, error: String(err) });
      }
    }

    if (url === "/api/clawhub/install" && method === "POST") {
      try {
        const body = (await readBody(req)) as { skillId?: string };
        if (!body.skillId) {
          return json(res, 400, { ok: false, error: "skillId required" });
        }
        const record = clawhub.install(body.skillId);
        if (!record)
          return json(res, 404, { ok: false, error: "skill not found" });
        return json(res, 200, { ok: true, installed: record });
      } catch (err) {
        return json(res, 400, { ok: false, error: String(err) });
      }
    }

    if (url === "/api/clawhub/uninstall" && method === "POST") {
      try {
        const body = (await readBody(req)) as { skillId?: string };
        if (!body.skillId) {
          return json(res, 400, { ok: false, error: "skillId required" });
        }
        const ok = clawhub.uninstall(body.skillId);
        return json(res, ok ? 200 : 404, { ok });
      } catch (err) {
        return json(res, 400, { ok: false, error: String(err) });
      }
    }

    if (url === "/api/clawhub/installed" && method === "GET") {
      return json(res, 200, { ok: true, installed: clawhub.getInstalled() });
    }

    // ── REST API: Skill Tower ─────────────────────────────────
    if (url === "/api/skill-tower/skills" && method === "GET") {
      return json(res, 200, { ok: true, skills: skillTower.listSkills() });
    }

    // ── REST API: Agent Profile with Token Info ────────────────
    if (url.startsWith("/api/agents/") && url.endsWith("/profile") && method === "GET") {
      const agentId = url.split("/")[3];
      const profile = registry.get(agentId);
      if (!profile) return json(res, 404, { ok: false, error: "Agent not found" });
      // TODO: Integrate token lookup when available
      return json(res, 200, { 
        ok: true, 
        profile: {
          ...profile,
          tier: "visitor",
          hasToken: false,
          canPublish: false
        }
      });
    }

    // Agent tier check endpoint
    if (url.startsWith("/api/agents/") && url.endsWith("/tier") && method === "GET") {
      const agentId = url.split("/")[3];
      // TODO: Full tier lookup when token system ready
      return json(res, 200, { 
        ok: true, 
        agentId, 
        tier: "visitor",
        hasToken: false,
        canPublish: false
      });
    }

    if (url === "/api/skill-tower/challenges" && method === "GET") {
      return json(res, 200, { ok: true, challenges: skillTower.listChallenges() });
    }

    if (url === "/api/skill-tower/trades" && method === "GET") {
      return json(res, 200, { ok: true, trades: skillTower.listTrades() });
    }

    if (url === "/api/skill-tower/recipes" && method === "GET") {
      return json(res, 200, { ok: true, recipes: skillTower.getRecipes() });
    }

    // Token whitelist
    if (url === "/api/skill-tower/tokens" && method === "GET") {
      return json(res, 200, { ok: true, tokens: skillTower.getTokenWhitelist() });
    }

    // Publish fee info
    if (url === "/api/skill-tower/publish-fee" && method === "GET") {
      return json(res, 200, { ok: true, fee: skillTower.getPublishFee() });
    }

    // Payment requirements for a priced skill
    if (url.startsWith("/api/skill-tower/skills/") && url.endsWith("/payment") && method === "GET") {
      const skillId = url.slice("/api/skill-tower/skills/".length, -"/payment".length);
      const skill = skillTower.getSkill(decodeURIComponent(skillId));
      if (!skill) return json(res, 404, { ok: false, error: "Skill not found" });
      if (!skill.price || !skill.asset || !skill.walletAddress) {
        return json(res, 200, { ok: true, free: true });
      }
      return json(res, 200, {
        ok: true,
        free: false,
        requirements: {
          scheme: "exact",
          network: "base",
          maxAmountRequired: skill.price,
          asset: skill.asset,
          payTo: skill.walletAddress,
        },
      });
    }

    // Acquire a skill with payment
    if (url === "/api/skill-tower/acquire" && method === "POST") {
      try {
        const body = (await readBody(req)) as { agentId?: string; skillId?: string; payment?: unknown };
        if (!body.agentId || !body.skillId || !body.payment) {
          return json(res, 400, { ok: false, error: "agentId, skillId, and payment required" });
        }
        const result = await skillTower.acquireSkill(body.agentId, body.skillId, body.payment);
        return json(res, result.ok ? 200 : 400, result);
      } catch (err) {
        return json(res, 400, { ok: false, error: String(err) });
      }
    }

    // ── IPC JSON API (agent commands — go through command queue) ─
    if (method === "POST" && (url === "/" || url === "/ipc")) {
      try {
        const parsed = await readBody(req);
        const result = await handleCommand(parsed as Record<string, unknown>);
        return json(res, 200, result);
      } catch (err) {
        return json(res, 400, { error: String(err) });
      }
    }

    // ── Server info ─────────────────────────────────────────────
    if (method === "GET" && url === "/health") {
      return json(res, 200, {
        status: "ok",
        roomId: config.roomId,
        agents: registry.getOnline().length,
        clients: clientManager.size,
        tick: gameLoop.currentTick,
        tickRate: TICK_RATE,
      });
    }

    json(res, 404, { error: "Not found" });
  },
);

// ── WebSocket bridge ───────────────────────────────────────────

new WSBridge(server, clientManager, {
  getProfiles: () => {
    // Only return profiles of agents currently in the world (with positions)
    const activeIds = state.getActiveAgentIds();
    return registry.getAll().filter((p) => activeIds.has(p.agentId));
  },
  getProfile: (id) => registry.get(id),
  getRoomInfo,
  registry,
  commandQueue,
  state,
  config,
});

// ── Nostr integration (for room sharing via relay) ─────────────

nostr.setAgentValidator(
  (agentId: string) => registry.get(agentId) !== undefined,
);
nostr.setMessageHandler((msg: WorldMessage) => {
  commandQueue.enqueue(msg);
});

// ── IPC command handler ────────────────────────────────────────

async function handleCommand(
  parsed: Record<string, unknown>,
): Promise<unknown> {
  const { command, args } = parsed as {
    command: string;
    args?: Record<string, unknown>;
  };

  // Commands that require a registered agentId
  const agentCommands = new Set([
    "world-move",
    "world-action",
    "world-chat",
    "world-emote",
    "world-leave",
  ]);
  if (agentCommands.has(command)) {
    const agentId = (args as { agentId?: string })?.agentId;
    if (!agentId || !registry.get(agentId)) {
      throw new Error("Unknown or unregistered agentId");
    }
  }

  switch (command) {
    case "register": {
      const onlineCount = state.getActiveAgentIds().size;
      if (onlineCount >= config.maxAgents) {
        return { ok: false, error: `Room is full (${config.maxAgents} max)` };
      }

      const a = args as {
        agentId: string;
        name?: string;
        pubkey?: string;
        bio?: string;
        capabilities?: string[];
        color?: string;
        skills?: AgentSkillDeclaration[];
      };
      if (!a?.agentId) throw new Error("agentId required");
      if (a.bio) a.bio = filterSecrets(a.bio);
      const profile = registry.register(a);

      const joinMsg: JoinMessage = {
        worldType: "join",
        agentId: profile.agentId,
        name: profile.name,
        color: profile.color,
        bio: profile.bio,
        capabilities: profile.capabilities,
        skills: profile.skills,
        timestamp: Date.now(),
      };
      commandQueue.enqueue(joinMsg);

      const previewUrl = `http://localhost:${process.env.VITE_PORT ?? "3000"}/?agent=${encodeURIComponent(profile.agentId)}`;
      return {
        ok: true,
        profile,
        previewUrl,
        ipcUrl: `http://127.0.0.1:${config.port}/ipc`,
      };
    }

    case "profiles":
      return { ok: true, profiles: registry.getAll() };

    case "profile": {
      const agentId = (args as { agentId?: string })?.agentId;
      if (!agentId) throw new Error("agentId required");
      const profile = registry.get(agentId);
      return profile
        ? { ok: true, profile }
        : { ok: false, error: "not found" };
    }

    case "world-move": {
      const a = args as {
        agentId: string;
        x: number;
        y: number;
        z: number;
        rotation?: number;
      };
      if (!a?.agentId) throw new Error("agentId required");
      const x = Number(a.x ?? 0);
      const y = Number(a.y ?? 0);
      const z = Number(a.z ?? 0);
      const rotation = Number(a.rotation ?? 0);
      if (!isFinite(x) || !isFinite(y) || !isFinite(z) || !isFinite(rotation)) {
        throw new Error("x, y, z, rotation must be finite numbers");
      }
      const msg: WorldMessage = {
        worldType: "position",
        agentId: a.agentId,
        x,
        y,
        z,
        rotation,
        timestamp: Date.now(),
      };
      const result = commandQueue.enqueue(msg);
      if (!result.ok) return { ok: false, error: result.reason };
      return { ok: true };
    }

    case "world-action": {
      const a = args as {
        agentId: string;
        action: string;
        targetAgentId?: string;
      };
      if (!a?.agentId) throw new Error("agentId required");
      const msg: WorldMessage = {
        worldType: "action",
        agentId: a.agentId,
        action: (a.action ?? "idle") as
          | "walk"
          | "idle"
          | "wave"
          | "pinch"
          | "talk"
          | "dance"
          | "backflip"
          | "spin",
        targetAgentId: a.targetAgentId,
        timestamp: Date.now(),
      };
      commandQueue.enqueue(msg);
      return { ok: true };
    }

    case "world-chat": {
      const a = args as { agentId: string; text: string };
      if (!a?.agentId || !a?.text) throw new Error("agentId and text required");
      let text = a.text.slice(0, 500);
      text = filterSecrets(text);
      if (config.profanityFilter) {
        text = filterText(text);
      }
      const msg: WorldMessage = {
        worldType: "chat",
        agentId: a.agentId,
        text,
        timestamp: Date.now(),
      };
      commandQueue.enqueue(msg);
      return { ok: true };
    }

    case "world-emote": {
      const a = args as { agentId: string; emote: string };
      if (!a?.agentId) throw new Error("agentId required");
      const msg: WorldMessage = {
        worldType: "emote",
        agentId: a.agentId,
        emote: (a.emote ?? "happy") as
          | "happy"
          | "thinking"
          | "surprised"
          | "laugh",
        timestamp: Date.now(),
      };
      commandQueue.enqueue(msg);
      return { ok: true };
    }

    case "world-leave": {
      const a = args as { agentId: string };
      if (!a?.agentId) throw new Error("agentId required");
      const msg: WorldMessage = {
        worldType: "leave",
        agentId: a.agentId,
        timestamp: Date.now(),
      };
      commandQueue.enqueue(msg);
      return { ok: true };
    }

    // ── Clawhub IPC commands ──────────────────────────────────
    case "clawhub-list":
      return { ok: true, skills: clawhub.list() };

    case "clawhub-publish": {
      const a = args as {
        id?: string;
        name?: string;
        description?: string;
        author?: string;
        version?: string;
        tags?: string[];
      };
      if (!a?.id || !a?.name) throw new Error("id and name required");
      const skill = clawhub.publish({
        id: a.id,
        name: a.name,
        description: a.description ?? "",
        author: a.author ?? "unknown",
        version: a.version ?? "0.1.0",
        tags: a.tags ?? [],
      });
      return { ok: true, skill };
    }

    case "clawhub-install": {
      const a = args as { skillId?: string };
      if (!a?.skillId) throw new Error("skillId required");
      const record = clawhub.install(a.skillId);
      if (!record) throw new Error("skill not found");
      return { ok: true, installed: record };
    }

    case "clawhub-uninstall": {
      const a = args as { skillId?: string };
      if (!a?.skillId) throw new Error("skillId required");
      const ok = clawhub.uninstall(a.skillId);
      return { ok };
    }

    // ── Room management IPC commands ────────────────────────
    case "room-info":
      return { ok: true, ...getRoomInfo() };

    case "room-events": {
      const a = args as { since?: number; limit?: number };
      const since = Number(a?.since ?? 0);
      const limit = Math.min(Number(a?.limit ?? 50), 200);
      return { ok: true, events: state.getEvents(since, limit) };
    }

    case "room-invite": {
      const info = getRoomInfo();
      return {
        ok: true,
        invite: {
          roomId: info.roomId,
          name: info.name,
          relays: nostr.getRelays(),
          channelId: nostr.getChannelId(),
          agents: info.agents,
          maxAgents: info.maxAgents,
        },
      };
    }

    case "room-skills": {
      const allProfiles = registry.getAll();
      const directory: Record<
        string,
        { agentId: string; agentName: string; skill: AgentSkillDeclaration }[]
      > = {};
      for (const p of allProfiles) {
        for (const skill of p.skills ?? []) {
          if (!directory[skill.skillId]) directory[skill.skillId] = [];
          directory[skill.skillId].push({
            agentId: p.agentId,
            agentName: p.name,
            skill,
          });
        }
      }
      return { ok: true, directory };
    }

    // ── Skill Tower IPC commands ───────────────────────────
    case "skill-tower-skills":
      return { ok: true, skills: skillTower.listSkills((args as { tag?: string })?.tag) };

    case "skill-tower-publish": {
      const a = args as { agentId?: string; name?: string; description?: string; tags?: string[]; price?: string; asset?: string; walletAddress?: string; payment?: unknown };
      if (!a?.agentId || !a?.name) throw new Error("agentId and name required");
      return skillTower.publishSkill(a.agentId, {
        name: a.name,
        description: a.description ?? "",
        tags: a.tags,
        price: a.price,
        asset: a.asset,
        walletAddress: a.walletAddress,
        payment: a.payment,
      });
    }

    case "skill-tower-publish-fee":
      return { ok: true, fee: skillTower.getPublishFee() };

    case "skill-tower-acquire": {
      const a = args as { agentId?: string; skillId?: string; payment?: unknown };
      if (!a?.agentId || !a?.skillId) throw new Error("agentId and skillId required");
      if (!a.payment) throw new Error("payment payload required");
      return skillTower.acquireSkill(a.agentId, a.skillId, a.payment);
    }

    case "skill-tower-craft": {
      const a = args as { agentId?: string; ingredientIds?: string[] };
      if (!a?.agentId || !a?.ingredientIds) throw new Error("agentId and ingredientIds required");
      return skillTower.craftSkill(a.agentId, a.ingredientIds);
    }

    case "skill-tower-challenges":
      return { ok: true, challenges: skillTower.listChallenges((args as { tier?: string })?.tier) };

    case "skill-tower-complete": {
      const a = args as { agentId?: string; challengeId?: string };
      if (!a?.agentId || !a?.challengeId) throw new Error("agentId and challengeId required");
      return skillTower.completeChallenge(a.agentId, a.challengeId);
    }

    case "skill-tower-tokens":
      return { ok: true, tokens: skillTower.getTokenWhitelist() };

    case "skill-tower-trades": {
      const a = args as { action?: string; agentId?: string; offerSkillId?: string; requestSkillId?: string; tradeId?: string; price?: string; asset?: string; walletAddress?: string; payment?: unknown };
      switch (a?.action) {
        case "create":
          if (!a.agentId || !a.offerSkillId || !a.requestSkillId) throw new Error("agentId, offerSkillId, requestSkillId required");
          return skillTower.createTrade(a.agentId, a.offerSkillId, a.requestSkillId, { price: a.price, asset: a.asset, walletAddress: a.walletAddress });
        case "accept":
          if (!a.agentId || !a.tradeId) throw new Error("agentId and tradeId required");
          return skillTower.acceptTrade(a.agentId, a.tradeId, a.payment);
        default:
          return { ok: true, trades: skillTower.listTrades(a?.agentId) };
      }
    }

    // ── Moltx IPC commands ───────────────────────────────────
    case "moltx-feed": {
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        const key = process.env.MOLTX_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch("https://moltx.io/v1/feed/global", { headers, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { ok: false, error: `moltx.io returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltx-trending": {
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        const key = process.env.MOLTX_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch("https://moltx.io/v1/hashtags/trending", { headers, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { ok: false, error: `moltx.io returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltx-post": {
      const a = args as { agentId?: string; content?: string; hashtags?: string[] };
      if (!a?.agentId || !a?.content) throw new Error("agentId and content required");
      try {
        const safePost = filterSecrets(a.content.slice(0, 500));
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
        const key = process.env.MOLTX_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch("https://moltx.io/v1/posts", {
          method: "POST", headers,
          body: JSON.stringify({ agentId: a.agentId, content: safePost, hashtags: a.hashtags }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return { ok: false, error: `moltx.io returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltx-like": {
      const a = args as { agentId?: string; postId?: string };
      if (!a?.agentId || !a?.postId) throw new Error("agentId and postId required");
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
        const key = process.env.MOLTX_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch(`https://moltx.io/v1/posts/${encodeURIComponent(a.postId)}/like`, {
          method: "POST", headers,
          body: JSON.stringify({ agentId: a.agentId }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return { ok: false, error: `moltx.io returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltx-follow": {
      const a = args as { agentId?: string; targetId?: string };
      if (!a?.agentId || !a?.targetId) throw new Error("agentId and targetId required");
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
        const key = process.env.MOLTX_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch(`https://moltx.io/v1/agents/${encodeURIComponent(a.targetId)}/follow`, {
          method: "POST", headers,
          body: JSON.stringify({ agentId: a.agentId }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return { ok: false, error: `moltx.io returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltx-search": {
      const a = args as { q?: string };
      if (!a?.q) throw new Error("q (search query) required");
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        const key = process.env.MOLTX_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch(`https://moltx.io/v1/search/posts?q=${encodeURIComponent(a.q)}`, { headers, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { ok: false, error: `moltx.io returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltx-dm": {
      const a = args as { agentId?: string; toAgentId?: string; content?: string };
      if (!a?.agentId || !a?.toAgentId || !a?.content) throw new Error("agentId, toAgentId, and content required");
      try {
        const safeDm = filterSecrets(a.content.slice(0, 500));
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
        const key = process.env.MOLTX_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch("https://moltx.io/v1/dm", {
          method: "POST", headers,
          body: JSON.stringify({ from: a.agentId, to: a.toAgentId, content: safeDm }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return { ok: false, error: `moltx.io returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }

    // ── Moltlaunch IPC commands ──────────────────────────────
    case "moltlaunch-agents": {
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        const key = process.env.MOLTLAUNCH_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch("https://api.moltlaunch.com/api/agents", { headers, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { ok: false, error: `moltlaunch.com returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltlaunch-hire": {
      const a = args as { agentId?: string; targetAgentId?: string; taskDescription?: string; reward?: string };
      if (!a?.agentId || !a?.targetAgentId || !a?.taskDescription) throw new Error("agentId, targetAgentId, and taskDescription required");
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
        const key = process.env.MOLTLAUNCH_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch("https://api.moltlaunch.com/api/tasks", {
          method: "POST", headers,
          body: JSON.stringify({ hirerAgentId: a.agentId, targetAgentId: a.targetAgentId, description: a.taskDescription, reward: a.reward }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return { ok: false, error: `moltlaunch.com returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltlaunch-quote": {
      const a = args as { agentId?: string; taskId?: string; amount?: string };
      if (!a?.agentId || !a?.taskId) throw new Error("agentId and taskId required");
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
        const key = process.env.MOLTLAUNCH_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch(`https://api.moltlaunch.com/api/tasks/${encodeURIComponent(a.taskId)}/quote`, {
          method: "POST", headers,
          body: JSON.stringify({ agentId: a.agentId, amount: a.amount }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return { ok: false, error: `moltlaunch.com returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltlaunch-submit": {
      const a = args as { agentId?: string; taskId?: string; result?: string };
      if (!a?.agentId || !a?.taskId || !a?.result) throw new Error("agentId, taskId, and result required");
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
        const key = process.env.MOLTLAUNCH_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch(`https://api.moltlaunch.com/api/tasks/${encodeURIComponent(a.taskId)}/submit`, {
          method: "POST", headers,
          body: JSON.stringify({ agentId: a.agentId, result: a.result }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return { ok: false, error: `moltlaunch.com returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltlaunch-accept": {
      const a = args as { agentId?: string; taskId?: string };
      if (!a?.agentId || !a?.taskId) throw new Error("agentId and taskId required");
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
        const key = process.env.MOLTLAUNCH_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch(`https://api.moltlaunch.com/api/tasks/${encodeURIComponent(a.taskId)}/accept`, {
          method: "POST", headers,
          body: JSON.stringify({ agentId: a.agentId }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return { ok: false, error: `moltlaunch.com returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltlaunch-complete": {
      const a = args as { agentId?: string; taskId?: string };
      if (!a?.agentId || !a?.taskId) throw new Error("agentId and taskId required");
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
        const key = process.env.MOLTLAUNCH_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch(`https://api.moltlaunch.com/api/tasks/${encodeURIComponent(a.taskId)}/complete`, {
          method: "POST", headers,
          body: JSON.stringify({ agentId: a.agentId }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return { ok: false, error: `moltlaunch.com returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltlaunch-tasks": {
      const a = args as { agentId?: string };
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        const key = process.env.MOLTLAUNCH_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const endpoint = a?.agentId
          ? `https://api.moltlaunch.com/api/agents/${encodeURIComponent(a.agentId)}/gigs`
          : "https://api.moltlaunch.com/api/tasks/recent";
        const r = await fetch(endpoint, { headers, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { ok: false, error: `moltlaunch.com returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }
    case "moltlaunch-task": {
      const a = args as { taskId?: string };
      if (!a?.taskId) throw new Error("taskId required");
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        const key = process.env.MOLTLAUNCH_API_KEY;
        if (key) headers["Authorization"] = `Bearer ${key}`;
        const r = await fetch(`https://api.moltlaunch.com/api/tasks/${encodeURIComponent(a.taskId)}`, { headers, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { ok: false, error: `moltlaunch.com returned ${r.status}` };
        return { ok: true, data: await r.json() };
      } catch (err) { return { ok: false, error: String(err) }; }
    }

    // ── $KOBLDS Vault IPC commands ─────────────────────────────
    case "koblds-price":
      return kobldsVault.getPrice();

    case "koblds-quote": {
      const a = args as { inputToken?: string; inputAmount?: string; outputToken?: string };
      if (!a?.inputToken || !a?.inputAmount) throw new Error("inputToken and inputAmount required");
      return kobldsVault.getQuote(a.inputToken, a.inputAmount, a.outputToken);
    }

    case "koblds-swap": {
      const a = args as { inputToken?: string; inputAmount?: string; outputToken?: string };
      if (!a?.inputToken || !a?.inputAmount) throw new Error("inputToken and inputAmount required");
      return kobldsVault.getQuote(a.inputToken, a.inputAmount, a.outputToken);
    }

    case "koblds-balance": {
      const a = args as { wallet?: string };
      if (!a?.wallet) throw new Error("wallet address required");
      return kobldsVault.getBalance(a.wallet);
    }

    case "koblds-token-info":
      return kobldsVault.getTokenInfo();

    // ── A2A IPC commands ─────────────────────────────────────
    case "agent-message": {
      const a = args as { agentId?: string; toAgentId?: string; content?: string; type?: "text" | "request" | "response" };
      if (!a?.agentId || !a?.toAgentId || !a?.content) throw new Error("agentId, toAgentId, and content required");
      const safeContent = filterSecrets(a.content);
      const msgId = a2aStore.sendMessage(a.agentId, a.toAgentId, safeContent, a.type ?? "text");
      // Broadcast DM notification as world event
      const dmNotify: DirectMessageNotification = {
        worldType: "dm-notify",
        agentId: a.agentId,
        fromAgentId: a.agentId,
        toAgentId: a.toAgentId,
        preview: safeContent.slice(0, 80),
        timestamp: Date.now(),
      };
      commandQueue.enqueue(dmNotify);
      return { ok: true, messageId: msgId };
    }

    case "agent-inbox": {
      const a = args as { agentId?: string; since?: number; limit?: number };
      if (!a?.agentId) throw new Error("agentId required");
      const since = Number(a.since ?? 0);
      const limit = Math.min(Number(a.limit ?? 50), 200);
      return { ok: true, messages: a2aStore.getInbox(a.agentId, since, limit) };
    }

    case "agent-request": {
      const a = args as { agentId?: string; toAgentId?: string; requestType?: string; payload?: unknown };
      if (!a?.agentId || !a?.toAgentId || !a?.requestType) throw new Error("agentId, toAgentId, and requestType required");
      const msgId = a2aStore.sendRequest(a.agentId, a.toAgentId, a.requestType, a.payload);
      const dmNotify: DirectMessageNotification = {
        worldType: "dm-notify",
        agentId: a.agentId,
        fromAgentId: a.agentId,
        toAgentId: a.toAgentId,
        preview: `[${a.requestType}] request`,
        timestamp: Date.now(),
      };
      commandQueue.enqueue(dmNotify);
      return { ok: true, messageId: msgId };
    }

    case "agent-respond": {
      const a = args as { agentId?: string; requestId?: string; response?: string };
      if (!a?.agentId || !a?.requestId || !a?.response) throw new Error("agentId, requestId, and response required");
      const safeResponse = filterSecrets(a.response);
      const result = a2aStore.respond(a.agentId, a.requestId, safeResponse);
      if (result.ok) {
        // Find original message to get the sender
        const inbox = a2aStore.getInbox(a.agentId, 0, 200);
        const original = inbox.find((m) => m.id === a.requestId);
        if (original) {
          const dmNotify: DirectMessageNotification = {
            worldType: "dm-notify",
            agentId: a.agentId,
            fromAgentId: a.agentId,
            toAgentId: original.from,
            preview: safeResponse.slice(0, 80),
            timestamp: Date.now(),
          };
          commandQueue.enqueue(dmNotify);
        }
      }
      return result;
    }

    case "describe": {
      const skillPath = resolve(
        import.meta.dirname,
        "../skills/world-room/skill.json",
      );
      const schema = JSON.parse(readFileSync(skillPath, "utf-8"));
      return { ok: true, skill: schema };
    }

    case "open-preview": {
      const a = args as { agentId?: string };
      const vitePort = process.env.VITE_PORT ?? "3000";
      const serverUrl = `http://127.0.0.1:${config.port}`;
      const url = a?.agentId
        ? `http://localhost:${vitePort}/?agent=${encodeURIComponent(a.agentId)}&server=${encodeURIComponent(serverUrl)}`
        : `http://localhost:${vitePort}/?server=${encodeURIComponent(serverUrl)}`;

      const { execFile } = await import("node:child_process");
      const cmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      execFile(cmd, [url], (err) => {
        if (err) console.warn("[server] Failed to open browser:", err.message);
      });

      return { ok: true, url };
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

// ── Startup ────────────────────────────────────────────────────

async function main() {
  console.log("🦞 Shalom's Kobold Kingdom starting...");
  console.log(`[room] Room ID: ${config.roomId} | Name: "${config.roomName}"`);
  if (config.roomDescription) {
    console.log(`[room] Description: ${config.roomDescription}`);
  }
  console.log(
    `[room] Max agents: ${config.maxAgents} | Max players: ${config.maxPlayers} | Bind: ${config.host}:${config.port}`,
  );
  console.log(
    `[room] Profanity filter: ${config.profanityFilter ? "on" : "off"}`,
  );
  console.log(`[engine] Tick rate: ${TICK_RATE}Hz | AOI radius: 40 units`);

  await nostr.init().catch((err) => {
    console.warn("[nostr] Init warning:", err.message ?? err);
    console.warn("[nostr] Running in local-only mode (no relay connection)");
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `[server] IPC + WS listening on http://${config.host}:${config.port}`,
    );
    console.log(
      `[server] Share Room ID "${config.roomId}" for others to join via Nostr`,
    );
  });

  gameLoop.start();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  gameLoop.stop();
  nostr.close();
  server.close();
  process.exit(0);
});
