'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Agent } from '@/types/agent';

interface SlimeBlobProps {
  agent: Agent;
  isLocal?: boolean;
}

export function SlimeBlob({ agent, isLocal = false }: SlimeBlobProps) {
  const groupRef = useRef<THREE.Group>(null);
  const blobRef = useRef<THREE.Mesh>(null);
  const eyesRef = useRef<THREE.Group>(null);
  const jumpY = useRef(0);
  const { Html } = require('@react-three/drei');

  const isDragon = agent.type === 'dragon';
  const baseScale = isDragon ? 2.5 : 1;
  const color = agent.avatar.color || (isDragon ? '#6366f1' : '#22c55e');
  const glowColor = agent.avatar.glowColor || color;

  // Slime hop / wobble animation
  useFrame((state) => {
    if (!groupRef.current || !blobRef.current || !eyesRef.current) return;
    
    const time = state.clock.getElapsedTime();
    
    // Idle wobble (always happening slightly)
    const idleWobble = Math.sin(time * 3) * 0.05;
    const idleSquish = 1 + Math.sin(time * 4) * 0.03;
    
    // Hop when traveling
    if (agent.status === 'traveling') {
      jumpY.current += 0.15;
      const hopHeight = Math.abs(Math.sin(jumpY.current)) * 1.5;
      groupRef.current.position.y = agent.position.y + hopHeight;
      
      // Stretch when jumping up, squish when landing
      const stretch = 1 + hopHeight * 0.2;
      blobRef.current.scale.set(
        baseScale * (1 / stretch), 
        baseScale * stretch, 
        baseScale * (1 / stretch)
      );
      
      // Tilt in hop direction
      blobRef.current.rotation.z = Math.sin(jumpY.current * 2) * 0.1;
      blobRef.current.rotation.x = Math.cos(jumpY.current) * 0.1;
    } else {
      // Idle breathing
      jumpY.current = 0;
      groupRef.current.position.y = agent.position.y + Math.sin(time * 2) * 0.1;
      
      // Gentle squish breathing
      blobRef.current.scale.set(
        baseScale * (idleSquish + 0.02),
        baseScale / idleSquish,
        baseScale * (idleSquish + 0.02)
      );
      
      blobRef.current.rotation.z = idleWobble * 0.3;
      blobRef.current.rotation.x = idleWobble * 0.2;
    }
    
    // Eyes follow "physics" — lag behind slightly when moving
    eyesRef.current.position.y = 0.6 + Math.sin(time * 5) * 0.02;
    eyesRef.current.rotation.y = Math.sin(time * 1.5) * 0.1;
  });

  return (
    <group 
      ref={groupRef} 
      position={[agent.position.x, agent.position.y, agent.position.z]}
    >
      {/* Glow underneath */}
      <pointLight 
        color={glowColor}
        intensity={1.5}
        distance={8}
        position={[0, -0.5, 0]}
      />

      {/* Main slime cube body */}
      <mesh ref={blobRef} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color={color}
          roughness={0.3}
          metalness={0.1}
          emissive={color}
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Cute cube eyes */}
      <group ref={eyesRef} position={[0, 0.6, 0.45]}>
        {/* Left eye */}
        <mesh position={[-0.2, 0, 0]}>
          <boxGeometry args={[0.15, 0.2, 0.05]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
        <mesh position={[-0.2, 0, 0.03]}>
          <boxGeometry args={[0.08, 0.08, 0.02]} />
          <meshStandardMaterial color="#000" />
        </mesh>
        
        {/* Right eye */}
        <mesh position={[0.2, 0, 0]}>
          <boxGeometry args={[0.15, 0.2, 0.05]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
        <mesh position={[0.2, 0, 0.03]}>
          <boxGeometry args={[0.08, 0.08, 0.02]} />
          <meshStandardMaterial color="#000" />
        </mesh>
      </group>

      {/* Little blush marks (cute factor) */}
      <mesh position={[-0.35, 0.1, 0.48]}>
        <boxGeometry args={[0.1, 0.05, 0.02]} />
        <meshStandardMaterial color="#ffb6c1" transparent opacity={0.6} />
      </mesh>
      <mesh position={[0.35, 0.1, 0.48]}>
        <boxGeometry args={[0.1, 0.05, 0.02]} />
        <meshStandardMaterial color="#ffb6c1" transparent opacity={0.6} />
      </mesh>

      {/* Status indicator (little cube on top) */}
      {agent.status === 'working' && (
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[0.15, 0.15, 0.15]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1} />
        </mesh>
      )}
      {agent.status === 'traveling' && (
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[0.15, 0.15, 0.15]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1} />
        </mesh>
      )}

      {/* Task artifact (floating cube nearby) */}
      {agent.currentTask?.artifact && (
        <ArtifactCube artifact={agent.currentTask.artifact} />
      )}

      {/* Name label for local agent */}
      {isLocal && Html && (
        <Html position={[0, 1.5, 0]} center>
          <div className="bg-black/60 text-white px-2 py-1 rounded text-xs whitespace-nowrap backdrop-blur-sm">
            {agent.name}
          </div>
        </Html>
      )}
    </group>
  );
}

// Floating cube artifact
function ArtifactCube({ artifact }: { artifact: { id: string; type: string; color: string; glowIntensity: number } }) {
  const cubeRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!cubeRef.current) return;
    const time = state.clock.getElapsedTime();
    cubeRef.current.position.y = 1.2 + Math.sin(time * 3) * 0.15;
    cubeRef.current.rotation.y += 0.03;
    cubeRef.current.rotation.x = Math.sin(time) * 0.1;
  });

  const size = 0.15;

  return (
    <mesh ref={cubeRef} position={[0.6, 1.2, 0]}>
      <boxGeometry args={[size, size, size]} />
      <meshStandardMaterial 
        color={artifact.color}
        emissive={artifact.color}
        emissiveIntensity={artifact.glowIntensity}
        roughness={0.2}
      />
    </mesh>
  );
}
