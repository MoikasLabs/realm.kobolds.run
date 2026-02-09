import { Position } from '@/types/agent';
import { Building } from './buildings';

export interface PathNode {
  x: number;
  z: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

export class Pathfinder {
  private gridSize = 5;
  private obstacles: Set<string> = new Set();

  setObstacles(buildings: Building[]): void {
    this.obstacles.clear();
    
    for (const building of buildings) {
      // Add building footprint as obstacles (with padding)
      const padding = 3;
      const halfWidth = building.size.width / 2 + padding;
      const halfDepth = building.size.depth / 2 + padding;
      
      for (let x = building.position.x - halfWidth; x <= building.position.x + halfWidth; x += this.gridSize) {
        for (let z = building.position.z - halfDepth; z <= building.position.z + halfDepth; z += this.gridSize) {
          this.obstacles.add(`${Math.round(x)},${Math.round(z)}`);
        }
      }
    }
  }

  // Simple A* implementation (simplified for demo)
  findPath(start: Position, end: Position): Position[] {
    // For demo: just return linear interpolation with some midpoint points
    // A full A* would be implemented for production
    
    const direct = distance(start, end);
    const steps = Math.max(2, Math.ceil(direct / 10));
    const path: Position[] = [];
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      path.push({
        x: lerp(start.x, end.x, t),
        y: 0.8,
        z: lerp(start.z, end.z, t)
      });
    }
    
    return path;
  }

  // More sophisticated path with obstacles
  findPathWithAvoidance(start: Position, end: Position, buildings: Building[]): Position[] {
    // Check if direct path clears buildings
    const directPath = this.findPath(start, end);
    if (this.isPathClear(directPath, buildings)) {
      return directPath;
    }
    
    // Try waypoints around buildings
    const alternatePaths = this.generateAlternatePaths(start, end, buildings);
    
    for (const path of alternatePaths) {
      if (this.isPathClear(path, buildings)) {
        return path;
      }
    }
    
    // Return direct path anyway, will clip through
    return directPath;
  }

  private isPathClear(path: Position[], buildings: Building[]): boolean {
    for (const point of path) {
      for (const building of buildings) {
        const dx = Math.abs(point.x - building.position.x);
        const dz = Math.abs(point.z - building.position.z);
        const halfWidth = building.size.width / 2 + 1;
        const halfDepth = building.size.depth / 2 + 1;
        
        if (dx < halfWidth && dz < halfDepth) {
          return false;
        }
      }
    }
    return true;
  }

  private generateAlternatePaths(start: Position, end: Position, buildings: Building[]): Position[][] {
    const paths: Position[][] = [];
    const midX = (start.x + end.x) / 2;
    const midZ = (start.z + end.z) / 2;
    
    // Generate paths with different midpoints (offset from center line)
    const offsets = [-30, -15, 15, 30];
    
    for (const offset of offsets) {
      // Try offset perpendicular to direction
      const dirX = end.x - start.x;
      const dirZ = end.z - start.z;
      const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
      const perpX = -dirZ / len;
      const perpZ = dirX / len;
      
      const midPoint: Position = {
        x: midX + perpX * offset,
        y: 0.8,
        z: midZ + perpZ * offset
      };
      
      const path = [
        start,
        midPoint,
        end
      ];
      
      paths.push(path);
    }
    
    return paths;
  }

  // Get entrance position with offset from building
  getEntrance(building: Building, fromDirection?: Position): Position {
    const offset = building.size.width / 2 + 2;
    let angle = fromDirection 
      ? Math.atan2(building.position.z - fromDirection.z, building.position.x - fromDirection.x)
      : Math.random() * Math.PI * 2;
    
    // Normalize to point away or toward building
    angle = angle + Math.PI; // Face building
    
    return {
      x: building.position.x + Math.cos(angle) * offset,
      y: 0.8,
      z: building.position.z + Math.sin(angle) * offset
    };
  }
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function lerpPosition(start: Position, end: Position, t: number): Position {
  return {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t),
    z: lerp(start.z, end.z, t)
  };
}

export function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distanceXZ(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export const pathfinder = new Pathfinder();
