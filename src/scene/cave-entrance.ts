/**
 * The Warren - Kobold Cave Entrance
 * Agents spawn from here and return when idle
 * Located at edge of realm for "emerging from the depths" effect
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

export interface CaveData {
  entrance: THREE.Group;
  spawnPoint: THREE.Vector3;
  obstacles: THREE.Object3D[];
}

export function createCaveEntrance(scene: THREE.Scene): CaveData {
  const obstacles: THREE.Object3D[] = [];
  const caveGroup = new THREE.Group();
  caveGroup.name = "warren-cave";
  
  // Position: Bottom-right corner, slightly hidden
  const caveX = 40;
  const caveZ = 40;
  caveGroup.position.set(caveX, 0, caveZ);
  
  // === THE MOUND ===
  // Main cave mound - earth and stone
  const moundGeo = new THREE.SphereGeometry(8, 16, 12);
  const moundMat = new THREE.MeshStandardMaterial({
    color: 0x5c4a3d,
    roughness: 0.95,
    metalness: 0.0,
  });
  const mound = new THREE.Mesh(moundGeo, moundMat);
  mound.scale.set(1, 0.6, 0.8);
  mound.position.y = 1;
  caveGroup.add(mound);
  obstacles.push(mound);
  
  // === CAVE ENTRANCE ===
  // Dark tunnel opening
  const tunnelGeo = new THREE.CylinderGeometry(3, 3.5, 2, 16, 1, true);
  const tunnelMat = new THREE.MeshBasicMaterial({
    color: 0x1a0f0a,
    side: THREE.DoubleSide,
  });
  const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
  tunnel.position.set(0, 2, 5);
  tunnel.rotation.x = Math.PI * 0.15;
  caveGroup.add(tunnel);
  
  // Entrance glow - mysterious cave light
  const entranceLight = new THREE.PointLight(0x4ade80, 2, 15);
  entranceLight.position.set(0, 2, 6);
  caveGroup.add(entranceLight);
  
  // === ROCK DETAILS ===
  // Scattered rocks around entrance
  const rockPositions = [
    { x: -5, z: 6, s: 1.2 },
    { x: 4, z: 7, s: 0.9 },
    { x: -3, z: 8, s: 0.7 },
    { x: 6, z: 5, s: 1.0 },
    { x: -6, z: 3, s: 0.8 },
  ];
  
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a4a,
    roughness: 0.9,
  });
  
  rockPositions.forEach(pos => {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(pos.x, 0.5, pos.z);
    rock.scale.setScalar(pos.s);
    rock.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    caveGroup.add(rock);
    obstacles.push(rock);
  });
  
  // === BONE DECORATIONS ===
  // Kobold-style bone markers
  const boneGeo = new THREE.CylinderGeometry(0.1, 0.15, 2.5, 6);
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xe8dcc0,
    roughness: 0.6,
  });
  
  const leftBone = new THREE.Mesh(boneGeo, boneMat);
  leftBone.position.set(-3, 2, 7);
  leftBone.rotation.set(0.3, 0, -0.2);
  caveGroup.add(leftBone);
  
  const rightBone = new THREE.Mesh(boneGeo, boneMat);
  rightBone.position.set(3, 2.2, 7);
  rightBone.rotation.set(0.2, 0, 0.3);
  caveGroup.add(rightBone);
  
  // Skull-like decoration
  const skullGeo = new THREE.SphereGeometry(0.6, 12, 10);
  const skull = new THREE.Mesh(skullGeo, boneMat);
  skull.position.set(0, 3.5, 7);
  skull.scale.y = 0.8;
  caveGroup.add(skull);
  
  // === GLOWING MUSHROOMS ===
  // Bioluminescent cave mushrooms
  const mushroomPositions = [
    { x: -4, z: 5, c: 0x22c55e },
    { x: 3, z: 4, c: 0xa855f7 },
    { x: -2, z: 6, c: 0x3b82f6 },
  ];
  
  mushroomPositions.forEach(pos => {
    const stemGeo = new THREE.CylinderGeometry(0.1, 0.2, 0.8, 6);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x5c4a3d });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(pos.x, 0.4, pos.z);
    caveGroup.add(stem);
    
    const capGeo = new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const capMat = new THREE.MeshStandardMaterial({
      color: pos.c,
      emissive: pos.c,
      emissiveIntensity: 0.5,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(pos.x, 0.8, pos.z);
    caveGroup.add(cap);
    
    // Small light from mushroom
    const mushLight = new THREE.PointLight(pos.c, 0.8, 4);
    mushLight.position.set(pos.x, 1, pos.z);
    caveGroup.add(mushLight);
  });
  
  // === LABEL ===
  const labelDiv = document.createElement("div");
  labelDiv.className = "cave-label";
  labelDiv.textContent = "The Warrens (Cave Entrance)";
  labelDiv.style.cssText = `
    color: #4ade80;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    font-weight: bold;
    text-shadow: 0 0 10px #4ade80, 0 0 20px #4ade80;
    pointer-events: none;
    background: rgba(0,0,0,0.7);
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #4ade80;
  `;
  const label = new CSS2DObject(labelDiv);
  label.position.set(0, 6, 0);
  caveGroup.add(label);
  
  scene.add(caveGroup);
  
  // === SPAWN POINT ===
  // Where agents "emerge" from
  const spawnPoint = new THREE.Vector3(caveX, 0, caveZ + 6);
  
  return {
    entrance: caveGroup,
    spawnPoint,
    obstacles,
  };
}

// Idle positions inside/around the cave
export function getIdlePosition(index: number): { x: number; z: number } {
  // Scatter positions around and slightly inside the cave
  const positions = [
    { x: 42, z: 42 },  // Just outside entrance
    { x: 44, z: 40 },  // To the right
    { x: 38, z: 44 },  // To the left
    { x: 41, z: 38 },  // Further back
    { x: 45, z: 45 },  // Far corner
    { x: 40, z: 46 },  // Near entrance
  ];
  return positions[index % positions.length];
}
