/**
 * Agent Profile API Routes
 * Enhanced with token display and tier information
 */

import type { Request, Response } from "express";
import { AgentRegistry } from "../agent-registry.js";
import { fetchAgentTokenData, getTierInfo, getUnlockedFeatures } from "../identity/agent-token.js";

// Create singleton instance
const registry = new AgentRegistry();

/**
 * GET /api/agents/:agentId/profile
 * Get full agent profile with token information
 */
export async function getAgentProfile(req: Request, res: Response) {
  try {
    const { agentId } = req.params;
    
    // Get basic profile
    const profile = registry.get(agentId);
    if (!profile) {
      return res.status(404).json({ ok: false, error: "Agent not found" });
    }
    
    // Check for token (stored in agent metadata or linked via wallet)
    const tokenContract = await getAgentTokenContract(agentId);
    
    let tokenInfo = null;
    if (tokenContract) {
      tokenInfo = await fetchAgentTokenData(tokenContract);
    }
    
    // Build enriched profile
    const enrichedProfile = {
      ok: true,
      profile: {
        // Basic info
        agentId: profile.agentId,
        name: profile.name,
        bio: profile.bio,
        color: profile.color,
        capabilities: profile.capabilities,
        skills: profile.skills,
        
        // Activity
        joinedAt: profile.joinedAt,
        lastSeen: profile.lastSeen,
        
        // Token info (if available)
        token: tokenInfo ? {
          contractAddress: tokenInfo.contractAddress,
          symbol: tokenInfo.symbol,
          marketCap: tokenInfo.marketCap,
          price: tokenInfo.price,
          priceChange24h: tokenInfo.priceChange24h,
          volume24h: tokenInfo.volume24h,
          liquidity: tokenInfo.liquidity,
          
          // Tier info
          tier: tokenInfo.tier,
          tierProgress: tokenInfo.tierProgress,
          tierLabel: getTierInfo(tokenInfo.tier).label,
          tierEmoji: getTierInfo(tokenInfo.tier).emoji,
          tierColor: getTierInfo(tokenInfo.tier).color,
          tierDescription: getTierInfo(tokenInfo.tier).description,
          
          // Unlocks
          unlockedFeatures: getUnlockedFeatures(tokenInfo.tier),
          
          lastUpdated: tokenInfo.lastUpdated
        } : null,
        
        // If no token, show visitor tier
        tier: tokenInfo?.tier || "visitor",
        tierLabel: tokenInfo ? getTierInfo(tokenInfo.tier).label : "Visitor",
        
        // Action prompts
        actions: {
          canLaunchToken: !tokenContract,
          launchUrl: tokenContract ? null : `https://flaunch.gg/deploy?name=${encodeURIComponent(profile.name)}`,
          upgradePrompt: tokenInfo ? getUpgradePrompt(tokenInfo) : "Launch your agent token to unlock features!"
        }
      }
    };
    
    res.json(enrichedProfile);
    
  } catch (error) {
    console.error("[agent-profile] Error fetching profile:", error);
    res.status(500).json({ ok: false, error: "Failed to fetch agent profile" });
  }
}

/**
 * GET /api/agents/lookup
 * Lookup agent by wallet address
 */
export async function lookupAgent(req: Request, res: Response) {
  try {
    const { wallet } = req.query;
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ ok: false, error: "Wallet address required" });
    }
    
    // Search registry for agent with this wallet
    const allAgents = registry.getAll();
    
    // This would need proper wallet linkage - simplified for now
    const matchingAgent = allAgents.find((agent: any) => {
      // Check if agent has wallet metadata (stored in metadata field)
      return agent.metadata?.wallet === wallet.toLowerCase();
    });
    
    if (!matchingAgent) {
      return res.status(404).json({ ok: false, error: "No agent found for wallet" });
    }
    
    res.json({
      ok: true,
      agentId: matchingAgent.agentId,
      wallet: wallet,
      found: true
    });
    
  } catch (error) {
    console.error("[agent-profile] Error looking up agent:", error);
    res.status(500).json({ ok: false, error: "Lookup failed" });
  }
}

/**
 * GET /api/agents/:agentId/tier
 * Quick tier check endpoint
 */
export async function getAgentTier(req: Request, res: Response) {
  try {
    const { agentId } = req.params;
    const tokenContract = await getAgentTokenContract(agentId);
    
    if (!tokenContract) {
      return res.json({
        ok: true,
        agentId,
        tier: "visitor",
        hasToken: false,
        canPublish: false,
        canEnterVIP: false
      });
    }
    
    const tokenInfo = await fetchAgentTokenData(tokenContract);
    
    res.json({
      ok: true,
      agentId,
      tier: tokenInfo?.tier || "visitor",
      hasToken: true,
      marketCap: tokenInfo?.marketCap || 0,
      canPublish: (tokenInfo?.marketCap || 0) >= 100,
      canEnterVIP: (tokenInfo?.marketCap || 0) >= 10000,
      token: tokenInfo ? {
        symbol: tokenInfo.symbol,
        marketCap: tokenInfo.marketCap,
        tierProgress: tokenInfo.tierProgress
      } : null
    });
    
  } catch (error) {
    console.error("[agent-profile] Error checking tier:", error);
    res.status(500).json({ ok: false, error: "Tier check failed" });
  }
}

/**
 * Helper: Get agent's token contract address
 * In production, this would query ERC-8004 or stored metadata
 */
async function getAgentTokenContract(agentId: string): Promise<string | null> {
  // Simplified: check if stored in agent metadata
  // In production, this would:
  // 1. Look up ERC-8004 identity
  // 2. Check known agent token registries
  // 3. Return stored contract address
  
  const knownTokens: Record<string, string> = {
    // Example: agentId -> token contract
    // This would be populated from database
  };
  
  // For now, return null (simulate no token)
  // In production, query database
  return knownTokens[agentId] || null;
}

/**
 * Helper: Get upgrade prompt based on current tier
 */
function getUpgradePrompt(tokenInfo: { tier: string; marketCap: number; tierProgress: number }): string {
  const tiers = ["visitor", "newcomer", "verified", "established", "elite"] as const;
  const currentIndex = tiers.indexOf(tokenInfo.tier as any);
  
  if (currentIndex >= tiers.length - 1) {
    return "👑 You're at Elite tier! Max features unlocked.";
  }
  
  const nextTier = tiers[currentIndex + 1];
  const gaps: Record<string, string> = {
    newcomer: "Launch your first token to get hired",
    verified: `Grow to $100 MC to publish skills (${(100 - tokenInfo.marketCap).toFixed(0)} more needed)`,
    established: `Reach $1000 MC to host tournaments (${(1000 - tokenInfo.marketCap).toFixed(0)} more needed)`,
    elite: `Hit $10000 MC for VIP access and governance (${(10000 - tokenInfo.marketCap).toFixed(0)} more needed)`
  };
  
  return gaps[nextTier] || "Keep building value!";
}