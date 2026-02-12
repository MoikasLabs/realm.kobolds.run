import * as THREE from "three";

/**
 * Creates a procedural kobold mesh group.
 * Bipedal reptilian humanoid with scaled skin, large ears, snout, and tail.
 * Based on reference: rust-colored scales, leather gear, pickaxe-ready pose.
 * Uses MeshToonMaterial for stylized fantasy look.
 */
export function createKobold(color: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "kobold";

  // Inner container offset so feet sit at y=0 (ground level).
  // All geometry is added here; animations target `group` and
  // getObjectByName searches recursively so named parts still resolve.
  const inner = new THREE.Group();
  inner.position.y = 0.22; // lifts geometry so lowest point (toes) ≈ y=0

  const baseColor = new THREE.Color(color);
  const darkColor = baseColor.clone().multiplyScalar(0.55);
  const bellyColor = baseColor.clone().offsetHSL(0.02, -0.1, 0.2);
  const scaleAccent = baseColor.clone().multiplyScalar(0.45);

  const bodyMat = new THREE.MeshToonMaterial({ color: baseColor });
  const darkMat = new THREE.MeshToonMaterial({ color: darkColor });
  const bellyMat = new THREE.MeshToonMaterial({ color: bellyColor });
  const scaleMat = new THREE.MeshToonMaterial({ color: scaleAccent });
  const eyeIrisMat = new THREE.MeshToonMaterial({ color: 0xd4a017 });
  const pupilMat = new THREE.MeshToonMaterial({ color: 0x111111 });
  const leatherMat = new THREE.MeshToonMaterial({ color: 0x7a5c3a });
  const beltMat = new THREE.MeshToonMaterial({ color: 0x5c3a1a });
  const buckleMat = new THREE.MeshToonMaterial({ color: 0xb8860b });

  // ── Body (torso — slightly hunched, barrel-chested) ────────
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.45, 6, 10),
    bodyMat,
  );
  body.position.set(0, 0.86, 0.02);
  body.rotation.x = 0.12; // slight forward hunch
  body.castShadow = true;
  inner.add(body);

  // Belly (lighter underside, rounder)
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    bellyMat,
  );
  belly.scale.set(0.85, 1.15, 0.55);
  belly.position.set(0, 0.81, 0.18);
  inner.add(belly);

  // Scale plates on the back (dorsal ridge bumps)
  for (let i = 0; i < 4; i++) {
    const ridge = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 5, 4),
      scaleMat,
    );
    ridge.scale.set(1.4, 0.6, 1);
    ridge.position.set(0, 1.11 - i * 0.12, -0.28);
    inner.add(ridge);
  }

  // ── Head (wider, more reptilian) ───────────────────────────
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.28, 0.12);

  // Cranium — wider, flattened top
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    bodyMat,
  );
  head.scale.set(1.15, 0.85, 1.0);
  head.castShadow = true;
  headGroup.add(head);

  // Brow ridges (prominent, reptilian)
  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 5),
      darkMat,
    );
    brow.scale.set(1.6, 0.5, 1.2);
    brow.position.set(side * 0.13, 0.12, 0.18);
    headGroup.add(brow);
  }

  // Snout — longer, flatter, with distinct upper and lower jaw
  const upperSnout = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 7),
    bodyMat,
  );
  upperSnout.scale.set(0.95, 0.55, 1.4);
  upperSnout.position.set(0, 0.0, 0.24);
  upperSnout.castShadow = true;
  headGroup.add(upperSnout);

  // Lower jaw (gives the "grin" look)
  const lowerJaw = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 6),
    bodyMat,
  );
  lowerJaw.scale.set(0.9, 0.4, 1.3);
  lowerJaw.position.set(0, -0.08, 0.22);
  headGroup.add(lowerJaw);

  // Mouth line (dark crease between jaws)
  const mouthLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.012, 0.18),
    pupilMat,
  );
  mouthLine.position.set(0, -0.03, 0.3);
  headGroup.add(mouthLine);

  // Nostrils
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 5, 5),
      darkMat,
    );
    nostril.position.set(side * 0.05, 0.04, 0.42);
    headGroup.add(nostril);
  }

  // Small horn nubs on the crown
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.12, 5),
      scaleMat,
    );
    horn.position.set(side * 0.1, 0.22, -0.05);
    horn.rotation.z = side * -0.15;
    horn.rotation.x = -0.2;
    headGroup.add(horn);
  }
  // Center horn (smaller)
  const centerHorn = new THREE.Mesh(
    new THREE.ConeGeometry(0.03, 0.09, 5),
    scaleMat,
  );
  centerHorn.position.set(0, 0.24, -0.02);
  centerHorn.rotation.x = -0.3;
  headGroup.add(centerHorn);

  // ── Big bat-like ears (kobold signature) ───────────────────
  for (const side of [-1, 1]) {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.26, 0.1, -0.04);
    earGroup.rotation.z = side * -0.5;
    earGroup.rotation.x = -0.15;
    earGroup.rotation.y = side * -0.2;

    // Main ear membrane (large, flat cone)
    const earMembrane = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.45, 4),
      bodyMat,
    );
    earMembrane.scale.set(0.6, 1, 0.15);
    earMembrane.castShadow = true;
    earGroup.add(earMembrane);

    // Inner ear (slightly lighter/pinker)
    const innerEar = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.35, 4),
      bellyMat,
    );
    innerEar.scale.set(0.5, 0.9, 0.08);
    innerEar.position.set(0, -0.02, side * 0.01);
    earGroup.add(innerEar);

    headGroup.add(earGroup);
  }

  // ── Eyes (large, golden, reptilian) ────────────────────────
  for (const side of [-1, 1]) {
    // Eye socket (slight indent)
    const socket = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 8, 6),
      darkMat,
    );
    socket.position.set(side * 0.14, 0.08, 0.2);
    headGroup.add(socket);

    // Eyeball
    const eyeWhite = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      new THREE.MeshToonMaterial({ color: 0xfff5d0 }),
    );
    eyeWhite.position.set(side * 0.14, 0.08, 0.22);
    headGroup.add(eyeWhite);

    // Golden iris (large, reptilian)
    const iris = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      eyeIrisMat,
    );
    iris.position.set(side * 0.14, 0.08, 0.27);
    headGroup.add(iris);

    // Slit pupil (vertical ellipse)
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 6, 6),
      pupilMat,
    );
    pupil.scale.set(0.4, 1.2, 0.5);
    pupil.position.set(side * 0.14, 0.08, 0.29);
    headGroup.add(pupil);
  }

  inner.add(headGroup);

  // ── Arms ───────────────────────────────────────────────────
  for (const side of [-1, 1]) {
    const armGroup = new THREE.Group();
    armGroup.name = side === -1 ? "arm_left" : "arm_right";
    armGroup.position.set(side * 0.34, 1.11, 0);

    // Shoulder scale plate
    const shoulderPlate = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 5),
      scaleMat,
    );
    shoulderPlate.scale.set(1.3, 0.7, 1.1);
    shoulderPlate.position.set(side * 0.04, 0.0, 0);
    armGroup.add(shoulderPlate);

    // Upper arm (35% longer)
    const upperArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.07, 0.27, 4, 6),
      bodyMat,
    );
    upperArm.position.set(side * 0.06, -0.19, 0);
    upperArm.rotation.z = side * 0.15;
    upperArm.castShadow = true;
    armGroup.add(upperArm);

    // Elbow bump
    const elbow = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 5, 4),
      scaleMat,
    );
    elbow.position.set(side * 0.08, -0.35, -0.02);
    armGroup.add(elbow);

    // Forearm (35% longer)
    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.06, 0.24, 4, 6),
      bodyMat,
    );
    forearm.position.set(side * 0.1, -0.46, 0.04);
    forearm.rotation.x = -0.25;
    forearm.castShadow = true;
    armGroup.add(forearm);

    // Hand (3-clawed)
    const palm = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      darkMat,
    );
    palm.scale.set(1.1, 0.7, 1.0);
    palm.position.set(side * 0.11, -0.62, 0.07);
    armGroup.add(palm);

    // Claws (3 fingers)
    for (let f = -1; f <= 1; f++) {
      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(0.015, 0.07, 4),
        scaleMat,
      );
      claw.position.set(
        side * 0.11 + f * 0.03,
        -0.70,
        0.1 + Math.abs(f) * -0.02,
      );
      claw.rotation.x = -0.5;
      armGroup.add(claw);
    }

    inner.add(armGroup);
  }

  // ── Legs (digitigrade / lizard-like stance) ─────────────────
  for (const side of [-1, 1]) {
    const legGroup = new THREE.Group();
    legGroup.name = side === -1 ? "leg_left" : "leg_right";
    legGroup.position.set(side * 0.16, 0.64, 0);

    // Thigh — mostly vertical, slight forward lean
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 0.4, 4, 6),
      bodyMat,
    );
    thigh.position.set(0, -0.22, 0.02);
    thigh.rotation.x = 0.15;
    thigh.castShadow = true;
    legGroup.add(thigh);

    // Knee bump (slightly forward of the leg line)
    const knee = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 6, 5),
      scaleMat,
    );
    knee.position.set(0, -0.46, 0.07);
    legGroup.add(knee);

    // Shin — 55% of original length
    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.075, 0.26, 4, 6),
      bodyMat,
    );
    shin.position.set(0, -0.61, 0.0);
    shin.rotation.x = -0.1;
    shin.castShadow = true;
    legGroup.add(shin);

    // Ankle / hock joint
    const ankle = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 5, 4),
      darkMat,
    );
    ankle.position.set(0, -0.77, -0.02);
    legGroup.add(ankle);

    // Metatarsal (lizard foot bone — angled forward to ground)
    const metatarsal = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.04, 0.08, 4, 5),
      bodyMat,
    );
    metatarsal.position.set(0, -0.80, 0.02);
    metatarsal.rotation.x = 0.35;
    metatarsal.castShadow = true;
    legGroup.add(metatarsal);

    // Foot pad (splayed, 3-toed)
    const footBase = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 5),
      darkMat,
    );
    footBase.scale.set(1.1, 0.35, 1.5);
    footBase.position.set(0, -0.85, 0.06);
    legGroup.add(footBase);

    // Toe claws
    for (let t = -1; t <= 1; t++) {
      const toe = new THREE.Mesh(
        new THREE.ConeGeometry(0.025, 0.1, 4),
        scaleMat,
      );
      toe.position.set(t * 0.05, -0.86, 0.12 + Math.abs(t) * -0.03);
      toe.rotation.x = -1.3;
      legGroup.add(toe);
    }

    inner.add(legGroup);
  }

  // ── Tail (thick, tapered, reptilian with ridges) ───────────
  const tailSegments = 6;
  for (let i = 0; i < tailSegments; i++) {
    const t = i / tailSegments;
    const radius = 0.16 * (1 - t * 0.75);

    const tailSeg = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 8, 6),
      i % 2 === 0 ? bodyMat : darkMat,
    );
    tailSeg.scale.set(1, 0.9, 1.6);
    tailSeg.position.set(0, 0.54 - i * 0.04, -0.3 - i * 0.22);
    tailSeg.rotation.x = 0.25 + i * 0.08;
    tailSeg.castShadow = true;
    tailSeg.name = `tail_${i}`;
    inner.add(tailSeg);

    // Dorsal ridge on each tail segment
    if (i < 4) {
      const tailRidge = new THREE.Mesh(
        new THREE.ConeGeometry(0.02, 0.06 * (1 - t), 3),
        scaleMat,
      );
      tailRidge.position.set(0, 0.54 - i * 0.04 + radius * 0.8, -0.3 - i * 0.22);
      tailRidge.rotation.x = -0.3;
      inner.add(tailRidge);
    }
  }

  // ── Leather Tunic with Belt ────────────────────────────────
  // Tunic body
  const tunic = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.25, 4, 8),
    leatherMat,
  );
  tunic.position.set(0, 0.81, 0.03);
  tunic.rotation.x = 0.12;
  tunic.castShadow = true;
  inner.add(tunic);

  // Tunic skirt (hangs lower in front)
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.2, 0.25),
    leatherMat,
  );
  skirt.position.set(0, 0.61, 0.08);
  inner.add(skirt);

  // Cross strap (diagonal)
  const crossStrap = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.55, 0.05),
    beltMat,
  );
  crossStrap.position.set(-0.08, 0.86, 0.28);
  crossStrap.rotation.z = 0.35;
  inner.add(crossStrap);

  // Belt
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.06, 10),
    beltMat,
  );
  belt.position.set(0, 0.68, 0.02);
  inner.add(belt);

  // Belt buckle
  const buckle = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.07, 0.04),
    buckleMat,
  );
  buckle.position.set(0, 0.68, 0.3);
  inner.add(buckle);

  group.add(inner);

  // ── Scale the whole kobold ─────────────────────────────────
  group.scale.set(1.3, 1.3, 1.3);

  return group;
}

/**
 * All animations use absolute `=` assignments (never `+=` or `*=`)
 * to avoid unbounded accumulation across frames. The kobold-manager
 * calls position.set() before animations, so position.y offsets here
 * are additive on top of the correct base position for one frame only.
 */

/** Animate idle — slight tail sway and breathing */
export function animateIdle(group: THREE.Group, time: number): void {
  // Breathing (subtle body scale/bob)
  group.position.y += Math.sin(time * 2) * 0.003;

  // Tail sway
  for (let i = 0; i < 6; i++) {
    const tail = group.getObjectByName(`tail_${i}`);
    if (tail) {
      tail.rotation.y = Math.sin(time * 2 + i * 0.5) * 0.1;
    }
  }
}

/** Animate walking (leg swing + arm counter-swing) */
export function animateWalk(group: THREE.Group, time: number): void {
  const walkCycle = time * 6;

  // Leg swing
  const leftLeg = group.getObjectByName("leg_left");
  const rightLeg = group.getObjectByName("leg_right");
  if (leftLeg) leftLeg.rotation.x = Math.sin(walkCycle) * 0.5;
  if (rightLeg) rightLeg.rotation.x = Math.sin(walkCycle + Math.PI) * 0.5;

  // Arm counter-swing
  const leftArm = group.getObjectByName("arm_left");
  const rightArm = group.getObjectByName("arm_right");
  if (leftArm) leftArm.rotation.x = Math.sin(walkCycle + Math.PI) * 0.4;
  if (rightArm) rightArm.rotation.x = Math.sin(walkCycle) * 0.4;

  // Tail counterbalance
  for (let i = 0; i < 6; i++) {
    const tail = group.getObjectByName(`tail_${i}`);
    if (tail) {
      tail.rotation.z = Math.sin(walkCycle + i * 0.3) * 0.08;
    }
  }
}

/** Animate claw snap (replaced with hand rub/pick motion) */
export function animateClawSnap(group: THREE.Group, time: number): void {
  const leftArm = group.getObjectByName("arm_left");
  const rightArm = group.getObjectByName("arm_right");

  // Mining pick motion
  const pick = Math.sin(time * 6) * 0.3;
  if (rightArm) {
    rightArm.rotation.x = -0.5 + pick;
    rightArm.rotation.z = -0.3;
  }
  if (leftArm) {
    leftArm.rotation.x = 0.2;
    leftArm.rotation.z = 0.3;
  }
}

/** Animate wave (raise arm, kobold greeting) */
export function animateWave(group: THREE.Group, time: number): void {
  const rightArm = group.getObjectByName("arm_right");
  if (rightArm) {
    rightArm.rotation.z = -0.8 + Math.sin(time * 5) * 0.3;
    rightArm.rotation.x = -0.5;
  }
}

/** Animate dance (enthusiastic kobold jig) */
export function animateDance(group: THREE.Group, time: number): void {
  // Bounce
  group.position.y += Math.abs(Math.sin(time * 6)) * 0.08;

  // Body sway
  group.rotation.z = Math.sin(time * 4) * 0.1;

  // Arm flailing (joyful)
  const leftArm = group.getObjectByName("arm_left");
  const rightArm = group.getObjectByName("arm_right");
  if (leftArm) {
    leftArm.rotation.z = 0.5 + Math.sin(time * 8) * 0.6;
  }
  if (rightArm) {
    rightArm.rotation.z = -0.5 + Math.sin(time * 8 + Math.PI) * 0.6;
  }

  // Tail wag
  for (let i = 0; i < 6; i++) {
    const tail = group.getObjectByName(`tail_${i}`);
    if (tail) {
      tail.rotation.y = Math.sin(time * 10 + i * 0.5) * 0.2;
    }
  }
}

/** Animate backflip (agile kobold flip) */
export function animateBackflip(group: THREE.Group, time: number): void {
  const cycleDuration = 1.2;
  const phase = (time % cycleDuration) / cycleDuration;

  // Smooth flip
  const eased =
    phase < 0.5 ? 2 * phase * phase : 1 - Math.pow(-2 * phase + 2, 2) / 2;

  group.rotation.x = eased * Math.PI * 2;

  // Jump arc
  group.position.y += Math.sin(phase * Math.PI) * 2;

  // Tuck limbs
  const leftLeg = group.getObjectByName("leg_left");
  const rightLeg = group.getObjectByName("leg_right");
  if (leftLeg) leftLeg.rotation.x = -0.8 * Math.sin(phase * Math.PI);
  if (rightLeg) rightLeg.rotation.x = -0.8 * Math.sin(phase * Math.PI);

  // Arms tucked
  const leftArm = group.getObjectByName("arm_left");
  const rightArm = group.getObjectByName("arm_right");
  if (leftArm) leftArm.rotation.x = -0.5 * Math.sin(phase * Math.PI);
  if (rightArm) rightArm.rotation.x = -0.5 * Math.sin(phase * Math.PI);

  // Tail tucked tight
  for (let i = 0; i < 6; i++) {
    const tail = group.getObjectByName(`tail_${i}`);
    if (tail) {
      tail.rotation.x = 0.5 + 0.5 * Math.sin(phase * Math.PI);
    }
  }
}

/** Animate spin (360° happy spin) */
export function animateSpin(group: THREE.Group, time: number): void {
  const spinSpeed = 2 * Math.PI;
  group.rotation.y = (time * spinSpeed) % (Math.PI * 2);

  // Little hops
  const cycleDuration = 0.6;
  const phase = (time % cycleDuration) / cycleDuration;
  group.position.y += Math.sin(phase * Math.PI) * 0.2;

  // Arms out for balance
  const leftArm = group.getObjectByName("arm_left");
  const rightArm = group.getObjectByName("arm_right");
  if (leftArm) leftArm.rotation.z = 0.8;
  if (rightArm) rightArm.rotation.z = -0.8;

  // Tail spiral
  for (let i = 0; i < 6; i++) {
    const tail = group.getObjectByName(`tail_${i}`);
    if (tail) {
      tail.rotation.z = Math.sin(time * 6 + i * 0.8) * 0.3;
    }
  }
}
