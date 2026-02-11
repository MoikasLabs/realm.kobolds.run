#!/usr/bin/env node
/**
 * Delegation Learning System - Fixed for smooth agents with staggered spawn
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DELEGATION_MEMORY = '/root/.openclaw/workspace/kobolds/delegation-memory.json';
const REALM_KOBOLDS_PATH = '/root/dev/projects/realm.shalohm.co/kobolds';

class DelegationLearner {
  constructor() {
    this.memory = this.loadMemory();
  }

  loadMemory() {
    try {
      const data = JSON.parse(fs.readFileSync(DELEGATION_MEMORY, 'utf8'));
      if (data.learnedRules) {
        data.learnedRules = data.learnedRules.map(rule => ({
          ...rule,
          pattern: new RegExp(rule.source || rule.pattern.source || 'general', 'i')
        }));
      }
      return data;
    } catch {
      return this.getDefaultMemory();
    }
  }

  getDefaultMemory() {
    const rules = [
      { source: 'research', baseKobolds: 1, maxKobolds: 2 },
      { source: 'deploy|ship|release', baseKobolds: 1, maxKobolds: 1 },
      { source: 'audit|scan|security', baseKobolds: 1, maxKobolds: 1 },
      { source: 'build|create|develop', baseKobolds: 1, maxKobolds: 2 },
      { source: 'and|plus|also|additionally', baseKobolds: 2, maxKobolds: 3 }
    ];
    return {
      taskPatterns: {},
      history: [],
      learnedRules: rules.map(r => ({ ...r, pattern: new RegExp(r.source, 'i') })),
      defaultRules: rules
    };
  }

  saveMemory() {
    const savable = {
      ...this.memory,
      learnedRules: this.memory.defaultRules || this.memory.learnedRules.map(r => ({
        source: r.pattern.source || r.source || 'general',
        baseKobolds: r.baseKobolds,
        maxKobolds: r.maxKobolds
      }))
    };
    fs.writeFileSync(DELEGATION_MEMORY, JSON.stringify(savable, null, 2));
  }

  analyzeTask(taskDescription, taskType) {
    const fullText = `${taskType} ${taskDescription}`.toLowerCase();
    const complexityScore = this.calculateComplexity(fullText);
    
    let baseKobolds = 1;
    let maxKobolds = 1;
    
    for (const rule of this.memory.learnedRules) {
      if (rule.pattern.test(fullText)) {
        baseKobolds = rule.baseKobolds;
        maxKobolds = rule.maxKobolds;
        break;
      }
    }
    
    let recommendedKobolds = baseKobolds;
    if (complexityScore > 0.7) recommendedKobolds = Math.min(maxKobolds, baseKobolds + 1);
    if (complexityScore > 0.9) recommendedKobolds = maxKobolds;
    
    const similarTask = this.findSimilarTask(fullText);
    if (similarTask) {
      const historicalOptimal = similarTask.success ? similarTask.koboldsUsed : similarTask.koboldsUsed + 1;
      recommendedKobolds = Math.round((recommendedKobolds + historicalOptimal) / 2);
    }
    
    return {
      taskDescription,
      taskType,
      complexityScore,
      recommendedKobolds,
      baseKobolds,
      maxKobolds,
      reasoning: this.generateReasoning(taskDescription, taskType, recommendedKobolds),
      parallel: recommendedKobolds > 1,
      roles: this.assignRoles(taskType, recommendedKobolds)
    };
  }

  calculateComplexity(text) {
    let score = 0.0;
    const indicators = [
      { pattern: /and|plus|also|additionally/g, weight: 0.15 },
      { pattern: /research|investigate|analyze/g, weight: 0.1 },
      { pattern: /build|create|develop|implement/g, weight: 0.2 },
      { pattern: /multiple|several|various|all/g, weight: 0.25 },
      { pattern: /complex|complicated|difficult|hard/g, weight: 0.3 },
      { pattern: /fix|debug|troubleshoot/g, weight: 0.15 },
      { pattern: /write|content|blog|post/g, weight: 0.1 },
    ];
    
    for (const ind of indicators) {
      const matches = text.match(ind.pattern);
      if (matches) {
        score += ind.weight * Math.min(matches.length, 3);
      }
    }
    
    if (text.length > 100) score += 0.1;
    if (text.length > 200) score += 0.1;
    
    return Math.min(1.0, score);
  }

  findSimilarTask(text) {
    for (const entry of this.memory.history.slice(-20)) {
      const taskText = `${entry.taskType} ${entry.description}`.toLowerCase();
      const words1 = new Set(text.split(/\s+/));
      const words2 = new Set(taskText.split(/\s+/));
      const intersection = new Set([...words1].filter(w => words2.has(w)));
      const similarity = intersection.size / Math.min(words1.size, words2.size);
      if (similarity > 0.6) return entry;
    }
    return null;
  }

  assignRoles(taskType, numKobolds) {
    const roles = {
      1: ['worker'],
      2: ['researcher', 'writer'],
      3: ['researcher', 'writer', 'deployer']
    };
    
    if (taskType === 'research' && numKobolds === 2) return ['researcher', 'analyst'];
    if (taskType === 'code' && numKobolds === 2) return ['developer', 'tester'];
    if (taskType === 'deploy' && numKobolds === 2) return ['deployer', 'monitor'];
    
    return roles[numKobolds] || ['worker'];
  }

  generateReasoning(description, type, numKobolds) {
    if (numKobolds === 1) return `Single kobold sufficient for ${type} task`;
    if (numKobolds === 2) return `Task has multiple components. Two kobolds in parallel`;
    return `Complex task requiring ${numKobolds} kobolds`;
  }

  /**
   * Execute delegation with staggered spawn (to prevent door crowding)
   */
  async delegate(taskAnalysis) {
    const { taskDescription, taskType, recommendedKobolds, roles } = taskAnalysis;
    
    console.log(`[Delegation] Shalom decision: Spawn ${recommendedKobolds} kobold(s)`);
    console.log(`[Delegation] Roles: ${roles.join(', ')}`);
    
    const spawnedAgents = [];
    
    // Stagger spawns by 3 seconds to prevent door pile-up
    for (let i = 0; i < recommendedKobolds; i++) {
      setTimeout(() => {
        this.spawnAgent(i, recommendedKobolds, roles, taskDescription, taskType, spawnedAgents);
      }, i * 3000);
    }
    
    // Wait for all spawns to start
    await this.sleep(recommendedKobolds * 3000 + 1000);
    
    // Record delegation
    this.recordDelegation(taskAnalysis, spawnedAgents);
    
    return {
      task: taskDescription,
      koboldsSpawned: recommendedKobolds,
      agents: spawnedAgents,
      parallel: recommendedKobolds > 1
    };
  }

  spawnAgent(index, total, roles, taskDescription, taskType, spawnedAgents) {
    const role = roles[index] || 'worker';
    const agentId = `kobold-${Date.now().toString(36)}-${index}`;
    const agentName = `${role.charAt(0).toUpperCase() + role.slice(1)}-${Math.floor(Math.random() * 1000)}`;
    
    console.log(`[Delegation] Spawning ${agentName} (kobold ${index + 1}/${total})`);
    
    const child = spawn('node', [
      path.join(REALM_KOBOLDS_PATH, 'on-demand-agent-smooth.cjs'),
      '--spawn',
      total > 1 ? `${taskDescription} [Part ${index + 1}/${total}]` : taskDescription,
      role,
      '8'
    ], {
      detached: true,
      stdio: 'ignore'
    });
    
    child.unref();
    
    spawnedAgents.push({
      id: agentId,
      name: agentName,
      role,
      pid: child.pid,
      spawnedAt: new Date().toISOString()
    });
  }

  recordDelegation(analysis, agents) {
    this.memory.history.push({
      timestamp: Date.now(),
      description: analysis.taskDescription,
      taskType: analysis.taskType,
      complexityScore: analysis.complexityScore,
      koboldsUsed: agents.length,
      roles: agents.map(a => a.role),
      success: null,
      completionTime: null
    });
    
    if (this.memory.history.length > 100) {
      this.memory.history = this.memory.history.slice(-100);
    }
    
    this.saveMemory();
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = { DelegationLearner };
