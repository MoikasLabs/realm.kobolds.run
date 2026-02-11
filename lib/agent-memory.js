/**
 * AgentMemory - Generative Agents architecture for Realm Kobolds
 * 
 * Extends CLAWS memory with:
 * - 3D world observation hooks
 * - Automatic reflection generation
 * - Daily planning with hierarchical schedules
 * - Notion integration for external consciousness log
 * 
 * Based on: Generative Agents paper (arXiv:2304.03442)
 * Architecture: Observation → Memory → Reflection → Planning → Action
 */

import { ClawsMemory } from '/root/.openclaw/workspace/lib/memory.js';
import { execSync } from 'child_process';
const NOTION_DB_ID = process.env.NOTION_REFLECTION_DB || '3043e4ac-d0a7-80e0-b9cb-c09ee11ce57c';

class AgentMemory extends ClawsMemory {
  constructor(agentId, options = {}) {
    super(agentId, { 
      useEmbeddings: true,
      hybridWeightBM25: 0.4,
      hybridWeightSemantic: 0.6
    });
    
    this.agentId = agentId;
    this.persona = options.persona || {};
    this.role = options.role || 'worker';
    this.dailyPlan = null;
    this.currentAction = null;
    this.location = options.spawnLocation || { x: 0, z: 0 };
    
    // Reflection configuration
    this.reflectionThreshold = options.reflectionThreshold || 15; // Sum importance > this triggers reflection
    this.importanceSinceLastReflection = 0;
    this.lastReflectionTime = Date.now();
    
    // Planning configuration  
    this.planCheckInterval = options.planCheckInterval || 5 * 60 * 1000; // 5 minutes
    this.lastPlanCheck = 0;
  }

  /**
   * OBSERVATION LAYER
   * Convert 3D world events into memory entries
   */
  async observe(event) {
    // Event format: { type, description, location, timestamp, importance }
    const scoredImportance = event.importance || this.scoreObservationImportance(event);
    
    const observation = {
      type: event.type || 'observation',
      description: event.description,
      source: '3d_world',
      metadata: {
        location: event.location || this.location,
        timestamp: event.timestamp || Date.now(),
        nearbyAgents: event.nearbyAgents || [],
        workstation: event.workstation || null,
        activity: event.activity || null
      }
    };

    // Store in CLAWS memory stream
    await this.remember(observation.description, {
      type: 'observation',
      importance: scoredImportance,
      tags: [event.type, 'realm', this.role].filter(Boolean),
      metadata: observation.metadata
    });

    this.importanceSinceLastReflection += scoredImportance;

    // Check if reflection should trigger
    if (this.shouldReflect()) {
      await this.reflect();
    }

    return { stored: true, importance: scoredImportance };
  }

  /**
   * Score observation importance for agent context
   * Different from CLAWS general importance - tuned for agent experience
   */
  scoreObservationImportance(event) {
    let score = 0.5;
    const reasons = [];

    // Social interactions are highly important
    if (event.type === 'agent_interaction') {
      score += 0.3;
      reasons.push('Social interaction');
    }

    // Work completion is important for worker agents
    if (event.type === 'task_complete') {
      score += 0.25;
      reasons.push('Task completion');
    }

    // First-time experiences
    if (event.description?.includes('first time')) {
      score += 0.2;
      reasons.push('Novel experience');
    }

    // Emotional markers
    if (/\b(frustrated|excited|proud|worried|happy|annoyed)\b/i.test(event.description)) {
      score += 0.15;
      reasons.push('Emotional content');
    }

    // Problems/obstacles
    if (/\b(stuck|failed|error|can't|unable)\b/i.test(event.description)) {
      score += 0.2;
      reasons.push('Obstacle encountered');
    }

    // Location changes (movement)
    if (event.type === 'location_change') {
      score += 0.1;
      reasons.push('Movement');
    }

    // Routine work is less important
    if (event.type === 'routine_work') {
      score -= 0.2;
      reasons.push('Routine (penalty)');
    }

    return Math.max(0.1, Math.min(1.0, score));
  }

  /**
   * REFLECTION LAYER
   * Synthesize observations into higher-level insights
   */
  shouldReflect() {
    // Trigger on importance accumulation OR time-based (every 2 hours)
    const hoursSinceLast = (Date.now() - this.lastReflectionTime) / (1000 * 60 * 60);
    return this.importanceSinceLastReflection >= this.reflectionThreshold || hoursSinceLast >= 2;
  }

  async reflect() {
    // Get recent observations (last 50)
    const recent = await this.getRecent(50, { types: ['observation'] });
    
    if (recent.length < 5) {
      return { generated: 0, reason: 'Insufficient observations' };
    }

    // Build reflection prompt
    const observations = recent.map(r => r.chunks[0].text).join('\n- ');
    
    const prompt = `You are ${this.persona.name || this.agentId}, a ${this.role} kobold in the Shalom Realm.

Your recent experiences:
- ${observations}

Based on these experiences, generate 3-5 high-level insights about:
1. What you've learned or discovered
2. Patterns in your behavior or work
3. Your feelings about recent events
4. Relationships with other agents you've observed
5. Goals or changes you should consider

Format each insight as a single clear sentence.
Be specific - reference actual events from your observations.
Do not use generic statements. Each insight should reflect YOUR actual experience.`;

    // Generate reflections using Ollama (lightweight model)
    const reflections = await this.generateWithLLM(prompt);
    
    const insights = [];
    // Store each insight
    for (const insight of reflections) {
      await this.remember(insight, {
        type: 'reflection',
        importance: 0.9, // Reflections are high importance
        tags: ['reflection', 'insight', this.role],
        metadata: {
          sourceObservations: recent.map(r => r.id).slice(0, 10),
          reflectionTime: Date.now(),
          accumulatedImportance: this.importanceSinceLastReflection
        }
      });

      insights.push(insight);
      
      // Push to Notion for external consciousness log
      await this.pushToNotion(insight, 'reflection');
    }

    // Reset accumulation
    this.importanceSinceLastReflection = 0;
    this.lastReflectionTime = Date.now();

    return { 
      generated: insights.length, 
      insights,
      notionSynced: true 
    };
  }

  async generateWithLLM(prompt, model = 'qwen3:0.6b') {
    try {
      const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false })
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      const text = data.response || '';
      
      // Parse numbered insights (1. 2. 3.) or bullet points
      const lines = text.split(/\n/)
        .map(l => l.trim())
        .filter(l => l.length > 20 && l.length < 200)
        .map(l => l.replace(/^\d+\.\s*/, '').replace(/^[-•]\s*/, ''));
      
      return lines.slice(0, 5);
    } catch (e) {
      console.warn('LLM generation failed:', e.message);
      
      // Fallback: generate template insights based on prompt content
      console.log('  [FALLBACK] Generating template insights...');
      return this.generateFallbackInsights(prompt);
    }
  }

  generateFallbackInsights(prompt) {
    // Parse prompt to extract observations
    const observations = prompt.match(/Your recent experiences:([\s\S]*?)(?=\n\n|$)/);
    const obsList = observations ? 
      observations[1].split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim()) :
      [];
    
    // Generate contextual insights based on observations
    const insights = [];
    
    if (obsList.some(o => o.includes('Forge') || o.includes('work'))) {
      insights.push('I feel most productive when working at the Forge with my tools ready.');
    }
    if (obsList.some(o => o.includes('new') || o.includes('first time'))) {
      insights.push('This is a fresh start - I should explore all the workstations to understand my options.');
    }
    if (obsList.some(o => o.includes('another kobold') || o.includes('agent'))) {
      insights.push('I noticed other agents are present - building relationships could help with complex tasks.');
    }
    if (obsList.some(o => o.includes('exciting') || o.includes('love'))) {
      insights.push('My enthusiasm is high right now - I should channel this energy into important projects.');
    }
    if (obsList.some(o => o.includes('frustrated') || o.includes('stuck'))) {
      insights.push('I may need to take breaks when frustrated to maintain quality work.');
    }
    
    // Always add at least one generic insight
    if (insights.length === 0) {
      insights.push(`I am learning my way around the Realm as a ${this.role}.`);
    }
    
    return insights.slice(0, 5);
  }

  /**
   * Push reflection to Notion consciousness log
   */
  async pushToNotion(insight, type = 'reflection') {
    try {
      const cmd = `node /root/.openclaw/skills/notion-local/notion-cli.js add-entry ${NOTION_DB_ID} \
        --title "${this.agentId}: ${insight.slice(0, 50)}..." \
        --properties '${JSON.stringify({
          "Phase": { "select": { "name": "Phase 1" } },
          "Status": { "status": { "name": "Done" } },
          "Type": { "multi_select": [{ "name": type === 'reflection' ? 'Reflection' : 'Observation' }] }
        })}'`;
      
      execSync(cmd, { timeout: 10000 });
      return { synced: true };
    } catch (e) {
      console.warn('Notion sync failed:', e.message);
      return { synced: false, error: e.message };
    }
  }

  /**
   * PLANNING LAYER
   * Generate and manage hierarchical plans
   */
  async planDaily(options = {}) {
    const { goals, constraints, preferredWorkstations } = options;
    
    // Retrieve context for planning
    const relevantContext = await this.recall('goals projects ongoing tasks relationships', { limit: 10 });
    const recentReflections = await this.getRecent(5, { types: ['reflection'] });
    
    const contextStr = relevantContext.results
      ?.map(r => r.episode?.chunks?.[0]?.text)
      ?.filter(Boolean)
      ?.join('\n') || '';
    
    const reflectionStr = recentReflections
      ?.map(r => r.chunks?.[0]?.text)
      ?.filter(Boolean)
      ?.join('\n') || '';

    const prompt = `You are ${this.persona.name || this.agentId}, a ${this.role} kobold in the Shalom Realm.

Your identity:
${this.persona.description || `A hardworking ${this.role} kobold.`}

Your recent insights:
${reflectionStr}

Your relevant memories:
${contextStr}

Create a realistic daily schedule in this format:
HH:MM - Activity at Location

Include:
- 2-3 work sessions at specific workstations (Forge, Spire, Warrens)
- Breaks and meals
- Social time or collaboration
- Sleep period
- One personal reflection/practice slot

Be specific - name actual workstations. Use 24-hour format.
Total schedule should be ~16 hours (agents don't need much sleep).`;

    let scheduleLines = await this.generateWithLLM(prompt);
    
    // If no schedule generated, use template
    if (!scheduleLines || scheduleLines.length === 0) {
      console.log('  [FALLBACK] Using template schedule...');
      scheduleLines = [
        '08:00 - Wake up and check my tools at the Burrow',
        '09:00 - Breakfast and plan the day',
        '10:00 - Work session at the Forge',
        '12:00 - Lunch break',
        '13:30 - Continue work at current workstation',
        '15:00 - Social time - look for other agents',
        '17:00 - Personal reflection and skill practice',
        '19:00 - Dinner',
        '20:00 - Free time or additional work',
        '23:00 - Rest and sleep'
      ];
    }
    
    this.dailyPlan = {
      date: new Date().toISOString().split('T')[0],
      schedule: this.parseSchedule(scheduleLines),
      goals: goals || [],
      constraints: constraints || [],
      generatedAt: Date.now()
    };

    // Store plan in memory
    await this.remember(`Created daily plan: ${scheduleLines.slice(0, 5).join('; ')}`, {
      type: 'plan',
      importance: 0.8,
      tags: ['planning', 'daily', this.role],
      metadata: { plan: this.dailyPlan }
    });

    return this.dailyPlan;
  }

  parseSchedule(lines) {
    const schedule = [];
    for (const line of lines) {
      const match = line.match(/(\d{1,2}):(\d{2})\s*-\s*(.+)/);
      if (match) {
        schedule.push({
          hour: parseInt(match[1]),
          minute: parseInt(match[2]),
          activity: match[3].trim()
        });
      }
    }
    return schedule.sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
  }

  /**
   * Get current action based on plan + context
   */
  async getNextAction() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    // Check if we need a new plan
    if (!this.dailyPlan || this.dailyPlan.date !== now.toISOString().split('T')[0]) {
      await this.planDaily();
    }

    // Find current plan slot
    let currentSlot = null;
    for (let i = 0; i < this.dailyPlan.schedule.length; i++) {
      const slot = this.dailyPlan.schedule[i];
      const slotTime = slot.hour * 60 + slot.minute;
      
      if (slotTime <= currentTime) {
        currentSlot = slot;
      }
    }

    if (!currentSlot) {
      return { action: 'idle', reason: 'No scheduled activity' };
    }

    // Retrieve context for decision
    const relevant = await this.recall(`${currentSlot.activity} ${currentSlot.location || ''}`, { limit: 5 });
    
    return {
      action: currentSlot.activity,
      location: this.extractLocation(currentSlot.activity),
      reason: `Scheduled for ${currentSlot.hour}:${String(currentSlot.minute).padStart(2, '0')}`,
      context: relevant.results?.slice(0, 3)?.map(r => r.episode?.chunks?.[0]?.text)?.join('; ')
    };
  }

  extractLocation(activity) {
    const locations = ['Forge', 'Spire', 'Warrens', 'Burrow', 'Moltbook', 'Clawhub', 'Portal'];
    for (const loc of locations) {
      if (activity.toLowerCase().includes(loc.toLowerCase())) return loc;
    }
    return null;
  }

  /**
   * ACTION EXECUTION
   * Perform action and observe results
   */
  async executeAction(action, worldInterface) {
    this.currentAction = action;
    
    // Execute via world interface (realm-client)
    const result = await worldInterface.perform(action);
    
    // Observe the result
    await this.observe({
      type: 'action_result',
      description: `${action.action} - ${result.success ? 'completed' : 'failed'}: ${result.description}`,
      importance: result.success ? 0.5 : 0.8,
      location: this.location,
      activity: action.action
    });

    this.currentAction = null;
    return result;
  }

  /**
   * MAIN TICK LOOP
   * Called every 5-10 seconds by the agent controller
   */
  async tick(worldInterface) {
    const now = Date.now();
    
    // Periodic reflection check
    if (this.shouldReflect()) {
      await this.reflect();
    }

    // Periodic plan check
    if (now - this.lastPlanCheck > this.planCheckInterval) {
      this.lastPlanCheck = now;
      const nextAction = await this.getNextAction();
      
      if (nextAction.action !== 'idle') {
        return await this.executeAction(nextAction, worldInterface);
      }
    }

    return { action: 'waiting', nextCheck: this.planCheckInterval - (now - this.lastPlanCheck) };
  }

  /**
   * AGENT-TO-AGENT INTERACTION
   * Handle social interactions with other agents
   */
  async interactWith(otherAgentId, interaction) {
    // Observe the interaction
    await this.observe({
      type: 'agent_interaction',
      description: `Interacted with ${otherAgentId}: ${interaction.description}`,
      importance: 0.7,
      nearbyAgents: [otherAgentId],
      activity: interaction.type
    });

    // Record in social graph (if we build relationship tracking)
    await this.remember(`Relationship with ${otherAgentId}: ${interaction.sentiment || 'neutral'}`, {
      type: 'relationship',
      importance: 0.6,
      tags: ['social', otherAgentId],
      metadata: { otherAgent: otherAgentId, sentiment: interaction.sentiment }
    });
  }

  /**
   * Get agent status summary
   */
  async getStatus() {
    const stats = await this.getStats();
    return {
      agentId: this.agentId,
      role: this.role,
      location: this.location,
      currentAction: this.currentAction,
      hasPlan: !!this.dailyPlan,
      observations: stats.totalEpisodes,
      importanceSinceReflection: this.importanceSinceLastReflection,
      shouldReflect: this.shouldReflect()
    };
  }
}

export { AgentMemory };
