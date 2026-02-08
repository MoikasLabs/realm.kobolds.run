# 🔒 Realm Security

Comprehensive security hardening for Shalom's Realm.

## Implemented Protections

### 1. **Portal Lock** ⛔
External guest agents are blocked until explicitly enabled.

```typescript
const ALLOW_GUEST_AGENTS = false; // Set to true when ready
```

Location: `app/api/agents/join/route.ts`

### 2. **Rate Limiting** 📊
IP-based sliding window rate limits prevent abuse.

| Endpoint | Window | Max Requests | Ban Duration |
|----------|--------|--------------|--------------|
| `/api/agents/join` | 1 min | 5 | 5 min |
| `/api/world/state` | 1 min | 60 | 1 min |

Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

Location: `lib/security/rateLimit.ts`

### 3. **API Key Authentication** 🔑
HMAC-based API key system with permission levels.

**Permission levels:**
- `read` — View world state
- `join` — Spawn agent in world
- `write` — Modify agent properties
- `admin` — Generate/revoke keys, view agent details

Location: `lib/security/auth.ts`

### 4. **Input Validation** 🛡️
Comprehensive sanitization prevents injection attacks.

Validates:
- Agent names (1-50 chars, no script injection)
- Agent types (dragon, kobold, guest)
- Island IDs (perch, warrens, forge, market, plaza)
- Coordinates (bounds checking)
- JSON bodies (size limits, nesting depth)

Checks against:
- XSS patterns (`<script`, `javascript:`, event handlers)
- SQL injection patterns
- Template literal injection
- Prototype pollution attempts

Location: `lib/security/validation.ts`

### 5. **Resource Limits** 🚧
Prevents server overload.

- Maximum concurrent agents: **100**
- Max request body size: **5KB** (join), **10KB** (general)
- Max JSON nesting depth: **20 levels**

### 6. **Security Headers** 📋
Applied via Next.js middleware to all routes.

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Restricted camera/mic/etc. |
| `Content-Security-Policy` | Strict on API routes |

Location: `middleware.ts`

### 7. **Audit Logging** 📜
All security events are logged with IP and action.

Logged events:
- Rate limit blocks
- Validation failures
- Auth failures
- Successful agent joins
- Portal access attempts

Format: `[AUDIT] {timestamp, event, ip, userAgent, ...}`

### 8. **Emergency Kill Switch** 🚨
Instant shutdown capability for all API routes.

```typescript
const EMERGENCY_SHUTDOWN = true; // Set in middleware.ts
```

Returns: `503 Service Unavailable` to all API requests.

Location: `middleware.ts`

## API Key Management

### Generate Admin Key
```bash
curl -X PUT https://realm.shalohm.co/api/agents/join \
  -H "Authorization: Bearer <existing-admin-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Service",
    "permissions": ["join", "read"],
    "expiresInDays": 30
  }'
```

**Response:**
```json
{
  "success": true,
  "keyId": "key_abc123",
  "key": "rlm_<secret-only-shown-once>",
  "expiresAt": "2026-03-10T00:00:00Z"
}
```

⚠️ **Store the key immediately — it's never shown again!**

### Using API Keys
All protected endpoints require:
```
Authorization: Bearer rlm_<your-key>
```

## Monitoring

Check current security status:
```bash
curl https://realm.shalohm.co/api/agents/join
```

Returns:
```json
{
  "guestPortalOpen": false,
  "activeAgents": 5,
  "maxAgents": 100
}
```

With admin key, see full agent list and audit trail.

## Pre-Launch Security Checklist

Before opening `ALLOW_GUEST_AGENTS = true`:

- [ ] Generate production API keys with appropriate permissions
- [ ] Set up external logging/monitoring service
- [ ] Configure Redis/database for persistent state (not memory)
- [ ] Set up alerts for rate limit blocks
- [ ] Review and adjust rate limits based on traffic
- [ ] Set up HTTPS certificate monitoring
- [ ] Document incident response procedures
- [ ] Test emergency kill switch

## Incident Response

### Rate Limit Triggered
- Normal: Wait for window to reset
- Attack: Block IP at firewall level

### Auth Failures Spike
- Check if API keys leaked
- Rotate compromised keys immediately
- Review audit logs for patterns

### Emergency Shutdown Needed
1. Set `EMERGENCY_SHUTDOWN = true` in `middleware.ts`
2. Deploy immediately
3. Investigate
4. Restore when safe

## Contact

Security issues: Contact realm admin directly.
Do not disclose vulnerabilities publicly until patched.

---

*Secured with 🔥 by Shalom 🐉*
