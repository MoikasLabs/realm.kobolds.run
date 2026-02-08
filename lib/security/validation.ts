// Input validation and sanitization for Realm API
// Prevents injection attacks and ensures data integrity

export interface ValidationResult {
  valid: boolean;
  sanitized?: unknown;
  error?: string;
}

// Valid island IDs
const VALID_ISLANDS = ['perch', 'warrens', 'forge', 'market', 'plaza'];

// Valid agent types
const VALID_AGENT_TYPES = ['dragon', 'kobold', 'guest'];

// Forbidden patterns (potential injection attempts)
const FORBIDDEN_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i, // onclick=, onerror=, etc.
  /data:text\/html/i,
  /\/\*\s*\*\//, // SQL comment injection
  /;\s*drop\s+/i, // SQL drop
  /union\s+select/i, // SQL union
  /\$\{.*\}/, // Template literal injection
  /__proto__/i,
  /constructor/i,
];

/**
 * Validate and sanitize agent name
 */
export function validateAgentName(name: unknown): ValidationResult {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Agent name must be a string' };
  }
  
  // Length check
  if (name.length < 1 || name.length > 50) {
    return { valid: false, error: 'Agent name must be between 1 and 50 characters' };
  }
  
  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(name)) {
      console.warn(`[Validation] Blocked potentially malicious agent name: ${name.slice(0, 20)}...`);
      return { valid: false, error: 'Agent name contains invalid characters' };
    }
  }
  
  // Sanitize: remove control characters, trim
  const sanitized = name
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Control chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Check for empty after sanitization
  if (!sanitized) {
    return { valid: false, error: 'Agent name cannot be empty' };
  }
  
  return { valid: true, sanitized };
}

/**
 * Validate agent type
 */
export function validateAgentType(type: unknown): ValidationResult {
  if (typeof type !== 'string') {
    return { valid: false, error: 'Agent type must be a string' };
  }
  
  const normalized = type.toLowerCase().trim();
  
  if (!VALID_AGENT_TYPES.includes(normalized)) {
    return { 
      valid: false, 
      error: `Invalid agent type. Must be one of: ${VALID_AGENT_TYPES.join(', ')}` 
    };
  }
  
  return { valid: true, sanitized: normalized };
}

/**
 * Validate island ID
 */
export function validateIsland(island: unknown): ValidationResult {
  if (typeof island !== 'string') {
    return { valid: false, error: 'Island must be a string' };
  }
  
  const normalized = island.toLowerCase().trim();
  
  if (!VALID_ISLANDS.includes(normalized)) {
    return { 
      valid: false, 
      error: `Invalid island. Must be one of: ${VALID_ISLANDS.join(', ')}` 
    };
  }
  
  return { valid: true, sanitized: normalized };
}

/**
 * Validate API key (format check only)
 */
export function validateAPIKeyFormat(key: unknown): ValidationResult {
  if (typeof key !== 'string') {
    return { valid: false, error: 'API key must be a string' };
  }
  
  // Realm keys start with 'rlm_'
  if (!key.startsWith('rlm_')) {
    return { valid: false, error: 'Invalid API key format' };
  }
  
  // Check length (rough check, actual keys are longer)
  if (key.length < 20 || key.length > 200) {
    return { valid: false, error: 'Invalid API key length' };
  }
  
  // Check for suspicious characters
  if (/[<>"'\\]/.test(key)) {
    return { valid: false, error: 'API key contains invalid characters' };
  }
  
  return { valid: true, sanitized: key.trim() };
}

/**
 * Validate position coordinates
 */
export function validatePosition(pos: unknown): ValidationResult {
  if (!pos || typeof pos !== 'object') {
    return { valid: false, error: 'Position must be an object' };
  }
  
  const p = pos as Record<string, unknown>;
  
  const x = typeof p.x === 'number' ? p.x : parseFloat(p.x as string);
  const y = typeof p.y === 'number' ? p.y : parseFloat(p.y as string);
  const z = typeof p.z === 'number' ? p.z : parseFloat(p.z as string);
  
  if (isNaN(x) || isNaN(y) || isNaN(z)) {
    return { valid: false, error: 'Position coordinates must be numeric' };
  }
  
  // Bounds check (realm is roughly -100 to 100)
  const absLimit = 500;
  if (Math.abs(x) > absLimit || Math.abs(y) > absLimit || Math.abs(z) > absLimit) {
    return { valid: false, error: 'Position coordinates out of bounds' };
  }
  
  return { valid: true, sanitized: { x, y, z } };
}

/**
 * JSON payload validation
 */
export function validateJSONBody(body: string, maxSize: number = 10000): ValidationResult {
  // Size check
  if (body.length > maxSize) {
    return { valid: false, error: `Request body too large (max ${maxSize} bytes)` };
  }
  
  // Nested depth check (prevent stack overflow)
  let depth = 0;
  let maxDepth = 0;
  for (const char of body) {
    if (char === '{' || char === '[') {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === '}' || char === ']') {
      depth--;
    }
    
    if (maxDepth > 20) {
      return { valid: false, error: 'JSON nesting too deep' };
    }
  }
  
  try {
    const parsed = JSON.parse(body);
    return { valid: true, sanitized: parsed };
  } catch {
    return { valid: false, error: 'Invalid JSON' };
  }
}

/**
 * Comprehensive validation for join request
 */
export function validateJoinRequest(body: unknown): {
  valid: boolean;
  data?: {
    agentName: string;
    agentType: string;
    requestedIsland?: string;
    apiKey?: string;
  };
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }
  
  const b = body as Record<string, unknown>;
  
  // Validate required fields
  const nameResult = validateAgentName(b.agentName);
  if (!nameResult.valid) {
    return { valid: false, error: nameResult.error };
  }
  
  const typeResult = validateAgentType(b.agentType);
  if (!typeResult.valid) {
    return { valid: false, error: typeResult.error };
  }
  
  // Validate optional fields
  let islandResult: ValidationResult | undefined;
  if (b.requestedIsland !== undefined) {
    islandResult = validateIsland(b.requestedIsland);
    if (!islandResult.valid) {
      return { valid: false, error: islandResult.error };
    }
  }
  
  let apiKeyResult: ValidationResult | undefined;
  if (b.apiKey !== undefined) {
    apiKeyResult = validateAPIKeyFormat(b.apiKey);
    if (!apiKeyResult.valid) {
      return { valid: false, error: apiKeyResult.error };
    }
  }
  
  return {
    valid: true,
    data: {
      agentName: nameResult.sanitized as string,
      agentType: typeResult.sanitized as string,
      requestedIsland: islandResult?.sanitized as string | undefined,
      apiKey: apiKeyResult?.sanitized as string | undefined
    }
  };
}
