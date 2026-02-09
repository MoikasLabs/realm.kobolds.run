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
}

export interface AvatarConfig {
  color: string;
  scale: number;
  glowColor?: string;
  shape: 'dragon' | 'kobold' | 'slime' | 'sphere' | 'custom';
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export type AgentStatus = 'idle' | 'working' | 'traveling' | 'resting' | 'sleeping' | 'error';

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
