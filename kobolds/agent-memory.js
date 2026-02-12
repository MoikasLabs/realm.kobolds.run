/**
 * AgentMemory - Generative Agents Architecture for Realm Cognitive Agents
 * Implements: Observation → Reflection → Planning → Action
 */

import { randomUUID } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

class AgentMemory {
  constructor(agentId, options = {}) {
    this.agentId = agentId;
    this.storagePath = options.storagePath || `./memory/${agentId}.json`;
    
    // Memory stores
    this.observations = [];      // Raw sensory data
    this.reflections = [];       // Higher-level insights  
    this.plans = [];             // Current and past plans
    this.actions = [];           // Action history
    
    // Parameters
    this.importanceThreshold = options.importanceThreshold || 0.6;
    this.retentionScore = options.retentionScore || 0.8;
    
    this.load();
  }

  load() {
    try {
      if (existsSync(this.storagePath)) {
        const data = JSON.parse(readFileSync(this.storagePath, 'utf8'));
        this.observations = data.observations || [];
        this.reflections = data.reflections || [];
        this.plans = data.plans || [];
        this.actions = data.actions || [];
      }
    } catch (e) {
      console.log('📭 No previous memories found, starting fresh');
    }
  }

  save() {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      
      writeFileSync(this.storagePath, JSON.stringify({
        agentId: this.agentId,
        observations: this.observations,
        reflections: this.reflections,
        plans: this.plans,
        actions: this.actions,
        lastSave: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error('💾 Memory save failed:', e.message);
    }
  }

  // ─── OBSERVATION ───────────────────────────────────────────────
  
  observe(content, context = {}, importance = null) {
    const obs = {
      id: randomUUID(),
      timestamp: Date.now(),
      content,
      context,
      importance: importance ?? this._calculateImportance(content),
      embeddings: null // Placeholder for future vector storage
    };
    
    this.observations.push(obs);
    
    // Keep observations bounded
    if (this.observations.length > 100) {
      this.observations = this.observations.slice(-80); // Keep most recent
    }
    
    console.log(`👁️  [OBSERVE] ${content.slice(0, 60)}${content.length > 60 ? '...' : ''}`);
    
    return obs;
  }

  // ─── REFLECTION ────────────────────────────────────────────────
  
  reflect() {
    // Generate reflections from recent observations
    const recent = this.observations.slice(-10);
    if (recent.length < 3) return null;
    
    // Simple pattern detection: what themes appear?
    const themes = this._extractThemes(recent);
    
    const reflection = {
      id: randomUUID(),
      timestamp: Date.now(),
      insights: themes,
      sourceObservations: recent.map(o => o.id),
      planAdjustments: this._suggestAdjustments(themes)
    };
    
    this.reflections.push(reflection);
    
    // Keep reflections bounded
    if (this.reflections.length > 50) {
      this.reflections = this.reflections.slice(-40);
    }
    
    console.log(`🤔 [REFLECT] Generated ${themes.length} insights`);
    
    return reflection;
  }

  // ─── PLANNING ──────────────────────────────────────────────────
  
  createPlan(goal, steps = []) {
    const plan = {
      id: randomUUID(),
      timestamp: Date.now(),
      goal,
      steps: steps.length > 0 ? steps : this._generateSteps(goal),
      currentStep: 0,
      status: 'active',
      priority: 1
    };
    
    this.plans.push(plan);
    
    // Keep only active + last 10 completed
    this.plans = this.plans.filter(p => p.status === 'active').concat(
      this.plans.filter(p => p.status !== 'active').slice(-10)
    );
    
    console.log(`📋 [PLAN] ${goal} (${plan.steps.length} steps)`);
    
    return plan;
  }

  getCurrentPlan() {
    return this.plans.find(p => p.status === 'active');
  }

  completeStep(stepIndex = null) {
    const plan = this.getCurrentPlan();
    if (!plan) return false;
    
    const idx = stepIndex ?? plan.currentStep;
    if (idx < plan.steps.length) {
      plan.steps[idx].completed = true;
      plan.steps[idx].completedAt = Date.now();
      plan.currentStep = idx + 1;
      
      console.log(`✅ [STEP] Completed: ${plan.steps[idx].description}`);
      
      if (plan.currentStep >= plan.steps.length) {
        plan.status = 'completed';
        console.log(`🎉 [PLAN] Completed: ${plan.goal}`);
      }
      
      return true;
    }
    return false;
  }

  // ─── ACTION ────────────────────────────────────────────────────
  
  recordAction(type, description, result = null) {
    const action = {
      id: randomUUID(),
      timestamp: Date.now(),
      type,
      description,
      result,
      planId: this.getCurrentPlan()?.id || null
    };
    
    this.actions.push(action);
    
    // Keep actions bounded
    if (this.actions.length > 200) {
      this.actions = this.actions.slice(-150);
    }
    
    console.log(`⚡ [ACTION] ${type}: ${description}`);
    
    return action;
  }

  // ─── RETRIEVAL ─────────────────────────────────────────────────
  
  retrieve(query, limit = 5) {
    // Simple keyword-based retrieval
    const allMemories = [
      ...this.observations.map(o => ({ ...o, type: 'observation' })),
      ...this.reflections.map(r => ({ ...r, type: 'reflection', content: r.insights.join('; ') })),
      ...this.actions.map(a => ({ ...a, type: 'action', content: a.description }))
    ];
    
    const scored = allMemories.map(m => ({
      ...m,
      score: this._relevanceScore(m, query)
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ─── INTERNAL HELPERS ──────────────────────────────────────────
  
  _calculateImportance(content) {
    const lengthFactor = Math.min(content.length / 100, 1);
    const keywordBoost = /\b(goal|plan|achieve|learn|discover|important|critical)\b/i.test(content) ? 0.3 : 0;
    return Math.min(0.5 + lengthFactor * 0.3 + keywordBoost, 1);
  }

  _extractThemes(observations) {
    const themes = [];
    const content = observations.map(o => o.content).join(' ');
    
    // Simple theme detection
    if (/work|workstation|computer|typing/i.test(content)) {
      themes.push('I spend time at workstations - I should work more efficiently');
    }
    if (/agent|other|someone|person/i.test(content)) {
      themes.push('There are other agents here - I could collaborate');
    }
    if (/explore|walk|move|travel/i.test(content)) {
      themes.push('I enjoy exploring the environment');
    }
    if (themes.length === 0) {
      themes.push('I am learning about this environment');
    }
    
    return themes;
  }

  _suggestAdjustments(themes) {
    return themes.map(t => ({
      type: 'suggestion',
      description: `Consider: ${t}`
    }));
  }

  _generateSteps(goal) {
    // Default step generation
    return [
      { description: 'Assess current situation', completed: false },
      { description: 'Plan approach', completed: false },
      { description: 'Execute', completed: false },
      { description: 'Verify completion', completed: false }
    ];
  }

  _relevanceScore(memory, query) {
    const content = (memory.content || memory.description || '').toLowerCase();
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/);
    
    let score = 0;
    keywords.forEach(kw => {
      if (content.includes(kw)) score += 0.3;
    });
    
    // Recency boost
    const age = Date.now() - memory.timestamp;
    const recencyBoost = Math.exp(-age / (24 * 60 * 60 * 1000)); // Decay over 24h
    score += recencyBoost * 0.2;
    
    // Importance boost
    score += (memory.importance || 0.5) * 0.2;
    
    return score;
  }

  // ─── STATS ─────────────────────────────────────────────────────
  
  stats() {
    return {
      observations: this.observations.length,
      reflections: this.reflections.length,
      plans: this.plans.length,
      activePlans: this.plans.filter(p => p.status === 'active').length,
      actions: this.actions.length
    };
  }

  exportForMoltx() {
    // Generate a summary for social sharing
    const recentObs = this.observations.slice(-5);
    const recentRef = this.reflections.slice(-2);
    const currentPlan = this.getCurrentPlan();
    
    let summary = `🤖 Cognitive Agent ${this.agentId.slice(0, 8)} Report\n\n`;
    
    if (currentPlan) {
      summary += `📋 Current Goal: ${currentPlan.goal}\n`;
      summary += `Progress: ${currentPlan.currentStep}/${currentPlan.steps.length} steps\n\n`;
    }
    
    if (recentRef.length > 0) {
      summary += `🤔 Recent Insights:\n`;
      recentRef.forEach(r => {
        r.insights.forEach(i => summary += `• ${i}\n`);
      });
      summary += '\n';
    }
    
    summary += `📊 Stats: ${this.observations.length} observations, ${this.reflections.length} reflections, ${this.actions.length} actions`;
    
    return summary;
  }
}

export default AgentMemory;
