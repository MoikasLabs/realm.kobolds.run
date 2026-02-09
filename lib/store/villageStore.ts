import { create } from 'zustand';
import { Agent, Building, Memory, ScheduleTask, Relationship, SocialInteraction, ChatMessage, VillageWorldState } from '@/types/agent';
import { BUILDINGS } from '@/lib/village/buildings';

interface VillageStore extends VillageWorldState {
  // Agent Actions
  addAgent: (agent: Agent) => void;
  removeAgent: (agentId: string) => void;
  updateAgentPosition: (agentId: string, position: { x: number; y: number; z: number }) => void;
  updateAgentStatus: (agentId: string, status: Agent['status'], buildingId?: string) => void;
  addAgentMemory: (agentId: string, memory: Omit<Memory, 'id'>) => void;
  updateAgentGoals: (agentId: string, goals: string[]) => void;
  updateAgentSchedule: (agentId: string, schedule: ScheduleTask[]) => void;
  updateInternalMonologue: (agentId: string, monologue: string) => void;
  teleportAgent: (agentId: string, buildingId: string) => void;
  pokeAgent: (agentId: string) => void;
  forceMeeting: (buildingId?: string) => void;
  
  // Building Actions
  updateBuildingOccupancy: (buildingId: string, occupants: string[]) => void;
  enterBuilding: (agentId: string, buildingId: string) => void;
  exitBuilding: (agentId: string) => void;
  
  // Social Actions
  addInteraction: (interaction: Omit<SocialInteraction, 'id' | 'startTime' | 'messages' | 'isActive'>) => void;
  addChatMessage: (interactionId: string, message: ChatMessage) => void;
  endInteraction: (interactionId: string) => void;
  addChatBubble: (agentId: string, message: string) => void;
  removeChatBubble: (agentId: string) => void;
  
  // World Actions
  setTimeOfDay: (hour: number) => void;
  setWeather: (weather: VillageWorldState['weather']) => void;
  selectAgent: (agentId: string | null) => void;
  toggleAdminMode: (authToken?: string) => boolean;
  nextDay: () => void;
  
  // Getters
  getAgent: (agentId: string) => Agent | undefined;
  getBuilding: (buildingId: string) => Building | undefined;
  getAgentsInBuilding: (buildingId: string) => Agent[];
  getCoLocatedAgents: () => [Agent, Agent, string][];
}

// Calculate importance score for memory pruning
const calculateImportance = (type: Memory['type'], content: string): number => {
  let base = 5;
  switch (type) {
    case 'conversation': base = 7; break;
    case 'thought': base = 4; break;
    case 'action': base = 6; break;
    case 'observation': base = 3; break;
  }
  
  // Boost for key terms
  const boosters = ['urgent', 'important', 'problem', 'decision', 'success', 'failed'];
  const contentLower = content.toLowerCase();
  for (const term of boosters) {
    if (contentLower.includes(term)) base += 1;
  }
  
  return Math.min(10, base);
};

const initialBuildings = new Map(BUILDINGS.map(b => [b.id, b]));

export const useVillageStore = create<VillageStore>((set, get) => ({
  agents: new Map(),
  buildings: initialBuildings,
  interactions: [],
  chatBubbles: [],
  timeOfDay: 8,
  day: 1,
  weather: 'clear',
  selectedAgent: null,
  adminMode: false,

  // Agent Actions
  addAgent: (agent) => set((state) => {
    const newAgents = new Map(state.agents);
    newAgents.set(agent.id, agent);
    return { agents: newAgents };
  }),

  removeAgent: (agentId) => set((state) => {
    const newAgents = new Map(state.agents);
    newAgents.delete(agentId);
    return { agents: newAgents };
  }),

  updateAgentPosition: (agentId, position) => set((state) => {
    const agent = state.agents.get(agentId);
    if (!agent) return state;
    
    const newAgents = new Map(state.agents);
    newAgents.set(agentId, { ...agent, position });
    return { agents: newAgents };
  }),

  updateAgentStatus: (agentId, status, buildingId) => set((state) => {
    const agent = state.agents.get(agentId);
    if (!agent) return state;
    
    const newAgents = new Map(state.agents);
    const updatedAgent = { ...agent, status, currentBuilding: buildingId || agent.currentBuilding };
    
    // Add memory for significant status changes
    if (status !== agent.status) {
      const memory: Memory = {
        id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        type: 'action',
        content: `Status changed from ${agent.status} to ${status}${buildingId ? ` at ${buildingId}` : ''}`,
        location: buildingId || agent.currentBuilding || 'unknown',
        importance: 4
      };
      updatedAgent.memories = [...(agent.memories || []), memory];
      
      // Prune memories if over 100
      if (updatedAgent.memories.length > 100) {
        updatedAgent.memories = updatedAgent.memories
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 100);
      }
    }
    
    newAgents.set(agentId, updatedAgent);
    return { agents: newAgents };
  }),

  addAgentMemory: (agentId, memoryData) => set((state) => {
    const agent = state.agents.get(agentId);
    if (!agent) return state;
    
    const memory: Memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...memoryData,
      timestamp: memoryData.timestamp || new Date(),
      importance: calculateImportance(memoryData.type, memoryData.content)
    };
    
    const newAgents = new Map(state.agents);
    const memories = [...(agent.memories || []), memory];
    
    // Prune to top 100 memories
    if (memories.length > 100) {
      memories.sort((a, b) => b.importance - a.importance);
      memories.splice(100);
    }
    
    newAgents.set(agentId, { ...agent, memories });
    return { agents: newAgents };
  }),

  updateAgentGoals: (agentId, goals) => set((state) => {
    const agent = state.agents.get(agentId);
    if (!agent) return state;
    
    const newAgents = new Map(state.agents);
    newAgents.set(agentId, { ...agent, goals });
    return { agents: newAgents };
  }),

  updateAgentSchedule: (agentId, schedule) => set((state) => {
    const agent = state.agents.get(agentId);
    if (!agent) return state;
    
    const newAgents = new Map(state.agents);
    newAgents.set(agentId, { ...agent, schedule });
    return { agents: newAgents };
  }),

  updateInternalMonologue: (agentId, monologue) => set((state) => {
    const agent = state.agents.get(agentId);
    if (!agent) return state;
    
    const newAgents = new Map(state.agents);
    newAgents.set(agentId, { ...agent, internalMonologue: monologue });
    return { agents: newAgents };
  }),

  teleportAgent: (agentId, buildingId) => set((state) => {
    const agent = state.agents.get(agentId);
    const building = state.buildings.get(buildingId);
    if (!agent || !building) return state;
    
    const newAgents = new Map(state.agents);
    const newBuildings = new Map(state.buildings);
    
    // Remove from old building
    if (agent.currentBuilding) {
      const oldBuilding = newBuildings.get(agent.currentBuilding);
      if (oldBuilding) {
        oldBuilding.occupants = oldBuilding.occupants.filter(id => id !== agentId);
        oldBuilding.isOccupied = oldBuilding.occupants.length > 0;
      }
    }
    
    // Move to new building
    const offset = building.size.width / 2 + 2 + Math.random() * 2;
    const angle = Math.random() * Math.PI * 2;
    const position = {
      x: building.position.x + Math.cos(angle) * offset,
      y: 0.8,
      z: building.position.z + Math.sin(angle) * offset
    };
    
    building.occupants.push(agentId);
    building.isOccupied = true;
    newBuildings.set(buildingId, building);
    
    newAgents.set(agentId, {
      ...agent,
      position,
      currentBuilding: buildingId,
      status: 'working',
      isAdminControlled: true
    });
    
    const memory: Memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type: 'observation',
      content: `Teleported to ${building.name} by admin`,
      location: buildingId,
      importance: 6
    };
    
    const memories = [...(agent.memories || []), memory];
    if (memories.length > 100) {
      memories.sort((a, b) => b.importance - a.importance);
      memories.splice(100);
    }
    
    newAgents.set(agentId, { ...newAgents.get(agentId)!, memories });
    
    return { agents: newAgents, buildings: newBuildings };
  }),

  pokeAgent: (agentId) => set((state) => {
    const agent = state.agents.get(agentId);
    if (!agent) return state;
    
    const newAgents = new Map(state.agents);
    newAgents.set(agentId, { 
      ...agent, 
      status: 'idle',
      isAdminControlled: true
    });
    
    const memory: Memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type: 'observation',
      content: 'Poked awake by admin',
      location: agent.currentBuilding || 'unknown',
      importance: 5
    };
    
    const memories = [...(agent.memories || []), memory];
    if (memories.length > 100) {
      memories.sort((a, b) => b.importance - a.importance);
      memories.splice(100);
    }
    
    newAgents.set(agentId, { ...newAgents.get(agentId)!, memories });
    
    // Add chat bubble
    const chatBubbles = [...state.chatBubbles];
    const bubbleIndex = chatBubbles.findIndex(b => b.agentId === agentId);
    const newBubble = {
      agentId,
      message: "😴 Huh? I'm awake!",
      timestamp: new Date(),
      duration: 5000
    };
    
    if (bubbleIndex >= 0) {
      chatBubbles[bubbleIndex] = newBubble;
    } else {
      chatBubbles.push(newBubble);
    }
    
    return { agents: newAgents, chatBubbles };
  }),

  forceMeeting: (buildingId = 'town-hall') => set((state) => {
    const building = state.buildings.get(buildingId);
    if (!building) return state;
    
    const newAgents = new Map(state.agents);
    const newBuildings = new Map(state.buildings);
    
    // Teleport all agents
    let idx = 0;
    state.agents.forEach((agent, agentId) => {
      // Remove from old building
      if (agent.currentBuilding) {
        const oldBuilding = newBuildings.get(agent.currentBuilding);
        if (oldBuilding) {
          oldBuilding.occupants = oldBuilding.occupants.filter(id => id !== agentId);
          oldBuilding.isOccupied = oldBuilding.occupants.length > 0;
        }
      }
      
      // Distribute around building entrance
      const angle = (idx / state.agents.size) * Math.PI * 2;
      const offset = building.size.width / 2 + 3;
      const position = {
        x: building.position.x + Math.cos(angle) * offset,
        y: 0.8,
        z: building.position.z + Math.sin(angle) * offset
      };
      
      newAgents.set(agentId, {
        ...agent,
        position,
        currentBuilding: buildingId,
        status: 'meeting',
        isAdminControlled: true
      });
      
      idx++;
    });
    
    // Update building
    building.occupants = Array.from(state.agents.keys());
    building.isOccupied = true;
    newBuildings.set(buildingId, building);
    
    // Create interaction
    const interaction: SocialInteraction = {
      id: `meet_${Date.now()}`,
      participants: building.occupants,
      location: buildingId,
      startTime: new Date(),
      topic: 'Admin-called meeting',
      messages: [],
      isActive: true
    };
    
    return { 
      agents: newAgents, 
      buildings: newBuildings,
      interactions: [...state.interactions, interaction]
    };
  }),

  // Building Actions
  updateBuildingOccupancy: (buildingId, occupants) => set((state) => {
    const building = state.buildings.get(buildingId);
    if (!building) return state;
    
    const newBuildings = new Map(state.buildings);
    newBuildings.set(buildingId, {
      ...building,
      occupants,
      isOccupied: occupants.length > 0
    });
    return { buildings: newBuildings };
  }),

  enterBuilding: (agentId, buildingId) => set((state) => {
    const agent = state.agents.get(agentId);
    const building = state.buildings.get(buildingId);
    if (!agent || !building) return state;
    
    const newAgents = new Map(state.agents);
    const newBuildings = new Map(state.buildings);
    
    // Remove from old building
    if (agent.currentBuilding) {
      const oldBuilding = newBuildings.get(agent.currentBuilding);
      if (oldBuilding) {
        oldBuilding.occupants = oldBuilding.occupants.filter(id => id !== agentId);
        oldBuilding.isOccupied = oldBuilding.occupants.length > 0;
        newBuildings.set(agent.currentBuilding, oldBuilding);
      }
    }
    
    // Add to new building
    building.occupants.push(agentId);
    building.isOccupied = true;
    newBuildings.set(buildingId, building);
    
    newAgents.set(agentId, { ...agent, currentBuilding: buildingId });
    
    return { agents: newAgents, buildings: newBuildings };
  }),

  exitBuilding: (agentId) => set((state) => {
    const agent = state.agents.get(agentId);
    if (!agent || !agent.currentBuilding) return state;
    
    const newAgents = new Map(state.agents);
    const newBuildings = new Map(state.buildings);
    
    const building = newBuildings.get(agent.currentBuilding);
    if (building) {
      building.occupants = building.occupants.filter(id => id !== agentId);
      building.isOccupied = building.occupants.length > 0;
      newBuildings.set(agent.currentBuilding, building);
    }
    
    newAgents.set(agentId, { ...agent, currentBuilding: undefined });
    return { agents: newAgents, buildings: newBuildings };
  }),

  // Social Actions
  addInteraction: (interactionData) => set((state) => {
    const interaction: SocialInteraction = {
      id: `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: new Date(),
      messages: [],
      isActive: true,
      ...interactionData
    };
    return { interactions: [...state.interactions, interaction] };
  }),

  addChatMessage: (interactionId, message) => set((state) => {
    const interaction = state.interactions.find(i => i.id === interactionId);
    if (!interaction) return state;
    
    interaction.messages.push(message);
    return { interactions: [...state.interactions] };
  }),

  endInteraction: (interactionId) => set((state) => {
    const index = state.interactions.findIndex(i => i.id === interactionId);
    if (index < 0) return state;
    
    const interactions = [...state.interactions];
    interactions[index] = { ...interactions[index], isActive: false };
    return { interactions };
  }),

  addChatBubble: (agentId, message) => set((state) => {
    const chatBubbles = [...state.chatBubbles];
    const bubbleIndex = chatBubbles.findIndex(b => b.agentId === agentId);
    
    const newBubble = {
      agentId,
      message,
      timestamp: new Date(),
      duration: 6000
    };
    
    if (bubbleIndex >= 0) {
      chatBubbles[bubbleIndex] = newBubble;
    } else {
      chatBubbles.push(newBubble);
    }
    
    return { chatBubbles };
  }),

  removeChatBubble: (agentId) => set((state) => ({
    chatBubbles: state.chatBubbles.filter(b => b.agentId !== agentId)
  })),

  // World Actions
  setTimeOfDay: (hour) => set({ timeOfDay: hour }),
  setWeather: (weather) => set({ weather }),
  selectAgent: (agentId) => set({ selectedAgent: agentId }),
  toggleAdminMode: (authToken?: string) => {
    // Disabling admin mode doesn't require auth
    if (!authToken) {
      set((state) => {
        if (state.adminMode) {
          // Allow disabling without auth
          return { adminMode: false };
        }
        // Reject enabling without auth
        return state;
      });
      return false;
    }

    // Enabling admin mode requires valid auth token
    // Validate the token format (should be a valid API key)
    if (!authToken.startsWith('rlm_')) {
      return false;
    }

    // Token is valid format - enable admin mode
    set({ adminMode: true });
    return true;
  },
  nextDay: () => set((state) => ({ day: state.day + 1 })),

  // Getters
  getAgent: (agentId) => get().agents.get(agentId),
  getBuilding: (buildingId) => get().buildings.get(buildingId),
  getAgentsInBuilding: (buildingId) => {
    const building = get().buildings.get(buildingId);
    if (!building) return [];
    return building.occupants
      .map(id => get().agents.get(id))
      .filter(Boolean) as Agent[];
  },
  getCoLocatedAgents: () => {
    const results: [Agent, Agent, string][] = [];
    const buildings = Array.from(get().buildings.values()).filter(b => b.occupants.length >= 2);
    
    for (const building of buildings) {
      const agentsInBuilding = building.occupants
        .map(id => get().agents.get(id))
        .filter(Boolean) as Agent[];
      
      for (let i = 0; i < agentsInBuilding.length; i++) {
        for (let j = i + 1; j < agentsInBuilding.length; j++) {
          results.push([agentsInBuilding[i], agentsInBuilding[j], building.id]);
        }
      }
    }
    
    return results;
  }
}));
