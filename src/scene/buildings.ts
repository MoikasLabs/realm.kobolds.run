import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

export interface BuildingDef {
  id: string;
  name: string;
  position: THREE.Vector3;
  obstacleRadius: number;
  mesh: THREE.Group;
}

/**
 * Create all interactive buildings in the ocean world.
 * Returns building definitions + obstacle data for collision avoidance.
 */
export function createBuildings(scene: THREE.Scene): {
  buildings: BuildingDef[];
  obstacles: { x: number; z: number; radius: number }[];
} {
  const buildings: BuildingDef[] = [];
  const obstacles: { x: number; z: number; radius: number }[] = [];

  // ── Moltbook Bulletin Board ──────────────────────────────────
  const moltbook = createMoltbookBoard();
  moltbook.position.set(-20, 0, -20);
  scene.add(moltbook);
  buildings.push({
    id: "moltbook",
    name: "Moltbook",
    position: new THREE.Vector3(-20, 0, -20),
    obstacleRadius: 4,
    mesh: moltbook,
  });
  obstacles.push({ x: -20, z: -20, radius: 4 });

  // ── Clawhub School ───────────────────────────────────────────
  const clawhub = createClawhubSchool();
  clawhub.position.set(22, 0, -22);
  scene.add(clawhub);
  buildings.push({
    id: "clawhub",
    name: "Clawhub Academy",
    position: new THREE.Vector3(22, 0, -22),
    obstacleRadius: 6,
    mesh: clawhub,
  });
  obstacles.push({ x: 22, z: -22, radius: 6 });

  // ── Worlds Portal ───────────────────────────────────────────
  const portal = createWorldsPortal();
  portal.position.set(0, 0, -35);
  scene.add(portal);
  buildings.push({
    id: "worlds-portal",
    name: "Worlds Portal",
    position: new THREE.Vector3(0, 0, -35),
    obstacleRadius: 5,
    mesh: portal,
  });
  obstacles.push({ x: 0, z: -35, radius: 5 });

  // ── Skill Tower ────────────────────────────────────────────
  const skillTower = createSkillTower();
  skillTower.position.set(30, 0, 30);
  scene.add(skillTower);
  buildings.push({
    id: "skill-tower",
    name: "Skill Tower",
    position: new THREE.Vector3(30, 0, 30),
    obstacleRadius: 5,
    mesh: skillTower,
  });
  obstacles.push({ x: 30, z: 30, radius: 5 });

  // ── Moltx House ──────────────────────────────────────────────
  const moltx = createMoltxHouse();
  moltx.position.set(-25, 0, 25);
  scene.add(moltx);
  buildings.push({
    id: "moltx",
    name: "Moltx",
    position: new THREE.Vector3(-25, 0, 25),
    obstacleRadius: 5,
    mesh: moltx,
  });
  obstacles.push({ x: -25, z: 25, radius: 5 });

  // ── Moltlaunch House ───────────────────────────────────────
  const moltlaunch = createMoltlaunchHouse();
  moltlaunch.position.set(0, 0, 30);
  scene.add(moltlaunch);
  buildings.push({
    id: "moltlaunch",
    name: "Moltlaunch",
    position: new THREE.Vector3(0, 0, 30),
    obstacleRadius: 5,
    mesh: moltlaunch,
  });
  obstacles.push({ x: 0, z: 30, radius: 5 });

  // ── $KOBLDS Vault ────────────────────────────────────────
  const kobldsVault = createKobldsVault();
  kobldsVault.position.set(35, 0, 0);
  scene.add(kobldsVault);
  buildings.push({
    id: "koblds-vault",
    name: "$KOBLDS Vault",
    position: new THREE.Vector3(35, 0, 0),
    obstacleRadius: 5,
    mesh: kobldsVault,
  });
  obstacles.push({ x: 35, z: 0, radius: 5 });

  // Add floating labels above each building
  const labelHeights: Record<string, number> = {
    moltbook: 6,
    "skill-tower": 14,
    "worlds-portal": 9,
    moltx: 12,
    moltlaunch: 10,
    "koblds-vault": 5,
  };
  for (const b of buildings) {
    const el = document.createElement("div");
    el.className = "building-label";
    el.textContent = b.name;
    const labelObj = new CSS2DObject(el);
    const labelY = labelHeights[b.id] ?? 8;
    labelObj.position.set(0, labelY, 0);
    b.mesh.add(labelObj);
  }

  // ── Moltbook decorative sticky notes (3D geometry on the board) ──
  const moltbookGroup = buildings.find((b) => b.id === "moltbook")?.mesh;
  if (moltbookGroup) {
    const noteGrid = [
      // [x, y] on the board face — 3 columns x 3 rows
      [-1.0, 4.2], [0.0, 4.3], [1.0, 4.1],
      [-0.8, 3.3], [0.4, 3.2], [1.2, 3.4],
      [-0.3, 2.4], [0.8, 2.5],
    ];
    const noteColors = [0xc8e6c9, 0x81d4fa, 0xffcc80, 0xb39ddb, 0xffe082, 0x80cbc4, 0xf48fb1, 0x90caf9];

    for (let i = 0; i < noteGrid.length; i++) {
      const [nx, ny] = noteGrid[i];
      const w = 0.5 + Math.random() * 0.3;
      const h = 0.5 + Math.random() * 0.2;
      const note = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({
          color: noteColors[i % noteColors.length],
          roughness: 0.9,
        })
      );
      note.position.set(nx, ny, 0.09);
      note.rotation.z = (Math.random() - 0.5) * 0.15;
      note.userData.buildingId = "moltbook";
      moltbookGroup.add(note);
    }
  }

  return { buildings, obstacles };
}

function createMoltbookBoard(): THREE.Group {
  const group = new THREE.Group();
  group.name = "building_moltbook";
  group.userData.buildingId = "moltbook";

  // Posts (two wooden poles)
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.18, 5, 8),
      postMat
    );
    post.position.set(side * 1.8, 2.5, 0);
    post.castShadow = true;
    group.add(post);
  }

  // Board (main panel)
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.7 });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 0.15),
    boardMat
  );
  board.position.set(0, 3.5, 0);
  board.castShadow = true;
  group.add(board);

  // Board frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.6 });
  const frameGeo = new THREE.BoxGeometry(4.3, 3.3, 0.1);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.set(0, 3.5, -0.1);
  group.add(frame);

  // Decorative sticky notes are added as 3D meshes in createBuildings()

  // "Moltbook" title on top
  const titleBg = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.5, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xff7043 })
  );
  titleBg.position.set(0, 5.2, 0);
  group.add(titleBg);

  // Small roof
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.8 });
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.2, 1),
    roofMat
  );
  roof.position.set(0, 5.5, 0);
  roof.castShadow = true;
  group.add(roof);

  // Mark all meshes as interactable
  group.traverse((child) => {
    child.userData.buildingId = "moltbook";
  });

  return group;
}

function createClawhubSchool(): THREE.Group {
  const group = new THREE.Group();
  group.name = "building_clawhub";
  group.userData.buildingId = "clawhub";

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.6 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x00bcd4, roughness: 0.3 });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x4fc3f7,
    emissive: 0x0288d1,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.8,
  });

  // Main building body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(8, 5, 6),
    wallMat
  );
  body.position.set(0, 2.5, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Roof (pitched)
  const roofGeo = new THREE.ConeGeometry(5.5, 2, 4);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 6, 0);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  // Door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 2.5, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x5d4037 })
  );
  door.position.set(0, 1.25, 3.05);
  group.add(door);

  // Door accent (arch)
  const doorArch = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.3, 0.15),
    accentMat
  );
  doorArch.position.set(0, 2.6, 3.05);
  group.add(doorArch);

  // Windows (2 rows of 3)
  for (let row = 0; row < 2; row++) {
    for (let col = -1; col <= 1; col++) {
      if (row === 0 && col === 0) continue; // Door position
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.8),
        windowMat
      );
      win.position.set(col * 2.2, 1.5 + row * 2, 3.06);
      group.add(win);
    }
  }

  // Side windows
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.8),
        windowMat
      );
      win.position.set(side * 4.06, 2.5 + (i % 2) * 1.5, -1 + i * 1.5);
      win.rotation.y = side * Math.PI / 2;
      group.add(win);
    }
  }

  // "Clawhub" sign above door
  const signBg = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.7, 0.1),
    accentMat
  );
  signBg.position.set(0, 4.5, 3.06);
  group.add(signBg);

  // Flag pole on roof
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2, 6),
    new THREE.MeshStandardMaterial({ color: 0x9e9e9e })
  );
  pole.position.set(0, 7.5, 0);
  group.add(pole);

  // Flag
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x00bcd4, side: THREE.DoubleSide })
  );
  flag.position.set(0.5, 8, 0);
  group.add(flag);

  // Mark all meshes as interactable
  group.traverse((child) => {
    child.userData.buildingId = "clawhub";
  });

  return group;
}

function createSkillTower(): THREE.Group {
  const group = new THREE.Group();
  group.name = "building_skill_tower";
  group.userData.buildingId = "skill-tower";

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.7 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.5 });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xffcc80,
    emissive: 0xff9800,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.8,
  });

  // Platform: octagonal base
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4.5, 0.4, 8),
    stoneMat
  );
  platform.position.set(0, 0.2, 0);
  platform.receiveShadow = true;
  group.add(platform);

  // Tower body: tapered cylinder
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 3.5, 10, 8),
    stoneMat
  );
  body.position.set(0, 5.2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Floor rings at 3 tiers
  const ringColors = [0x4caf50, 0x2196f3, 0x9c27b0]; // novice, adept, master
  const ringHeights = [3, 6, 9];
  for (let i = 0; i < 3; i++) {
    const ringMat = new THREE.MeshStandardMaterial({
      color: ringColors[i],
      emissive: ringColors[i],
      emissiveIntensity: 0.2,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.2 - i * 0.3, 0.12, 8, 16),
      ringMat
    );
    ring.position.set(0, ringHeights[i], 0);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  // Roof: pointed cone
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(3, 3, 8),
    roofMat
  );
  roof.position.set(0, 11.7, 0);
  roof.castShadow = true;
  group.add(roof);

  // Crystal: glowing sphere on top
  const crystal = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0xffcc80,
      emissive: 0xff9800,
      emissiveIntensity: 0.8,
    })
  );
  crystal.position.set(0, 13.5, 0);
  group.add(crystal);

  // Door: arched box on front face
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x5d4037 })
  );
  door.position.set(0, 1.5, 3.55);
  group.add(door);

  const doorArch = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.3, 0.15),
    new THREE.MeshStandardMaterial({
      color: 0xff9800,
      emissive: 0xff9800,
      emissiveIntensity: 0.15,
    })
  );
  doorArch.position.set(0, 2.7, 3.55);
  group.add(doorArch);

  // Windows: 3 per tier level, around the tower
  for (let tier = 0; tier < 3; tier++) {
    const h = ringHeights[tier] + 0.5;
    const r = 3.3 - tier * 0.3;
    for (let w = 0; w < 3; w++) {
      const angle = (w / 3) * Math.PI * 2 + Math.PI / 6;
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.8),
        windowMat
      );
      win.position.set(
        Math.sin(angle) * r,
        h,
        Math.cos(angle) * r
      );
      win.lookAt(0, h, 0);
      win.rotateY(Math.PI);
      group.add(win);
    }
  }

  // Banner: flag pole + flag
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2, 6),
    new THREE.MeshStandardMaterial({ color: 0x9e9e9e })
  );
  pole.position.set(2.2, 11, 0);
  group.add(pole);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xff9800, side: THREE.DoubleSide })
  );
  flag.position.set(2.7, 11.5, 0);
  group.add(flag);

  // Mark all meshes as interactable
  group.traverse((child) => {
    child.userData.buildingId = "skill-tower";
  });

  return group;
}

function createMoltxHouse(): THREE.Group {
  const group = new THREE.Group();
  group.name = "building_moltx";
  group.userData.buildingId = "moltx";

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a237e, roughness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x00e5ff,
    emissive: 0x00e5ff,
    emissiveIntensity: 0.3,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x00e5ff,
    emissive: 0x00bcd4,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.8,
  });

  // Hexagonal platform base
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4.5, 0.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x283593, roughness: 0.7 })
  );
  platform.position.set(0, 0.2, 0);
  platform.receiveShadow = true;
  group.add(platform);

  // Main body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(5, 6, 5),
    wallMat
  );
  body.position.set(0, 3.2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Pitched roof
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(4.2, 2, 4),
    new THREE.MeshStandardMaterial({ color: 0x0d47a1, roughness: 0.5 })
  );
  roof.position.set(0, 7.2, 0);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  // Antenna tower on top
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x90a4ae })
  );
  antenna.position.set(0, 9.7, 0);
  group.add(antenna);

  // Signal rings (3 torus rings)
  const ringHeights = [9.0, 10.0, 11.0];
  const ringSizes = [1.2, 0.9, 0.6];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringSizes[i], 0.06, 8, 24),
      new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 0.6,
      })
    );
    ring.position.set(0, ringHeights[i], 0);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  // Glowing teal windows (front face)
  for (let row = 0; row < 2; row++) {
    for (let col = -1; col <= 1; col++) {
      if (row === 0 && col === 0) continue; // door position
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.7),
        windowMat
      );
      win.position.set(col * 1.5, 2 + row * 2, 2.56);
      group.add(win);
    }
  }

  // Side windows
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.7),
        windowMat
      );
      win.position.set(side * 2.56, 2.5 + i * 2, 0);
      win.rotation.y = side * Math.PI / 2;
      group.add(win);
    }
  }

  // Door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 2.2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x0d47a1 })
  );
  door.position.set(0, 1.3, 2.56);
  group.add(door);

  // Door accent
  const doorArch = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.3, 0.15),
    accentMat
  );
  doorArch.position.set(0, 2.5, 2.56);
  group.add(doorArch);

  // "Moltx" sign above door
  const signBg = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.6, 0.1),
    accentMat
  );
  signBg.position.set(0, 5, 2.56);
  group.add(signBg);

  // Mark all meshes as interactable
  group.traverse((child) => {
    child.userData.buildingId = "moltx";
  });

  return group;
}

function createMoltlaunchHouse(): THREE.Group {
  const group = new THREE.Group();
  group.name = "building_moltlaunch";
  group.userData.buildingId = "moltlaunch";

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xff6d00,
    emissive: 0xff6d00,
    emissiveIntensity: 0.3,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xffab00,
    emissive: 0xff8f00,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.8,
  });

  // Circular launchpad base
  const launchpad = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5, 0.3, 32),
    new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.7 })
  );
  launchpad.position.set(0, 0.15, 0);
  launchpad.receiveShadow = true;
  group.add(launchpad);

  // Concentric orange ring markings on launchpad
  for (let i = 1; i <= 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(i * 1.4, 0.08, 8, 32),
      new THREE.MeshStandardMaterial({
        color: 0xff6d00,
        emissive: 0xff6d00,
        emissiveIntensity: 0.2,
      })
    );
    ring.position.set(0, 0.32, 0);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  // Control tower body (narrower base)
  const towerBase = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 2.5, 5, 8),
    wallMat
  );
  towerBase.position.set(0, 2.8, 0);
  towerBase.castShadow = true;
  towerBase.receiveShadow = true;
  group.add(towerBase);

  // Observation deck (wider top section)
  const obsDeck = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 2, 2.5, 8),
    wallMat
  );
  obsDeck.position.set(0, 6.55, 0);
  obsDeck.castShadow = true;
  group.add(obsDeck);

  // Wrap-around amber windows on observation deck
  for (let w = 0; w < 8; w++) {
    const angle = (w / 8) * Math.PI * 2;
    const r = 2.6;
    const win = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1),
      windowMat
    );
    win.position.set(
      Math.sin(angle) * r,
      6.55,
      Math.cos(angle) * r
    );
    win.lookAt(0, 6.55, 0);
    win.rotateY(Math.PI);
    group.add(win);
  }

  // Roof cap
  const roofCap = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.5 })
  );
  roofCap.position.set(0, 8.55, 0);
  roofCap.castShadow = true;
  group.add(roofCap);

  // Orange beacon sphere on top
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0xff6d00,
      emissive: 0xff6d00,
      emissiveIntensity: 0.8,
    })
  );
  beacon.position.set(0, 9.5, 0);
  group.add(beacon);

  // Door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x263238 })
  );
  door.position.set(0, 1.4, 2.55);
  group.add(door);

  // Door accent
  const doorArch = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.3, 0.15),
    accentMat
  );
  doorArch.position.set(0, 2.6, 2.55);
  group.add(doorArch);

  // Rocket silhouette decorations flanking the door
  for (const side of [-1, 1]) {
    // Rocket body (narrow cylinder)
    const rocketBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 1.8, 6),
      accentMat
    );
    rocketBody.position.set(side * 1.2, 1.5, 2.56);
    group.add(rocketBody);

    // Rocket nose cone
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.5, 6),
      accentMat
    );
    nose.position.set(side * 1.2, 2.65, 2.56);
    group.add(nose);
  }

  // Mark all meshes as interactable
  group.traverse((child) => {
    child.userData.buildingId = "moltlaunch";
  });

  return group;
}

function createKobldsVault(): THREE.Group {
  const group = new THREE.Group();
  group.name = "building_koblds_vault";
  group.userData.buildingId = "koblds-vault";

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3e3e3e, roughness: 0.8 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.4 });
  const darkGoldMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.5 });
  const glowGoldMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xdaa520,
    emissiveIntensity: 0.6,
  });

  // Stone platform base (octagonal)
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(4.5, 5, 0.4, 8),
    stoneMat
  );
  platform.position.set(0, 0.2, 0);
  platform.receiveShadow = true;
  group.add(platform);

  // Sunken vault walls (half underground)
  const vaultWalls = new THREE.Mesh(
    new THREE.BoxGeometry(7, 2, 7),
    goldMat
  );
  vaultWalls.position.set(0, -0.5, 0);
  vaultWalls.castShadow = true;
  vaultWalls.receiveShadow = true;
  group.add(vaultWalls);

  // Staircase — 5 descending steps
  for (let i = 0; i < 5; i++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.25, 0.8),
      darkGoldMat
    );
    step.position.set(0, -i * 0.3, 3.5 + i * 0.6);
    step.castShadow = true;
    group.add(step);
  }

  // Vault door frame (archway)
  const doorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 3, 0.3),
    darkGoldMat
  );
  doorFrame.position.set(0, 1, 3.5);
  doorFrame.castShadow = true;
  group.add(doorFrame);

  // Vault door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2.5, 0.15),
    goldMat
  );
  door.position.set(0, 0.8, 3.55);
  group.add(door);

  // Door handle (circular torus)
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.05, 8, 16),
    darkGoldMat
  );
  handle.position.set(0.5, 0.8, 3.65);
  group.add(handle);

  // Corner pillars (4x) with glowing caps
  const pillarPositions = [
    [-3, -3], [3, -3], [-3, 3], [3, 3],
  ];
  for (const [px, pz] of pillarPositions) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.35, 3, 8),
      darkGoldMat
    );
    pillar.position.set(px, 1.5, pz);
    pillar.castShadow = true;
    group.add(pillar);

    // Glowing cap
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 8),
      glowGoldMat
    );
    cap.position.set(px, 3.1, pz);
    group.add(cap);
  }

  // $KOBLDS coin symbols (2x) flanking entrance
  for (const side of [-1, 1]) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16),
      glowGoldMat
    );
    coin.position.set(side * 1.8, 2.2, 3.5);
    coin.rotation.x = Math.PI / 2;
    group.add(coin);
  }

  // Low perimeter wall around the sunken area
  const wallSegments = [
    { pos: [0, 0.3, -3.6] as const, size: [7.2, 0.6, 0.2] as const },
    { pos: [0, 0.3, 3.0] as const, size: [7.2, 0.6, 0.2] as const },
    { pos: [-3.6, 0.3, 0] as const, size: [0.2, 0.6, 7.2] as const },
    { pos: [3.6, 0.3, 0] as const, size: [0.2, 0.6, 7.2] as const },
  ];
  for (const seg of wallSegments) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(seg.size[0], seg.size[1], seg.size[2]),
      stoneMat
    );
    wall.position.set(seg.pos[0], seg.pos[1], seg.pos[2]);
    group.add(wall);
  }

  // "Vault" sign above door
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.5, 0.08),
    glowGoldMat
  );
  sign.position.set(0, 2.8, 3.55);
  group.add(sign);

  // Decorative gold bars visible through grate (3x small boxes)
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.6, 0.15),
      goldMat
    );
    bar.position.set(-0.5 + i * 0.5, 0.1, -2.5);
    group.add(bar);
  }

  // Mark all meshes as interactable
  group.traverse((child) => {
    child.userData.buildingId = "koblds-vault";
  });

  return group;
}

function createWorldsPortal(): THREE.Group {
  const group = new THREE.Group();
  group.name = "building_worlds_portal";
  group.userData.buildingId = "worlds-portal";

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x78909c, roughness: 0.7 });
  const portalMat = new THREE.MeshStandardMaterial({
    color: 0x7c4dff,
    emissive: 0x4527a0,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.6,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xb388ff,
    emissive: 0x7c4dff,
    emissiveIntensity: 0.2,
  });

  // Stone arch (two pillars + top)
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 7, 1.2),
      stoneMat
    );
    pillar.position.set(side * 3, 3.5, 0);
    pillar.castShadow = true;
    group.add(pillar);

    // Pillar base
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.5, 1.8),
      stoneMat
    );
    base.position.set(side * 3, 0.25, 0);
    group.add(base);

    // Pillar cap
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.4, 1.6),
      stoneMat
    );
    cap.position.set(side * 3, 7.2, 0);
    group.add(cap);
  }

  // Top arch beam
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(7.5, 1, 1.2),
    stoneMat
  );
  beam.position.set(0, 7.5, 0);
  beam.castShadow = true;
  group.add(beam);

  // Portal surface (glowing plane)
  const portalPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 6.5),
    portalMat
  );
  portalPlane.position.set(0, 3.5, 0);
  group.add(portalPlane);

  // Portal back side
  const portalBack = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 6.5),
    portalMat
  );
  portalBack.position.set(0, 3.5, -0.01);
  portalBack.rotation.y = Math.PI;
  group.add(portalBack);

  // Decorative runes on pillars
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const rune = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.4),
        accentMat
      );
      rune.position.set(side * 3, 2 + i * 1.8, 0.65);
      group.add(rune);
    }
  }

  // Glowing orb on top
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0xb388ff,
      emissive: 0x7c4dff,
      emissiveIntensity: 0.8,
    })
  );
  orb.position.set(0, 8.3, 0);
  group.add(orb);

  // Platform base
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4.5, 0.4, 8),
    stoneMat
  );
  platform.position.set(0, 0.2, 0);
  platform.receiveShadow = true;
  group.add(platform);

  // Mark all meshes as interactable
  group.traverse((child) => {
    child.userData.buildingId = "worlds-portal";
  });

  return group;
}
