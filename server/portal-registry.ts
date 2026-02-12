/**
 * Portal Registry - Multi-Realm Directory Service
 * 
 * Tracks active realms and routes agents to correct session.
 * Each realm = isolated agent session universe.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REGISTRY_PATH = resolve(process.cwd(), "portal-registry.json");
const SAVE_DELAY_MS = 5000;

export interface RealmEntry {
  roomId: string;
  name: string;
  description?: string;
  status: "active" | "inactive" | "maintenance";
  url: string;
  wsUrl: string;
  agents: number;
  maxAgents: number;
  players: number;
  tickRate: number;
  createdAt: number;
  lastHeartbeat: number;
  tags: string[]; // "public", "private", "dev", "main"
  wakeAgentNests: Record<string, { x: number; z: number }>;
  metadata?: {
    region?: string;
    shard?: number;
    parentRealm?: string;
  };
}

export class PortalRegistry {
  private realms = new Map<string, RealmEntry>();
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  /**
   * Register a new realm or update existing
   */
  registerRealm(
    roomId: string,
    config: {
      name: string;
      url: string;
      wsUrl: string;
      maxAgents?: number;
      tags?: string[];
      wakeAgentNests?: Record<string, { x: number; z: number }>;
      description?: string;
    }
  ): RealmEntry {
    const existing = this.realms.get(roomId);
    const now = Date.now();

    const entry: RealmEntry = {
      roomId,
      name: config.name,
      description: config.description,
      status: "active",
      url: config.url,
      wsUrl: config.wsUrl,
      agents: existing?.agents ?? 0,
      maxAgents: config.maxAgents ?? 50,
      players: existing?.players ?? 0,
      tickRate: existing?.tickRate ?? 20,
      createdAt: existing?.createdAt ?? now,
      lastHeartbeat: now,
      tags: config.tags ?? ["public"],
      wakeAgentNests: config.wakeAgentNests ?? {
        shalom: { x: -5, z: -5 },
        default: { x: 0, z: 0 }
      },
      metadata: existing?.metadata
    };

    this.realms.set(roomId, entry);
    this.scheduleSave();

    console.log(`[portal] Registered realm: ${roomId} (${config.name})`);
    return entry;
  }

  /**
   * Update realm heartbeat (called by realm server periodically)
   */
  heartbeat(
    roomId: string,
    stats: { agents: number; players: number; tickRate: number }
  ): void {
    const realm = this.realms.get(roomId);
    if (!realm) return;

    realm.agents = stats.agents;
    realm.players = stats.players;
    realm.tickRate = stats.tickRate;
    realm.lastHeartbeat = Date.now();
    realm.status = "active";

    this.scheduleSave();
  }

  /**
   * Mark realm as inactive (cleanup after timeout)
   */
  markInactive(roomId: string): void {
    const realm = this.realms.get(roomId);
    if (realm) {
      realm.status = "inactive";
      this.scheduleSave();
    }
  }

  /**
   * Get realm by ID
   */
  getRealm(roomId: string): RealmEntry | undefined {
    return this.realms.get(roomId);
  }

  /**
   * List all active realms
   */
  listRealms(filter?: { tag?: string; status?: string }): RealmEntry[] {
    let list = Array.from(this.realms.values());

    if (filter?.tag) {
      list = list.filter(r => r.tags.includes(filter.tag!));
    }
    if (filter?.status) {
      list = list.filter(r => r.status === filter.status);
    }

    // Sort by last heartbeat (most recently active first)
    return list.sort((a, b) => b.lastHeartbeat - a.lastHeartbeat);
  }

  /**
   * Get default/main realm
   */
  getDefaultRealm(): RealmEntry | undefined {
    // Prefer "main" tag, then most recently active
    const main = this.listRealms({ tag: "main" })[0];
    if (main) return main;
    return this.listRealms({ status: "active" })[0];
  }

  /**
   * Find realm for agent session
   * Creates new realm if none suitable (sharding logic)
   */
  findOrCreateRealm(agentId: string, preferences?: { tag?: string }): RealmEntry {
    // Find realm with capacity matching preferences
    const candidates = this.listRealms({ status: "active" }).filter(
      r => r.agents < r.maxAgents && (!preferences?.tag || r.tags.includes(preferences.tag))
    );

    if (candidates.length > 0) {
      // Pick realm with most space
      return candidates.sort((a, b) => 
        (b.maxAgents - b.agents) - (a.maxAgents - a.agents)
      )[0];
    }

    // No suitable realm - return default (caller handles creation)
    return this.getDefaultRealm() ?? this.createPlaceholder();
  }

  /**
   * Get wake agent nest for agent in realm
   */
  getWakeAgentNest(roomId: string, agentId: string): { x: number; z: number } {
    const realm = this.realms.get(roomId);
    if (!realm) return { x: -5, z: -5 };
    
    return realm.wakeAgentNests[agentId] ?? 
           realm.wakeAgentNests.default ?? 
           { x: -5, z: -5 };
  }

  /**
   * Clean up stale realms (no heartbeat > 5 minutes)
   */
  cleanup(): number {
    const now = Date.now();
    const stale = Array.from(this.realms.values()).filter(
      r => r.status === "active" && now - r.lastHeartbeat > 5 * 60 * 1000
    );

    for (const realm of stale) {
      this.markInactive(realm.roomId);
    }

    return stale.length;
  }

  private createPlaceholder(): RealmEntry {
    // Emergency placeholder when no realms exist
    return {
      roomId: "placeholder",
      name: "Placeholder",
      status: "inactive",
      url: "https://realm.kobolds.run",
      wsUrl: "wss://realm.kobolds.run/ws",
      agents: 0,
      maxAgents: 0,
      players: 0,
      tickRate: 0,
      createdAt: Date.now(),
      lastHeartbeat: 0,
      tags: [],
      wakeAgentNests: { default: { x: 0, z: 0 } }
    };
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.flush();
      }, SAVE_DELAY_MS);
    }
  }

  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      const data = Array.from(this.realms.values());
      writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("[portal] Failed to save registry:", e);
    }
  }

  private load(): void {
    try {
      if (existsSync(REGISTRY_PATH)) {
        const data = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")) as RealmEntry[];
        for (const r of data) {
          this.realms.set(r.roomId, r);
        }
      }
    } catch (e) {
      console.error("[portal] Failed to load registry:", e);
    }
  }
}
