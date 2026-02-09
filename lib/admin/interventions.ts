import { AdminAction, Agent, Building } from '@/types/agent';
import { useVillageStore } from '@/lib/store/villageStore';
import { BUILDINGS } from '@/lib/village/buildings';
export const ADMIN_ACTIONS: AdminAction[] = [
  {
    id: 'teleport',
    label: 'Teleport to Building',
    icon: '✨',
    requiresParam: true,
    paramOptions: BUILDINGS.map(b => b.id)
  },
  {
    id: 'set-goal',
    label: 'Set New Goal',
    icon: '🎯',
    requiresParam: true,
    paramOptions: [
      'Focus on strategy',
      'Improve efficiency',
      'Socialize more',
      'Learn new skills',
      'Complete pending tasks',
      'Take a break'
    ]
  },
  {
    id: 'poke',
    label: 'Poke (Wake Up)',
    icon: '👆'
  },
  {
    id: 'force-meeting',
    label: 'Call Town Meeting',
    icon: '📢'
  },
  {
    id: 'sleep',
    label: 'Force Rest',
    icon: '😴'
  }
];

export class AdminInterventionSystem {
  executeAction(actionId: string, agentId: string, param?: string): boolean {
    const store = useVillageStore.getState();
    const agent = store.getAgent(agentId);
    
    if (!agent) return false;
    
    switch (actionId) {
      case 'teleport':
        if (param) {
          store.teleportAgent(agentId, param);
          return true;
        }
        return false;
        
      case 'set-goal':
        if (param) {
          const newGoals = [...(agent.goals || []), param];
          store.updateAgentGoals(agentId, newGoals);
          
          // Add memory
          store.addAgentMemory(agentId, {
            timestamp: new Date(),
            type: 'thought',
            content: `Admin assigned new goal: ${param}`,
            location: agent.currentBuilding || 'unknown',
            importance: 8
          });
          
          store.addChatBubble(agentId, `New goal: ${param}`);
          return true;
        }
        return false;
        
      case 'poke':
        if (agent.status === 'sleeping') {
          store.pokeAgent(agentId);
          return true;
        }
        return false;
        
      case 'force-meeting':
        store.forceMeeting('town-hall');
        return true;
        
      case 'sleep':
        store.updateAgentStatus(agentId, 'sleeping', 'residences');
        store.teleportAgent(agentId, 'residences');
        
        store.addAgentMemory(agentId, {
          timestamp: new Date(),
          type: 'thought',
          content: 'Admin forced me to rest',
          location: 'residences',
          importance: 5
        });
        
        return true;
        
      default:
        return false;
    }
  }
  
  getAvailableActions(agent: Agent): AdminAction[] {
    const actions = [...ADMIN_ACTIONS];
    
    // Modify poke - only if sleeping
    if (agent.status !== 'sleeping') {
      const pokeIndex = actions.findIndex(a => a.id === 'poke');
      if (pokeIndex >= 0) {
        actions[pokeIndex] = { ...actions[pokeIndex], label: 'Poke (Already awake)' };
      }
    }
    
    return actions;
  }
}

export const adminSystem = new AdminInterventionSystem();
