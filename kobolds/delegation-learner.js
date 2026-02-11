#!/usr/bin/env node
/**
 * Delegation Learning System - Shalom learns how many kobolds tasks need
 * 
 * Shalom analyzes tasks and decides:
 * - Simple task? → 1 kobold
 * - Complex/multi-part? → 2-3 kobolds in parallel
 * - Big project? → Multiple kobolds with different roles
 * 
 * Learns from outcomes to improve future delegation decisions.
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
      // Reconstruct RegExp patterns from saved strings
      if (data.learnedRules) {
        data.learnedRules = data.learnedRules.map(rule => ({
          ...rule,
          pattern: new RegExp(rule.pattern.source || rule.pattern, 'i')
        }));
      }
      return data;
    } catch {
      return this.getDefaultMemory();
    }
  }

  getDefaultMemory() {
    return {
      taskPatterns: {},
      history: [],
      learnedRules: [
        { pattern: /research/i, baseKobolds: 1, maxKobolds: 2 },
        { pattern: /deploy|ship|release/i, baseKobolds: 1, maxKobolds: 1 },
        { pattern: /audit|scan|security/i, baseKobolds: 1, maxKobolds: 1 },
        { pattern: /build|create|develop/i, baseKobolds: 1, maxKobolds: 2 },
        { pattern: /and|plus|also|additionally/i, baseKobolds: 2, maxKobolds: 3 }
      ],
      defaultRules: [  // Store originals for serialization
        { source: 'research', baseKobolds: 1, maxKobolds: 2 },
        { source: 'deploy|ship|release', baseKobolds: 1, maxKobolds: 1 },
        { source: 'audit|scan|security', baseKobolds: 1, maxKobolds: 1 },
        { source: 'build|create|develop', baseKobolds: 1, maxKobolds: 2 },
        { source: 'and|plus|also|additionally', baseKobolds: 2, maxKobolds: 3 }
      ]
    };
  }

  saveMemory() {
    // Convert RegExp patterns to serializable sources
    const savable = {
      ...this.memory,
      learnedRules: this.memory.learnedRules.map(rule => ({
        source: rule.pattern.source || 'general',
        baseKobolds: rule.baseKobolds,
        maxKobolds: rule.maxKobolds
      }))
    };
    fs.writeFileSync(DELEGATION_MEMORY, JSON.stringify(savable, null, 2));
  }

  /**
   * Analyze task and decide delegation strategy
   */
  analyzeTask(taskDescription, taskType) {
    const fullText = `${taskType} ${taskDescription}`.toLowerCase();
    
    // Check for complexity indicators
    const complexityScore = this.calculateComplexity(fullText);
    
    // Match against learned rules
    let baseKobolds = 1;
    let maxKobolds = 1;
    
    for (const rule of this.memory.learnedRules) {
      if (rule.pattern.test(fullText)) {
        baseKobolds = rule.baseKobolds;
        maxKobolds = rule.maxKobolds;
        break;
      }
    }
    
    // Adjust based on complexity
    let recommendedKobolds = baseKobolds;
    if (complexityScore > 0.7) recommendedKobolds = Math.min(maxKobolds, baseKobolds + 1);
    if (complexityScore > 0.9) recommendedKobolds = maxKobolds;
    
    // Check if we've seen this exact/similar task before
    const similarTask = this.findSimilarTask(fullText);
    if (similarTask) {
      console.log(`[Delegation] Found similar task: used ${similarTask.koboldsUsed} kobolds, success: ${similarTask.success}`);
      // Use historical data but blend with analysis
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
    
    // Complexity indicators
    const indicators = [
      { pattern: /and|plus|also|additionally/g, weight: 0.15 }, // Multiple parts
      { pattern: /research|investigate|analyze/g, weight: 0.1 }, // Research heavy
      { pattern: /build|create|develop|implement/g, weight: 0.2 }, // Building
      { pattern: /multiple|several|various|all/g, weight: 0.25 }, // Scope words
      { pattern: /complex|complicated|difficult|hard/g, weight: 0.3 }, // Explicit complexity
      { pattern: /fix|debug|troubleshoot/g, weight: 0.15 }, // Debugging
      { pattern: /write|content|blog|post/g, weight: 0.1 }, // Content
      { pattern: /compare|evaluate|benchmark/g, weight: 0.15 }, // Comparison
    ];
    
    for (const ind of indicators) {
      const matches = text.match(ind.pattern);
      if (matches) {
        score += ind.weight * Math.min(matches.length, 3); // Cap at 3 occurrences
      }
    }
    
    // Length factor (longer descriptions often = more complex)
    if (text.length > 100) score += 0.1;
    if (text.length > 200) score += 0.1;
    
    return Math.min(1.0, score);
  }

  findSimilarTask(text) {
    // Simple similarity check - could use embeddings in future
    for (const entry of this.memory.history.slice(-20)) { // Last 20 tasks
      const taskText = `${entry.taskType} ${entry.description}`.toLowerCase();
      
      // Check word overlap
      const words1 = new Set(text.split(/\s+/));
      const words2 = new Set(taskText.split(/\s+/));
      const intersection = new Set([...words1].filter(w => words2.has(w)));
      const similarity = intersection.size / Math.min(words1.size, words2.size);
      
      if (similarity > 0.6) { // 60% word overlap
        return entry;
      }
    }
    return null;
  }

  assignRoles(taskType, numKobolds) {
    const roles = {
      1: ['worker'],
      2: ['researcher', 'writer'],
      3: ['researcher', 'writer', 'deployer']
    };
    
    // Task-specific role assignments
    if (taskType === 'research' && numKobolds === 2) {
      return ['researcher', 'analyst'];
    }
    if (taskType === 'code' && numKobolds === 2) {
      return ['developer', 'tester'];
    }
    if (taskType === 'deploy' && numKobolds === 2) {
      return ['deployer', 'monitor'];
    }
    
    return roles[numKobolds] || ['worker'];
  }

  generateReasoning(description, type, numKobolds) {
    if (numKobolds === 1) {
      return `Single kobold sufficient for ${type} task: "${description.slice(0, 50)}..."`;
    }
    if (numKobolds === 2) {
      return `Task has multiple components. Two kobolds in parallel: one focusing on execution, one on validation/reporting.`;
    }
    return `Complex task requiring ${numKobolds} kobolds with specialized roles for efficient completion.`;
  }

  /**
   * Execute delegation - spawn the kobolds
   */
  async delegate(taskAnalysis) {
    const { taskDescription, taskType, recommendedKobolds, roles } = taskAnalysis;
    
    console.log(`[Delegation] Shalom decision: Spawn ${recommendedKobolds} kobold(s)`);
    console.log(`[Delegation] Roles: ${roles.join(', ')}`);
    console.log(`[Delegation] Reasoning: ${taskAnalysis.reasoning}`);
    
    const spawnedAgents = [];
    
    for (let i = 0; i < recommendedKobolds; i++) {
      const role = roles[i] || 'worker';
      const agentId = `kobold-${Date.now().toString(36)}-${i}`;
      const agentName = `${role.charAt(0).toUpperCase() + role.slice(1)}-${Math.floor(Math.random() * 1000)}`;
      
      // Spawn the on-demand agent
      const child = spawn('node', [
        path.join(REALM_KOBOLDS_PATH, 'on-demand-agent.cjs'),
        '--spawn',
        recommendedKobolds > 1 
          ? `${taskDescription} [Part ${i+1}/${recommendedKobolds}: ${role}]`
          : taskDescription,
        role,
        '15' // 15 min per kobold for multi-kobold tasks
      ], {
        detached: true,
        stdio: 'ignore'
      });
      
      child.unref();
      
      spawnedAgents.push({
        id: agentId,
        name: agentName,
        role,
        pid: child.pid
      });
      
      // Small delay between spawns so they don't all materialize at once
      if (i < recommendedKobolds - 1) {
        await this.sleep(2000);
      }
    }
    
    // Record this delegation
    this.recordDelegation(taskAnalysis, spawnedAgents);
    
    return {
      task: taskDescription,
      koboldsSpawned: recommendedKobolds,
      agents: spawnedAgents,
      parallel: recommendedKobolds > 1
    };
  }

  recordDelegation(analysis, agents) {
    this.memory.history.push({
      timestamp: Date.now(),
      description: analysis.taskDescription,
      taskType: analysis.taskType,
      complexityScore: analysis.complexityScore,
      koboldsUsed: agents.length,
      roles: agents.map(a => a.role),
      success: null, // Will be updated when task completes
      completionTime: null // Will be updated
    });
    
    // Keep history manageable
    if (this.memory.history.length > 100) {
      this.memory.history = this.memory.history.slice(-100);
    }
    
    this.saveMemory();
  }

  /**
   * Learn from task completion feedback
   */
  learn(taskDescription, numKoboldsUsed, success, completionTimeMs) {
    // Find the task in history
    const entry = this.memory.history.find(h => 
      h.description === taskDescription && 
      h.koboldsUsed === numKoboldsUsed &&
      h.success === null
    );
    
    if (entry) {
      entry.success = success;
      entry.completionTime = completionTimeMs;
      
      // Update task pattern statistics
      const pattern = entry.taskType;
      if (!this.memory.taskPatterns[pattern]) {
        this.memory.taskPatterns[pattern] = { total: 0, successes: 0, avgKobolds: 0, avgTime: 0 };
      }
      
      const stats = this.memory.taskPatterns[pattern];
      stats.total++;
      if (success) stats.successes++;
      stats.avgKobolds = ((stats.avgKobolds * (stats.total - 1)) + numKoboldsUsed) / stats.total;
      stats.avgTime = ((stats.avgTime * (stats.total - 1)) + completionTimeMs) / stats.total;
      
      this.saveMemory();
      
      // Generate learning insight
      if (!success && numKoboldsUsed === 1) {
        console.log(`[Delegation Learning] Task "${pattern}" failed with 1 kobold. Future similar tasks may need 2.`);
        // Could auto-adjust rules here
      }
    }
  }

  /**
   * Get Shalom's delegation stats
   */
  getStats() {
    const totalTasks = this.memory.history.length;
    const completedTasks = this.memory.history.filter(h => h.success !== null).length;
    const successfulTasks = this.memory.history.filter(h => h.success === true).length;
    const avgKobolds = this.memory.history.length > 0 
      ? this.memory.history.reduce((a, h) => a + h.koboldsUsed, 0) / this.memory.history.length 
      : 0;
    
    return {
      totalTasks,
      completedTasks,
      successRate: completedTasks > 0 ? (successfulTasks / completedTasks) : 0,
      avgKoboldsPerTask: avgKobolds.toFixed(2),
      patterns: this.memory.taskPatterns,
      recentHistory: this.memory.history.slice(-5)
    };
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

// CLI
async function main() {
  const learner = new DelegationLearner();
  
  const args = process.argv.slice(2);
  
  if (args[0] === '--stats') {
    console.log(JSON.stringify(learner.getStats(), null, 2));
    return;
  }
  
  if (args[0] === '--delegate') {
    const description = args[1] || 'General task';
    const type = args[2] || 'general';
    
    const analysis = learner.analyzeTask(description, type);
    console.log('Analysis:', JSON.stringify(analysis, null, 2));
    
    const result = await learner.delegate(analysis);
    console.log('\nDelegation result:', JSON.stringify(result, null, 2));
    return;
  }
  
  if (args[0] === '--test') {
    // Test various tasks
    const testTasks = [
      { desc: 'Research AI trends', type: 'research' },
      { desc: 'Build and deploy landing page', type: 'code' },
      { desc: 'Audit security', type: 'security' },
      { desc: 'Research, write, and deploy blog post about AI', type: 'content' }
    ];
    
    for (const task of testTasks) {
      console.log(`\n--- Testing: ${task.desc} ---`);
      const analysis = learner.analyzeTask(task.desc, task.type);
      console.log(`Recommended: ${analysis.recommendedKobolds} kobold(s)`);
      console.log(`Roles: ${analysis.roles.join(', ')}`);
      console.log(`Complexity: ${(analysis.complexityScore * 100).toFixed(0)}%`);
    }
    return;
  }
  
  console.log('Delegation Learning System');
  console.log('');
  console.log('Usage:');
  console.log('  node delegation-learner.js --test           # Test task analysis');
  console.log('  node delegation-learner.js --stats          # Show learning stats');
  console.log('  node delegation-learner.js --delegate "task" [type] # Delegate a task');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { DelegationLearner };
