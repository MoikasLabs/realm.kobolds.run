import * as THREE from "three";
import * as Lobster from "./lobster.js";
import * as Kobold from "./kobold.js";

/**
 * Agent Skins Registry - Scalable system for creature variety
 * Adding a new skin: create module → register here → done
 */

export type SkinType = "lobster" | "kobold";

interface SkinModule {
  create: (color: string) => THREE.Group;
  animateIdle: (group: THREE.Group, time: number) => void;
  animateWalk: (group: THREE.Group, time: number) => void;
  animateClawSnap: (group: THREE.Group, time: number) => void;
  animateWave: (group: THREE.Group, time: number) => void;
  animateDance: (group: THREE.Group, time: number) => void;
  animateBackflip: (group: THREE.Group, time: number) => void;
  animateSpin: (group: THREE.Group, time: number) => void;
}

const registry: Record<SkinType, SkinModule> = {
  lobster: {
    create: Lobster.createLobster,
    animateIdle: Lobster.animateIdle,
    animateWalk: Lobster.animateWalk,
    animateClawSnap: Lobster.animateClawSnap,
    animateWave: Lobster.animateWave,
    animateDance: Lobster.animateDance,
    animateBackflip: Lobster.animateBackflip,
    animateSpin: Lobster.animateSpin,
  },
  kobold: {
    create: Kobold.createKobold,
    animateIdle: Kobold.animateIdle,
    animateWalk: Kobold.animateWalk,
    animateClawSnap: Kobold.animateClawSnap,
    animateWave: Kobold.animateWave,
    animateDance: Kobold.animateDance,
    animateBackflip: Kobold.animateBackflip,
    animateSpin: Kobold.animateSpin,
  },
};

/** Get available skin types */
export function getAvailableSkins(): SkinType[] {
  return Object.keys(registry) as SkinType[];
}

/** Check if skin exists */
export function isValidSkin(skin: string): skin is SkinType {
  return skin in registry;
}

/** Create mesh for skin type (defaults to kobold if invalid) */
export function createAgentMesh(skin: SkinType | string, color: string): THREE.Group {
  const validSkin = isValidSkin(skin) ? skin : "kobold";
  const group = registry[validSkin].create(color);
  group.userData.skin = validSkin;
  return group;
}

/** Get animation function for an agent's skin */
export function animate(
  group: THREE.Group,
  animation: keyof SkinModule,
  time: number
): void {
  const skin = (group.userData.skin as SkinType) || "kobold";
  const module = registry[skin];
  const fn = module[animation];
  if (fn && animation !== "create") {
    fn(group, time);
  }
}

/** Register a new skin at runtime (for plugins/mods) */
export function registerSkin(type: SkinType, module: SkinModule): void {
  registry[type] = module;
}
