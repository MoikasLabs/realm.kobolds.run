// Rate limiting middleware for Realm API
// Uses IP-based tracking with sliding window

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockExpires?: number;
}

const RATE_LIMITS = {
  // Stricter for joins (expensive operation)
  join: {
    windowMs: 60000, // 1 minute
    maxRequests: 5,
    blockDurationMs: 300000 // 5 minute ban if exceeded
  },
  // Lighter for state reads
  state: {
    windowMs: 60000,
    maxRequests: 60,
    blockDurationMs: 60000 // 1 minute ban
  }
};

// In-memory store (use Redis in production)
const ipStore = new Map<string, Map<string, RateLimitEntry>>();

function getClientIP(req: Request): string {
  // Try various headers, fallback to 'unknown'
  const headers = req.headers;
  const forwarded = headers.get('x-forwarded-for');
  const realIP = headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export function checkRateLimit(
  req: Request,
  endpoint: 'join' | 'state'
): RateLimitResult {
  const ip = getClientIP(req);
  const now = Date.now();
  const config = RATE_LIMITS[endpoint];
  
  // Get or create IP entry map
  let ipEntries = ipStore.get(ip);
  if (!ipEntries) {
    ipEntries = new Map();
    ipStore.set(ip, ipEntries);
  }
  
  // Get or create endpoint entry
  let entry = ipEntries.get(endpoint);
  if (!entry || now - entry.windowStart > config.windowMs) {
    entry = {
      count: 0,
      windowStart: now,
      blocked: false
    };
    ipEntries.set(endpoint, entry);
  }
  
  // Check if currently blocked
  if (entry.blocked && entry.blockExpires && now < entry.blockExpires) {
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      resetTime: entry.blockExpires,
      retryAfter: Math.ceil((entry.blockExpires - now) / 1000)
    };
  }
  
  // Clear block if expired
  if (entry.blocked && entry.blockExpires && now >= entry.blockExpires) {
    entry.blocked = false;
    entry.blockExpires = undefined;
    entry.count = 0;
    entry.windowStart = now;
  }
  
  // Check limit
  if (entry.count >= config.maxRequests) {
    // Block the IP
    entry.blocked = true;
    entry.blockExpires = now + config.blockDurationMs;
    
    console.warn(`[RateLimit] IP ${ip} blocked from ${endpoint} for ${config.blockDurationMs}ms`);
    
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      resetTime: entry.blockExpires,
      retryAfter: Math.ceil(config.blockDurationMs / 1000)
    };
  }
  
  // Increment count
  entry.count++;
  
  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetTime: entry.windowStart + config.windowMs
  };
}

// Cleanup old entries periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  const maxAge = 3600000; // 1 hour
  
  for (const [ip, entries] of ipStore) {
    for (const [endpoint, entry] of entries) {
      if (now - entry.windowStart > maxAge && !entry.blocked) {
        entries.delete(endpoint);
      }
    }
    if (entries.size === 0) {
      ipStore.delete(ip);
    }
  }
}, 600000);

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
    ...(result.retryAfter && { 'Retry-After': result.retryAfter.toString() })
  };
}
