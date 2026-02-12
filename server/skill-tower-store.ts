import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { OpenFacilitator, isPaymentPayload } from "@openfacilitator/sdk";
import type { PaymentPayload } from "@openfacilitator/sdk";
import type { SkillTowerEntry, SkillChallenge, SkillTrade } from "./types.js";

const DATA_PATH = resolve(process.cwd(), "skill-tower.json");
const SAVE_DELAY_MS = 5000;

const facilitator = new OpenFacilitator();

// ── Token whitelist (Base ERC-20s sellers can charge in) ──────
export interface WhitelistedToken {
  address: string;
  symbol: string;
  decimals: number;
}

const TOKEN_WHITELIST: WhitelistedToken[] = [
  { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC",    decimals: 6  },
  { address: "0x4200000000000000000000000000000000000006", symbol: "WETH",    decimals: 18 },
  { address: "0x8a6d3bb6091ea0dd8b1b87c915041708d11f9d3a", symbol: "$KOBLDS", decimals: 18 },
];

function lookupToken(address: string): WhitelistedToken | undefined {
  return TOKEN_WHITELIST.find((t) => t.address.toLowerCase() === address.toLowerCase());
}

// $KOBLDS publish fee: 25 tokens (18 decimals) on Base
const KOBLDS_TOKEN = "0x8a6d3bb6091ea0dd8b1b87c915041708d11f9d3a";
const KOBLDS_PUBLISH_FEE = "25000000000000000000"; // 25 * 10^18
const KOBLDS_FEE_WALLET = "0xc406fFf2Ce8b5dce517d03cd3531960eb2F6110d";

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

  getTokenWhitelist(): WhitelistedToken[] {
    return TOKEN_WHITELIST;
  }

  getPublishFee(): { asset: string; amount: string; payTo: string; symbol: string; decimals: number } {
    return {
      asset: KOBLDS_TOKEN,
      amount: KOBLDS_PUBLISH_FEE,
      payTo: KOBLDS_FEE_WALLET,
      symbol: "$KOBLDS",
      decimals: 18,
    };
  }

  async publishSkill(
    agentId: string,
    input: { name: string; description: string; tags?: string[]; price?: string; asset?: string; walletAddress?: string; payment?: unknown },
  ): Promise<{ ok: boolean; skill?: SkillTowerEntry; tx?: string; error?: string }> {
    if (input.price && !input.walletAddress) {
      return { ok: false, error: "walletAddress is required when setting a price" };
    }
    if (input.price && !input.asset) {
      return { ok: false, error: "asset (token address) is required when setting a price" };
    }
    if (input.asset && !lookupToken(input.asset)) {
      return { ok: false, error: `Token not whitelisted: ${input.asset}. Use skill-tower-tokens to see allowed tokens.` };
    }

    // Require 25 $KOBLDS to publish
    if (!input.payment) {
      return { ok: false, error: "Publishing requires 25 $KOBLDS. Include a payment payload." };
    }
    if (!isPaymentPayload(input.payment)) {
      return { ok: false, error: "Invalid x402 payment payload" };
    }

    const publishRequirements = {
      scheme: "exact",
      network: "base",
      maxAmountRequired: KOBLDS_PUBLISH_FEE,
      asset: KOBLDS_TOKEN,
      payTo: KOBLDS_FEE_WALLET,
    };

    let publishTx: string | undefined;
    try {
      const verifyResult = await facilitator.verify(input.payment, publishRequirements);
      if (!verifyResult.isValid) {
        return { ok: false, error: verifyResult.invalidReason ?? "Publish fee verification failed" };
      }

      const settleResult = await facilitator.settle(input.payment, publishRequirements);
      if (!settleResult.success) {
        return { ok: false, error: settleResult.errorReason ?? "Publish fee settlement failed" };
      }
      publishTx = settleResult.transaction;
    } catch (err) {
      return { ok: false, error: `Publish fee payment error: ${String(err)}` };
    }

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

    if (input.price) {
      entry.price = input.price;
      entry.asset = input.asset;
      entry.walletAddress = input.walletAddress;
      entry.acquiredBy = [];
    }

    this.skills.set(id, entry);
    this.scheduleSave();
    return { ok: true, skill: entry, tx: publishTx };
  }

  // ── Acquire (x402 payment) ──────────────────────────────────

  getSkill(skillId: string): SkillTowerEntry | undefined {
    return this.skills.get(skillId);
  }

  async acquireSkill(
    agentId: string,
    skillId: string,
    paymentPayload: unknown,
  ): Promise<{ ok: boolean; tx?: string; error?: string }> {
    const skill = this.skills.get(skillId);
    if (!skill) return { ok: false, error: "Skill not found" };
    if (!skill.price || !skill.asset || !skill.walletAddress) {
      return { ok: false, error: "Skill is free — no payment required" };
    }
    if (skill.acquiredBy?.includes(agentId)) {
      return { ok: false, error: "Already acquired" };
    }
    if (!isPaymentPayload(paymentPayload)) {
      return { ok: false, error: "Invalid x402 payment payload" };
    }

    const requirements = {
      scheme: "exact",
      network: "base",
      maxAmountRequired: skill.price,
      asset: skill.asset,
      payTo: skill.walletAddress,
    };

    try {
      const verifyResult = await facilitator.verify(paymentPayload, requirements);
      if (!verifyResult.isValid) {
        return { ok: false, error: verifyResult.invalidReason ?? "Payment verification failed" };
      }

      const settleResult = await facilitator.settle(paymentPayload, requirements);
      if (!settleResult.success) {
        return { ok: false, error: settleResult.errorReason ?? "Payment settlement failed" };
      }

      if (!skill.acquiredBy) skill.acquiredBy = [];
      skill.acquiredBy.push(agentId);
      this.scheduleSave();
      return { ok: true, tx: settleResult.transaction };
    } catch (err) {
      return { ok: false, error: `Payment error: ${String(err)}` };
    }
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
    options?: { price?: string; asset?: string; walletAddress?: string },
  ): { ok: boolean; trade?: SkillTrade; error?: string } {
    if (options?.price && !options.walletAddress) {
      return { ok: false, error: "walletAddress is required when setting a price" };
    }
    if (options?.price && !options.asset) {
      return { ok: false, error: "asset (token address) is required when setting a price" };
    }
    if (options?.asset && !lookupToken(options.asset)) {
      return { ok: false, error: `Token not whitelisted: ${options.asset}` };
    }

    const trade: SkillTrade = {
      id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromAgent,
      offerSkillId,
      requestSkillId,
      status: "open",
      createdAt: Date.now(),
    };

    if (options?.price) {
      trade.price = options.price;
      trade.asset = options.asset;
      trade.walletAddress = options.walletAddress;
    }

    this.trades.push(trade);
    this.scheduleSave();
    return { ok: true, trade };
  }

  async acceptTrade(
    agentId: string,
    tradeId: string,
    paymentPayload?: unknown,
  ): Promise<{ ok: boolean; tx?: string; error?: string }> {
    const trade = this.trades.find((t) => t.id === tradeId);
    if (!trade) return { ok: false, error: "Trade not found" };
    if (trade.status !== "open") return { ok: false, error: "Trade not open" };
    if (trade.fromAgent === agentId) {
      return { ok: false, error: "Cannot accept your own trade" };
    }

    // If trade has a price, require payment
    if (trade.price && trade.asset && trade.walletAddress) {
      if (!paymentPayload) {
        return { ok: false, error: "Payment required to accept this trade" };
      }
      if (!isPaymentPayload(paymentPayload)) {
        return { ok: false, error: "Invalid x402 payment payload" };
      }

      const requirements = {
        scheme: "exact",
        network: "base",
        maxAmountRequired: trade.price,
        asset: trade.asset,
        payTo: trade.walletAddress,
      };

      try {
        const verifyResult = await facilitator.verify(paymentPayload, requirements);
        if (!verifyResult.isValid) {
          return { ok: false, error: verifyResult.invalidReason ?? "Payment verification failed" };
        }

        const settleResult = await facilitator.settle(paymentPayload, requirements);
        if (!settleResult.success) {
          return { ok: false, error: settleResult.errorReason ?? "Payment settlement failed" };
        }

        trade.paymentTx = settleResult.transaction;
      } catch (err) {
        return { ok: false, error: `Payment error: ${String(err)}` };
      }
    }

    trade.toAgent = agentId;
    trade.status = "accepted";
    this.scheduleSave();
    return { ok: true, tx: trade.paymentTx };
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
