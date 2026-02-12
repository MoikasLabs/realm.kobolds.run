import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentDirectMessage } from "./types.js";

const DATA_PATH = resolve(process.cwd(), "a2a-messages.json");
const SAVE_DELAY_MS = 5000;
const MESSAGE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface PersistedData {
  messages: AgentDirectMessage[];
}

export class A2AStore {
  private messages: AgentDirectMessage[] = [];
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  /** Send a direct message between agents */
  sendMessage(
    from: string,
    to: string,
    content: string,
    type: "text" | "request" | "response" = "text",
    opts?: { replyTo?: string; requestType?: string; payload?: unknown },
  ): string {
    const id = `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const msg: AgentDirectMessage = {
      id,
      from,
      to,
      content: content.slice(0, 2000),
      type,
      status: "pending",
      createdAt: Date.now(),
      replyTo: opts?.replyTo,
      requestType: opts?.requestType,
      payload: opts?.payload,
    };
    this.messages.push(msg);
    this.prune();
    this.scheduleSave();
    return id;
  }

  /** Get inbox messages for an agent */
  getInbox(agentId: string, since = 0, limit = 50): AgentDirectMessage[] {
    this.prune();
    return this.messages
      .filter((m) => m.to === agentId && m.createdAt > since)
      .slice(-limit);
  }

  /** Get conversation thread between two agents */
  getConversation(agent1: string, agent2: string, limit = 50): AgentDirectMessage[] {
    this.prune();
    return this.messages
      .filter(
        (m) =>
          (m.from === agent1 && m.to === agent2) ||
          (m.from === agent2 && m.to === agent1),
      )
      .slice(-limit);
  }

  /** Mark a message as read */
  markRead(agentId: string, messageId: string): boolean {
    const msg = this.messages.find((m) => m.id === messageId && m.to === agentId);
    if (!msg) return false;
    msg.status = "read";
    msg.readAt = Date.now();
    this.scheduleSave();
    return true;
  }

  /** Send a structured collaboration request */
  sendRequest(
    from: string,
    to: string,
    requestType: string,
    payload: unknown,
  ): string {
    return this.sendMessage(from, to, `[${requestType}] request`, "request", {
      requestType,
      payload,
    });
  }

  /** Respond to a request, linking the response */
  respond(
    agentId: string,
    requestId: string,
    response: string,
  ): { ok: boolean; messageId?: string; error?: string } {
    const original = this.messages.find(
      (m) => m.id === requestId && m.to === agentId,
    );
    if (!original) return { ok: false, error: "Request not found" };
    original.status = "responded";
    this.scheduleSave();

    const messageId = this.sendMessage(agentId, original.from, response, "response", {
      replyTo: requestId,
    });
    return { ok: true, messageId };
  }

  /** Prune messages older than TTL */
  private prune(): void {
    const cutoff = Date.now() - MESSAGE_TTL_MS;
    const before = this.messages.length;
    this.messages = this.messages.filter((m) => m.createdAt > cutoff);
    if (this.messages.length !== before) {
      this.scheduleSave();
    }
  }

  // ── Persistence ─────────────────────────────────────────────

  private load(): void {
    try {
      if (existsSync(DATA_PATH)) {
        const raw = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as PersistedData;
        if (Array.isArray(raw.messages)) {
          this.messages = raw.messages;
        }
      }
    } catch {
      // Non-fatal
    }
    this.prune();
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
      const data: PersistedData = { messages: this.messages };
      writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // Non-fatal
    }
  }
}
