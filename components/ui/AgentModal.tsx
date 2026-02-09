'use client';

import { useVillageStore } from '@/lib/store/villageStore';
import { adminSystem, ADMIN_ACTIONS } from '@/lib/admin/interventions';
import { BUILDINGS } from '@/lib/village/buildings';
import { useState } from 'react';

export function AgentModal() {
  const store = useVillageStore();
  const { selectedAgent, agents, adminMode, buildings } = store;
  const [activeTab, setActiveTab] = useState<'info' | 'memories' | 'schedule' | 'admin'>('info');
  const [adminAction, setAdminAction] = useState<string>('');
  const [adminParam, setAdminParam] = useState<string>('');
  
  if (!selectedAgent) return null;
  
  const agent = agents.get(selectedAgent);
  if (!agent) return null;
  
  const currentBuilding = agent.currentBuilding 
    ? buildings.get(agent.currentBuilding) 
    : null;
  
  const recentMemories = (agent.memories || [])
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 15);
  
  const isDragon = agent.subtype === 'shalom';

  const handleAdminAction = () => {
    if (!adminAction) return;
    
    const success = adminSystem.executeAction(adminAction, agent.id, adminParam || undefined);
    if (success) {
      store.addChatBubble(agent.id, '✅ Action completed');
      setAdminAction('');
      setAdminParam('');
    } else {
      store.addChatBubble(agent.id, '❌ Action failed');
    }
  };

  return (
    <div 
      className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={() => store.selectAgent(null)}
    >
      <div 
        className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl w-full max-w-lg m-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{isDragon ? '🐉' : agent.type === 'subagent' ? '👤' : '🦎'}</span>
            <div>
              <h2 className="text-xl font-bold text-white">{agent.name}</h2>
              <p className="text-sm text-indigo-200">
                {isDragon ? 'Dragon Overseer' : (agent.subtype || 'Agent').toUpperCase()}
              </p>
            </div>
          </div>
          <button 
            onClick={() => store.selectAgent(null)}
            className="text-white/80 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-600">
          {['info', 'memories', 'schedule', ...(adminMode ? ['admin'] : [])].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
                activeTab === tab 
                  ? 'bg-slate-700 text-indigo-400 border-b-2 border-indigo-400' 
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <p className="text-xs text-gray-400 uppercase">Status</p>
                  <p className={`font-medium capitalize ${
                    agent.status === 'working' ? 'text-green-400' :
                    agent.status === 'traveling' ? 'text-yellow-400' :
                    agent.status === 'sleeping' ? 'text-blue-400' :
                    agent.status === 'meeting' ? 'text-purple-400' :
                    'text-gray-300'
                  }`}>
                    {agent.status}
                  </p>
                </div>
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <p className="text-xs text-gray-400 uppercase">Location</p>
                  <p className="font-medium text-gray-300">
                    {currentBuilding ? currentBuilding.name : 'Exploring'}
                  </p>
                </div>
              </div>

              {/* Internal Monologue */}
              {agent.internalMonologue && (
                <div className="bg-indigo-900/30 border border-indigo-500/30 p-4 rounded-lg">
                  <p className="text-xs text-indigo-400 uppercase mb-2">💭 Internal Monologue</p>
                  <p className="text-gray-200 italic">"{agent.internalMonologue}"</p>
                </div>
              )}

              {/* Current Task */}
              {agent.currentTask && (
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <p className="text-xs text-gray-400 uppercase">Current Task</p>
                  <p className="font-medium text-gray-300">{agent.currentTask.name}</p>
                  <div className="mt-2 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all"
                      style={{ width: `${agent.currentTask.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{agent.currentTask.progress}% complete</p>
                </div>
              )}

              {/* Goals */}
              {(agent.goals?.length ?? 0) > 0 && (
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <p className="text-xs text-gray-400 uppercase mb-2">Goals</p>
                  <ul className="space-y-1">
                    {agent.goals.map((goal, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                        <span className="text-indigo-400">▸</span> {goal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Joined */}
              <p className="text-xs text-gray-500 text-center">
                Joined the realm on {agent.joinedAt.toLocaleDateString()}
              </p>
            </div>
          )}

          {activeTab === 'memories' && (
            <div className="space-y-3">
              {recentMemories.length > 0 ? (
                recentMemories.map((memory) => (
                  <div 
                    key={memory.id}
                    className="bg-slate-700/50 p-3 rounded-lg border-l-2 border-l-indigo-500"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        memory.type === 'conversation' ? 'bg-purple-500/30 text-purple-300' :
                        memory.type === 'action' ? 'bg-green-500/30 text-green-300' :
                        memory.type === 'thought' ? 'bg-yellow-500/30 text-yellow-300' :
                        'bg-blue-500/30 text-blue-300'
                      }`}>
                        {memory.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(memory.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">{memory.content}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      📍 {memory.location} • ⚡ {memory.importance}/10
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">No memories yet...</p>
              )}
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-2">
              {agent.schedule?.length > 0 ? (
                agent.schedule.map((task, i) => {
                  const timeStr = Math.floor(task.startTime).toString().padStart(2, '0') + ':' + 
                    Math.floor((task.startTime % 1) * 60).toString().padStart(2, '0');
                  const building = buildings.get(task.building);
                  
                  return (
                    <div 
                      key={task.id}
                      className="flex items-center gap-3 bg-slate-700/50 p-3 rounded-lg"
                    >
                      <div className="text-right min-w-[50px]">
                        <p className="text-sm font-mono text-indigo-400">{timeStr}</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-300">{task.activity}</p>
                        <p className="text-xs text-gray-400">
                          at {building?.name || task.building} ({task.duration}min)
                        </p>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${
                        task.priority >= 8 ? 'bg-red-400' :
                        task.priority >= 6 ? 'bg-yellow-400' :
                        'bg-green-400'
                      }`} />
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-8">No schedule entries...</p>
              )}
            </div>
          )}

          {activeTab === 'admin' && adminMode && (
            <div className="space-y-4">
              <div className="bg-purple-900/30 border border-purple-500/30 p-3 rounded-lg">
                <p className="text-sm text-purple-300 font-medium">👑 Admin Controls</p>
                <p className="text-xs text-gray-400">Override agent behavior</p>
              </div>

              {/* Action Selector */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 uppercase">Action</label>
                  <select
                    value={adminAction}
                    onChange={(e) => {
                      setAdminAction(e.target.value);
                      setAdminParam('');
                    }}
                    className="w-full mt-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white"
                  >
                    <option value="">Select action...</option>
                    {ADMIN_ACTIONS.map(action => (
                      <option key={action.id} value={action.id}>{action.icon} {action.label}</option>
                    ))}
                  </select>
                </div>

                {/* Parameter Selector */}
                {adminAction && (() => {
                  const action = ADMIN_ACTIONS.find(a => a.id === adminAction);
                  if (!action?.requiresParam) return null;
                  
                  if (action.id === 'teleport') {
                    return (
                      <div>
                        <label className="text-xs text-gray-400 uppercase">Destination</label>
                        <select
                          value={adminParam}
                          onChange={(e) => setAdminParam(e.target.value)}
                          className="w-full mt-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white"
                        >
                          <option value="">Select building...</option>
                          {BUILDINGS.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  
                  if (action.paramOptions) {
                    return (
                      <div>
                        <label className="text-xs text-gray-400 uppercase">Goal</label>
                        <select
                          value={adminParam}
                          onChange={(e) => setAdminParam(e.target.value)}
                          className="w-full mt-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white"
                        >
                          <option value="">Select goal...</option>
                          {action.paramOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  
                  return null;
                })()}

                <button
                  onClick={handleAdminAction}
                  disabled={!adminAction || (ADMIN_ACTIONS.find(a => a.id === adminAction)?.requiresParam && !adminParam)}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-gray-500 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                >
                  Execute Action
                </button>
              </div>

              {/* Quick Actions */}
              <div className="border-t border-slate-600 pt-3">
                <p className="text-xs text-gray-400 uppercase mb-2">Quick Actions</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => adminSystem.executeAction('poke', agent.id)}
                    disabled={agent.status !== 'sleeping'}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white py-1 px-2 rounded text-sm"
                  >
                    👆 Poke
                  </button>
                  <button
                    onClick={() => adminSystem.executeAction('force-meeting', agent.id)}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-1 px-2 rounded text-sm"
                  >
                    📢 Call Meeting
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
