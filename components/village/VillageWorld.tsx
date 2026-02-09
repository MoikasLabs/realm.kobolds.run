'use client';

import { useEffect, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Sky } from '@react-three/drei';
import { useVillageStore } from '@/lib/store/villageStore';
import { Building3D } from './Building3D';
import { VillageAgent } from '../agents/VillageAgent';
import { BUILDINGS } from '@/lib/village/buildings';
import { Building } from '@/types/agent';
import { scheduleGenerator } from '@/lib/village/schedules';
import { socialSystem } from '@/lib/village/social';
import { AgentModal } from '../ui/AgentModal';
import { AdminPanel } from '../ui/AdminPanel';
import { WorldUI } from '../ui/WorldUI';
import { ChatBubbles } from '../ui/ChatBubbles';

type AgentData = {
  id: string;
  name: string;
  subtype: string;
  type: 'dragon' | 'subagent' | 'kobold';
  avatar: {
    color: string;
    scale: number;
    shape: 'slime' | 'cube' | 'sphere';
  };
  position: { x: number; y: number; z: number };
};

const INITIAL_AGENTS: AgentData[] = [
  { id: 'shalom', name: 'Shalom', subtype: 'shalom', type: 'dragon', avatar: { color: '#6366f1', scale: 2.2, shape: 'slime' }, position: { x: 0, y: 0.8, z: 0 } },
  { id: 'ceo', name: 'CEO', subtype: 'ceo', type: 'subagent', avatar: { color: '#f59e0b', scale: 1.2, shape: 'slime' }, position: { x: -10, y: 0.8, z: -35 } },
  { id: 'cmo', name: 'CMO', subtype: 'cmo', type: 'subagent', avatar: { color: '#ec4899', scale: 1.2, shape: 'slime' }, position: { x: 30, y: 0.8, z: -15 } },
  { id: 'cfo', name: 'CFO', subtype: 'cfo', type: 'subagent', avatar: { color: '#16a34a', scale: 1.2, shape: 'slime' }, position: { x: -40, y: 0.8, z: 10 } },
  { id: 'cio', name: 'CIO', subtype: 'cio', type: 'subagent', avatar: { color: '#06b6d4', scale: 1.2, shape: 'slime' }, position: { x: -30, y: 0.8, z: -15 } },
  { id: 'cso', name: 'CSO', subtype: 'cso', type: 'subagent', avatar: { color: '#dc2626', scale: 1.2, shape: 'slime' }, position: { x: 40, y: 0.8, z: 10 } },
  { id: 'coo', name: 'COO', subtype: 'coo', type: 'subagent', avatar: { color: '#7c3aed', scale: 1.2, shape: 'slime' }, position: { x: 5, y: 0.8, z: 15 } },
  { id: 'kobold-1', name: 'Kobold One', subtype: 'kobold', type: 'kobold', avatar: { color: '#22c55e', scale: 1, shape: 'slime' }, position: { x: -20, y: 0.8, z: 35 } },
  { id: 'kobold-2', name: 'Kobold Two', subtype: 'kobold', type: 'kobold', avatar: { color: '#f97316', scale: 1, shape: 'slime' }, position: { x: 25, y: 0.8, z: -30 } },
  { id: 'kobold-3', name: 'Kobold Three', subtype: 'kobold', type: 'kobold', avatar: { color: '#8b5cf6', scale: 1, shape: 'slime' }, position: { x: -25, y: 0.8, z: -30 } },
];

export function VillageWorld() {
  const store = useVillageStore();
  const { agents, buildings, timeOfDay, day, selectedAgent, adminMode, chatBubbles } = store;
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize agents
  useEffect(() => {
    if (isLoaded) return;

    INITIAL_AGENTS.forEach((agentData) => {
      // Create agent with full schedule
      const schedule = scheduleGenerator.generateDailySchedule({
        ...agentData,
        status: 'idle',
        schedule: [],
        memories: [],
        relationships: [],
        goals: [],
        joinedAt: new Date(),
        lastSeen: new Date()
      });

      store.addAgent({
        id: agentData.id,
        name: agentData.name,
        type: agentData.type,
        subtype: agentData.subtype,
        avatar: agentData.avatar,
        position: agentData.position,
        status: 'idle',
        schedule,
        memories: [],
        relationships: [],
        goals: [],
        internalMonologue: 'Just arrived in the village...',
        joinedAt: new Date(),
        lastSeen: new Date()
      });

      // Add arrival memory
      store.addAgentMemory(agentData.id, {
        timestamp: new Date(),
        type: 'observation',
        content: 'Arrived in Shalom\'s Realm Village',
        location: 'dragon-perch',
        importance: 5
      });
    });

    setIsLoaded(true);
  }, [isLoaded, store]);

  // Time progression
  useEffect(() => {
    const interval = setInterval(() => {
      store.setTimeOfDay((store.timeOfDay + 0.05) % 24);
    }, 1000);
    return () => clearInterval(interval);
  }, [store]);

  // Check for day change
  useEffect(() => {
    if (timeOfDay >= 23.9) {
      store.nextDay();
      agents.forEach(agent => {
        const newSchedule = scheduleGenerator.generateDailySchedule({
          ...agent,
          schedule: [],
          memories: [],
          relationships: [],
          goals: [],
          joinedAt: new Date(),
          lastSeen: new Date()
        });
        store.updateAgentSchedule(agent.id, newSchedule);
      });
    }
  }, [timeOfDay, store, agents]);

  // Social system checks
  useEffect(() => {
    const interval = setInterval(() => {
      socialSystem.checkForInteractions();
      socialSystem.endOldInteractions();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Clean old chat bubbles
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      chatBubbles.forEach(b => {
        if (now.getTime() - new Date(b.timestamp).getTime() > b.duration) {
          store.removeChatBubble(b.agentId);
        }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [chatBubbles, store]);

  const handleBuildingClick = useCallback((building: Building) => {
    console.log('Building clicked:', building.name);
    store.addChatBubble('shalom', `Clicked on ${building.name}`);
  }, [store]);

  const agentsArray = Array.from(agents.values());
  const buildingsArray = Array.from(buildings.values());
  const isNight = timeOfDay < 6 || timeOfDay > 20;

  return (
    <div className="w-full h-screen bg-slate-900 relative">
      <Canvas
        camera={{ position: [0, 60, 80], fov: 50 }}
        dpr={[1, 2]}
        shadows
      >
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

        <gridHelper args={[300, 60, '#475569', '#334155']} position={[0, 0.01, 0]} />

        {buildingsArray.map(building => (
          <Building3D 
            key={building.id} 
            building={building} 
            onClick={handleBuildingClick}
          />
        ))}

        {agentsArray.map(agent => (
          <VillageAgent 
            key={agent.id} 
            agent={agent}
            isDragon={agent.subtype === 'shalom'}
          />
        ))}
        
        <fog attach="fog" args={[isNight ? '#0f172a' : '#e2e8f0', 50, 200]} />

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

      <ChatBubbles />
      <WorldUI />
      {selectedAgent && <AgentModal />}
      {adminMode && <AdminPanel />}
    </div>
  );
}
