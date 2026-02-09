'use client';

import { useVillageStore } from '@/lib/store/villageStore';
import { ADMIN_ACTIONS, adminSystem } from '@/lib/admin/interventions';
import { BUILDINGS } from '@/lib/village/buildings';
import { useState } from 'react';

export function AdminPanel() {
  const store = useVillageStore();
  const { agents } = store;
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [targetAgents, setTargetAgents] = useState<string[]>(['all']);
  const [param, setParam] = useState<string>('');

  const agentsArray = Array.from(agents.values());

  const executeAction = () => {
    if (!selectedAction) return;

    const targets = targetAgents.includes('all') 
      ? agentsArray.map(a => a.id)
      : targetAgents;

    for (const agentId of targets) {
      adminSystem.executeAction(selectedAction, agentId, param || undefined);
    }

    // Reset
    setSelectedAction('');
    setParam('');
  };

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-purple-900/90 backdrop-blur-md text-white p-4 rounded-xl border border-purple-500/50 shadow-xl z-40 max-w-lg">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">👑</span>
        <h2 className="text-lg font-bold">Admin Controls</h2>
      </div>

      {/* Action Select */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-300 uppercase">Action</label>
          <select
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setParam('');
            }}
            className="w-full mt-1 bg-purple-800/50 border border-purple-500 rounded px-3 py-2 text-sm text-white"
          >
            <option value="">Select action...</option>
            {ADMIN_ACTIONS.map(action => (
              <option key={action.id} value={action.id}>{action.icon} {action.label}</option>
            ))}
          </select>
        </div>

        {/* Parameter */}
        {selectedAction === 'teleport' && (
          <div>
            <label className="text-xs text-gray-300 uppercase">Destination</label>
            <select
              value={param}
              onChange={(e) => setParam(e.target.value)}
              className="w-full mt-1 bg-purple-800/50 border border-purple-500 rounded px-3 py-2 text-sm text-white"
            >
              <option value="">Select building...</option>
              {BUILDINGS.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        {selectedAction === 'set-goal' && (
          <div>
            <label className="text-xs text-gray-300 uppercase">Goal</label>
            <input
              type="text"
              value={param}
              onChange={(e) => setParam(e.target.value)}
              placeholder="Enter goal..."
              className="w-full mt-1 bg-purple-800/50 border border-purple-500 rounded px-3 py-2 text-sm text-white"
            />
          </div>
        )}

        {/* Target Agents */}
        <div>
          <label className="text-xs text-gray-300 uppercase">Target Agents</label>
          <div className="flex flex-wrap gap-2 mt-1">
            <button
              onClick={() => setTargetAgents(['all'])}
              className={`px-3 py-1 rounded text-sm ${
                targetAgents.includes('all') 
                  ? 'bg-purple-500 text-white' 
                  : 'bg-purple-800/50 text-gray-300'
              }`}
            >
              All Agents
            </button>
            {agentsArray.map(agent => (
              <button
                key={agent.id}
                onClick={() => {
                  if (targetAgents.includes('all')) {
                    setTargetAgents([agent.id]);
                  } else if (targetAgents.includes(agent.id)) {
                    setTargetAgents(targetAgents.filter(id => id !== agent.id));
                  } else {
                    setTargetAgents([...targetAgents, agent.id]);
                  }
                }}
                className={`px-3 py-1 rounded text-sm ${
                  targetAgents.includes(agent.id) 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-purple-800/50 text-gray-300'
                }`}
              >
                {agent.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Execute Button */}
      <button
        onClick={executeAction}
        disabled={!selectedAction || (selectedAction === 'teleport' && !param)}
        className="mt-4 w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900 disabled:text-purple-400 text-white py-2 rounded-lg font-medium transition-colors"
      >
        Execute
      </button>
    </div>
  );
}
