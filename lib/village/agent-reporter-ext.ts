/**
 * 🏘️ Realm Reporter - Generative Agent Extension
 * 
 * Extends the base realm-reporter.js with:
 * - Memory stream (observations, actions, thoughts)
 * - Daily schedule generation
 * - Goal planning and reflection
 * - Social interaction hooks
 * - Admin intervention recognition
 */

import { Memory, ScheduleTask, Task, AgentStatus } from '@/types/agent';
import { scheduleGenerator } from './schedules';
import { pathfinder } from './pathfinding';
import { BUILDINGS, getBuildingById } from './buildings';

export interface MemoryConfig {
  capacity: number;
  decayRate: number;
  importanceThreshold: number;
}

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  capacity: 100,
  decayRate: 0.99, // Memories lose importance over time
  importanceThreshold: 3
};

export class GenerativeAgentReporter {
  id: string;
  name: string;
  type: string;
  subtype: string;
  position: { x: number; y: number; z: number };
  status: AgentStatus;
  currentBuilding?: string;
  
  // Memory system
  memories: Memory[] = [];
  memoryConfig: MemoryConfig;
  
  // Schedule system
  schedule: ScheduleTask[] = [];
  currentScheduleIndex: number = -1;
  
  // Goal system
  goals: string[] = [];
  shortTermGoal?: string;
  
  // Social
  relationships: Map<string, { level: number; lastInteraction: Date }> = new Map();
  
  // State
  private lastReflection: Date = new Date(0);
  private lastMemoryPrune: Date = new Date(0);
  private isAdminControlled: boolean = false;

  constructor(config: {
    id: string;
    name: string;
    type: string;
    subtype?: string;
    position?: { x: number; y: number; z: number };
    memoryConfig?: Partial<MemoryConfig>;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.subtype = config.subtype || config.id;
    this.position = config.position || { x: 0, y: 0.8, z: 0 };
    this.status = 'idle';
    this.memoryConfig = { ...DEFAULT_MEMORY_CONFIG, ...config.memoryConfig };
    
    // Generate initial schedule
    this.regenerateSchedule();
  }

  // ═══════════════════════════════════════════════════════════
  // Memory System
  // ═══════════════════════════════════════════════════════════

  /**
   * Add a new memory to the stream
   */
  addMemory(
    content: string,
    type: Memory['type'] = 'observation',
    location?: string,
    customImportance?: number
  ): Memory {
    const importance = customImportance ?? this.calculateImportance(type, content);
    
    const memory: Memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      content,
      location: location || this.currentBuilding || 'unknown',
      importance
    };
    
    this.memories.push(memory);
    
    // Sort by importance and prune if needed
    this.pruneMemories();
    
    return memory;
  }

  /**
   * Get recent memories within hours
   */
  getRecentMemories(hours: number = 24): Memory[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.memories
      .filter(m => new Date(m.timestamp) > cutoff)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Get memories by location
   */
  getMemoriesByLocation(location: string): Memory[] {
    return this.memories.filter(m => m.location === location);
  }

  /**
   * Get memories by type
   */
  getMemoriesByType(type: Memory['type']): Memory[] {
    return this.memories.filter(m => m.type === type);
  }

  /**
   * Retrieve memories by content similarity (simple keyword matching)
   */
  retrieveRelevantMemories(query: string, maxResults: number = 5): Memory[] {
    const queryWords = query.toLowerCase().split(' ');
    
    const scored = this.memories.map(m => {
      let score = m.importance;
      const contentLower = m.content.toLowerCase();
      
      for (const word of queryWords) {
        if (word.length < 3) continue;
        if (contentLower.includes(word)) score += 2;
      }
      
      // Recency bonus
      const hoursAgo = (Date.now() - new Date(m.timestamp).getTime()) / (1000 * 60 * 60);
      score += Math.max(0, 10 - hoursAgo);
      
      return { memory: m, score };
    });
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => s.memory);
  }

  private calculateImportance(type: Memory['type'], content: string): number {
    let base = 5;
    
    switch (type) {
      case 'conversation': base = 7; break;
      case 'action': base = 6; break;
      case 'thought': base = 4; break;
      case 'observation': base = 3; break;
    }
    
    // Boost for key terms (like the Stanford paper)
    const boosters = ['urgent', 'important', 'critical', 'decision', 'success', 'failed', 'failure', 'amazing', 'terrible'];
    const contentLower = content.toLowerCase();
    
    for (const term of boosters) {
      if (contentLower.includes(term)) base += 2;
    }
    
    return Math.min(10, base);
  }

  private pruneMemories(): void {
    const now = new Date();
    if (now.getTime() - this.lastMemoryPrune.getTime() < 60000) return;
    this.lastMemoryPrune = now;
    
    if (this.memories.length > this.memoryConfig.capacity) {
      // Sort by importance
      this.memories.sort((a, b) => b.importance - a.importance);
      this.memories = this.memories.slice(0, this.memoryConfig.capacity);
    }
    
    // Age memories
    for (const memory of this.memories) {
      const hoursOld = (now.getTime() - new Date(memory.timestamp).getTime()) / (1000 * 60 * 60);
      if (hoursOld > 48) {
        memory.importance *= this.memoryConfig.decayRate;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Schedule System
  // ═══════════════════════════════════════════════════════════

  /**
   * Generate or regenerate daily schedule
   */
  regenerateSchedule(): void {
    // Use the base schedule generator
    const tasks = scheduleGenerator.generateDailySchedule({
      id: this.id,
      name: this.name,
      type: this.type as any,
      subtype: this.subtype,
      avatar: { color: '#22c55e', scale: 1, shape: 'slime' },
      position: this.position,
      status: this.status,
      schedule: [],
      memories: this.memories,
      relationships: [],
      goals: this.goals,
      joinedAt: new Date(),
      lastSeen: new Date()
    });
    
    this.schedule = tasks;
    this.currentScheduleIndex = -1;
  }

  /**
   * Get current task based on time
   */
  getCurrentTask(currentHour: number): ScheduleTask | null {
    return scheduleGenerator.getCurrentTask({ schedule: this.schedule } as any, currentHour);
  }

  /**
   * Get next task
   */
  getNextTask(currentHour: number): ScheduleTask | null {
    return scheduleGenerator.getNextTask({ schedule: this.schedule } as any, currentHour);
  }

  /**
   * Advance to next task in schedule
   */
  advanceSchedule(): ScheduleTask | null {
    this.currentScheduleIndex++;
    if (this.currentScheduleIndex >= this.schedule.length) {
      this.currentScheduleIndex = 0;
    }
    return this.schedule[this.currentScheduleIndex] || null;
  }

  // ═══════════════════════════════════════════════════════════
  // Goal System
  // ═══════════════════════════════════════════════════════════

  /**
   * Set long-term goals
   */
  setGoals(goals: string[]): void {
    this.goals = goals;
    this.addMemory(`Set new goals: ${goals.join(', ')}`, 'thought', this.currentBuilding, 7);
  }

  /**
   * Set short-term task goal
   */
  setShortTermGoal(goal: string): void {
    this.shortTermGoal = goal;
    this.addMemory(`Current focus: ${goal}`, 'thought', this.currentBuilding, 5);
  }

  /**
   * Generate reflection based on recent memories (like Stanford paper)
   */
  generateReflection(): string {
    const recentMemories = this.getRecentMemories(24);
    const significantMemories = recentMemories.filter(m => m.importance >= 7);
    
    let reflection = '';
    
    if (significantMemories.length === 0) {
      reflection = "It was a relatively quiet day. I stayed focused on my routine tasks.";
    } else {
      reflection = `Looking back at my day, several things stood out:\n`;
      for (const memory of significantMemories.slice(0, 3)) {
        reflection += `- ${memory.content}\n`;
      }
    }
    
    this.lastReflection = new Date();
    this.addMemory(reflection, 'thought', this.currentBuilding, 8);
    
    return reflection;
  }

  /**
   * Generate plan based on goals and current context
   */
  generatePlan(context: string): string[] {
    const relevantMemories = this.retrieveRelevantMemories(context + ' ' + this.goals.join(' '));
    
    const plan: string[] = [];
    
    // Consider recent relevant memories
    for (const memory of relevantMemories.slice(0, 3)) {
      if (memory.type === 'action' && memory.importance >= 6) {
        plan.push(`Based on past experience with "${memory.content}", I should continue along that path.`);
      }
    }
    
    // Add goals
    for (const goal of this.goals.slice(0, 2)) {
      plan.push(`Work toward goal: ${goal}`);
    }
    
    return plan.length > 0 ? plan : ['Stay on task', 'Check for updates'];
  }

  // ═══════════════════════════════════════════════════════════
  // Movement & Position
  // ═══════════════════════════════════════════════════════════

  /**
   * Move to a building
   */
  moveToBuilding(buildingId: string): { x: number; y: number; z: number } {
    const building = getBuildingById(buildingId);
    if (!building) return this.position;
    
    const entrance = pathfinder.getEntrance(building, this.position);
    this.position = entrance;
    this.currentBuilding = buildingId;
    
    this.addMemory(`Moved to ${building.name}`, 'action', buildingId, 4);
    
    return entrance;
  }

  /**
   * Generate path to target
   */
  generatePath(target: { x: number; z: number }): { x: number; y: number; z: number }[] {
    return pathfinder.findPath(this.position, { ...target, y: 0.8 });
  }

  // ═══════════════════════════════════════════════════════════
  // Social & Relationships
  // ═══════════════════════════════════════════════════════════

  /**
   * Record interaction with another agent
   */
  recordInteraction(agentId: string, agentName: string, topic: string, wasPositive: boolean = true): void {
    const relationship = this.relationships.get(agentId) || { level: 0, lastInteraction: new Date() };
    
    relationship.level += wasPositive ? 1 : -1;
    relationship.lastInteraction = new Date();
    
    this.relationships.set(agentId, relationship);
    
    const levelStr = relationship.level > 5 ? 'friendly' : relationship.level > 0 ? 'positive' : 'neutral';
    this.addMemory(`${wasPositive ? 'Positive' : 'Challenging'} interaction with ${agentName} about ${topic}. Relationship is now ${levelStr}.`, 'conversation', this.currentBuilding, 6);
  }

  getRelationship(agentId: string): { level: number; lastInteraction: Date } | undefined {
    return this.relationships.get(agentId);
  }

  // ═══════════════════════════════════════════════════════════
  // Admin Interventions
  // ═══════════════════════════════════════════════════════════

  onAdminIntervention(action: string, param?: string): void {
    this.isAdminControlled = true;
    
    this.addMemory(`Admin issued command: ${action}${param ? ` (${param})` : ''}`, 'observation', this.currentBuilding, 9);
    
    // Handle specific interventions
    switch (action) {
      case 'poke':
        this.status = 'idle';
        this.addMemory('Poked awake by admin', 'observation', this.currentBuilding, 5);
        break;
        
      case 'teleport':
        if (param) this.moveToBuilding(param);
        break;
        
      case 'set-goal':
        if (param) {
          this.goals.push(param);
          this.setShortTermGoal(param);
        }
        break;
        
      case 'force-meeting':
        this.status = 'meeting';
        break;
        
      case 'sleep':
        this.status = 'sleeping';
        this.currentBuilding = 'residences';
        break;
    }
    
    // Release admin control after 30 seconds
    setTimeout(() => {
      this.isAdminControlled = false;
      this.addMemory('Released from admin control, resuming normal schedule', 'thought', this.currentBuilding, 3);
    }, 30000);
  }

  // ═══════════════════════════════════════════════════════════
  // Status Updates (for API integration)
  // ═══════════════════════════════════════════════════════════

  /**
   * Get current state for webhook
   */
  getStateForReport() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      subtype: this.subtype,
      status: this.status,
      position: this.position,
      currentBuilding: this.currentBuilding,
      goals: this.goals,
      memories: this.memories,
      relationships: Array.from(this.relationships.entries()).map(([id, data]) => ({
        agentId: id,
        ...data
      }))
    };
  }
}

// Factory function
export function createGenerativeAgent(config: {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  position?: { x: number; y: number; z: number };
}) {
  return new GenerativeAgentReporter(config);
}

// Export for realm-reporter.js integration
export const GenerativeAgentHelpers = {
  createAgent: createGenerativeAgent,
  calculateImportance: (type: Memory['type'], content: string): number => {
    let base = 5;
    switch (type) {
      case 'conversation': base = 7; break;
      case 'action': base = 6; break;
      case 'thought': base = 4; break;
      case 'observation': base = 3; break;
    }
    const boosters = ['urgent', 'important', 'critical', 'decision', 'success', 'failed'];
    const contentLower = content.toLowerCase();
    for (const term of boosters) {
      if (contentLower.includes(term)) base += 2;
    }
    return Math.min(10, base);
  }
};
