# ERC-8004 Week 1 Work Breakdown

## Team Structure

| Role | Agent | Task | Est. Time |
|------|-------|------|-----------|
| **Smart Contract Dev** | ContractKobold | Identity + Reputation contracts | 3 days |
| **Deployment & Infra** | DeployKobold | Hardhat config, deploy scripts, testnet | 2 days |
| **Integration Dev** | IntegrationKobold | Realm server integration, DB schema | 2 days |
| **Testing & QA** | TestKobold | Unit tests, integration tests | 2 days |

---

## Work Packages

### Package A: Smart Contracts (ContractKobold)
**Files:**
- `contracts/ERC8004IdentityRegistry.sol`
- `contracts/ERC8004ReputationRegistry.sol`

**Requirements:**
- ERC-721 with URIStorage for Identity
- Metadata storage (key-value)
- EIP-712 signature verification for wallet setting
- Reputation feedback storage
- Tag-based filtering

**Deliverables:**
- [ ] Compiling contracts
- [ ] Unit tests passing
- [ ] Gas optimization review

### Package B: Infrastructure (DeployKobold)
**Files:**
- `hardhat.config.ts`
- `scripts/deploy-erc8004.ts`
- `.env.example`

**Requirements:**
- Hardhat setup with Base Sepolia
- Deployment scripts with verification
- Environment variable management
- README with deploy instructions

**Deliverables:**
- [ ] Contracts deployed to Base Sepolia
- [ ] Verified on Basescan
- [ ] Deployment addresses documented

### Package C: Server Integration (IntegrationKobold)
**Files:**
- `server/identity/erc8004-client.ts`
- `server/db/agent-identity.ts`
- `server/routes/agent-identity.ts`

**Requirements:**
- Identity lookup by wallet
- Auto-registration flow
- Reputation query API
- Database schema updates

**Deliverables:**
- [ ] Agent lookup by wallet
- [ ] Auto-registration on first connect
- [ ] Reputation endpoint `/api/agents/:id/reputation`

### Package D: Testing (TestKobold)
**Files:**
- `test/ERC8004Identity.test.ts`
- `test/ERC8004Reputation.test.ts`
- `test/integration/realm-identity.test.ts`

**Requirements:**
- Unit tests for all contract functions
- Integration tests for registration flow
- Edge case coverage

**Deliverables:**
- [ ] 90%+ test coverage
- [ ] CI passing
- [ ] Bug reports fixed

---

## Dependencies

```
A (Contracts) ─┬─► B (Deployment) ─┐
               │                   ├─► D (Testing)
               └───────────────────┘
               
C (Integration) ────────────────────► D (Testing)
```

**Critical path:** A → B → C → D

---

## Daily Standup Format

Each kobold reports:
1. What completed yesterday
2. What working on today
3. Blockers or help needed

---

## Branch

`shalom/erc8004-identity-week1`

**Merge criteria:**
- All tests passing
- Contracts deployed and verified
- Integration working on testnet
- Code review approved

---

## Spawn Commands

```bash
# Spawn contract developer
team spawn smart-contract-dev --name ContractKobold \
  --task "Create ERC-8004 Identity and Reputation contracts with full ERC-721 compliance, metadata storage, and EIP-712 wallet verification"

# Spawn deployment specialist  
team spawn devops --name DeployKobold \
  --task "Set up Hardhat with Base Sepolia, create deployment scripts, verify contracts on Basescan, document addresses"

# Spawn integration developer
team spawn backend-dev --name IntegrationKobold \
  --task "Create Realm server integration for ERC-8004: agent lookup by wallet, auto-registration flow, reputation query API"

# Spawn QA engineer
team spawn qa --name TestKobold \
  --task "Write comprehensive unit and integration tests for ERC-8004 contracts and Realm integration, 90%+ coverage"
```

---

*Work breakdown created: 2026-02-12*
*Target completion: 1 week*