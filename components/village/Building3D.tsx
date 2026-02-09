'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Building } from '@/types/agent';

interface Building3DProps {
  building: Building;
  onClick?: (building: Building) => void;
}

export function Building3D({ building, onClick }: Building3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const pulseRef = useRef(0);

  const { width, depth, height } = building.size;
  const color = building.color;
  const glowColor = building.glowColor || color;

  // Animation
  useFrame((state) => {
    if (!groupRef.current || !glowRef.current) return;
    
    const time = state.clock.getElapsedTime();
    
    if (building.isOccupied) {
      // Pulsing glow when occupied
      pulseRef.current += 0.02;
      const pulse = 1 + Math.sin(pulseRef.current) * 0.15;
      glowRef.current.intensity = 2 * pulse;
      
      // Subtle float
      groupRef.current.position.y = building.position.y + Math.sin(time * 2) * 0.1;
    } else {
      // Gentle idle glow
      const idlePulse = 1 + Math.sin(time * 0.5) * 0.05;
      glowRef.current.intensity = 0.5 * idlePulse;
      groupRef.current.position.y = building.position.y;
    }
  });

  const handleClick = () => {
    if (onClick) onClick(building);
  };

  return (
    <group 
      ref={groupRef}
      position={[building.position.x, building.position.y, building.position.z]}
      onClick={handleClick}
    >
      {/* Main building body - low poly box */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial 
          color={color}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>

      {/* Roof */}
      <mesh position={[0, height + 1, 0]}>
        <boxGeometry args={[width + 1, 2, depth + 1]} />
        <meshStandardMaterial 
          color={new THREE.Color(color).multiplyScalar(0.8)}
          roughness={0.6}
        />
      </mesh>

      {/* Glow light */}
      <pointLight 
        ref={glowRef}
        color={glowColor}
        intensity={building.isOccupied ? 2 : 0.5}
        distance={width * 2}
        position={[0, height / 2, 0]}
        castShadow
      />

      {/* Windows - glowing squares */}
      {useMemo(() => {
        const windows = [];
        const levels = Math.max(1, Math.floor(height / 3));
        const windowsPerSide = Math.max(2, Math.floor(width / 5));
        
        for (let level = 0; level < levels; level++) {
          for (let i = 0; i < windowsPerSide; i++) {
            const offset = (i - (windowsPerSide - 1) / 2) * 3;
            const y = 2 + level * 3;
            
            // Front
            windows.push(
              <mesh key={`front-${level}-${i}`} position={[offset, y, depth / 2 + 0.1]}>
                <planeGeometry args={[1.5, 1.5]} />
                <meshStandardMaterial 
                  color={building.isOccupied ? '#fff' : '#334155'}
                  emissive={glowColor}
                  emissiveIntensity={building.isOccupied ? 1.5 : 0.2}
                />
              </mesh>
            );
            
            // Back
            windows.push(
              <mesh key={`back-${level}-${i}`} position={[offset, y, -depth / 2 - 0.1]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[1.5, 1.5]} />
                <meshStandardMaterial 
                  color={building.isOccupied ? '#fff' : '#334155'}
                  emissive={glowColor}
                  emissiveIntensity={building.isOccupied ? 1.5 : 0.2}
                />
              </mesh>
            );
          }
          
          for (let i = 0; i < Math.max(2, Math.floor(depth / 5)); i++) {
            const offset = (i - (Math.floor(depth / 5) - 1) / 2) * 3;
            const y = 2 + level * 3;
            
            // Left
            windows.push(
              <mesh key={`left-${level}-${i}`} position={[-width / 2 - 0.1, y, offset]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[1.5, 1.5]} />
                <meshStandardMaterial 
                  color={building.isOccupied ? '#fff' : '#334155'}
                  emissive={glowColor}
                  emissiveIntensity={building.isOccupied ? 1.5 : 0.2}
                />
              </mesh>
            );
            
            // Right
            windows.push(
              <mesh key={`right-${level}-${i}`} position={[width / 2 + 0.1, y, offset]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[1.5, 1.5]} />
                <meshStandardMaterial 
                  color={building.isOccupied ? '#fff' : '#334155'}
                  emissive={glowColor}
                  emissiveIntensity={building.isOccupied ? 1.5 : 0.2}
                />
              </mesh>
            );
          }
        }
        
        return windows;
      }, [width, depth, height, building.isOccupied, glowColor])}

      {/* Door */}
      <mesh position={[0, 1.5, depth / 2 + 0.05]}>
        <planeGeometry args={[3, 3]} />
        <meshStandardMaterial 
          color="#1e293b"
          roughness={0.3}
        />
      </mesh>

      {/* Occupancy indicator */}
      {building.isOccupied && (
        <mesh position={[0, height + 3, 0]}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshStandardMaterial 
            color="#22c55e"
            emissive="#22c55e"
            emissiveIntensity={2}
          />
        </mesh>
      )}
    </group>
  );
}
