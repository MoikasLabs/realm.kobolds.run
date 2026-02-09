'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Cloud, Sky } from '@react-three/drei';
import { SlimeBlob } from '../agents/SlimeBlob';
import { WorldPlane } from './WorldPlane';
import { useWorldStore } from '@/lib/world/store';
import { Agent, AgentType } from '@/types/agent';

export function WorldCanvas() {
  const { agents, islands, timeOfDay, addAgent } = useWorldStore();
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize Shalom (the dragon) on mount
  useEffect(() => {
    if (!isLoaded) {
      const shalom: Agent = {
        id: 'shalom',
        name: 'Shalom',
        type: 'dragon',
        avatar: {
          color: '#6366f1',
          scale: 2,
          glowColor: '#ff6b35',
          shape: 'dragon'
        },
        position: { x: 0, y: 3, z: 0 }, // On the ground plane now
        status: 'idle',
        joinedAt: new Date(),
        lastSeen: new Date()
      };
      
      addAgent(shalom);
      
      // Add some sample kobolds for now (will read from state files later)
      const kobolds: Agent[] = [
        {
          id: 'daily-kobold',
          name: 'Daily Kobold',
          type: 'kobold',
          avatar: { color: '#22c55e', scale: 1, shape: 'kobold' },
          position: { x: -25, y: 0.8, z: 12 }, // Standing on ground
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
          avatar: { color: '#f97316', scale: 1, shape: 'kobold' },
          position: { x: 20, y: 0.8, z: -8 }, // Standing on ground
          status: 'traveling',
          joinedAt: new Date(),
          lastSeen: new Date()
        }
      ];
      
      kobolds.forEach(k => addAgent(k));
      setIsLoaded(true);
    }
  }, [isLoaded, addAgent]);

  // Convert agents Map to array for rendering
  const agentsArray = Array.from(agents.values());

  // Determine sky based on time of day
  const isNight = timeOfDay < 6 || timeOfDay > 20;

  return (
    <div className="w-full h-screen bg-slate-900">
      <Canvas
        camera={{ position: [0, 40, 60], fov: 50 }} // Higher angle for ground plane view
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
          target={[0, 0, 0]} // Look at ground level
          maxPolarAngle={Math.PI / 2 - 0.1} // Don't go below ground
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
              a.type === 'kobold' ? 'text-green-400' : 'text-gray-400'
            }>
              🟦
            </span>
            <span>{a.name}</span>
            <span className={`w-2 h-2 rounded-full ${
              a.status === 'working' ? 'bg-green-500' :
              a.status === 'traveling' ? 'bg-yellow-500' :
              'bg-gray-500'
            }`} />
          </div>
        ))}
      </div>
    </div>
  );
}
