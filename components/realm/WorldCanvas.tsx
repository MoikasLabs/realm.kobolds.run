'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Cloud, Sky } from '@react-three/drei';
import { SlimeBlob } from '../agents/SlimeBlob';
import { WorldPlane } from './WorldPlane';
import { useWorldStore } from '@/lib/world/store';
import { Agent } from '@/types/agent';

export function WorldCanvas() {
  const { agents, islands, timeOfDay, addAgent } = useWorldStore();
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize default agents (will be overridden by API if agents report)
  useEffect(() => {
    if (!isLoaded) {
      // Default Shalom (will be overridden if Shalom reports via API)
      const shalom: Agent = {
        id: 'shalom',
        name: 'Shalom',
        type: 'dragon',
        avatar: {
          color: '#6366f1',
          scale: 2.5,
          glowColor: '#ff6b35',
          shape: 'slime'
        },
        position: { x: 0, y: 0.8, z: 0 },
        status: 'idle',
        joinedAt: new Date(),
        lastSeen: new Date()
      };
      addAgent(shalom);

      // Demo kobolds (will be overridden by real ones via API)
      const demoKobolds: Agent[] = [
        {
          id: 'daily-kobold',
          name: 'Daily Kobold',
          type: 'kobold',
          avatar: { color: '#22c55e', scale: 1, shape: 'slime' },
          position: { x: -25, y: 0.8, z: 12 },
          status: 'working',
          currentTask: {
            id: 'task-1',
            name: 'Moltx posting',
            type: 'write',
            progress: 65,
            artifact: { id: 'art-1', type: 'scroll', color: '#fbbf24', glowIntensity: 1 }
          },
          joinedAt: new Date(),
          lastSeen: new Date()
        },
        {
          id: 'trade-kobold',
          name: 'Trading Kobold',
          type: 'kobold',
          avatar: { color: '#f97316', scale: 1, shape: 'slime' },
          position: { x: 20, y: 0.8, z: -8 },
          status: 'traveling',
          joinedAt: new Date(),
          lastSeen: new Date()
        }
      ];
      demoKobolds.forEach(k => addAgent(k));
      setIsLoaded(true);
    }
  }, [isLoaded, addAgent]);

  // Convert agents Map to array for rendering
  const agentsArray = Array.from(agents.values());

  // Poll unified agent webhook for live updates
  useEffect(() => {
    const POLL_INTERVAL = 3000; // 3 seconds
    
    async function fetchAgents() {
      try {
        const response = await fetch('/api/agent/webhook');
        if (!response.ok) return;
        
        const data = await response.json();
        
        // Sync all agents from API to store
        const agentsFromAPI = data.all || [];
        
        agentsFromAPI.forEach((apiAgent: {
          id: string;
          name: string;
          type: string;
          subtype: string;
          status: 'idle' | 'working' | 'traveling' | 'error' | 'sleeping';
          position: { x: number; y: number; z: number };
          currentTask?: { id: string; name: string; type: string; progress: number };
          metadata?: { color?: string };
        }) => {
          // Handle Shalom (dragon) - special rendering
          if (apiAgent.id === 'shalom') {
            const shalom: Agent = {
              id: 'shalom',
              name: apiAgent.name || 'Shalom',
              type: 'dragon',
              avatar: {
                color: apiAgent.metadata?.color || '#6366f1',
                scale: 2.5,
                glowColor: '#ff6b35',
                shape: 'slime'
              },
              position: apiAgent.position,
              status: apiAgent.status,
              currentTask: apiAgent.currentTask ? {
                id: apiAgent.currentTask.id,
                name: apiAgent.currentTask.name,
                type: apiAgent.currentTask.type as 'code' | 'trade' | 'deploy' | 'write' | 'art' | 'meeting',
                progress: apiAgent.currentTask.progress,
                artifact: { id: `art-shalom`, type: 'crystal', color: '#fbbf24', glowIntensity: 1 }
              } : undefined,
              joinedAt: new Date(),
              lastSeen: new Date()
            };
            addAgent(shalom);
            return;
          }
          
          const agent: Agent = {
            id: apiAgent.id,
            name: apiAgent.name,
            type: apiAgent.type === 'subagent' ? 'subagent' : 
                  apiAgent.type === 'guest' ? 'guest' : 'kobold',
            avatar: { 
              color: apiAgent.metadata?.color || 
                     (apiAgent.subtype === 'cmo' ? '#ec4899' :
                      apiAgent.subtype === 'cio' ? '#06b6d4' :
                      apiAgent.subtype === 'cso' ? '#dc2626' :
                      apiAgent.subtype === 'cfo' ? '#16a34a' :
                      apiAgent.subtype === 'coo' ? '#7c3aed' :
                      apiAgent.subtype === 'ceo' ? '#f59e0b' :
                      apiAgent.subtype === 'trading' ? '#f97316' :
                      apiAgent.subtype === 'deploy' ? '#3b82f6' :
                      '#22c55e'),
              scale: apiAgent.type === 'subagent' ? 1.2 : 1,
              shape: 'slime'
            },
            position: apiAgent.position,
            status: apiAgent.status,
            currentTask: apiAgent.currentTask ? {
              id: apiAgent.currentTask.id,
              name: apiAgent.currentTask.name,
              type: apiAgent.currentTask.type as 'code' | 'trade' | 'deploy' | 'write' | 'art' | 'meeting',
              progress: apiAgent.currentTask.progress,
              artifact: { id: `art-${apiAgent.id}`, type: 'crystal', color: '#fbbf24', glowIntensity: 0.8 }
            } : undefined,
            joinedAt: new Date(),
            lastSeen: new Date()
          };
          
          addAgent(agent);
        });
      } catch (e) {
        // Silently fail - world shows demo data if no connection
      }
    }
    
    // Initial fetch
    fetchAgents();
    
    // Poll periodically
    const interval = setInterval(fetchAgents, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [addAgent]);

  // Determine sky based on time of day
  const isNight = timeOfDay < 6 || timeOfDay > 20;

  return (
    <div className="w-full h-screen bg-slate-900">
      <Canvas
        camera={{ position: [0, 40, 60], fov: 50 }}
        dpr={[1, 2]}
        shadows
      >
        {/* Lighting */}
        <ambientLight intensity={isNight ? 0.2 : 0.4} />
        <directionalLight
          position={[50, 50, 20]}
          intensity={isNight ? 0.3 : 1}
          color={isNight ? '#6366f1' : '#fff'}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        
        {/* Night glow */}
        {isNight && (
          <pointLight position={[0, 50, 0]} intensity={0.5} color="#6366f1" distance={100} />
        )}

        {/* Sky / Environment */}
        {isNight ? (
          <>
            <Stars radius={100} depth={50} count={5000} factor={4} fade speed={0.5} />
            <Cloud opacity={0.2} speed={0.4} segments={20} position={[0, 30, -50]} />
          </>
        ) : (
          <Sky
            distance={450000}
            sunPosition={[0, 1, 0]}
            inclination={0}
            azimuth={0.25}
            turbidity={10}
            rayleigh={3}
            mieCoefficient={0.005}
            mieDirectionalG={0.7}
          />
        )}

        {/* World Ground Plane with Zone Markers */}
        <WorldPlane islands={islands} />

        {/* Slime Blob Agents */}
        {agentsArray.map((agent) => (
          <SlimeBlob key={agent.id} agent={agent} isLocal={agent.type === 'dragon'} />
        ))}

        {/* Controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={15}
          maxDistance={120}
          target={[0, 0, 0]}
          maxPolarAngle={Math.PI / 2 - 0.1}
        />

        {/* Fog for depth */}
        <fog attach="fog" args={[isNight ? '#0f172a' : '#e2e8f0', 50, 180]} />
      </Canvas>

      {/* UI Overlay */}
      <WorldUI agents={agentsArray} timeOfDay={timeOfDay} />
    </div>
  );
}

// Simple UI overlay showing world info
function WorldUI({ agents, timeOfDay }: { agents: Agent[]; timeOfDay: number }) {
  return (
    <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm text-white p-4 rounded-lg">
      <h1 className="text-xl font-bold mb-2">🐉 Shalom&apos;s Realm</h1>
      <p className="text-sm text-gray-300">Time: {timeOfDay.toFixed(1)}:00</p>
      <p className="text-sm text-gray-300">Agents: {agents.length}</p>
      <div className="mt-2 space-y-1">
        {agents.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-xs">
            <span className={
              a.type === 'dragon' ? 'text-indigo-400' : 
              a.type === 'subagent' ? 'text-pink-400' :
              a.type === 'guest' ? 'text-gray-400' :
              'text-green-400'
            }>
              {a.type === 'dragon' ? '🐉' : 
               a.type === 'subagent' ? '👤' :
               a.type === 'guest' ? '👋' : '🦎'}
            </span>
            <span className={a.type === 'subagent' ? 'font-semibold' : ''}>{a.name}</span>
            <span className={`w-2 h-2 rounded-full ${
              a.status === 'working' ? 'bg-green-500' :
              a.status === 'traveling' ? 'bg-yellow-500' :
              a.status === 'sleeping' ? 'bg-blue-400' :
              'bg-gray-500'
            }`} />
          </div>
        ))}
      </div>
    </div>
  );
}
