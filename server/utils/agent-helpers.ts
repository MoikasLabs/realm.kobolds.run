/**
 * Agent helper utilities
 */

/**
 * Get agent's token contract address
 * In production, this would query database or ERC-8004
 */
export async function getAgentTokenContract(agentId: string): Promise<string | null> {
  // TODO: Implement actual lookup from database
  // For now, return null (no tokens registered yet)
  return null;
}