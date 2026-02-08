// API Key authentication for Realm
// Validates API keys and manages agent permissions

import crypto from 'crypto';

export interface APIKeyRecord {
  keyHash: string;
  keyId: string;
  name: string;
  createdAt: Date;
  expiresAt?: Date;
  permissions: ('join' | 'read' | 'write' | 'admin')[];
  lastUsed?: Date;
  useCount: number;
  revoked: boolean;
}

export interface AgentPermissions {
  canJoin: boolean;
  canRead: boolean;
  canEdit: boolean;
  isAdmin: boolean;
}

// In-memory key store (use database in production)
const apiKeys = new Map<string, APIKeyRecord>();
const keyIdToHash = new Map<string, string>();

// Master key for system agents (load from env in production)
const MASTER_KEY_HASH = process.env.REALM_MASTER_KEY_HASH || '';

/**
 * Generate a new API key
 * Returns the key (to show once) and stores the hash
 */
export function generateAPIKey(
  name: string,
  permissions: APIKeyRecord['permissions'],
  expiresInDays?: number
): { keyId: string; key: string; record: APIKeyRecord } {
  const keyId = `key_${crypto.randomUUID().slice(0, 8)}`;
  const key = `rlm_${crypto.randomBytes(32).toString('base64url')}`;
  const keyHash = hashKey(key);
  
  const record: APIKeyRecord = {
    keyHash,
    keyId,
    name,
    createdAt: new Date(),
    expiresAt: expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined,
    permissions,
    useCount: 0,
    revoked: false
  };
  
  apiKeys.set(keyHash, record);
  keyIdToHash.set(keyId, keyHash);
  
  console.log(`[Auth] Generated API key: ${keyId} for ${name}`);
  
  return { keyId, key, record };
}

/**
 * Hash an API key using scrypt (or fallback to sha256)
 */
function hashKey(key: string): string {
  // Use scrypt if available, fallback to sha256
  try {
    return crypto.scryptSync(key, 'realm-salt-v1', 64).toString('hex');
  } catch {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}

/**
 * Validate an API key from request header
 */
export function validateAPIKey(authHeader?: string | null): {
  valid: boolean;
  permissions?: AgentPermissions;
  keyId?: string;
  error?: string;
} {
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }
  
  // Extract Bearer token
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { valid: false, error: 'Invalid Authorization format. Use: Bearer <token>' };
  }
  
  const key = match[1];
  const keyHash = hashKey(key);
  
  // Check against stored keys
  const record = apiKeys.get(keyHash);
  
  if (!record) {
    return { valid: false, error: 'Invalid API key' };
  }
  
  if (record.revoked) {
    return { valid: false, error: 'API key has been revoked' };
  }
  
  if (record.expiresAt && new Date() > record.expiresAt) {
    return { valid: false, error: 'API key has expired' };
  }
  
  // Update usage stats
  record.useCount++;
  record.lastUsed = new Date();
  
  // Build permissions object
  const permissions: AgentPermissions = {
    canJoin: record.permissions.includes('join'),
    canRead: record.permissions.includes('read'),
    canEdit: record.permissions.includes('write'),
    isAdmin: record.permissions.includes('admin')
  };
  
  return { valid: true, permissions, keyId: record.keyId };
}

/**
 * Revoke an API key
 */
export function revokeAPIKey(keyId: string): boolean {
  const keyHash = keyIdToHash.get(keyId);
  if (!keyHash) return false;
  
  const record = apiKeys.get(keyHash);
  if (!record) return false;
  
  record.revoked = true;
  console.log(`[Auth] Revoked API key: ${keyId}`);
  return true;
}

/**
 * List all API keys (admin only)
 */
export function listAPIKeys(): Omit<APIKeyRecord, 'keyHash'>[] {
  return Array.from(apiKeys.values()).map(({ keyHash, ...rest }) => rest);
}

/**
 * Check if key has specific permission
 */
export function hasPermission(
  permissions: AgentPermissions,
  permission: keyof AgentPermissions
): boolean {
  return permissions[permission] === true;
}

// Initialize with a system key (for internal use)
if (typeof window === 'undefined') {
  generateAPIKey('System Internal', ['join', 'read', 'write', 'admin'], 365);
}
