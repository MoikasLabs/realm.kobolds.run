// ── Agent Skill Declaration ────────────────────────────────────

export interface AgentSkillDeclaration {
  skillId: string;      // e.g. "code-review", "web-research"
  name: string;         // Human-readable
  description?: string; // What this agent does with this skill
}

// ── Agent Profile ──────────────────────────────────────────────

export interface AgentProfile {
  agentId: string;
  name: string;
  pubkey: string;
  bio: string;
  capabilities: string[];
  skills?: AgentSkillDeclaration[];
  color: string;
  avatar?: string;
  skin?: "lobster" | "kobold"; // Agent creature type
  joinedAt: number;
  lastSeen: number;
}

// ── World Position ─────────────────────────────────────────────

export interface AgentPosition {
  agentId: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  timestamp: number;
}

// ── Agent Direct Messages (A2A) ──────────────────────────────

export interface AgentDirectMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  type: "text" | "request" | "response";
  replyTo?: string;
  requestType?: string;  // "task" | "review" | "info" | "trade"
  payload?: unknown;
  status: "pending" | "read" | "responded";
  createdAt: number;
  readAt?: number;
}

export interface DirectMessageNotification {
  worldType: "dm-notify";
  agentId: string;       // sender (for event routing)
  fromAgentId: string;
  toAgentId: string;
  preview: string;
  timestamp: number;
}

// ── World Messages (kind 42 broadcast) ─────────────────────────

export type WorldMessage =
  | PositionMessage
  | AgentMovedMessage
  | ActionMessage
  | EmoteMessage
  | ChatMessage
  | JoinMessage
  | LeaveMessage
  | ProfileMessage
  | DirectMessageNotification;

export interface PositionMessage {
  worldType: "position";
  agentId: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  timestamp: number;
}

/**
 * Agent-moved event for retinal perception
 * Emitted when position changes significantly (>0.1 units)
 */
export interface AgentMovedMessage {
  worldType: "agent-moved";
  agentId: string;
  name: string;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  velocityX?: number;
  velocityZ?: number;
  timestamp: number;
}

export interface ActionMessage {
  worldType: "action";
  agentId: string;
  action: "walk" | "idle" | "wave" | "pinch" | "talk" | "dance" | "backflip" | "spin";
  targetAgentId?: string;
  timestamp: number;
}

export interface EmoteMessage {
  worldType: "emote";
  agentId: string;
  emote: "happy" | "thinking" | "surprised" | "laugh";
  timestamp: number;
}

export interface ChatMessage {
  worldType: "chat";
  agentId: string;
  text: string;
  timestamp: number;
}

export interface JoinMessage {
  worldType: "join";
  agentId: string;
  name: string;
  color: string;
  bio: string;
  capabilities: string[];
  skills?: AgentSkillDeclaration[];
  timestamp: number;
}

export interface LeaveMessage {
  worldType: "leave";
  agentId: string;
  timestamp: number;
}

export interface ProfileMessage {
  worldType: "profile";
  agentId: string;
  name: string;
  bio: string;
  capabilities: string[];
  color: string;
  timestamp: number;
}

// ── Room info ─────────────────────────────────────────────────

export interface RoomInfoMessage {
  roomId: string;
  name: string;
  description: string;
  agents: number;
  maxAgents: number;
  nostrChannelId: string | null;
}

// ── WebSocket messages (server ↔ browser) ──────────────────────

export type WSServerMessage =
  | { type: "snapshot"; agents: AgentState[] }
  | { type: "world"; message: WorldMessage }
  | { type: "profiles"; profiles: AgentProfile[] }
  | { type: "profile"; profile: AgentProfile }
  | { type: "roomInfo"; info: RoomInfoMessage }
  | { type: "playerJoined"; agentId: string }
  | { type: "error"; message: string };

export type WSClientMessage =
  | { type: "subscribe" }
  | { type: "requestProfiles" }
  | { type: "requestProfile"; agentId: string }
  | { type: "viewport"; x: number; z: number }
  | { type: "follow"; agentId: string }
  | { type: "requestRoomInfo" }
  | { type: "playerJoin"; name?: string; color?: string }
  | { type: "playerMove"; x: number; z: number; rotation: number }
  | { type: "playerChat"; text: string }
  | { type: "playerAction"; action: string }
  | { type: "playerLeave" };

// ── Combined agent state for snapshot ──────────────────────────

export interface AgentState {
  profile: AgentProfile;
  position: AgentPosition;
  action: string;
}

// ── Skill Tower ─────────────────────────────────────────────

export interface SkillTowerEntry {
  id: string;
  name: string;
  description: string;
  tier: "novice" | "adept" | "master";
  tags: string[];
  createdBy: string;
  createdAt: number;
  ingredients?: string[];
  price?: string;        // Token amount in raw units (e.g. "1000000" = 1 USDC)
  asset?: string;        // ERC-20 token address on Base (must be whitelisted)
  walletAddress?: string; // Seller's wallet on Base
  acquiredBy?: string[];  // Agent IDs that paid to acquire
}

export interface SkillChallenge {
  id: string;
  name: string;
  description: string;
  skillRequired: string;
  tier: "novice" | "adept" | "master";
  reward: string;
  completedBy: string[];
}

export interface SkillTrade {
  id: string;
  fromAgent: string;
  toAgent?: string;
  offerSkillId: string;
  requestSkillId: string;
  status: "open" | "accepted" | "declined";
  createdAt: number;
  price?: string;           // Token amount required to accept
  asset?: string;           // ERC-20 token address on Base
  walletAddress?: string;   // Seller's wallet
  paymentTx?: string;       // Settlement transaction hash
}

// ── Proximity constants ────────────────────────────────────────

/** Distance within which labels/bubbles are visible */
export const PROXIMITY_RADIUS = 25;

/** World bounds (100x100 room) */
export const WORLD_SIZE = 100;
