import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentProfile } from "./types.js";

const PROFILES_PATH = resolve(process.cwd(), "profiles.json");

/** Delay before flushing dirty profiles to disk */
const SAVE_DELAY_MS = 5000;

export class AgentRegistry {
  private profiles = new Map<string, AgentProfile>();
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  /** Register or update an agent profile */
  register(profile: Partial<AgentProfile> & { agentId: string }): AgentProfile {
    const existing = this.profiles.get(profile.agentId);
    const now = Date.now();

    const merged: AgentProfile = {
      agentId: profile.agentId,
      name: profile.name ?? existing?.name ?? profile.agentId,
      pubkey: profile.pubkey ?? existing?.pubkey ?? "",
      bio: profile.bio?.slice(0, 500) ?? existing?.bio ?? "",
      capabilities: profile.capabilities ?? existing?.capabilities ?? [],
      skills: profile.skills ?? existing?.skills,
      color: profile.color ?? existing?.color ?? this.randomColor(),
      avatar: profile.avatar ?? existing?.avatar,
      joinedAt: existing?.joinedAt ?? now,
      lastSeen: now,
    };

    this.profiles.set(profile.agentId, merged);
    this.scheduleSave();
    return merged;
  }

  /** Update lastSeen timestamp */
  touch(agentId: string): void {
    const profile = this.profiles.get(agentId);
    if (profile) {
      profile.lastSeen = Date.now();
      this.dirty = true;
    }
  }

  /** Get a single profile */
  get(agentId: string): AgentProfile | undefined {
    return this.profiles.get(agentId);
  }

  /** Get all profiles */
  getAll(): AgentProfile[] {
    return Array.from(this.profiles.values());
  }

  /** Remove an agent */
  remove(agentId: string): void {
    this.profiles.delete(agentId);
    this.scheduleSave();
  }

  /** Agents seen within last N milliseconds */
  getOnline(withinMs = 5 * 60 * 1000): AgentProfile[] {
    const cutoff = Date.now() - withinMs;
    return this.getAll().filter((p) => p.lastSeen >= cutoff);
  }

  private randomColor(): string {
    const h = Math.floor(Math.random() * 360);
    const s = 55 + Math.floor(Math.random() * 25);
    const l = 45 + Math.floor(Math.random() * 15);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  private load(): void {
    try {
      if (existsSync(PROFILES_PATH)) {
        const data = JSON.parse(readFileSync(PROFILES_PATH, "utf-8"));
        if (Array.isArray(data)) {
          for (const p of data) {
            if (p.agentId) this.profiles.set(p.agentId, p);
          }
        }
      }
    } catch {
      // Start fresh if corrupt
    }
  }

  /** Schedule a debounced save — coalesces rapid mutations into one write */
  private scheduleSave(): void {
    this.dirty = true;
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.flush();
      }, SAVE_DELAY_MS);
    }
  }

  /** Immediately write to disk if dirty */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      writeFileSync(
        PROFILES_PATH,
        JSON.stringify(this.getAll(), null, 2),
        "utf-8"
      );
    } catch {
      // Non-fatal — profiles are also in-memory
    }
  }
}
