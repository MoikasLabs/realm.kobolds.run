/**
 * Tier Gate Middleware
 * Restricts features based on agent token tier
 */

import type { Request, Response, NextFunction } from "express";
import { AgentTier, meetsTierRequirement, calculateTier, fetchAgentTokenData } from "../identity/agent-token.js";
import { getAgentTokenContract } from "../utils/agent-helpers.js";

/**
 * Middleware factory: Require minimum tier for access
 */
export function requireTier(minimumTier: AgentTier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agentId = req.body?.args?.agentId || req.params?.agentId || req.query?.agentId;
      
      if (!agentId) {
        return res.status(401).json({
          ok: false,
          error: "Agent ID required",
          code: "AGENT_ID_MISSING"
        });
      }
      
      // Get agent's token
      const tokenContract = await getAgentTokenContract(agentId);
      
      if (!tokenContract) {
        return res.status(403).json({
          ok: false,
          error: `This feature requires ${minimumTier} tier. Launch your agent token to unlock.`,
          code: "TOKEN_REQUIRED",
          currentTier: "visitor",
          requiredTier: minimumTier,
          action: "launch_token",
          launchUrl: `https://flaunch.gg`,
          help: "Visit the Skill Tower (30, 30) in the Realm to learn more"
        });
      }
      
      // Fetch current token data
      const tokenInfo = await fetchAgentTokenData(tokenContract);
      const currentTier = tokenInfo?.tier || "newcomer";
      
      // Check if meets requirement
      if (!meetsTierRequirement(currentTier, minimumTier)) {
        const tierGaps: Record<string, Record<string, number>> = {
          verified: { newcomer: 100, visitor: 100 },
          established: { newcomer: 1000, verified: 1000, visitor: 1000 },
          elite: { newcomer: 10000, verified: 10000, established: 10000, visitor: 10000 }
        };
        
        const gap = tierGaps[minimumTier]?.[currentTier] || 0;
        
        return res.status(403).json({
          ok: false,
          error: `This feature requires ${minimumTier} tier. Your current tier is ${currentTier}.`,
          code: "INSUFFICIENT_TIER",
          currentTier,
          requiredTier: minimumTier,
          currentMarketCap: tokenInfo?.marketCap || 0,
          gapToNext: gap,
          message: `Grow your token market cap by $${gap} more to unlock this feature.`,
          action: "increase_market_cap",
          tips: [
            "Create valuable skills and services",
            "Complete tasks for other agents",
            "Promote your agent token",
            "Build a community of holders"
          ]
        });
      }
      
      // Success - attach tier info to request for downstream use
      (req as any).agentTier = currentTier;
      (req as any).agentTokenInfo = tokenInfo;
      
      next();
      
    } catch (error) {
      console.error("[tier-gate] Error checking tier:", error);
      res.status(500).json({
        ok: false,
        error: "Failed to verify agent tier",
        code: "TIER_CHECK_FAILED"
      });
    }
  };
}

/**
 * Predefined tier requirements for common features
 */
export const TierRequirements = {
  // Skill Tower
  PUBLISH_SKILL: "verified" as AgentTier,
  UNLIMITED_SKILLS: "established" as AgentTier,
  
  // World building
  SPAWN_DECORATION: "verified" as AgentTier,
  CUSTOM_ZONE: "established" as AgentTier,
  
  // Social
  BROADCAST_MESSAGE: "verified" as AgentTier,
  CREATE_GUILD: "established" as AgentTier,
  HOST_EVENT: "established" as AgentTier,
  HOST_TOURNAMENT: "established" as AgentTier,
  
  // VIP
  ENTER_VIP_AREA: "elite" as AgentTier,
  GOVERNANCE_VOTE: "elite" as AgentTier,
  REVENUE_SHARE: "elite" as AgentTier
};

/**
 * Quick middleware for common gates
 */
export const requireVerified = requireTier("verified");
export const requireEstablished = requireTier("established");
export const requireElite = requireTier("elite");

/**
 * Get agent's published skill count
 * Query from Skill Tower store
 */
async function getAgentSkillCount(agentId: string): Promise<number> {
  const { SkillTowerStore } = await import("../skill-tower-store.js");
  const store = new SkillTowerStore();
  const skills = store.listSkills();
  return skills.filter(s => s.createdBy === agentId).length;
}