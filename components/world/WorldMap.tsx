'use client';

import { useRef, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from '@/lib/world/store';
import { VILLAGE_BUILDINGS, Building as BuildingType } from '@/lib/village/buildings';
import { pathfinder } from '@/lib/village/pathfinding';
import { Agent } from '@/types/agent';

export function WorldMap() {
  const { agents, timeOfDay } = useWorldStore();
  const agentsArray = Array.from(agents.values());
  const isNight = timeOfDay < 6 || timeOfDay > 20;

  const handleBuildingClick = useCallback((building: BuildingType) => {
    console.log('Map: Focus on building:', building.name);
    // Could navigate to /village with focus parameter
  }, []);

  return (
    <div className="w-full h-screen bg-slate-900 relative">
      <Canvas
        orthographic
        camera={{ 
          position: [0, 80, 0], 
          zoom: 8,
          near: 0.1,
          far: 200
        }}
        dpr={[1, 2]}
      >
        {/* Lighting - flat for map view */}
        <ambientLight intensity={0.8} />
        <directionalLight position={[0, 50, 0]} intensity={0.5} />
        
        {/* Ground - flat grid for map */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial 
            color={isNight ? '#1e293b' : '#334155'}
            roughness={1}
          />
        </mesh>

        {/* Grid lines */}
        <GridOverlay isNight={isNight} />

        {/* Building Paths (connections) */}
        <PathNetwork buildings={VILLAGE_BUILDINGS} />

        {/* Buildings (simplified icons) */}
        {VILLAGE_BUILDINGS.map(building => (
          <BuildingIcon 
            key={building.id}
            building={building}
            onClick={handleBuildingClick}
          />
        ))}

        {/* Agent Dots */}
        {agentsArray.map(agent => (
          <AgentDot key={agent.id} agent={agent} />
        ))}

        {/* Map Labels Layer */}
        <MapLabels buildings={VILLAGE_BUILDINGS} />

        {/* Controls - limited for map view */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={false}
          minZoom={4}
          maxZoom={20}
          target={[0, 0, 0]}
        />
      </Canvas>

      {/* Map UI Overlay */}
      <MapUI agents={agentsArray} timeOfDay={timeOfDay} />
    </div>
  );
}

// Grid overlay for map aesthetic
function GridOverlay({ isNight }: { isNight: boolean }) {
  const gridColor = isNight ? '#475569' : '#64748b';
  
  return (
    <>
      {/* Major grid lines */}
      {Array.from({ length: 21 }, (_, i) => {
        const pos = (i - 10) * 10;
        return (
          <group key={`grid-${i}`}>
            <mesh position={[pos, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.1, 200]} />
              <meshBasicMaterial color={gridColor} transparent opacity={0.3} />
            </mesh>
            <mesh position={[0, 0.01, pos]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[200, 0.1]} />
              <meshBasicMaterial color={gridColor} transparent opacity={0.3} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// Path network between buildings
function PathNetwork({ buildings }: { buildings: BuildingType[] }) {
  const lines: JSX.Element[] = [];
  
  // Connect each building to 2 nearest neighbors
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    const neighbors = buildings
      .filter((b, idx) => idx !== i)
      .map(b => ({
        building: b,
        dist: pathfinder.distanceXZ(building.position, b.position)
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2);
    
    for (const neighbor of neighbors) {
      const midX = (building.position.x + neighbor.building.position.x) / 2;
      const midZ = (building.position.z + neighbor.building.position.z) / 2;
      const length = neighbor.dist;
      const angle = Math.atan2(
        neighbor.building.position.z - building.position.z,
        neighbor.building.position.x - building.position.x
      );
      
      lines.push(
        <mesh 
          key={`path-${building.id}-${neighbor.building.id}`}
          position={[midX, 0.02, midZ]}
          rotation={[0, angle, 0]}
        >
          <planeGeometry args={[length, 0.3]} />
          <meshBasicMaterial 
            color="#94a3b8" 
            transparent 
            opacity={0.5}
          />
        </mesh>
      );
    }
  }
  
  return <>{lines}</>;
}

// Simplified building icon for map view
function BuildingIcon({ 
  building, 
  onClick 
}: { 
  building: BuildingType; 
  onClick: (b: BuildingType) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const handleClick = () => {
    onClick(building);
  };

  // Building footprint
  const footprint = Math.min(building.size.width, building.size.depth);
  
  return (
    <group 
      position={[building.position.x, 0.1, building.position.z]}
      onClick={handleClick}
    >
      {/* Building footprint */}
      <mesh ref={meshRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[footprint, footprint]} />
        <meshStandardMaterial 
          color={building.color}
          emissive={building.color}
          emissiveIntensity={building.isOccupied ? 0.5 : 0.1}
        />
      </mesh>
      
      {/* Occupancy indicator */}
      {building.isOccupied && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[footprint * 0.3, 16]} />
          <meshBasicMaterial 
            color="#22c55e" 
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
      
      {/* Type indicator icon */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[footprint * 0.5, footprint * 0.5]} />
        <meshBasicMaterial 
          color="#fff" 
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  );
}

// Agent dot for map view
function AgentDot({ agent }: { agent: Agent }) {
  const dotRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef(0);
  
  // Pulse animation for agent
  useFrame(() => {
    if (!dotRef.current) return;
    pulseRef.current += 0.05;
    const scale = 1 + Math.sin(pulseRef.current) * 0.2;
    dotRef.current.scale.setScalar(scale);
  });

  const color = agent.avatar.color || '#22c55e';
  const size = agent.type === 'dragon' ? 1.2 : 0.8;

  return (
    <group position={[agent.position.x, 0.05, agent.position.z]}>
      {/* Agent dot */}
      <mesh ref={dotRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[size, 16]} />
        <meshStandardMaterial 
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
        />
      </mesh>
      
      {/* Outer ring for visibility */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[size * 1.2, size * 1.4, 16]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={0.5}
        />
      </mesh>
      
      {/* Status indicator */}
      <mesh position={[size * 1.5, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 8]} />
        <meshBasicMaterial 
          color={
            agent.status === 'working' ? '#22c55e' :
            agent.status === 'traveling' ? '#fbbf24' :
            agent.status === 'sleeping' ? '#6366f1' :
            '#94a3b8'
          }
        />
      </mesh>
    </group>
  );
}

// Map labels for buildings
function MapLabels({ buildings }: { buildings: BuildingType[] }) {
  return (
    <>
      {buildings.map(building => (
        <Html
          key={`label-${building.id}`}
          position={[building.position.x, 0.5, building.position.z]}
          center
        >
          <div className="bg-black/80 text-white px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none border border-white/20">
            <span className="font-semibold">{building.name}</span>
            {building.isOccupied && (
              <span className="ml-1 text-green-400">●</span>
            )}
          </div>
        </Html>
      ))}
    </>
  );
}

// Map UI Overlay
function MapUI({ agents, timeOfDay }: { agents: Agent[]; timeOfDay: number }) {
  const isNight = timeOfDay < 6 || timeOfDay > 20;
  
  return (
    <>
      {/* Header */}
      <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm text-white p-4 rounded-lg border border-white/10">
        <h1 className="text-xl font-bold mb-1 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          🗺️ Strategic Map
        </h1>
        <p className="text-xs text-gray-400">Top-down view of Shalom's Realm</p>
        
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Time:</span>
            <span className="font-mono">{Math.floor(timeOfDay).toString().padStart(2, '0')}:{Math.floor((timeOfDay % 1) * 60).toString().padStart(2, '0')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Agents:</span>
            <span>{agents.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Mode:</span>
            <span className="text-cyan-400">Strategic View</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm text-white p-3 rounded-lg border border-white/10 text-xs">
        <h3 className="font-semibold mb-2 text-gray-300">Legend</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-indigo-500" />
            <span>Office</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-purple-500" />
            <span>Service</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-teal-500" />
            <span>Living</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 border-2 border-gray-400" />
            <span>Active Agent</span>
          </div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm text-white p-3 rounded-lg border border-white/10">
        <a 
          href="/village"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors text-sm font-medium"
        >
          <span>🏘️</span>
          <span>Switch to 3D View</span>
        </a>
        <div className="mt-2 text-xs text-gray-400 text-center">
          Experience the village
        </div>
      </div>

      {/* Agent List */}
      <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm text-white p-3 rounded-lg border border-white/10 max-h-[200px] overflow-y-auto">
        <h3 className="font-semibold mb-2 text-gray-300 text-xs uppercase">Active Agents</h3>
        <div className="space-y-1">
          {agents.slice(0, 6).map(agent => (
            <div key={agent.id} className="flex items-center gap-2 text-xs">
              <span className={
                agent.type === 'dragon' ? 'text-2xl' : agent.type === 'subagent' ? 'text-lg' : 'text-base'
              }>
                {agent.type === 'dragon' ? '🐉' : agent.type === 'subagent' ? '👤' : '🦎'}
              </span>
              <span className="flex-1">{agent.name}</span>
              <span className={`w-2 h-2 rounded-full ${
                agent.status === 'working' ? 'bg-green-500' :
                agent.status === 'traveling' ? 'bg-yellow-500' :
                agent.status === 'sleeping' ? 'bg-blue-500' :
                'bg-gray-500'
              }`} />
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute top-1/2 right-4 transform -translate-y-1/2 bg-black/50 backdrop-blur-sm text-white px-3 py-2 rounded text-xs text-gray-400">
        <p>🖱️ <b>Click</b> buildings to focus</p>
        <p>🖱️ <b>Pan</b> with right-click</p>
        <p>📜 <b>Scroll</b> to zoom</p>
      </div>
    </>
  );
}
