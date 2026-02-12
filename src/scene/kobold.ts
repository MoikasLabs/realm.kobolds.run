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

  const baseColor = new THREE.Color(color);
  const darkColor = baseColor.clone().multiplyScalar(0.6);
  const bellyColor = baseColor.clone().offsetHSL(0, 0, 0.15);

  const bodyMat = new THREE.MeshToonMaterial({ color: baseColor });
  const darkMat = new THREE.MeshToonMaterial({ color: darkColor });
  const bellyMat = new THREE.MeshToonMaterial({ color: bellyColor });
  const eyeMat = new THREE.MeshToonMaterial({ color: 0x111111 });
  const leatherMat = new THREE.MeshToonMaterial({ color: 0x8B4513 });

  // ── Body (torso) ───────────────────────────────────────────
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.5, 4, 8),
    bodyMat
  );
  body.position.set(0, 0.6, 0);
  body.castShadow = true;
  group.add(body);

  // Belly (lighter underside)
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 8),
    bellyMat
  );
  belly.scale.set(0.8, 1.2, 0.5);
  belly.position.set(0, 0.55, 0.15);
  group.add(belly);

  // ── Head ───────────────────────────────────────────────────
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.0, 0.1);

  // Main head shape
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    bodyMat
  );
  head.scale.set(1, 0.9, 1);
  head.castShadow = true;
  headGroup.add(head);

  // Snout
  const snout = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 6),
    bodyMat
  );
  snout.scale.set(1, 0.7, 1.2);
  snout.position.set(0, -0.05, 0.25);
  snout.castShadow = true;
  headGroup.add(snout);

  // Nose tip
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 6, 6),
    darkMat
  );
  nose.position.set(0, 0.02, 0.42);
  headGroup.add(nose);

  // Big ears (pointed, kobold signature)
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.4, 4),
      bodyMat
    );
    ear.position.set(side * 0.25, 0.25, -0.05);
    ear.rotation.z = side * -0.4;
    ear.rotation.x = -0.2;
    ear.castShadow = true;
    headGroup.add(ear);
  }

  // Eyes (large, expressive)
  for (const side of [-1, 1]) {
    const eyeWhite = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshToonMaterial({ color: 0xfff8dc })
    );
    eyeWhite.position.set(side * 0.12, 0.08, 0.22);
    headGroup.add(eyeWhite);

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      eyeMat
    );
    eye.position.set(side * 0.14, 0.08, 0.26);
    headGroup.add(eye);
  }

  group.add(headGroup);

  // ── Arms ───────────────────────────────────────────────────
  for (const side of [-1, 1]) {
    const armGroup = new THREE.Group();
    armGroup.name = side === -1 ? "arm_left" : "arm_right";
    armGroup.position.set(side * 0.45, 0.85, 0);

    // Upper arm
    const upperArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.08, 0.35, 4, 6),
      bodyMat
    );
    upperArm.position.set(side * 0.15, -0.15, 0);
    upperArm.rotation.z = side * 0.3;
    upperArm.castShadow = true;
    armGroup.add(upperArm);

    // Forearm
    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.07, 0.3, 4, 6),
      bodyMat
    );
    forearm.position.set(side * 0.25, -0.45, 0.1);
    forearm.rotation.x = -0.4;
    forearm.castShadow = true;
    armGroup.add(forearm);

    // Hand (3-fingered claw)
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 6),
      darkMat
    );
    hand.scale.set(1, 0.7, 1.2);
    hand.position.set(side * 0.3, -0.65, 0.15);
    armGroup.add(hand);

    group.add(armGroup);
  }

  // ── Legs ────────────────────────────────────────────────────
  for (const side of [-1, 1]) {
    const legGroup = new THREE.Group();
    legGroup.name = side === -1 ? "leg_left" : "leg_right";
    legGroup.position.set(side * 0.2, 0.35, 0);

    // Thigh
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 0.35, 4, 6),
      bodyMat
    );
    thigh.position.set(0, -0.15, 0);
    thigh.castShadow = true;
    legGroup.add(thigh);

    // Shin
    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.08, 0.35, 4, 6),
      bodyMat
    );
    shin.position.set(0, -0.55, 0.05);
    shin.rotation.x = 0.2;
    shin.castShadow = true;
    legGroup.add(shin);

    // Foot
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.08, 0.25),
      darkMat
    );
    foot.position.set(0, -0.78, 0.1);
    legGroup.add(foot);

    group.add(legGroup);
  }

  // ── Tail (long, tapered, reptilian) ────────────────────────
  const tailSegments = 6;
  let prevTail: THREE.Object3D = group;
  let tailX = 0, tailY = 0.25, tailZ = -0.3;

  for (let i = 0; i < tailSegments; i++) {
    const t = i / tailSegments;
    const radius = 0.18 * (1 - t * 0.7);
    const length = 0.25;

    const tailSeg = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 8, 6),
      i % 2 === 0 ? bodyMat : darkMat
    );
    tailSeg.scale.set(1, 1, 1.5);
    tailSeg.position.set(tailX, tailY - i * 0.05, tailZ - i * 0.2);
    tailSeg.rotation.x = 0.3 + i * 0.1;
    tailSeg.castShadow = true;
    tailSeg.name = `tail_${i}`;
    group.add(tailSeg);
  }

  // ── Simple Leather Apron (minimal) ─────────────────────────
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.4, 0.1),
    leatherMat
  );
  apron.position.set(0, 0.4, 0.22);
  apron.castShadow = true;
  group.add(apron);

  // Strap
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.08, 0.35),
    leatherMat
  );
  strap.position.set(0, 0.78, 0);
  group.add(strap);

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
  const eased = phase < 0.5
    ? 2 * phase * phase
    : 1 - Math.pow(-2 * phase + 2, 2) / 2;

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
