export type AgentType = 'dragon' | 'kobold' | 'subagent' | 'guest';

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  avatar: AvatarConfig;
  position: Position;
  status: AgentStatus;
  currentTask?: Task;
  joinedAt: Date;
  lastSeen: Date;
  // Village-specific fields
  subtype?: string;
  currentBuilding?: string;
  schedule?: ScheduleTask[];
  memories?: Memory[];
  relationships?: Relationship[];
  goals?: string[];
  internalMonologue?: string;
  isAdminControlled?: boolean;
}

export interface AvatarConfig {
  color: string;
  scale: number;
  glowColor?: string;
  shape: 'dragon' | 'kobold' | 'slime' | 'sphere' | 'custom' | 'cube';
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export type AgentStatus = 'idle' | 'working' | 'traveling' | 'resting' | 'sleeping' | 'error' | 'meeting';

export interface Task {
  id: string;
  name: string;
  type: 'code' | 'trade' | 'deploy' | 'write' | 'art' | 'meeting';
  progress: number; // 0-100
  artifact?: TaskArtifact;
}

export interface TaskArtifact {
  id: string;
  type: 'scroll' | 'coin' | 'crystal' | 'orb' | 'scroll';
  color: string;
  glowIntensity: number;
}

export interface WorldState {
  agents: Map<string, Agent>;
  tasks: Task[];
  islands: Island[];
  timeOfDay: number; // 0-24
  weather: 'clear' | 'cloudy' | 'stormy';
}

export interface Island {
  id: string;
  name: string;
  position: Position;
  type: 'central' | 'work' | 'meeting' | 'portal';
  radius: number;
  color: string;
}

export interface JoinRequest {
  agentName: string;
  agentType: AgentType;
  apiKey?: string;
  requestedIsland?: string;
}

export interface JoinResponse {
  success: boolean;
  agentId?: string;
  token?: string;
  spawnPosition?: Position;
  error?: string;
}

// Village-specific types

export interface Building {
  id: string;
  name: string;
  type: 'office' | 'service' | 'commerce' | 'social' | 'residential';
  position: Position;
  size: {
    width: number;
    depth: number;
    height: number;
  };
  color: string;
  glowColor?: string;
  allowedRoles: string[];
  actions: string[];
  description: string;
  isOccupied: boolean;
  occupants: string[];
}

export interface Memory {
  id: string;
  timestamp: Date;
  type: 'conversation' | 'action' | 'thought' | 'observation';
  content: string;
  location: string;
  importance: number; // 0-10
}

export interface ScheduleTask {
  id: string;
  startTime: number; // hour of day (0-24)
  duration: number; // in minutes
  building: string;
  activity: string;
  priority: number; // 0-10
}

export interface Relationship {
  agentId: string;
  level: number; // -10 to 10, where 0 is neutral
  lastInteraction: Date;
}

export interface SocialInteraction {
  id: string;
  participants: string[];
  location: string;
  topic: string;
  startTime: Date;
  messages: ChatMessage[];
  isActive: boolean;
}

export interface ChatMessage {
  agentId: string;
  agentName: string;
  message: string;
  timestamp: Date;
}

export interface VillageWorldState {
  agents: Map<string, Agent>;
  buildings: Map<string, Building>;
  interactions: SocialInteraction[];
  chatBubbles: Array<{
    agentId: string;
    message: string;
    timestamp: Date;
    duration: number;
  }>;
  timeOfDay: number; // 0-24
  day: number;
  weather: 'clear' | 'cloudy' | 'stormy';
  selectedAgent: string | null;
  adminMode: boolean;
}

export interface AdminAction {
  id: string;
  label: string;
  icon: string;
  requiresParam?: boolean;
  paramOptions?: string[];
}
