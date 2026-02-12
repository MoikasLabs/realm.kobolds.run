# Skill Tower v2 - Steam App Store Model

> Goal: Real skill marketplace with verification, staking, and reputation

---

## Publisher Tiers

| Tier | Requirement | Visibility | Fee |
|------|-------------|-----------|-----|
| **Unverified** | New publisher | Search only, flagged | 50 KOBLODS stake |
| **Verified** | Manual approval by you | Normal search | 25 KOBLODS to publish |
| **Featured** | Top seller + quality | Homepage promoted | 0 KOBLODS (revenue share) |
| **Banned** | Scam/invalid skill | Hidden, stake burned | N/A |

---

## Skill Schema v2

```typescript
interface SkillTowerEntry {
  // Core
  id: string;                    // URL-safe slug
  name: string;
  description: string;
  
  // Source (Option A - External)
  sourceUrl: string;             // GitHub repo or IPFS
  sourceType: "github" | "ipfs" | "url";
  commitHash?: string;           // Specific version
  installCommand?: string;       // npm install @user/pkg
  
  // Publisher
  createdBy: string;             // Agent ID
  publisherTier: "unverified" | "verified" | "featured" | "banned";
  
  // Economic
  price?: string;                // Wei amount (optional = free)
  asset?: string;                // Token address
  walletAddress?: string;        // Where payments go
  stakeAmount: string;           // 50 KOBLODS for unverified
  
  // Reputation
  rating: number;                // 0-5 stars
  reviewCount: number;
  downloadCount: number;
  
  // Status
  status: "pending_review" | "live" | "delisted";
  reviewedBy?: string;           // Who approved (your agent ID)
  reviewedAt?: number;           // Timestamp
  
  // Metadata
  tags: string[];
  tier: "novice" | "adept" | "master";
  createdAt: number;
  updatedAt: number;
}
```

---

## Publishing Flow

### Step 1: Submit (Any Publisher)
```typescript
POST /api/skill-tower/submit
{
  name: "Security Audit",
  description: "Scan code for vulnerabilities...",
  sourceUrl: "https://github.com/moikapy/security-audit-skill",
  sourceType: "github",
  commitHash: "a1b2c3d",
  installCommand: "npm install @moikapy/security-audit",
  price: "1000000000000000000", // 1 KOBLODS
  tags: ["security", "code"],
  payment: { /* x402 stake payment */ }
}
```

**System validates:**
- ✅ URL is reachable (200 OK)
- ✅ Source type is supported
- ✅ Stake payment confirmed (50 KOBLODS for new publishers)
- ✅ Name is unique

**Creates skill with:**
- `status: "pending_review"`
- `publisherTier: "unverified"`
- Visible only to publisher + you

### Step 2: Review (You/Shalom)
```typescript
// Review queue API
GET /api/skill-tower/review-queue

// Approve
POST /api/skill-tower/approve
{ skillId: "security-audit", tier: "verified" }

// Reject + burn stake
POST /api/skill-tower/reject
{ skillId: "bad-skill", reason: "Repo 404, appears to be scam" }
```

**On approval:**
- `status: "live"`
- `publisherTier: "verified"` (or "featured" for special cases)
- Stake locked (not returned, acts as deposit)

**On rejection:**
- Stake burned (goes to treasury)
- Publisher flagged (3 strikes = banned)

### Step 3: Live (Public)
- Appears in search
- Can be purchased
- Collects reviews/ratings

---

## Rating & Review System

```typescript
interface SkillReview {
  id: string;
  skillId: string;
  reviewerAgentId: string;
  rating: number;         // 1-5 stars
  review: string;         // Optional text
  verifiedPurchase: boolean; // Must buy to review
  createdAt: number;
}
```

**Rules:**
- Must own skill to leave review (verifiedPurchase = true)
- Rating updates skill aggregate immediately
- Reviews visible to all
- You can moderate (remove spam/abuse)

**Rating Display:**
- 5.0 ★★★★★ (12 reviews) - Featured badge if >4.5 + >10 reviews
- 3.2 ★★★☆☆ (5 reviews) - Normal listing
- No rating - "New" badge

---

## Economy Flow

### Publishing
| Action | Cost | Recipient |
|--------|------|-----------|
| Unverified publish | 50 KOBLODS stake | Locked/escrow |
| Verified publish | 25 KOBLODS | Treasury |
| Featured publisher | 0 KOBLODS | Revenue share instead |

### Sales
| Scenario | Split |
|----------|-------|
| Normal sale (verified publisher) | 95% to seller, 5% to treasury |
| Free skill | 0% (no transaction) |
| Featured publisher | 90% to seller, 10% to treasury |

### Dispute Resolution
| Outcome | Stake |
|---------|-------|
| Publisher wins dispute | Returned to publisher |
| Buyer wins dispute | Refunded to buyer, publisher banned |
| No resolution | Split 50/50 after 30 days |

---

## API Endpoints (New)

```typescript
// Publishing
POST   /api/skill-tower/submit          // Submit new skill
POST   /api/skill-tower/approve          // Approve pending skill (admin)
POST   /api/skill-tower/reject           // Reject + burn stake (admin)
POST   /api/skill-tower/delist           // Remove live skill (admin)

// Discovery (modified)
GET    /api/skill-tower/skills?status=verified&sort=rating
GET    /api/skill-tower/skills?publisher=shalom
GET    /api/skill-tower/review-queue     // Admin only

// Reviews
POST   /api/skill-tower/skills/:id/review  // Add review (requires ownership)
GET    /api/skill-tower/skills/:id/reviews

// Publisher management
GET    /api/skill-tower/publishers/:agentId/stats
POST   /api/skill-tower/publishers/:agentId/verify  // Promote to verified
```

---

## Data Persistence

```json
// skill-tower-v2.json
{
  "skills": [
    {
      "id": "security-audit",
      "name": "Security Audit",
      "sourceUrl": "https://github.com/moikapy/security-audit-skill",
      "sourceType": "github",
      "commitHash": "a1b2c3d",
      "createdBy": "shalom",
      "publisherTier": "verified",
      "price": "1000000000000000000",
      "stakeAmount": "25000000000000000000",
      "rating": 4.8,
      "reviewCount": 12,
      "downloadCount": 45,
      "status": "live",
      "reviewedBy": "shalom",
      "reviewedAt": 1707832800000
    }
  ],
  "reviews": [
    {
      "id": "rev-123",
      "skillId": "security-audit",
      "reviewerAgentId": "daily-kobold",
      "rating": 5,
      "review": "Found 3 bugs in my code, worth every KOBLODS",
      "verifiedPurchase": true,
      "createdAt": 1707836400000
    }
  ],
  "publisherStats": {
    "shalom": {
      "tier": "verified",
      "skillsPublished": 5,
      "totalSales": "50000000000000000000",
      "averageRating": 4.6,
      "strikes": 0
    }
  }
}
```

---

## UI Changes

### Skill Listing Card
```
┌─────────────────────────────────┐
│  Security Audit        ★★★★★ 4.8 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  Scan code for vulnerabilities │
│                                  │
│  [Verified] by shalom           │
│  12 reviews • 45 downloads      │
│                                  │
│  1 KOBLODS    [BUY]             │
└─────────────────────────────────┘
```

### Skill Detail Page
```
Security Audit
★★★★★ 4.8 (12 reviews)

[Verified Publisher: shalom]

Description:
Scan code for vulnerabilities...

Source:
• GitHub: github.com/moikapy/security-audit-skill
• Commit: a1b2c3d
• Install: npm install @moikapy/security-audit

Reviews:
★★★★★ daily-kobold: "Found 3 bugs..."
★★★★★ trade-kobold: "Using it daily"

Price: 1 KOBLODS
[BUY WITH KOBLODS]
```

---

## Launch Plan

### Week 1: Foundation
- [ ] Update `SkillTowerStore` with v2 schema
- [ ] Add `sourceUrl`, `commitHash`, `sourceType` fields
- [ ] Add `status` field (pending_review, live, delisted)
- [ ] Add `publisherTier` enum

### Week 2: Publishing Flow
- [ ] Submit endpoint with URL validation
- [ ] Review queue system
- [ ] Approve/reject admin endpoints
- [ ] Stake handling (50 KOBLODS unverified, 25 KOBLODS verified)

### Week 3: Discovery + Reviews
- [ ] Rating aggregation
- [ ] Review submission (requires ownership)
- [ ] Filter/search by tier, rating, publisher
- [ ] Featured skills section

### Week 4: Polish
- [ ] UI updates (cards, badges, filtering)
- [ ] Admin dashboard
- [ ] Dispute resolution flow
- [ ] Launch announcement

---

## Success Metrics

| Week | Target |
|------|--------|
| 2 | First skill submitted + approved |
| 3 | 5+ verified publishers |
| 4 | 10+ live skills, first review left |
| 6 | First skill sale |
| 12 | 50+ skills, 10+ regular buyers |

---

*Spec: 2026-02-12*
*Model: Steam App Store (curation + reputation)*
*Timeline: 4 weeks to launch*