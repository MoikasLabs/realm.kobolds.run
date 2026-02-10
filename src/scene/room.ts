import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { createJobZoneBuildings } from "./job-buildings.js";
import { createVisualWorkstations } from "./workstations-visual.js";

export interface TorchData {
  light: THREE.PointLight;
  flame: THREE.Mesh;
  baseIntensity: number;
  offset: number;
}

export interface CrystalData {
  light: THREE.SpotLight;
  crystal: THREE.Group;
  particles: THREE.Points;
  baseIntensity: number;
  offset: number;
  zone: string;
}

export function createScene() {
  // ── Renderer ───────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.getElementById("app")!.appendChild(renderer.domElement);

  // ── CSS2D label renderer ───────────────────────────────────
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.left = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  document.getElementById("app")!.appendChild(labelRenderer.domElement);

  // ── Scene ──────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e); // Dark cavern background
  scene.fog = new THREE.FogExp2(0x1a1a2e, 0.008);

  // ── Camera ─────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(25, 20, 25);
  camera.lookAt(0, 0, 0);

  // ── Controls ───────────────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.5;
  controls.minDistance = 8;
  controls.maxDistance = 70;
  controls.target.set(0, 0, 0);

  // ── Clock ──────────────────────────────────────────────────
  const clock = new THREE.Clock();

  // ── Dark cavern floor with stone texture ───────────────────
  const floorCanvas = document.createElement("canvas");
  floorCanvas.width = 512;
  floorCanvas.height = 512;
  const ctx = floorCanvas.getContext("2d")!;

  // Dark stone gradient
  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 360);
  gradient.addColorStop(0, "#3d3d5c");  // lighter center
  gradient.addColorStop(0.5, "#2d2d4a");
  gradient.addColorStop(1, "#1e1e30");  // darker edge
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Add stone cracks pattern
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 15; i++) {
    const startX = Math.random() * 512;
    const startY = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let j = 0; j < 5; j++) {
      ctx.lineTo(
        startX + (Math.random() - 0.5) * 100,
        startY + (Math.random() - 0.5) * 100
      );
    }
    ctx.stroke();
  }

  const floorTexture = new THREE.CanvasTexture(floorCanvas);
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(6, 6);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.9,
      metalness: 0.1,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── Cavern walls (rocky texture) ────────────────────────────
  const wallCanvas = document.createElement("canvas");
  wallCanvas.width = 256;
  wallCanvas.height = 256;
  const wallCtx = wallCanvas.getContext("2d")!;

  // Wall base color
  wallCtx.fillStyle = "#2a2a40";
  wallCtx.fillRect(0, 0, 256, 256);

  // Add rock texture noise
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const size = 2 + Math.random() * 6;
    wallCtx.fillStyle = Math.random() > 0.5 
      ? "rgba(40, 40, 60, 0.5)" 
      : "rgba(20, 20, 30, 0.5)";
    wallCtx.beginPath();
    wallCtx.arc(x, y, size, 0, Math.PI * 2);
    wallCtx.fill();
  }

  const wallTexture = new THREE.CanvasTexture(wallCanvas);
  wallTexture.wrapS = THREE.RepeatWrapping;
  wallTexture.wrapT = THREE.RepeatWrapping;
  wallTexture.repeat.set(4, 2);

  const wallMaterial = new THREE.MeshStandardMaterial({
    map: wallTexture,
    roughness: 0.95,
    metalness: 0.05,
  });

  const wallHeight = 30;
  const wallPositions: [number, number, number, number][] = [
    [0, wallHeight / 2, -60, 0],         // back
    [0, wallHeight / 2, 60, Math.PI],     // front
    [-60, wallHeight / 2, 0, Math.PI / 2], // left
    [60, wallHeight / 2, 0, -Math.PI / 2], // right
  ];

  for (const [x, y, z, ry] of wallPositions) {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(120, wallHeight),
      wallMaterial
    );
    wall.position.set(x, y, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    scene.add(wall);
  }

  // ── Torch Management Arrays ────────────────────────────────
  const torches: TorchData[] = [];
  const crystals: CrystalData[] = [];

  // ── Enhanced Wall Torches ──────────────────────────────────
  const torchConfigs = [
    // Back wall
    { pos: [-35, 12, -59.5], side: "back" as const },
    { pos: [-18, 8, -59.5], side: "back" as const },
    { pos: [0, 15, -59.5], side: "back" as const, large: true },
    { pos: [18, 8, -59.5], side: "back" as const },
    { pos: [35, 12, -59.5], side: "back" as const },
    // Front wall
    { pos: [-35, 12, 59.5], side: "front" as const },
    { pos: [-18, 8, 59.5], side: "front" as const },
    { pos: [0, 15, 59.5], side: "front" as const, large: true },
    { pos: [18, 8, 59.5], side: "front" as const },
    { pos: [35, 12, 59.5], side: "front" as const },
    // Left wall
    { pos: [-59.5, 10, -35], side: "left" as const },
    { pos: [-59.5, 6, -15], side: "left" as const },
    { pos: [-59.5, 14, 0], side: "left" as const, large: true },
    { pos: [-59.5, 6, 15], side: "left" as const },
    { pos: [-59.5, 10, 35], side: "left" as const },
    // Right wall
    { pos: [59.5, 10, -35], side: "right" as const },
    { pos: [59.5, 6, -15], side: "right" as const },
    { pos: [59.5, 14, 0], side: "right" as const, large: true },
    { pos: [59.5, 6, 15], side: "right" as const },
    { pos: [59.5, 10, 35], side: "right" as const },
  ];

  // Create torch geometry (reusable)
  const torchHandleGeo = new THREE.CylinderGeometry(0.15, 0.18, 1.8, 8);
  const torchIronMat = new THREE.MeshStandardMaterial({ 
    color: 0x4a4a4a, 
    roughness: 0.7,
    metalness: 0.6 
  });
  const torchWoodMat = new THREE.MeshStandardMaterial({ 
    color: 0x5c4033, 
    roughness: 1,
    metalness: 0
  });

  // Flame geometries
  const flameGeoSmall = new THREE.ConeGeometry(0.25, 0.7, 6);
  const flameGeoLarge = new THREE.ConeGeometry(0.4, 1.0, 8);
  
  torchConfigs.forEach((config, index) => {
    const { pos, large } = config;
    const [x, y, z] = pos;
    
    // Wall orientation adjustment
    const isBack = config.side === "back";
    const isFront = config.side === "front";
    const isLeft = config.side === "left";
    const isRight = config.side === "right";
    
    // Create torch bracket
    const bracketGeo = new THREE.BoxGeometry(0.4, 0.1, 0.8);
    const bracket = new THREE.Mesh(bracketGeo, torchIronMat);
    bracket.position.set(x, y - 0.5, z);
    
    // Rotate bracket based on wall
    if (isLeft) bracket.rotation.y = Math.PI / 2;
    if (isRight) bracket.rotation.y = -Math.PI / 2;
    if (isBack) bracket.rotation.y = 0;
    if (isFront) bracket.rotation.y = Math.PI;
    
    scene.add(bracket);
    
    // Torch handle
    const handle = new THREE.Mesh(torchHandleGeo, torchWoodMat);
    handle.position.set(x, y - 0.8, z);
    
    // Slight tilt outward from wall
    if (isBack) handle.rotation.x = 0.1;
    if (isFront) handle.rotation.x = -0.1;
    if (isLeft) handle.rotation.z = -0.1;
    if (isRight) handle.rotation.z = 0.1;
    
    scene.add(handle);
    
    // Metal holder ring
    const ringGeo = new THREE.TorusGeometry(0.2, 0.05, 6, 12);
    const ring = new THREE.Mesh(ringGeo, torchIronMat);
    ring.position.set(x, y + 0.1, z);
    ring.rotation.x = Math.PI / 2;
    if (isLeft) ring.rotation.x = 0;
    if (isRight) ring.rotation.x = 0;
    scene.add(ring);
    
    // Flame mesh with emissive material
    const flameGeo = large ? flameGeoLarge : flameGeoSmall;
    const flameMat = new THREE.MeshBasicMaterial({ 
      color: 0xff6611,
      transparent: true,
      opacity: 0.9
    });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(x, y + 0.4, z + (isBack ? 0.2 : isFront ? -0.2 : isLeft ? 0.2 : -0.2));
    scene.add(flame);
    
    // Inner core (hotter, brighter)
    const coreGeo = new THREE.ConeGeometry(
      large ? 0.15 : 0.1, 
      large ? 0.5 : 0.35, 
      6
    );
    const coreMat = new THREE.MeshBasicMaterial({ 
      color: 0xffcc33,
      transparent: true,
      opacity: 0.8
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(x, y + 0.35, z + (isBack ? 0.25 : isFront ? -0.25 : isLeft ? 0.25 : -0.25));
    scene.add(core);
    
    // Glow halo
    const glowGeo = new THREE.SphereGeometry(large ? 0.8 : 0.5, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff6611,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(x, y + 0.3, z);
    scene.add(glow);
    
    // Warm torch point light with shadow casting
    const baseIntensity = large ? 3.5 : 2.2;
    const lightRadius = large ? 35 : 22;
    const torchLight = new THREE.PointLight(0xff9944, baseIntensity, lightRadius);
    torchLight.position.set(x, y + 0.5, z);
    torchLight.castShadow = true;
    torchLight.shadow.mapSize.width = 1024;
    torchLight.shadow.mapSize.height = 1024;
    torchLight.shadow.bias = -0.001;
    torchLight.shadow.camera.near = 0.1;
    torchLight.shadow.camera.far = 40;
    scene.add(torchLight);
    
    // Store for animation
    torches.push({
      light: torchLight,
      flame: flame,
      baseIntensity,
      offset: index * 0.7
    });
  });

  // ── Ambient & Hemispheric Light ───────────────────────────
  // Brighter ambient light to illuminate the scene
  const ambientLight = new THREE.AmbientLight(0x8b92a0, 1.2);
  scene.add(ambientLight);
  
  // Hemisphere light for subtle ground/sky differentiation
  const hemiLight = new THREE.HemisphereLight(0xaabbdd, 0x3d3d5c, 1.0);
  hemiLight.position.set(0, 50, 0);
  scene.add(hemiLight);

  // ── Enhanced Crystal Formations with Light Beams ───────────
  
  // Zone configuration
  const zoneColors = {
    Forge: { color: 0xff8822, secondary: 0xffaa44, intensity: 3.5 },
    Spire: { color: 0x8844ff, secondary: 0xaa66ff, intensity: 3.0 },
    Warrens: { color: 0x44ff88, secondary: 0x66ffaa, intensity: 3.0 },
    General: { color: 0x4488ff, secondary: 0x66aaff, intensity: 2.5 }
  };

  // SHARED CRYSTAL MATERIALS BY ZONE - Prevents WebGL texture limit errors
  const crystalMaterials = {
    Forge: new THREE.MeshStandardMaterial({
      color: zoneColors.Forge.color,
      roughness: 0.1,
      metalness: 0.7,
      emissive: zoneColors.Forge.color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    }),
    Spire: new THREE.MeshStandardMaterial({
      color: zoneColors.Spire.color,
      roughness: 0.1,
      metalness: 0.7,
      emissive: zoneColors.Spire.color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    }),
    Warrens: new THREE.MeshStandardMaterial({
      color: zoneColors.Warrens.color,
      roughness: 0.1,
      metalness: 0.7,
      emissive: zoneColors.Warrens.color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    }),
    General: new THREE.MeshStandardMaterial({
      color: zoneColors.General.color,
      roughness: 0.1,
      metalness: 0.7,
      emissive: zoneColors.General.color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    })
  };

  const secondaryMaterials = {
    Forge: new THREE.MeshStandardMaterial({
      color: zoneColors.Forge.secondary,
      roughness: 0.15,
      metalness: 0.6,
      emissive: zoneColors.Forge.secondary,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.85
    }),
    Spire: new THREE.MeshStandardMaterial({
      color: zoneColors.Spire.secondary,
      roughness: 0.15,
      metalness: 0.6,
      emissive: zoneColors.Spire.secondary,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.85
    }),
    Warrens: new THREE.MeshStandardMaterial({
      color: zoneColors.Warrens.secondary,
      roughness: 0.15,
      metalness: 0.6,
      emissive: zoneColors.Warrens.secondary,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.85
    }),
    General: new THREE.MeshStandardMaterial({
      color: zoneColors.General.secondary,
      roughness: 0.15,
      metalness: 0.6,
      emissive: zoneColors.General.secondary,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.85
    })
  };

  // Shared ring material
  const sharedRingMat = new THREE.MeshStandardMaterial({ 
    color: 0x888888, 
    roughness: 0.4,
    metalness: 0.8
  });

  // Shared geometries
  const mainCrystalGeo = new THREE.ConeGeometry(0.4, 3, 6);
  const secCrystalGeo = new THREE.ConeGeometry(0.2, 1.5, 5);
  const ringGeo = new THREE.TorusGeometry(0.15, 0.03, 8, 16);
  
  const crystalFormations = [
    // Forge zone crystals (orange/red)
    { pos: [-30, 28, -30], zone: "Forge" as const, size: "large" as const },
    { pos: [-25, 26, -35], zone: "Forge" as const, size: "medium" as const },
    // Spire zone crystals (purple)
    { pos: [0, 28, -35], zone: "Spire" as const, size: "large" as const, central: true },
    { pos: [5, 25, -30], zone: "Spire" as const, size: "medium" as const },
    // Warrens zone crystals (green)
    { pos: [30, 28, -30], zone: "Warrens" as const, size: "large" as const },
    { pos: [35, 25, -35], zone: "Warrens" as const, size: "medium" as const },
    // Additional atmospheric crystals
    { pos: [-40, 26, 0], zone: "General" as const, size: "medium" as const },
    { pos: [40, 26, 0], zone: "General" as const, size: "medium" as const },
    { pos: [0, 28, 35], zone: "Spire" as const, size: "large" as const },
    { pos: [-20, 24, 40], zone: "General" as const, size: "small" as const },
    { pos: [20, 24, 40], zone: "General" as const, size: "small" as const },
  ];
  
  crystalFormations.forEach((config, index) => {
    const { pos, zone, size, central } = config;
    const [x, y, z] = pos;
    const zoneColor = zoneColors[zone];
    
    // Create crystal cluster
    const crystalGroup = new THREE.Group();
    crystalGroup.position.set(x, y, z);
    
    // Scale based on size
    const scale = size === "large" ? 1.5 : size === "medium" ? 1.0 : 0.6;
    
    // Main crystal - use shared material by zone
    const mainCrystal = new THREE.Mesh(mainCrystalGeo, crystalMaterials[zone]);
    mainCrystal.scale.set(scale, scale, scale);
    mainCrystal.rotation.x = Math.PI;
    mainCrystal.position.y = -0.5 * scale;
    mainCrystal.castShadow = true;
    crystalGroup.add(mainCrystal);
    
    // Secondary crystals - use shared secondary material
    const numSecondaries = size === "large" ? 3 : size === "medium" ? 2 : 1;
    for (let i = 0; i < numSecondaries; i++) {
      const secCrystal = new THREE.Mesh(secCrystalGeo, secondaryMaterials[zone]);
      secCrystal.scale.set(scale, scale, scale);
      
      const angle = (i / numSecondaries) * Math.PI * 2 + (index * 0.5);
      const radius = 0.3 * scale;
      secCrystal.position.set(
        Math.cos(angle) * radius,
        -0.3 * scale,
        Math.sin(angle) * radius
      );
      secCrystal.rotation.x = Math.PI;
      secCrystal.rotation.z = (Math.random() - 0.5) * 0.3;
      secCrystal.castShadow = true;
      crystalGroup.add(secCrystal);
    }
    
    // Ring - shared material
    const ring = new THREE.Mesh(ringGeo, sharedRingMat);
    ring.scale.set(scale, scale, scale);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.5 * scale;
    crystalGroup.add(ring);
    
    scene.add(crystalGroup);
    
    // Spotlight beaming down
    const spotIntensity = zoneColor.intensity * (central ? 1.5 : 1.0);
    const spotLight = new THREE.SpotLight(zoneColor.color, spotIntensity);
    spotLight.position.set(x, y - 0.5, z);
    spotLight.angle = central ? Math.PI / 5 : Math.PI / 6;
    spotLight.penumbra = 0.4;
    spotLight.decay = 1.5;
    spotLight.distance = 50;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.bias = -0.0001;
    spotLight.shadow.camera.near = 0.5;
    spotLight.shadow.camera.far = 50;
    spotLight.target.position.set(x, 0, z);
    scene.add(spotLight);
    scene.add(spotLight.target);
    
    // Glow sphere inside crystal
    const glowGeo = new THREE.SphereGeometry(0.35 * scale, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: zoneColor.color,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, -0.5 * scale, 0);
    crystalGroup.add(glow);
    
    // Floating particles for large crystals
    let particles: THREE.Points | null = null;
    if (size === "large") {
      const particleCount = 30;
      const particleGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);
      
      const colorObj = new THREE.Color(zoneColor.color);
      
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 3 * scale;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 2 * scale;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 3 * scale;
        
        colors[i * 3] = colorObj.r;
        colors[i * 3 + 1] = colorObj.g;
        colors[i * 3 + 2] = colorObj.b;
      }
      
      particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      
      const particleMat = new THREE.PointsMaterial({
        size: 0.15 * scale,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending
      });
      
      particles = new THREE.Points(particleGeo, particleMat);
      crystalGroup.add(particles);
    }
    
    // Store for animation
    crystals.push({
      light: spotLight,
      crystal: crystalGroup,
      particles,
      baseIntensity: spotIntensity,
      offset: index * 1.2,
      zone
    });
  });

  // ── Zone Beacons (ground level) ───────────────────────────
  function createZoneBeacon(x: number, z: number, color: number, name: string): void {
    // Base platform
    const baseGeo = new THREE.CylinderGeometry(2, 2.5, 0.5, 8);
    const base = new THREE.Mesh(
      baseGeo,
      new THREE.MeshStandardMaterial({ color: 0x3d3d5c, roughness: 0.9 })
    );
    base.position.set(x, 0.25, z);
    base.receiveShadow = true;
    scene.add(base);

    // Crystal pillar
    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
    const pillar = new THREE.Mesh(
      pillarGeo,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.8,
        emissive: color,
        emissiveIntensity: 0.3,
      })
    );
    pillar.position.set(x, 2.25, z);
    pillar.castShadow = true;
    scene.add(pillar);

    // Glowing orb on top
    const orbGeo = new THREE.SphereGeometry(0.4, 16, 12);
    const orb = new THREE.Mesh(
      orbGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
      })
    );
    orb.position.set(x, 4.5, z);
    scene.add(orb);

    // Point light
    const light = new THREE.PointLight(color, 1.5, 15);
    light.position.set(x, 4, z);
    scene.add(light);
  }

  // Create zone beacons
  createZoneBeacon(-30, -30, zoneColors.Forge.color, "Forge");
  createZoneBeacon(0, -35, zoneColors.Spire.color, "Spire");
  createZoneBeacon(30, -30, zoneColors.Warrens.color, "Warrens");

  // ── Ground crystal formations (obstacles/decoration) ──────
  const crystalColors = [0x9333ea, 0x3b82f6, 0x06b6d4, 0xf472b6];
  const obstacles: { x: number; z: number; radius: number }[] = [];

  for (let i = 0; i < 25; i++) {
    const crystalGroup = new THREE.Group();
    
    const baseColor = crystalColors[Math.floor(Math.random() * crystalColors.length)];
    const crystalMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.1,
      metalness: 0.6,
      emissive: baseColor,
      emissiveIntensity: 0.2,
    });

    const numCrystals = 2 + Math.floor(Math.random() * 4);
    for (let j = 0; j < numCrystals; j++) {
      const height = 0.8 + Math.random() * 2.5;
      const crystalGeo = new THREE.ConeGeometry(
        0.15 + Math.random() * 0.25,
        height,
        6
      );
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      
      const angle = (j / numCrystals) * Math.PI * 2;
      const radius = 0.3 + Math.random() * 0.5;
      
      crystal.position.set(
        Math.cos(angle) * radius,
        height * 0.5,
        Math.sin(angle) * radius
      );
      crystal.rotation.z = (Math.random() - 0.5) * 0.3;
      crystal.rotation.x = (Math.random() - 0.5) * 0.3;
      crystal.castShadow = true;
      crystal.receiveShadow = true;
      crystalGroup.add(crystal);
    }

    const cx = (Math.random() - 0.5) * 110;
    const cz = (Math.random() - 0.5) * 110;
    crystalGroup.position.set(cx, 0, cz);
    crystalGroup.rotation.y = Math.random() * Math.PI;
    scene.add(crystalGroup);
    
    obstacles.push({ x: cx, z: cz, radius: 1.2 });
  }

  // ── Stalagmites and stalactites ───────────────────────────
  const stalagmatiteGeo = new THREE.ConeGeometry(0.3, 2, 6);
  const stalagmatiteMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a5a,
    roughness: 0.9,
  });

  for (let i = 0; i < 15; i++) {
    const scale = 0.8 + Math.random() * 1.5;
    const stalagmatite = new THREE.Mesh(stalagmatiteGeo, stalagmatiteMat);
    stalagmatite.scale.set(scale, scale * (1 + Math.random()), scale);
    
    const sx = (Math.random() - 0.5) * 110;
    const sz = (Math.random() - 0.5) * 110;
    stalagmatite.position.set(sx, scale, sz);
    stalagmatite.castShadow = true;
    stalagmatite.receiveShadow = true;
    scene.add(stalagmatite);
    obstacles.push({ x: sx, z: sz, radius: scale * 0.5 });
  }

  // Stalactites from ceiling
  const stalactiteGeo = new THREE.ConeGeometry(0.4, 3, 6);
  const stalactiteMat = stalagmatiteMat;
  
  for (let i = 0; i < 10; i++) {
    const scale = 0.6 + Math.random() * 1.2;
    const stalactite = new THREE.Mesh(stalactiteGeo, stalactiteMat);
    stalactite.scale.set(scale, scale, scale);
    stalactite.rotation.x = Math.PI;
    
    stalactite.position.set(
      (Math.random() - 0.5) * 110,
      28 - scale * 0.5,
      (Math.random() - 0.5) * 110
    );
    stalactite.castShadow = true;
    scene.add(stalactite);
  }

  // ── Floating magical particles ─────────────────────────────
  const particleCount = 600;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 110;
    positions[i * 3 + 1] = Math.random() * 25;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 110;

    // Random colors: purple, blue, green, orange variants
    const colorChoice = Math.random();
    if (colorChoice < 0.25) {
      colors[i * 3] = 0.95;     // R
      colors[i * 3 + 1] = 0.5;  // G
      colors[i * 3 + 2] = 0.15; // B (orange)
    } else if (colorChoice < 0.5) {
      colors[i * 3] = 0.55;     // R
      colors[i * 3 + 1] = 0.25; // G
      colors[i * 3 + 2] = 0.95; // B (purple)
    } else if (colorChoice < 0.75) {
      colors[i * 3] = 0.2;      // R
      colors[i * 3 + 1] = 0.6;  // G
      colors[i * 3 + 2] = 1.0;  // B (blue)
    } else {
      colors[i * 3] = 0.13;     // R
      colors[i * 3 + 1] = 0.77; // G
      colors[i * 3 + 2] = 0.36; // B (green)
    }

    sizes[i] = 0.08 + Math.random() * 0.12;
  }

  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  particleGeo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const particleMat = new THREE.PointsMaterial({
    size: 0.12,
    transparent: true,
    opacity: 0.5,
    vertexColors: true,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });

  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // ── Lighting Animation Functions ───────────────────────────
  const originalPositions = positions.slice();
  
  function animateLights(time: number) {
    // Animate torch flickering
    torches.forEach((torch) => {
      const { light, flame, baseIntensity, offset } = torch;
      
      // Multiple frequency flicker for realistic fire
      const flicker1 = Math.sin(time * 12 + offset) * 0.08;
      const flicker2 = Math.sin(time * 23 + offset * 1.3) * 0.05;
      const flicker3 = Math.sin(time * 45 + offset * 0.7) * 0.03;
      const flicker = flicker1 + flicker2 + flicker3;
      
      light.intensity = baseIntensity * (0.9 + flicker);
      
      // Flame animation
      const flameScale = 0.85 + flicker * 1.5;
      flame.scale.set(flameScale, flameScale * (0.9 + Math.sin(time * 15 + offset) * 0.1), flameScale);
      flame.rotation.z = Math.sin(time * 8 + offset) * 0.08;
      flame.rotation.x = Math.cos(time * 6 + offset) * 0.05;
    });
    
    // Animate crystal pulsing
    crystals.forEach((crystal) => {
      const { light, crystal: crystalGroup, particles, baseIntensity, offset, zone } = crystal;
      
      // Slow pulse for magical feel
      const pulse = Math.sin(time * 0.8 + offset) * 0.15;
      light.intensity = baseIntensity * (0.95 + pulse);
      
      // Slight crystal sway
      crystalGroup.rotation.z = Math.sin(time * 0.5 + offset) * 0.02;
      crystalGroup.rotation.x = Math.cos(time * 0.3 + offset) * 0.015;
      
      // Animate crystal particles if present
      if (particles) {
        const partAttrs = particles.geometry.attributes;
        const posArr = partAttrs.position.array as Float32Array;
        for (let i = 0; i < posArr.length / 3; i++) {
          const idx = i * 3 + 1; // Y position
          posArr[idx] += Math.sin(time * 2 + i * 0.5) * 0.002;
        }
        partAttrs.position.needsUpdate = true;
      }
    });
    
    // Animate ambient particles
    const pos = particleGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < particleCount; i++) {
      pos.array[i * 3 + 1] =
        originalPositions[i * 3 + 1] + Math.sin(time * 0.5 + i * 0.01) * 0.5;
    }
    pos.needsUpdate = true;
  }

  // Expose animation via scene userData
  scene.userData.animateLights = animateLights;

  // Add job zone buildings and workstations
  const jobBuildings = createJobZoneBuildings(scene);
  const workstationVisuals = createVisualWorkstations(scene);
  obstacles.push(...jobBuildings.obstacles, ...workstationVisuals.obstacles);

  return { scene, camera, renderer, labelRenderer, controls, clock, obstacles, torches, crystals };
}
