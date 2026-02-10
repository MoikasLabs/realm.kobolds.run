import * as THREE from "three";

export type DragonType = "dragon" | "daily" | "trade" | "deploy";

interface DragonSpec {
  scale: number;
  color: string;
  hornSize: number;
  hasWings: boolean;
  hasTechGadgets: boolean;
  height: number;
}

const DRAGON_SPECS: Record<DragonType, DragonSpec> = {
  // Shalom (Dragon) - Leader, larger, majestic
  dragon: {
    scale: 1.5,
    color: "#6366f1", // Purple/indigo
    hornSize: 1,
    hasWings: true,
    hasTechGadgets: false,
    height: 1.2,
  },
  // Daily kobold - Green, smaller, lizard-like
  daily: {
    scale: 0.8,
    color: "#22c55e", // Green
    hornSize: 0.3,
    hasWings: false,
    hasTechGadgets: false,
    height: 0.6,
  },
  // Trade kobold - Orange, medium, crafty
  trade: {
    scale: 0.9,
    color: "#f97316", // Orange
    hornSize: 0.5,
    hasWings: false,
    hasTechGadgets: false,
    height: 0.75,
  },
  // Deploy kobold - Blue, tech gadgets
  deploy: {
    scale: 0.9,
    color: "#3b82f6", // Blue
    hornSize: 0.4,
    hasWings: false,
    hasTechGadgets: true,
    height: 0.75,
  },
};

/**
 * Creates a procedural dragon or kobold mesh group using Three.js primitives.
 * Dragons have horns, wings, tail, 4 legs. Kobolds are smaller lizard variants.
 */
export function createDragon(type: DragonType = "daily", customColor?: string): THREE.Group {
  const spec = DRAGON_SPECS[type];
  const group = new THREE.Group();
  group.name = "dragon";
  group.userData.dragonType = type;

  const baseColor = new THREE.Color(customColor || spec.color);
  const darkColor = baseColor.clone().multiplyScalar(0.6);
  const accentColor = baseColor.clone().offsetHSL(0, 0, 0.2);

  const bodyMat = new THREE.MeshToonMaterial({ color: baseColor });
  const darkMat = new THREE.MeshToonMaterial({ color: darkColor });
  const accentMat = new THREE.MeshToonMaterial({ color: accentColor });
  const eyeMat = new THREE.MeshToonMaterial({ color: 0xffdd44 }); // Golden eyes
  const pupilMat = new THREE.MeshToonMaterial({ color: 0x000000 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 });
  const wingMembraneMat = new THREE.MeshToonMaterial({ color: darkColor, transparent: true, opacity: 0.9 });

  // ── Body (main torso) ──────────────────────────────────────
  const bodyGeo = new THREE.CylinderGeometry(0.5 * spec.scale, 0.7 * spec.scale, 1.2 * spec.scale, 8);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = spec.height * spec.scale;
  body.castShadow = true;
  group.add(body);

  // Chest (slightly larger upper body)
  const chestGeo = new THREE.SphereGeometry(0.55 * spec.scale, 10, 8);
  const chest = new THREE.Mesh(chestGeo, bodyMat);
  chest.scale.set(1, 0.8, 0.9);
  chest.position.set(0, spec.height * spec.scale + 0.3 * spec.scale, 0.2 * spec.scale);
  chest.castShadow = true;
  group.add(chest);

  // ── Head ───────────────────────────────────────────────────
  const headGroup = new THREE.Group();
  headGroup.name = "head";

  // Main head shape (elongated snout for dragon, rounder for kobolds)
  const headGeo = new THREE.SphereGeometry(0.35 * spec.scale, 10, 8);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.scale.set(type === "dragon" ? 1.2 : 1, 0.9, 1.3);
  head.castShadow = true;
  headGroup.add(head);

  // Snout/muzzle
  const snoutGeo = new THREE.CylinderGeometry(0.2 * spec.scale, 0.28 * spec.scale, 0.4 * spec.scale, 6);
  const snout = new THREE.Mesh(snoutGeo, darkMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0, 0.5 * spec.scale);
  snout.castShadow = true;
  headGroup.add(snout);

  // Nostrils
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(
      new THREE.SphereGeometry(0.05 * spec.scale, 6, 4),
      darkMat
    );
    nostril.position.set(side * 0.12 * spec.scale, 0.05 * spec.scale, 0.7 * spec.scale);
    headGroup.add(nostril);
  }

  // Eyes
  for (const side of [-1, 1]) {
    const eyeGroup = new THREE.Group();
    
    // Eye socket
    const socket = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 * spec.scale, 8, 6),
      darkMat
    );
    socket.position.set(side * 0.25 * spec.scale, 0.15 * spec.scale, 0.2 * spec.scale);
    eyeGroup.add(socket);

    // Eyeball
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.09 * spec.scale, 8, 6),
      eyeMat
    );
    eye.position.set(side * 0.28 * spec.scale, 0.15 * spec.scale, 0.22 * spec.scale);
    eyeGroup.add(eye);

    // Pupil
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 * spec.scale, 6, 4),
      pupilMat
    );
    pupil.position.set(side * 0.32 * spec.scale, 0.15 * spec.scale, 0.3 * spec.scale);
    eyeGroup.add(pupil);

    headGroup.add(eyeGroup);
  }

  // Horns (larger for dragon, small for kobolds)
  if (spec.hornSize > 0) {
    for (const side of [-1, 1]) {
      // Main horn
      const hornGeo = new THREE.ConeGeometry(0.06 * spec.scale * spec.hornSize, 0.5 * spec.scale * spec.hornSize, 6);
      const horn = new THREE.Mesh(hornGeo, hornMat);
      horn.position.set(side * 0.2 * spec.scale, 0.5 * spec.scale, -0.1 * spec.scale);
      horn.rotation.z = side * 0.3;
      horn.castShadow = true;
      headGroup.add(horn);

      // Secondary horn (smaller)
      const horn2Geo = new THREE.ConeGeometry(0.04 * spec.scale * spec.hornSize, 0.3 * spec.scale * spec.hornSize, 6);
      const horn2 = new THREE.Mesh(horn2Geo, hornMat);
      horn2.position.set(side * 0.3 * spec.scale, 0.45 * spec.scale, -0.15 * spec.scale);
      horn2.rotation.z = side * 0.5;
      horn2.castShadow = true;
      headGroup.add(horn2);
    }
  }

  // Ears/Frills
  for (const side of [-1, 1]) {
    const earGeo = new THREE.ConeGeometry(0.08 * spec.scale, 0.25 * spec.scale, 4);
    const ear = new THREE.Mesh(earGeo, bodyMat);
    ear.position.set(side * 0.35 * spec.scale, 0.05 * spec.scale, -0.2 * spec.scale);
    ear.rotation.z = side * 0.8;
    ear.rotation.x = -0.3;
    headGroup.add(ear);
  }

  headGroup.position.set(0, spec.height * spec.scale + 0.6 * spec.scale, 0.5 * spec.scale);
  group.add(headGroup);

  // ── Wings (Dragon only) ────────────────────────────────────
  if (spec.hasWings) {
    for (const side of [-1, 1]) {
      const wingGroup = new THREE.Group();
      wingGroup.name = side === -1 ? "wing_left" : "wing_right";

      // Wing bone structure (triangular prism approximation)
      const wingSegments = 3;
      for (let i = 0; i < wingSegments; i++) {
        const t = i / wingSegments;
        const wingLength = 1.2 * spec.scale * (1 - t * 0.3);
        const wingWidth = 0.6 * spec.scale * (1 - t * 0.2);
        
        // Wing membrane segment
        const wingGeo = new THREE.BoxGeometry(0.02, wingLength, wingWidth);
        const wingPart = new THREE.Mesh(wingGeo, wingMembraneMat);
        wingPart.position.set(
          side * (0.4 + t * 0.8) * spec.scale,
          spec.height * spec.scale + (0.5 - t * 0.3) * spec.scale,
          -0.3 * spec.scale
        );
        wingPart.rotation.z = side * (0.3 + t * 0.4);
        wingPart.rotation.x = -0.2;
        wingPart.castShadow = true;
        wingGroup.add(wingPart);
      }

      // Wing arm bone
      const armGeo = new THREE.CylinderGeometry(0.04 * spec.scale, 0.06 * spec.scale, 0.8 * spec.scale, 6);
      const arm = new THREE.Mesh(armGeo, darkMat);
      arm.rotation.z = side * 1.2;
      arm.position.set(side * 0.3 * spec.scale, spec.height * spec.scale + 0.4 * spec.scale, -0.2 * spec.scale);
      arm.castShadow = true;
      wingGroup.add(arm);

      group.add(wingGroup);
    }
  }

  // ── Legs (4 legs, upright posture) ─────────────────────────
  const legPositions = [
    { x: -0.4, z: 0.3 }, // Front left
    { x: 0.4, z: 0.3 },  // Front right
    { x: -0.4, z: -0.3 }, // Back left
    { x: 0.4, z: -0.3 },  // Back right
  ];

  legPositions.forEach((pos, i) => {
    const isFront = i < 2;
    const side = pos.x < 0 ? -1 : 1;
    const legGroup = new THREE.Group();
    legGroup.name = `leg_${i}`;

    // Upper leg (thigh)
    const thighGeo = new THREE.CylinderGeometry(0.12 * spec.scale, 0.15 * spec.scale, 0.5 * spec.scale, 6);
    const thigh = new THREE.Mesh(thighGeo, darkMat);
    thigh.position.y = -0.25 * spec.scale;
    thigh.rotation.z = side * 0.2;
    thigh.castShadow = true;
    legGroup.add(thigh);

    // Lower leg
    const shinGeo = new THREE.CylinderGeometry(0.08 * spec.scale, 0.1 * spec.scale, 0.4 * spec.scale, 6);
    const shin = new THREE.Mesh(shinGeo, bodyMat);
    shin.position.set(side * 0.05 * spec.scale, -0.6 * spec.scale, 0);
    shin.rotation.z = side * -0.1;
    shin.castShadow = true;
    legGroup.add(shin);

    // Foot/claw
    const footGeo = new THREE.BoxGeometry(0.15 * spec.scale, 0.1 * spec.scale, 0.2 * spec.scale);
    const foot = new THREE.Mesh(footGeo, darkMat);
    foot.position.set(side * 0.08 * spec.scale, -0.85 * spec.scale, 0.05 * spec.scale);
    foot.castShadow = true;
    legGroup.add(foot);

    // Position the entire leg
    legGroup.position.set(
      pos.x * spec.scale,
      spec.height * spec.scale - 0.2 * spec.scale,
      pos.z * spec.scale
    );
    
    group.add(legGroup);
  });

  // ── Tail ───────────────────────────────────────────────────
  const tailSegments = type === "dragon" ? 6 : 4;
  const tailGroup = new THREE.Group();
  tailGroup.name = "tail";

  for (let i = 0; i < tailSegments; i++) {
    const t = i / tailSegments;
    const radius = 0.25 * spec.scale * (1 - t * 0.7);
    const segGeo = new THREE.SphereGeometry(radius, 8, 6);
    const seg = new THREE.Mesh(segGeo, i % 2 === 0 ? bodyMat : darkMat);
    seg.scale.set(1, 0.6, 1.2);
    seg.position.set(0, 0, -0.35 * spec.scale * (i + 1));
    seg.castShadow = true;
    tailGroup.add(seg);
  }

  // Tail tip (spike for dragon, rounded for kobolds)
  const tipGeo = type === "dragon" 
    ? new THREE.ConeGeometry(0.08 * spec.scale, 0.3 * spec.scale, 4)
    : new THREE.SphereGeometry(0.1 * spec.scale, 6, 4);
  const tip = new THREE.Mesh(tipGeo, darkMat);
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(0, 0.05 * spec.scale, -0.35 * spec.scale * (tailSegments + 0.8));
  tip.castShadow = true;
  tailGroup.add(tip);

  tailGroup.position.set(0, spec.height * spec.scale - 0.1 * spec.scale, -0.6 * spec.scale);
  group.add(tailGroup);

  // ── Tech Gadgets (Deploy kobold only) ─────────────────────
  if (spec.hasTechGadgets) {
    // Backpack/device
    const packGeo = new THREE.BoxGeometry(0.5 * spec.scale, 0.4 * spec.scale, 0.3 * spec.scale);
    const pack = new THREE.Mesh(packGeo, accentMat);
    pack.position.set(0, spec.height * spec.scale + 0.2 * spec.scale, -0.5 * spec.scale);
    pack.castShadow = true;
    group.add(pack);

    // Glowing antenna
    const antGeo = new THREE.CylinderGeometry(0.02 * spec.scale, 0.02 * spec.scale, 0.4 * spec.scale, 4);
    const ant = new THREE.Mesh(antGeo, new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
    ant.position.set(0.15 * spec.scale, spec.height * spec.scale + 0.6 * spec.scale, -0.55 * spec.scale);
    group.add(ant);

    // Small blinking light
    const lightGeo = new THREE.SphereGeometry(0.05 * spec.scale, 6, 4);
    const light = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff0055 }));
    light.position.set(0, spec.height * spec.scale + 0.35 * spec.scale, -0.65 * spec.scale);
    group.add(light);
  }

  // ── Arms (for kobolds, holding posture) ───────────────────
  if (type !== "dragon") {
    for (const side of [-1, 1]) {
      const armGroup = new THREE.Group();
      
      // Upper arm
      const upperArmGeo = new THREE.CylinderGeometry(0.06 * spec.scale, 0.08 * spec.scale, 0.4 * spec.scale, 6);
      const upperArm = new THREE.Mesh(upperArmGeo, bodyMat);
      upperArm.position.y = -0.2 * spec.scale;
      upperArm.rotation.z = side * 0.3;
      armGroup.add(upperArm);

      // Forearm
      const forearmGeo = new THREE.CylinderGeometry(0.05 * spec.scale, 0.06 * spec.scale, 0.35 * spec.scale, 6);
      const forearm = new THREE.Mesh(forearmGeo, darkMat);
      forearm.position.set(side * 0.15 * spec.scale, -0.5 * spec.scale, 0.1 * spec.scale);
      forearm.rotation.x = -0.5;
      armGroup.add(forearm);

      // Hand/claw
      const handGeo = new THREE.BoxGeometry(0.1 * spec.scale, 0.08 * spec.scale, 0.12 * spec.scale);
      const hand = new THREE.Mesh(handGeo, darkMat);
      hand.position.set(side * 0.18 * spec.scale, -0.7 * spec.scale, 0.15 * spec.scale);
      armGroup.add(hand);

      armGroup.position.set(
        side * 0.45 * spec.scale,
        spec.height * spec.scale + 0.1 * spec.scale,
        0.2 * spec.scale
      );
      armGroup.name = `arm_${side === -1 ? "left" : "right"}`;
      group.add(armGroup);
    }
  }

  return group;
}

// ════════════════════════════════════════════════════════════
// Animations
// ════════════════════════════════════════════════════════════

/** Idle breathing animation */
export function animateIdle(group: THREE.Group, time: number): void {
  group.position.y += Math.sin(time * 1.5) * 0.002;
  group.rotation.z = Math.sin(time * 1) * 0.015;
  
  // Subtle chest breathing
  const chest = group.children.find(c => c.geometry?.type === "SphereGeometry");
  if (chest) {
    chest.scale.y = 0.8 + Math.sin(time * 2) * 0.02;
  }
}

/** Walking animation - legs move in stride */
export function animateWalk(group: THREE.Group, time: number): void {
  group.children.forEach((child) => {
    if (child.name.startsWith("leg_")) {
      const idx = parseInt(child.name.split("_")[1], 10);
      const phase = idx * Math.PI * 0.5;
      // Different phases for diagonal pairs (walking gait)
      child.rotation.x = Math.sin(time * 6 + phase) * 0.3;
    }
  });

  // Tail sway while walking
  const tail = group.getObjectByName("tail");
  if (tail) {
    tail.rotation.y = Math.sin(time * 3) * 0.1;
  }
}

/** Wing flap animation (Dragon only) */
export function animateWingFlap(group: THREE.Group, time: number): void {
  const leftWing = group.getObjectByName("wing_left");
  const rightWing = group.getObjectByName("wing_right");
  
  if (leftWing && rightWing) {
    const flap = Math.sin(time * 4) * 0.3;
    leftWing.rotation.z = flap;
    rightWing.rotation.z = -flap;
  }
}

/** Talk gesture - head bob and arm wave */
export function animateTalk(group: THREE.Group, time: number): void {
  const head = group.getObjectByName("head");
  if (head) {
    head.rotation.x = Math.sin(time * 5) * 0.1;
  }
  
  // Wave arms for kobolds
  const leftArm = group.getObjectByName("arm_left");
  const rightArm = group.getObjectByName("arm_right");
  if (leftArm && rightArm) {
    leftArm.rotation.z = 0.5 + Math.sin(time * 4) * 0.3;
    rightArm.rotation.x = Math.sin(time * 3) * 0.2;
  }
}

/** Wave animation */
export function animateWave(group: THREE.Group, time: number): void {
  const rightArm = group.getObjectByName("arm_right");
  const wing = group.getObjectByName("wing_right");
  
  if (rightArm) {
    // Kobold wave
    rightArm.rotation.z = -0.8 + Math.sin(time * 5) * 0.4;
  } else if (wing) {
    // Dragon wing wave
    wing.rotation.z = -0.5 + Math.sin(time * 4) * 0.5;
  }
}

/** Dance animation - full body celebration */
export function animateDance(group: THREE.Group, time: number): void {
  // Bounce
  group.position.y += Math.abs(Math.sin(time * 4)) * 0.08;
  
  // Sway
  group.rotation.z = Math.sin(time * 3) * 0.1;
  group.rotation.y = Math.sin(time * 2) * 0.15;
  
  // Head bob
  const head = group.getObjectByName("head");
  if (head) {
    head.rotation.x = Math.sin(time * 5) * 0.2;
    head.rotation.y = Math.sin(time * 3) * 0.1;
  }
  
  // Tail wag
  const tail = group.getObjectByName("tail");
  if (tail) {
    tail.rotation.y = Math.sin(time * 6) * 0.2;
  }
  
  // Wings/arms flare
  const wingL = group.getObjectByName("wing_left") || group.getObjectByName("arm_left");
  const wingR = group.getObjectByName("wing_right") || group.getObjectByName("arm_right");
  if (wingL && wingR) {
    const flare = Math.sin(time * 4) * 0.3;
    wingL.rotation.z = flare;
    wingR.rotation.z = -flare;
  }
}

/** Backflip animation */
export function animateBackflip(group: THREE.Group, time: number): void {
  const cycleDuration = 1.5;
  const phase = (time % cycleDuration) / cycleDuration;
  
  const eased = phase < 0.5
    ? 2 * phase * phase
    : 1 - Math.pow(-2 * phase + 2, 2) / 2;
  
  group.rotation.x = eased * Math.PI * 2;
  group.position.y += Math.sin(phase * Math.PI) * 2;
  
  // Tuck legs
  group.children.forEach((child) => {
    if (child.name.startsWith("leg_")) {
      child.rotation.x = -0.4 * Math.sin(phase * Math.PI);
    }
  });
  
  // Tuck wings/arms
  const wingL = group.getObjectByName("wing_left") || group.getObjectByName("arm_left");
  const wingR = group.getObjectByName("wing_right") || group.getObjectByName("arm_right");
  if (wingL && wingR) {
    const tuck = Math.sin(phase * Math.PI) * 0.4;
    wingL.rotation.x = -tuck;
    wingR.rotation.x = -tuck;
  }
}

/** Spin animation */
export function animateSpin(group: THREE.Group, time: number): void {
  const spinSpeed = 2 * Math.PI;
  group.rotation.y = (time * spinSpeed) % (Math.PI * 2);
  
  const cycleDuration = 1.0;
  const phase = (time % cycleDuration) / cycleDuration;
  group.position.y += Math.sin(phase * Math.PI) * 0.4;
  
  // Spread wings/arms outward
  const wingL = group.getObjectByName("wing_left") || group.getObjectByName("arm_left");
  const wingR = group.getObjectByName("wing_right") || group.getObjectByName("arm_right");
  if (wingL && wingR) {
    wingL.rotation.z = 0.5 + Math.sin(time * 8) * 0.15;
    wingR.rotation.z = -0.5 - Math.sin(time * 8) * 0.15;
  }
  
  // Legs spread
  group.children.forEach((child) => {
    if (child.name.startsWith("leg_")) {
      const idx = parseInt(child.name.split("_")[1], 10);
      const side = idx % 2 === 0 ? -1 : 1;
      const spread = Math.sin(time * 3) * 0.1;
      child.rotation.z = side * 0.2 + spread;
    }
  });
}
