'use client';

import { useEffect, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from '@/lib/world/store';
import { SlimeBlob } from '@/components/agents/SlimeBlob';
import { Building } from './Building';
import { VILLAGE_BUILDINGS, Building as BuildingType, getRandomEntrancePosition } from '@/lib/village/buildings';
import { Agent } from '@/types/agent';
import { pathfinder } from '@/lib/village/pathfinding';

export function VillageWorld() {
  const { agents, islands, timeOfDay } = useWorldStore();
  const [isLoaded, setIsLoaded] = useState(false);
  const [buildings, setBuildings] = useState<BuildingType[]>(VILLAGE_BUILDINGS.map(b => ({...b, isOccupied: false, occupants: []})));
  const [hoveredBuilding, setHoveredBuilding] = useState<string | null>(null);

  // Track building occupancy
  useEffect(() => {
    const interval = setInterval(() => {
      setBuildings(prevBuildings => {
        return prevBuildings.map(building => {
          const occupants: string[] = [];
          let isOccupied = false;
          
          agents.forEach((agent, agentId) => {
            const dist = pathfinder.distanceXZ(
              agent.position,
              building.position
            );
            const threshold = Math.max(building.size.width, building.size.depth) / 2 + 5;
            
            if (dist < threshold) {
              occupants.push(agentId);
              isOccupied = true;
            }
          });
          
          return { ...building, isOccupied, occupants };
        });
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [agents]);

  const handleBuildingClick = useCallback((building: BuildingType) => {
    console.log('Building clicked:', building.name, 'Occupants:', building.occupants);
    setHoveredBuilding(building.id);
    setTimeout(() => setHoveredBuilding(null), 3000);
  }, []);

  const agentsArray = Array.from(agents.values());
  const isNight = timeOfDay < 6 || timeOfDay > 20;

  return (
    <div className="w-full h-screen bg-slate-900 relative">
      <Canvas
        camera={{ position: [0, 60, 80], fov: 50 }}
        dpr={[1, 2]}
        shadows
      >
        {/* Lighting */}
        <ambientLight intensity={isNight ? 0.15 : 0.4} />
        <directionalLight
          position={[50, 50, 20]}
          intensity={isNight ? 0.2 : 1}
          color={isNight ? '#6366f1' : '#fff'}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        
        {isNight && (
          <pointLight position={[0, 30, 0]} intensity={0.3} color="#6366f1" distance={150} />
        )}

        {/* Sky */}
        {isNight ? (
          <Stars radius={100} depth={50} count={5000} factor={4} fade speed={0.5} />
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

        {/* Ground Plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[300, 300]} />
          <meshStandardMaterial 
            color="#1e293b"
            roughness={0.8}
            metalness={0.2}
            emissive="#3b82f6"
            emissiveIntensity={isNight ? 0.08 : 0.03}
          />
        </mesh>

        {/* Grid */}
        <gridHelper args={[300, 60, '#475569', '#334155']} position={[0, 0.01, 0]} />

        {/* Buildings */}
        {buildings.map(building => (
          <Building 
            key={building.id}
            building={building}
            onClick={handleBuildingClick}
            showLabel={hoveredBuilding === building.id || building.isOccupied}
          />
        ))}

        {/* Paths visualization (subtle ground lines between buildings) */}
        <PathsBetweenBuildings buildings={buildings} />

        {/* Agents using existing SlimeBlob */}
        {agentsArray.map((agent) => (
          <SlimeBlob key={agent.id} agent={agent} isLocal={agent.type === 'dragon'} />
        ))}
        
        {/* Fog */}
        <fog attach="fog" args={[isNight ? '#0f172a' : '#e2e8f0', 50, 200]} />

        {/* Controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={20}
          maxDistance={150}
          target={[0, 0, 0]}
          maxPolarAngle={Math.PI / 2 - 0.1}
        />
      </Canvas>

      {/* UI Overlay */}
      <VillageUI agents={agentsArray} buildings={buildings} timeOfDay={timeOfDay} />
    </div>
  );
}

// Visual paths between buildings (shows where agents can walk)
function PathsBetweenBuildings({ buildings }: { buildings: BuildingType[] }) {
  const lines: JSX.Element[] = [];
  
  // Connect each building to its 2 nearest neighbors
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
      
      lines.push(
        <mesh 
          key={`path-${building.id}-${neighbor.building.id}`}
          position={[midX, 0.02, midZ]}
          rotation={[0, Math.atan2(
            neighbor.building.position.z - building.position.z,
            neighbor.building.position.x - building.position.x
          ), 0]}
        >
          <planeGeometry args={[neighbor.dist, 0.5]} />
          <meshBasicMaterial 
            color="#475569" 
            transparent 
            opacity={0.3}
          />
        </mesh>
      );
    }
  }
  
  return <>{lines}</>;
}

// UI overlay for village
function VillageUI({ agents, buildings, timeOfDay }: { 
  agents: Agent[]; 
  buildings: BuildingType[]; 
  timeOfDay: number;
}) {
  const isNight = timeOfDay < 6 || timeOfDay > 20;
  const occupiedCount = buildings.filter(b => b.isOccupied).length;
  
  return (
    <>
      {/* Header */}
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white p-4 rounded-lg border border-white/10">
        <h1 className="text-xl font-bold mb-1 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          🏘️ Realm Village
        </h1>
        <p className="text-xs text-gray-400 mb-3">Phase 1: Building System</p>
        
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Time:</span>
            <span className="font-mono">{Math.floor(timeOfDay).toString().padStart(2, '0')}:{Math.floor((timeOfDay % 1) * 60).toString().padStart(2, '0')}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Agents:</span>
            <span>{agents.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Buildings:</span>
            <span>{buildings.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Occupied:</span>
            <span className={occupiedCount > 0 ? "text-green-400" : "text-gray-400"}>
              {occupiedCount}
            </span>
          </div>
        </div>
      </div>

      {/* View Toggle - Switch to Map */}
      <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white p-3 rounded-lg border border-white/10">
        <a 
          href="/world"
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors text-sm font-medium"
        >
          <span>🗺️</span>
          <span>Strategic Map</span>
        </a>
        <div className="mt-2 text-xs text-gray-400 text-center">
          Top-down view
        </div>
      </div>

      {/* Building List */}
      <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm text-white p-4 rounded-lg border border-white/10 max-w-sm max-h-[30vh] overflow-y-auto">
        <h2 className="text-sm font-semibold mb-3 text-gray-300">
          🏗️ Buildings ({occupiedCount} active)
        </h2>
        <div className="space-y-1.5">
          {buildings.map(b => (
            <div key={b.id} className="flex items-center gap-2 text-xs">
              <span 
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: b.color }}
              />
              <span className="flex-1 truncate">{b.name}</span>
              {b.isOccupied && (
                <span className="text-green-400 flex items-center gap-1">
                  ● {b.occupants.length}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-sm text-white p-3 rounded-lg border border-white/10 text-xs text-gray-400">
        <p>🖱️ <b>Click</b> buildings to see details</p>
        <p>🖱️ <b>Drag</b> to rotate camera</p>
        <p>📜 <b>Scroll</b> to zoom</p>
        <p className="mt-1 text-indigo-400">🏘️ 3D immersive experience</p>
      </div>
    </>
  );
}
