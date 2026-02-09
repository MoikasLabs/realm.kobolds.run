import { Agent, SocialInteraction, ChatMessage, Relationship, Memory } from '@/types/agent';
import { useVillageStore } from '@/lib/store/villageStore';
import { BUILDINGS } from './buildings';

// Conversation topics based on agent roles and current activities
const TOPICS_BY_ROLE: Record<string, string[]> = {
  ceo: ['strategy', 'company vision', 'quarterly goals', 'market expansion', 'resource allocation'],
  cmo: ['marketing campaigns', 'brand awareness', 'social engagement', 'growth metrics', 'community'],
  cfo: ['budget planning', 'revenue forecasts', 'cost optimization', 'financial health', 'investments'],
  cio: ['tech stack', 'system architecture', 'innovation', 'automation', 'AI integration'],
  cso: ['security protocols', 'risk assessment', 'compliance', 'threat monitoring', 'best practices'],
  coo: ['operational efficiency', 'process improvements', 'team coordination', 'day-to-day execution', 'optimization'],
  kobold: ['daily tasks', 'market opportunities', 'tips and tricks', 'lunch options', 'gossip'],
  shalom: ['world oversight', 'agent coordination', 'vision alignment', 'realm expansion', 'wisdom']
};

const GREETINGS = [
  "Hey there!",
  "Morning!",
  "What's up?",
  "Good to see you!",
  "How goes it?",
  "Fancy meeting you here!",
  "Long time no see!"
];

const COFFEE_CHAT_TOPICS = [
  "That new feature we shipped",
  "The weather today",
  "Weekend plans",
  "That interesting post on Moltx",
  "Recent trades",
  "New tools to try",
  "A book I'm reading"
];

export class SocialSystem {
  private static instance: SocialSystem;
  private lastCheckTime = Date.now();
  private checkInterval = 5000; // Check every 5 seconds

  static getInstance(): SocialSystem {
    if (!SocialSystem.instance) {
      SocialSystem.instance = new SocialSystem();
    }
    return SocialSystem.instance;
  }

  // Check for co-located agents and spawn conversations
  checkForInteractions(): void {
    const store = useVillageStore.getState();
    const now = Date.now();
    
    if (now - this.lastCheckTime < this.checkInterval) return;
    this.lastCheckTime = now;
    
    const coLocated = store.getCoLocatedAgents();
    
    for (const [agentA, agentB, buildingId] of coLocated) {
      // Check if they're already in an active interaction
      const existingInteraction = store.interactions.find(
        i => i.isActive && 
             i.location === buildingId &&
             i.participants.includes(agentA.id) && 
             i.participants.includes(agentB.id)
      );
      
      if (existingInteraction) {
        // Add to existing conversation randomly
        if (Math.random() > 0.7) {
          this.addMessageToInteraction(existingInteraction.id, agentA, agentB);
        }
      } else if (Math.random() > 0.3) {
        // Start new conversation (70% chance when co-located)
        this.startConversation(agentA, agentB, buildingId);
      }
    }
  }

  startConversation(agentA: Agent, agentB: Agent, buildingId: string): void {
    const store = useVillageStore.getState();
    
    // Generate topic
    const topic = this.generateTopic(agentA, agentB);
    
    // Create interaction
    const interaction: Omit<SocialInteraction, 'id' | 'startTime' | 'messages' | 'isActive'> = {
      participants: [agentA.id, agentB.id],
      location: buildingId,
      topic
    };
    
    store.addInteraction(interaction);
    
    // Get the interaction we just created
    const newInteraction = useVillageStore.getState().interactions.find(
      i => i.location === buildingId && 
           i.participants.includes(agentA.id) && 
           i.participants.includes(agentB.id) && 
           i.isActive
    );
    
    if (newInteraction) {
      // Generate initial message
      const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
      const starter = agentA;
      
      const message: ChatMessage = {
        agentId: starter.id,
        agentName: starter.name,
        message: greeting,
        timestamp: new Date()
      };
      
      store.addChatMessage(newInteraction.id, message);
      store.addChatBubble(starter.id, greeting);
      
      // Add memory for both agents
      this.recordConversationMemory(agentA, agentB, buildingId, topic);
      this.recordConversationMemory(agentB, agentA, buildingId, topic);
      
      // Update relationship
      this.updateRelationship(agentA.id, agentB.id, buildingId);
    }
  }

  addMessageToInteraction(interactionId: string, sender: Agent, recipient: Agent): void {
    const store = useVillageStore.getState();
    const interaction = store.interactions.find(i => i.id === interactionId);
    
    if (!interaction || !interaction.isActive) return;
    
    // Generate message based on context
    const message = this.generateMessage(interaction.topic, sender.subtype);
    
    const chatMessage: ChatMessage = {
      agentId: sender.id,
      agentName: sender.name,
      message,
      timestamp: new Date()
    };
    
    store.addChatMessage(interactionId, chatMessage);
    store.addChatBubble(sender.id, message);
    
    // Update memory
    sender.memories.push({
      id: `mem_${Date.now()}`,
      timestamp: new Date(),
      type: 'conversation',
      content: `Said to ${recipient.name}: "${message}"`,
      location: interaction.location,
      importance: 5
    });
  }

  private generateTopic(agentA: Agent, agentB: Agent): string {
    const roles = [agentA.subtype, agentB.subtype];
    const topics: string[] = [];
    
    for (const role of roles) {
      const roleTopics = TOPICS_BY_ROLE[role] || TOPICS_BY_ROLE.kobold;
      topics.push(...roleTopics);
    }
    
    // Add some casual topics
    topics.push(...COFFEE_CHAT_TOPICS);
    
    return topics[Math.floor(Math.random() * topics.length)];
  }

  private generateMessage(topic: string, role: string): string {
    const templates: Record<string, string[]> = {
      strategy: [
        "Have you thought about our approach to Q2?",
        "I think we need to pivot slightly here.",
        "The numbers are looking good for expansion."
      ],
      marketing: [
        "Our engagement rates are climbing!",
        "That Moltx campaign performed well.",
        "I have ideas for the next launch."
      ],
      tech: [
        "The new system is running smoothly.",
        "I found a way to optimize that.",
        "Have you seen the latest framework?"
      ],
      casual: [
        "Did you hear about that trade?",
        "This is exhausting, need more coffee!",
        "What are you working on today?",
        "Have you seen the dragon lately?"
      ]
    };
    
    let templateSet = templates.casual;
    if (topic.includes('strategy') || topic.includes('vision')) templateSet = templates.strategy;
    else if (topic.includes('market') || topic.includes('brand')) templateSet = templates.marketing;
    else if (topic.includes('tech') || topic.includes('system')) templateSet = templates.tech;
    
    return templateSet[Math.floor(Math.random() * templateSet.length)];
  }

  private recordConversationMemory(agent: Agent, otherAgent: Agent, buildingId: string, topic: string): void {
    const store = useVillageStore.getState();
    const building = BUILDINGS.find(b => b.id === buildingId);
    
    store.addAgentMemory(agent.id, {
      timestamp: new Date(),
      type: 'conversation',
      content: `Had a conversation with ${otherAgent.name} about ${topic} at ${building?.name || buildingId}`,
      location: buildingId,
      importance: 6
    });
  }

  private updateRelationship(agentAId: string, agentBId: string, buildingId: string): void {
    // Find and update relationship in agent memories
    // (Relationship tracking would be implemented here)
  }

  endOldInteractions(maxAgeMinutes = 10): void {
    const store = useVillageStore.getState();
    const now = new Date();
    
    for (const interaction of store.interactions) {
      if (!interaction.isActive) continue;
      
      const age = (now.getTime() - interaction.startTime.getTime()) / 60000;
      
      if (age > maxAgeMinutes) {
        store.endInteraction(interaction.id);
      }
    }
  }

  // Generate random internal monologue
  generateMonologue(agent: Agent): string {
    const monologues: Record<string, string[]> = {
      ceo: [
        "Need to check Q2 targets...",
        "Should schedule a town hall meeting soon.",
        "Looking at the metrics, we're trending up.",
        "I wonder what the team thinks about the new direction."
      ],
      cmo: [
        "Engagement is up 15% this week...",
        "Need to plan the next campaign.",
        "That post got great reception.",
        "Wonder which channel to focus on next."
      ],
      cfo: [
        "Numbers are solid this quarter...",
        "Need to optimize that budget line.",
        "ROI projections looking good.",
        "Should we invest more in R&D?"
      ],
      cio: [
        "That refactor really paid off...",
        "Need to review the security logs.",
        "New tech stack seems solid.",
        "Automating that process next..."
      ],
      cso: [
        "Security posture is strong...",
        "Need to update those protocols.",
        "No threats detected today.",
        "Training the team on best practices..."
      ],
      coo: [
        "Operations are running smoothly...",
        "Need to sync with the teams.",
        "That process improvement worked.",
        "Planning the logistics for next week..."
      ],
      kobold: [
        "So much work to do today!",
        "That was a good trade.",
        "Lunch at the tavern sounds nice.",
        "Wonder what the dragon is up to?",
        "Need to check my tasks..."
      ],
      shalom: [
        "The realm is thriving today...",
        "My agents are performing well.",
        "Planning the next evolution...",
        "Proud of what we've built together."
      ]
    };
    
    const roleMono = monologues[agent.subtype] || monologues.kobold;
    return roleMono[Math.floor(Math.random() * roleMono.length)];
  }
}

export const socialSystem = SocialSystem.getInstance();
