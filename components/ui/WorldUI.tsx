'use client';

import { useVillageStore } from '@/lib/store/villageStore';
import { BUILDINGS } from '@/lib/village/buildings';
import { useState } from 'react';

export function WorldUI() {
  const store = useVillageStore();
  const { agents, timeOfDay, day, adminMode, selectedAgent, buildings } = store;
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authToken, setAuthToken] = useState('');
  
  const agentsArray = Array.from(agents.values());
  const occupiedBuildings = Array.from(buildings.values()).filter(b => b.isOccupied);
  
  const isNight = timeOfDay < 6 || timeOfDay > 20;

  const handleAdminToggle = () => {
    if (adminMode) {
      // Disable admin mode without auth
      store.toggleAdminMode();
    } else {
      // Require auth to enable admin mode
      setShowAuthPrompt(true);
    }
  };

  const handleAuthSubmit = async () => {
    if (!authToken.trim()) return;

    try {
      // Verify API key with server
      const response = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken.trim()}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        alert(`Authentication failed: ${data.error || 'Invalid API key'}`);
        return;
      }

      // Server verified - enable admin mode client-side
      const success = store.toggleAdminMode(authToken.trim());
      if (success) {
        setShowAuthPrompt(false);
        setAuthToken('');
      } else {
        alert('Failed to enable admin mode');
      }
    } catch (error) {
      alert('Authentication error: Unable to verify API key');
      console.error('Auth error:', error);
    }
  };

  return (
    <>
      {/* Main HUD */}
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white p-4 rounded-xl border border-white/10 shadow-xl max-w-xs">
        <h1 className="text-xl font-bold mb-1 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          🏘️ Realm Village
        </h1>
        <p className="text-xs text-gray-400 mb-3">Day {day} • {isNight ? '🌙 Night' : '☀️ Day'}</p>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Time:</span>
            <span className="font-mono">{Math.floor(timeOfDay).toString().padStart(2, '0')}:{Math.floor((timeOfDay % 1) * 60).toString().padStart(2, '0')}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Agents:</span>
            <span>{agentsArray.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Active Buildings:</span>
            <span>{occupiedBuildings.length}</span>
          </div>
        </div>

        <button
          onClick={handleAdminToggle}
          className={`mt-4 w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            adminMode 
              ? 'bg-purple-600 hover:bg-purple-700 text-white' 
              : 'bg-white/10 hover:bg-white/20 text-gray-300'
          }`}
        >
          {adminMode ? '👑 Admin Mode ON' : '🔒 Admin Mode OFF'}
        </button>
      </div>

      {/* Agent List */}
      <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md text-white p-4 rounded-xl border border-white/10 shadow-xl max-w-xs max-h-[40vh] overflow-y-auto">
        <h2 className="text-sm font-semibold mb-3 text-gray-300">Active Agents</h2>
        <div className="space-y-1.5">
          {agentsArray.map(agent => (
            <div 
              key={agent.id}
              onClick={() => store.selectAgent(agent.id)}
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                selectedAgent === agent.id 
                  ? 'bg-indigo-600/50 border border-indigo-400/50' 
                  : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className={
                agent.subtype === 'shalom' ? 'text-2xl' : agent.type === 'subagent' ? 'text-lg' : 'text-base'
              }>
                {agent.subtype === 'shalom' ? '🐉' : agent.type === 'subagent' ? '👤' : '🦎'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${agent.type === 'subagent' ? 'font-semibold' : ''}`}>
                  {agent.name}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {agent.subtype === 'shalom' ? 'Overseer' : (agent.subtype || agent.type || 'Agent').toUpperCase()}
                </p>
              </div>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                agent.status === 'working' ? 'bg-green-500' :
                agent.status === 'traveling' ? 'bg-yellow-500' :
                agent.status === 'sleeping' ? 'bg-blue-500' :
                agent.status === 'meeting' ? 'bg-purple-500' :
                'bg-gray-500'
              }`} />
            </div>
          ))}
        </div>
      </div>

      {/* Building Status */}
      <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md text-white p-4 rounded-xl border border-white/10 shadow-xl max-w-sm max-h-[30vh] overflow-y-auto">
        <h2 className="text-sm font-semibold mb-3 text-gray-300">
          🏗️ Active Buildings ({occupiedBuildings.length})
        </h2>
        <div className="space-y-1.5">
          {occupiedBuildings.map(building => (
            <div key={building.id} className="flex items-center gap-2 text-xs">
              <span 
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: building.color }}
              />
              <span className="flex-1 truncate">{building.name}</span>
              <span className="text-gray-400">{building.occupants.length} 👤</span>
            </div>
          ))}
          {occupiedBuildings.length === 0 && (
            <p className="text-xs text-gray-500 italic">All buildings are currently empty...</p>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md text-white p-3 rounded-xl border border-white/10 shadow-xl text-xs text-gray-400 max-w-xs">
        <p>🖱️ <b>Click</b> an agent to view details</p>
        <p>🖱️ <b>Drag</b> to rotate camera</p>
        <p>📜 <b>Scroll</b> to zoom</p>
        {adminMode && <p className="text-purple-400 mt-1">👑 Admin: Use actions in agent modal</p>}
      </div>

      {/* Admin Authentication Dialog */}
      {showAuthPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-purple-900/95 backdrop-blur-md text-white p-6 rounded-xl border border-purple-500/50 shadow-2xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
              <span className="text-2xl">🔐</span> Admin Authentication Required
            </h3>
            <p className="text-sm text-gray-300 mb-4">
              Admin mode requires a valid API key with admin permissions. Enter your key to continue.
            </p>
            
            <input
              type="password"
              placeholder="Enter API key (rlm_...)"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAuthSubmit();
                }
              }}
              className="w-full bg-purple-800/50 border border-purple-500 rounded px-3 py-2 text-sm text-white mb-4 placeholder-gray-500 focus:outline-none focus:border-purple-400"
              autoFocus
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowAuthPrompt(false);
                  setAuthToken('');
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAuthSubmit}
                disabled={!authToken.trim()}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900 disabled:text-purple-400 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Unlock Admin
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
