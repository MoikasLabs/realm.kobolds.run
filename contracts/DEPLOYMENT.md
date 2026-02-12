# ERC-8004 Deployment Guide

## Overview

This document describes the deployment process for the ERC-8004 Identity and Reputation Registry contracts on Base networks.

## Contracts

| Contract | Purpose | Type |
|----------|---------|------|
| `ERC8004IdentityRegistry` | Agent identity NFT (ERC-721) with metadata | Regular deployment |
| `ERC8004ReputationRegistry` | Feedback and reputation storage | UUPS Proxy |

## Network Configuration

### Base Sepolia (Testnet)

| Parameter | Value |
|-----------|-------|
| Chain ID | 84532 |
| RPC URL | `https://sepolia.base.org` |
| Explorer | https://sepolia.basescan.org |
| Faucet | https://www.alchemy.com/faucets/base-sepolia |

### Base Mainnet

| Parameter | Value |
|-----------|-------|
| Chain ID | 8453 |
| RPC URL | `https://mainnet.base.org` |
| Explorer | https://basescan.org |

## Prerequisites

### 1. Environment Setup

Create a `.env` file in the project root:

```bash
# Copy the example file
cp .env.hardhat.example .env
```

Required environment variables:

```env
# Deployer private key (without 0x prefix)
DEPLOYER_PRIVATE_KEY=your_private_key_here

# Basescan API key for verification
BASESCAN_API_KEY=your_api_key_here

# Optional: Custom RPC endpoints
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_MAINNET_RPC_URL=https://mainnet.base.org
```

### 2. Get Testnet ETH

1. Go to [Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia)
2. Connect your wallet or enter your deployer address
3. Request testnet ETH (usually 0.5-1 ETH available)

### 3. Get Basescan API Key

1. Go to [Basescan](https://basescan.org/register)
2. Create an account
3. Navigate to [API Keys](https://basescan.org/myapikey)
4. Create a new API key

### 4. Install Dependencies

```bash
npm install
```

## Deployment

### Local Deployment (for testing)

```bash
# Start a local Hardhat node
npx hardhat node

# In another terminal, deploy
npx hardhat run scripts/deploy-erc8004.ts --network localhost
```

### Base Sepolia Deployment

```bash
# Ensure your .env is configured with:
# - DEPLOYER_PRIVATE_KEY
# - BASESCAN_API_KEY

npx hardhat run scripts/deploy-erc8004.ts --network base-sepolia
```

### Base Mainnet Deployment

```bash
# ⚠️ Ensure thorough testing on testnet first!

npx hardhat run scripts/deploy-erc8004.ts --network base-mainnet
```

## Deployment Output

After successful deployment, addresses are saved to:

```
deployments/<network>-<chainId>.json
```

Example output file:

```json
{
  "network": "base-sepolia",
  "chainId": 84532,
  "deployer": "0x...",
  "deploymentTime": "2026-02-12T20:30:00.000Z",
  "contracts": {
    "identityRegistry": {
      "address": "0x...",
      "name": "ShalomAgentIdentity",
      "symbol": "SAI",
      "txHash": "0x...",
      "blockNumber": 12345678
    },
    "reputationRegistry": {
      "address": "0x...",
      "identityRegistry": "0x...",
      "txHash": "0x...",
      "blockNumber": 12345680,
      "implementation": "0x..."
    }
  },
  "verification": {
    "identityRegistry": "verified",
    "reputationRegistry": "verified"
  }
}
```

## Manual Verification

If automatic verification fails, verify manually:

```bash
# Verify Identity Registry
npx hardhat verify --network base-sepolia <IDENTITY_ADDRESS> \
  "ShalomAgentIdentity" "SAI" "<DEPLOYER_ADDRESS>"

# Verify Reputation Registry Implementation
npx hardhat verify --network base-sepolia <IMPLEMENTATION_ADDRESS>
```

## Contract Interactions

### Register an Agent

```typescript
const identity = await ethers.getContractAt(
  "ERC8004IdentityRegistry",
  IDENTITY_ADDRESS
);

// Register with URI
const tx = await identity.register("ipfs://Qm...");
const receipt = await tx.wait();
// Get agentId from Registered event
```

### Submit Feedback

```typescript
const reputation = await ethers.getContractAt(
  "ERC8004ReputationRegistry",
  REPUTATION_ADDRESS
);

await reputation.giveFeedback(
  agentId,           // The agent being rated
  100,               // Value (positive or negative)
  2,                 // Decimals (100 = 1.00 rating)
  "quality",         // Primary tag
  "response-time",   // Secondary tag
  "https://...",     // Endpoint URL
  "ipfs://...",      // Feedback URI (optional)
  ethers.ZeroHash    // Feedback hash (optional)
);
```

### Get Reputation Summary

```typescript
const [count, summaryValue, decimals] = await reputation.getSummary(
  agentId,
  [],              // Empty array = all clients
  "",              // Empty = no tag filter
  ""               // Empty = no subcategory filter
);

console.log(`Total feedback: ${count}`);
console.log(`Sum: ${summaryValue / 10n ** BigInt(decimals)}`);
```

## Gas Estimates

Approximate gas costs for Base Sepolia:

| Operation | Gas Used | ~Cost (at 1 gwei) |
|-----------|----------|-------------------|
| Deploy Identity | ~2,500,000 | ~0.0025 ETH |
| Deploy Reputation (Proxy) | ~1,800,000 | ~0.0018 ETH |
| Register Agent | ~150,000 | ~0.00015 ETH |
| Give Feedback | ~80,000 | ~0.00008 ETH |

## Troubleshooting

### "insufficient funds for intrinsic transaction cost"

- Ensure your deployer wallet has enough ETH
- Get testnet ETH from the faucet

### "Already Verified"

- This is normal if contracts were verified previously
- Check the explorer link to confirm

### "Invalid signature" when setting wallet

- Ensure you're using EIP-712 typed data
- The signature must come from the new wallet address
- Check deadline hasn't expired

### Proxy verification fails

- Verify the implementation address, not the proxy
- Use `@openzeppelin/hardhat-upgrades` for proxy verification

## Security Considerations

1. **Private Keys**: Never commit private keys to git. Use `.env` and ensure `.env` is in `.gitignore`.

2. **Upgrade Safety**: Reputation Registry uses UUPS proxy. Only the owner can upgrade. Implement `authorizeUpgrade` for additional safety.

3. **Access Control**: 
   - Identity Registry: Only token owner can modify metadata/wallet
   - Reputation Registry: Only agent owner can respond to feedback

4. **Sig Replay**: Wallet setting uses EIP-712 with deadline to prevent replay attacks.

## Post-Deployment Checklist

- [ ] Verify contracts on block explorer
- [ ] Test registration flow
- [ ] Test feedback submission
- [ ] Test reputation query
- [ ] Save deployment addresses to team documentation
- [ ] Set up monitoring (optional)
- [ ] Configure operational roles (if needed)

## Support

For issues or questions:
- Open an issue on GitHub
- Check the [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004)

---

*Last updated: 2026-02-12*