import { Building } from '@/types/agent';

export const BUILDINGS: Building[] = [
  {
    id: 'town-hall',
    name: 'Town Hall',
    type: 'office',
    position: { x: 0, y: 0, z: -40 },
    size: { width: 24, depth: 18, height: 12 },
    color: '#6366f1',
    glowColor: '#818cf8',
    allowedRoles: ['ceo', 'shalom'],
    actions: ['strategize', 'plan', 'review', 'meeting'],
    description: 'Executive command center for high-level decisions',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'workshop',
    name: 'Workshop',
    type: 'office',
    position: { x: -35, y: 0, z: -20 },
    size: { width: 18, depth: 14, height: 8 },
    color: '#06b6d4',
    glowColor: '#67e8f9',
    allowedRoles: ['cio', 'shalom'],
    actions: ['code', 'debug', 'innovate', 'research'],
    description: 'Technology and innovation hub',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'market-square',
    name: 'Market Square',
    type: 'commerce',
    position: { x: 35, y: 0, z: -20 },
    size: { width: 20, depth: 20, height: 4 },
    color: '#ec4899',
    glowColor: '#f9a8d4',
    allowedRoles: ['cmo', 'shalom', '*'],
    actions: ['market', 'brand', 'promote', 'analyze'],
    description: 'Trading and marketing hub',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'treasury',
    name: 'Treasury',
    type: 'office',
    position: { x: -45, y: 0, z: 10 },
    size: { width: 14, depth: 12, height: 10 },
    color: '#16a34a',
    glowColor: '#86efac',
    allowedRoles: ['cfo', 'shalom'],
    actions: ['audit', 'budget', 'forecast', 'report'],
    description: 'Financial planning and analysis center',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'guard-tower',
    name: 'Guard Tower',
    type: 'office',
    position: { x: 45, y: 0, z: 10 },
    size: { width: 12, depth: 12, height: 16 },
    color: '#dc2626',
    glowColor: '#fca5a5',
    allowedRoles: ['cso', 'shalom'],
    actions: ['monitor', 'secure', 'audit', 'plan'],
    description: 'Security and risk management center',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'tavern',
    name: 'The Cozy Tavern',
    type: 'social',
    position: { x: 0, y: 0, z: 20 },
    size: { width: 16, depth: 14, height: 7 },
    color: '#7c3aed',
    glowColor: '#c4b5fd',
    allowedRoles: ['coo', 'shalom', '*'],
    actions: ['rest', 'socialize', 'plan-ops', 'relax'],
    description: 'Social hub for relaxation and operations planning',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'moltx-post',
    name: 'Moltx Post',
    type: 'service',
    position: { x: -30, y: 0, z: 35 },
    size: { width: 12, depth: 10, height: 6 },
    color: '#8b5cf6',
    glowColor: '#a78bfa',
    allowedRoles: ['*'],
    actions: ['post', 'read', 'engage', 'connect'],
    description: 'Communication and social media hub',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'moltbook-library',
    name: 'Moltbook Library',
    type: 'service',
    position: { x: 30, y: 0, z: 35 },
    size: { width: 14, depth: 12, height: 8 },
    color: '#f59e0b',
    glowColor: '#fcd34d',
    allowedRoles: ['*'],
    actions: ['study', 'archive', 'research', 'learn'],
    description: 'Knowledge archive and learning center',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'trading-post',
    name: 'Trading Post',
    type: 'commerce',
    position: { x: -25, y: 0, z: -35 },
    size: { width: 14, depth: 12, height: 5 },
    color: '#f97316',
    glowColor: '#fdba74',
    allowedRoles: ['*'],
    actions: ['trade', 'negotiate', 'analyze', 'deal'],
    description: 'Active trading and deal-making center',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'forge',
    name: 'The Forge',
    type: 'service',
    position: { x: 25, y: 0, z: -35 },
    size: { width: 16, depth: 14, height: 6 },
    color: '#ea580c',
    glowColor: '#fb923c',
    allowedRoles: ['*'],
    actions: ['craft', 'build', 'mint', 'create'],
    description: 'Creation and crafting headquarters',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'residences',
    name: 'Residences',
    type: 'living',
    position: { x: -15, y: 0, z: 45 },
    size: { width: 20, depth: 16, height: 6 },
    color: '#14b8a6',
    glowColor: '#5eead4',
    allowedRoles: ['*'],
    actions: ['rest', 'sleep', 'plan', 'prepare'],
    description: 'Living quarters for all agents',
    isOccupied: false,
    occupants: []
  },
  {
    id: 'dragon-perch',
    name: "Dragon's Perch",
    type: 'office',
    position: { x: 0, y: 0, z: 0 },
    size: { width: 16, depth: 16, height: 14 },
    color: '#6366f1',
    glowColor: '#ff6b35',
    allowedRoles: ['shalom'],
    actions: ['oversee', 'command', 'strategize', 'judge'],
    description: 'Shalom\'s central command position',
    isOccupied: false,
    occupants: []
  }
];

export const getBuildingById = (id: string): Building | undefined => {
  return BUILDINGS.find(b => b.id === id);
};

export const getBuildingByRole = (role: string): Building | undefined => {
  return BUILDINGS.find(b => 
    b.allowedRoles.includes(role) || b.allowedRoles.includes('*')
  );
};

export const getRandomEntrancePosition = (building: Building): { x: number; y: number; z: number } => {
  const offset = building.size.width / 2 + 2;
  const angle = Math.random() * Math.PI * 2;
  return {
    x: building.position.x + Math.cos(angle) * offset,
    y: 0.8,
    z: building.position.z + Math.sin(angle) * offset
  };
};

export const calculateDistance = (pos1: { x: number; z: number }, pos2: { x: number; z: number }): number => {
  const dx = pos1.x - pos2.x;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dz * dz);
};

export const getNearestBuilding = (position: Position, type?: string): Building => {
  let buildings = BUILDINGS;
  if (type) {
    buildings = BUILDINGS.filter(b => b.type === type);
  }
  
  return buildings.reduce((nearest, building) => {
    const dist = calculateDistance(position, building.position);
    const nearestDist = calculateDistance(position, nearest.position);
    return dist < nearestDist ? building : nearest;
  }, buildings[0]);
};
