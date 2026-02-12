import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SkillTowerEntry, SkillChallenge, SkillTrade } from "./types.js";

const DATA_PATH = resolve(process.cwd(), "skill-tower.json");
const SAVE_DELAY_MS = 5000;

interface CraftRecipe {
  inputs: string[];
  output: { name: string; description: string; tier: "novice" | "adept" | "master"; tags: string[] };
}

interface PersistedData {
  skills: SkillTowerEntry[];
  challenges: SkillChallenge[];
  trades: SkillTrade[];
}

const SEED_CHALLENGES: SkillChallenge[] = [
  // Novice
  { id: "ch-first-words", name: "First Words", description: "Send a chat message in the world", skillRequired: "chat", tier: "novice", reward: "Communication skill", completedBy: [] },
  { id: "ch-explorer", name: "Explorer", description: "Walk to 3 different buildings", skillRequired: "explore", tier: "novice", reward: "Navigation skill", completedBy: [] },
  { id: "ch-social", name: "Social Butterfly", description: "Wave at 2 different agents", skillRequired: "social", tier: "novice", reward: "Social skill", completedBy: [] },
  // Adept
  { id: "ch-code-reviewer", name: "Code Reviewer", description: "Publish a code-review skill", skillRequired: "code-review", tier: "adept", reward: "Review expertise", completedBy: [] },
  { id: "ch-skill-crafter", name: "Skill Crafter", description: "Craft your first skill", skillRequired: "crafting", tier: "adept", reward: "Crafting knowledge", completedBy: [] },
  { id: "ch-trader", name: "Trader", description: "Complete 1 successful trade", skillRequired: "trading", tier: "adept", reward: "Trading savvy", completedBy: [] },
  // Master
  { id: "ch-mentor", name: "Mentor", description: "Publish 3 or more skills", skillRequired: "mentorship", tier: "master", reward: "Mentorship mastery", completedBy: [] },
  { id: "ch-champion", name: "Champion", description: "Complete all adept challenges", skillRequired: "champion", tier: "master", reward: "Champion title", completedBy: [] },
  { id: "ch-architect", name: "Architect", description: "Craft a master-tier skill", skillRequired: "architecture", tier: "master", reward: "Architecture mastery", completedBy: [] },
];

const RECIPES: CraftRecipe[] = [
  { inputs: ["chat", "code"], output: { name: "code-review", description: "Review code with clear communication", tier: "adept", tags: ["code", "review"] } },
  { inputs: ["chat", "explore"], output: { name: "research", description: "Research topics through exploration and discussion", tier: "adept", tags: ["research", "explore"] } },
  { inputs: ["code", "security"], output: { name: "security-audit", description: "Audit code for security vulnerabilities", tier: "adept", tags: ["security", "code"] } },
  { inputs: ["research", "code-review"], output: { name: "architecture", description: "Design software architecture through research and review", tier: "master", tags: ["architecture", "design"] } },
];

export class SkillTowerStore {
  private skills = new Map<string, SkillTowerEntry>();
  private challenges: SkillChallenge[] = [];
  private trades: SkillTrade[] = [];
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  // ── Skills ──────────────────────────────────────────────────

  listSkills(tag?: string): SkillTowerEntry[] {
    const all = Array.from(this.skills.values());
    if (!tag) return all;
    return all.filter((s) => s.tags.includes(tag));
  }

  publishSkill(
    agentId: string,
    input: { name: string; description: string; tags?: string[] },
  ): SkillTowerEntry {
    const id = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);

    const entry: SkillTowerEntry = {
      id,
      name: input.name.slice(0, 100),
      description: (input.description ?? "").slice(0, 500),
      tier: "novice",
      tags: (input.tags ?? []).slice(0, 10).map((t) => t.slice(0, 30)),
      createdBy: agentId,
      createdAt: Date.now(),
    };

    this.skills.set(id, entry);
    this.scheduleSave();
    return entry;
  }

  // ── Crafting ────────────────────────────────────────────────

  getRecipes(): { inputs: string[]; outputName: string; outputTier: string }[] {
    return RECIPES.map((r) => ({
      inputs: r.inputs,
      outputName: r.output.name,
      outputTier: r.output.tier,
    }));
  }

  craftSkill(
    agentId: string,
    ingredientIds: string[],
  ): { ok: boolean; skill?: SkillTowerEntry; error?: string } {
    // Sort inputs for matching
    const sorted = [...ingredientIds].sort();

    const recipe = RECIPES.find((r) => {
      const rSorted = [...r.inputs].sort();
      return (
        rSorted.length === sorted.length &&
        rSorted.every((v, i) => v === sorted[i])
      );
    });

    if (!recipe) {
      return { ok: false, error: "No recipe matches those ingredients" };
    }

    // Check agent has the ingredient skills published
    for (const ing of ingredientIds) {
      if (!this.skills.has(ing)) {
        return { ok: false, error: `Missing ingredient skill: ${ing}` };
      }
    }

    // Check if already crafted
    if (this.skills.has(recipe.output.name)) {
      return { ok: false, error: `Skill "${recipe.output.name}" already exists` };
    }

    const entry: SkillTowerEntry = {
      id: recipe.output.name,
      name: recipe.output.name,
      description: recipe.output.description,
      tier: recipe.output.tier,
      tags: recipe.output.tags,
      createdBy: agentId,
      createdAt: Date.now(),
      ingredients: ingredientIds,
    };

    this.skills.set(entry.id, entry);
    this.scheduleSave();
    return { ok: true, skill: entry };
  }

  // ── Challenges ──────────────────────────────────────────────

  listChallenges(tier?: string): SkillChallenge[] {
    if (!tier) return this.challenges;
    return this.challenges.filter((c) => c.tier === tier);
  }

  completeChallenge(
    agentId: string,
    challengeId: string,
  ): { ok: boolean; error?: string } {
    const challenge = this.challenges.find((c) => c.id === challengeId);
    if (!challenge) return { ok: false, error: "Challenge not found" };
    if (challenge.completedBy.includes(agentId)) {
      return { ok: false, error: "Already completed" };
    }
    challenge.completedBy.push(agentId);
    this.scheduleSave();
    return { ok: true };
  }

  // ── Trades ──────────────────────────────────────────────────

  listTrades(agentId?: string): SkillTrade[] {
    if (!agentId) return this.trades.filter((t) => t.status === "open");
    return this.trades.filter(
      (t) => t.fromAgent === agentId || t.toAgent === agentId,
    );
  }

  createTrade(
    fromAgent: string,
    offerSkillId: string,
    requestSkillId: string,
  ): SkillTrade {
    const trade: SkillTrade = {
      id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromAgent,
      offerSkillId,
      requestSkillId,
      status: "open",
      createdAt: Date.now(),
    };
    this.trades.push(trade);
    this.scheduleSave();
    return trade;
  }

  acceptTrade(
    agentId: string,
    tradeId: string,
  ): { ok: boolean; error?: string } {
    const trade = this.trades.find((t) => t.id === tradeId);
    if (!trade) return { ok: false, error: "Trade not found" };
    if (trade.status !== "open") return { ok: false, error: "Trade not open" };
    if (trade.fromAgent === agentId) {
      return { ok: false, error: "Cannot accept your own trade" };
    }
    trade.toAgent = agentId;
    trade.status = "accepted";
    this.scheduleSave();
    return { ok: true };
  }

  // ── Persistence ─────────────────────────────────────────────

  private load(): void {
    try {
      if (existsSync(DATA_PATH)) {
        const raw = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as PersistedData;
        if (Array.isArray(raw.skills)) {
          for (const s of raw.skills) {
            if (s.id) this.skills.set(s.id, s);
          }
        }
        if (Array.isArray(raw.challenges)) {
          this.challenges = raw.challenges;
        } else {
          this.challenges = structuredClone(SEED_CHALLENGES);
        }
        if (Array.isArray(raw.trades)) {
          this.trades = raw.trades;
        }
      } else {
        this.challenges = structuredClone(SEED_CHALLENGES);
      }
    } catch {
      this.challenges = structuredClone(SEED_CHALLENGES);
    }
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
      const data: PersistedData = {
        skills: Array.from(this.skills.values()),
        challenges: this.challenges,
        trades: this.trades,
      };
      writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // Non-fatal
    }
  }
}
