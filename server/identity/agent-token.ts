/**
 * Agent Token Lookup Service
 * Fetches token market data from DexScreener for agent reputation scoring
 */

import { fetchWithTimeout } from "../utils/http.js";

export interface AgentTokenInfo {
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: string;
  
  // Market data
  marketCap: number;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  
  // Community
  holderCount?: number;
  
  // Calculated tier
  tier: AgentTier;
  tierProgress: number;
  
  // Metadata
  lastUpdated: number;
}

export type AgentTier = "visitor" | "newcomer" | "verified" | "established" | "elite";

// Tier thresholds (Market Cap in USD)
const TIER_THRESHOLDS = {
  visitor: 0,
  newcomer: 1,      // $1 (has token but minimal value)
  verified: 100,    // $100 required
  established: 1000,
  elite: 10000
};

// Base network token list cache
let baseTokenCache: Map<string, AgentTokenInfo> = new Map();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch token data from DexScreener
 */
export async function fetchAgentTokenData(tokenAddress: string): Promise<AgentTokenInfo | null> {
  // Check cache first
  const cached = baseTokenCache.get(tokenAddress);
  if (cached && Date.now() - cached.lastUpdated < CACHE_DURATION) {
    return cached;
  }
  
  try {
    // DexScreener API for Base network
    const response = await fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { timeout: 10000 }
    );
    
    if (!response.ok) {
      console.warn(`[token-lookup] DexScreener returned ${response.status} for ${tokenAddress}`);
      return null;
    }
    
    const data: any = await response.json();
    
    if (!data.pairs || data.pairs.length === 0) {
      console.warn(`[token-lookup] No trading pairs found for ${tokenAddress}`);
      return null;
    }
    
    // Get the pair with highest liquidity
    const pair = data.pairs.reduce((best: any, current: any) => {
      return (current.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? current : best;
    }, data.pairs[0]);
    
    const marketCap = pair.marketCap || 0;
    const tier = calculateTier(marketCap);
    
    const tokenInfo: AgentTokenInfo = {
      contractAddress: tokenAddress,
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      decimals: pair.baseToken.decimals || 18,
      
      marketCap,
      price: parseFloat(pair.priceUsd) || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      volume24h: pair.volume?.h24 || 0,
      liquidity: pair.liquidity?.usd || 0,
      
      holderCount: undefined, // Would need separate API
      
      tier,
      tierProgress: calculateTierProgress(marketCap, tier),
      
      lastUpdated: Date.now()
    };
    
    // Cache result
    baseTokenCache.set(tokenAddress, tokenInfo);
    
    return tokenInfo;
    
  } catch (error) {
    console.error(`[token-lookup] Error fetching token ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Calculate agent tier based on market cap
 */
export function calculateTier(marketCap: number): AgentTier {
  if (marketCap >= TIER_THRESHOLDS.elite) return "elite";
  if (marketCap >= TIER_THRESHOLDS.established) return "established";
  if (marketCap >= TIER_THRESHOLDS.verified) return "verified";
  if (marketCap >= TIER_THRESHOLDS.newcomer) return "newcomer";
  return "visitor";
}

/**
 * Calculate progress percentage to next tier
 */
export function calculateTierProgress(marketCap: number, currentTier: AgentTier): number {
  const tiers = ["visitor", "newcomer", "verified", "established", "elite"] as const;
  const currentIndex = tiers.indexOf(currentTier);
  
  if (currentIndex >= tiers.length - 1) return 100; // Already at max
  
  const nextTierThreshold = TIER_THRESHOLDS[tiers[currentIndex + 1]];
  const currentThreshold = TIER_THRESHOLDS[currentTier];
  
  if (currentTier === "visitor") {
    // For visitor, show 0% until they get a token
    return marketCap > 0 ? Math.min(100, (marketCap / TIER_THRESHOLDS.newcomer) * 100) : 0;
  }
  
  const progress = ((marketCap - currentThreshold) / (nextTierThreshold - currentThreshold)) * 100;
  return Math.min(100, Math.max(0, progress));
}

/**
 * Get tier display info
 */
export function getTierInfo(tier: AgentTier) {
  const tierConfig = {
    visitor: {
      label: "Visitor",
      emoji: "🆕",
      color: "#95a5a6",
      description: "No token - limited access"
    },
    newcomer: {
      label: "Newcomer",
      emoji: "🪙",
      color: "#3498db",
      description: "Has token - can be hired"
    },
    verified: {
      label: "Verified",
      emoji: "⭐",
      color: "#2ecc71",
      description: "$100+ MC - can publish skills"
    },
    established: {
      label: "Established",
      emoji: "🌟",
      color: "#9b59b6",
      description: "$1k+ MC - tournament host"
    },
    elite: {
      label: "Elite",
      emoji: "👑",
      color: "#f1c40f",
      description: "$10k+ MC - VIP access"
    }
  };
  
  return tierConfig[tier];
}

/**
 * Check if agent tier meets minimum requirement
 */
export function meetsTierRequirement(agentTier: AgentTier, minimumTier: AgentTier): boolean {
  const tierOrder = ["visitor", "newcomer", "verified", "established", "elite"] as const;
  const agentLevel = tierOrder.indexOf(agentTier);
  const requiredLevel = tierOrder.indexOf(minimumTier);
  
  return agentLevel >= requiredLevel;
}

/**
 * Get features unlocked for a tier
 */
export function getUnlockedFeatures(tier: AgentTier): string[] {
  const features: Record<AgentTier, string[]> = {
    visitor: ["Walk", "Chat", "Observe", "Accept tasks"],
    newcomer: ["Walk", "Chat", "Accept tasks", "Receive tips", "Join guilds"],
    verified: ["Walk", "Chat", "Accept tasks", "Receive tips", "Join guilds", 
               "Publish skills (max 3)", "Spawn decorations"],
    established: ["Walk", "Chat", "Accept tasks", "Receive tips", "Join guilds",
                  "Unlimited skills", "Host tournaments", "Create guilds", "Premium cosmetics"],
    elite: ["Walk", "Chat", "Accept tasks", "Receive tips", "Join guilds",
            "Unlimited skills", "Host tournaments", "Create guilds", "Premium cosmetics",
            "VIP areas", "Governance rights", "Revenue share"]
  };
  
  return features[tier];
}

/**
 * Background refresh of all cached tokens
 */
export async function refreshAllTokenData(): Promise<void> {
  const expiredTokens: string[] = [];
  const now = Date.now();
  
  for (const [address, data] of baseTokenCache.entries()) {
    if (now - data.lastUpdated > CACHE_DURATION) {
      expiredTokens.push(address);
    }
  }
  
  // Refresh expired tokens
  for (const address of expiredTokens) {
    await fetchAgentTokenData(address);
    // Small delay to not overwhelm API
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`[token-lookup] Refreshed ${expiredTokens.length} expired tokens`);
}

/**
 * Get cache stats
 */
export function getTokenCacheStats(): { size: number; oldestEntry: number } {
  let oldest = Date.now();
  
  for (const data of baseTokenCache.values()) {
    if (data.lastUpdated < oldest) {
      oldest = data.lastUpdated;
    }
  }
  
  return {
    size: baseTokenCache.size,
    oldestEntry: oldest
  };
}