import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Workstation, WorkstationAssignment, ZoneType } from "./types.js";

const WORKSTATIONS_PATH = resolve(process.cwd(), "workstations.json");
const ASSIGNMENTS_PATH = resolve(process.cwd(), "workstation-assignments.json");

/** Default workstation configurations for the realm */
const DEFAULT_WORKSTATIONS: Workstation[] = [
  // Forge - Infrastructure & Deployment (positioned AWAY from Clawhub obstacle at 22,-22 r=6)
  {
    id: "k8s-deployer",
    name: "K8s Deployment Station",
    zone: "forge",
    skillRequired: "deployment",
    position: { x: 32, z: -12 },  // Moved from (25,-20) - was too close to Clawhub
  },
  {
    id: "terraform-station",
    name: "Terraform Workbench",
    zone: "forge",
    skillRequired: "infrastructure",
    position: { x: 35, z: -8 },   // Safe distance from Clawhub
  },
  {
    id: "docker-builder",
    name: "Container Build Station",
    zone: "forge",
    skillRequired: "deployment",
    position: { x: 38, z: -18 },  // Moved from (28,-25) - was too close to Clawhub
  },
  // Spire - Security & Secrets
  {
    id: "vault-unlocker",
    name: "Vault Unlocker Station",
    zone: "spire",
    skillRequired: "security",
    position: { x: -20, z: 25 },
  },
  {
    id: "audit-helm",
    name: "Security Audit Helm",
    zone: "spire",
    skillRequired: "security",
    position: { x: -15, z: 30 },
  },
  {
    id: "crypto-analyzer",
    name: "Cryptographic Analyzer",
    zone: "spire",
    skillRequired: "security",
    position: { x: -25, z: 28 },
  },
  // Warrens - Trading & Analysis
  {
    id: "trade-terminal",
    name: "Trading Terminal",
    zone: "warrens",
    skillRequired: "trading",
    position: { x: 15, z: 20 },
  },
  {
    id: "chart-analyzer",
    name: "Chart Analysis Desk",
    zone: "warrens",
    skillRequired: "analysis",
    position: { x: 20, z: 18 },
  },
  {
    id: "market-scanner",
    name: "Market Scanner Station",
    zone: "warrens",
    skillRequired: "trading",
    position: { x: 18, z: 25 },
  },
  // General - Orchestration & Content
  {
    id: "command-nexus",
    name: "Command Nexus",
    zone: "forge",
    skillRequired: "orchestration",
    position: { x: 0, z: -10 },
  },
  {
    id: "content-forge",
    name: "Content Creation Forge",
    zone: "warrens",
    skillRequired: "content",
    position: { x: -10, z: 10 },
  },
  {
    id: "memory-archive",
    name: "Memory Archive",
    zone: "spire",
    skillRequired: "memory",
    position: { x: 10, z: -30 },
  },
];

export class WorkstationRegistry {
  private workstations = new Map<string, Workstation>();
  private assignments = new Map<string, WorkstationAssignment>(); // agentId -> assignment

  constructor() {
    this.load();
  }

  /** Initialize default workstations if none exist */
  private initializeDefaults(): void {
    for (const ws of DEFAULT_WORKSTATIONS) {
      if (!this.workstations.has(ws.id)) {
        this.workstations.set(ws.id, { ...ws });
      }
    }
    this.save();
  }

  /** Get all workstations */
  getAll(): Workstation[] {
    return Array.from(this.workstations.values());
  }

  /** Get workstations by zone */
  getByZone(zone: ZoneType): Workstation[] {
    return this.getAll().filter((ws) => ws.zone === zone);
  }

  /** Get workstations by required skill */
  getBySkill(skillId: string): Workstation[] {
    return this.getAll().filter((ws) => ws.skillRequired === skillId);
  }

  /** Get a specific workstation */
  get(workstationId: string): Workstation | undefined {
    return this.workstations.get(workstationId);
  }

  /** Check if workstation is occupied */
  isOccupied(workstationId: string): boolean {
    const ws = this.workstations.get(workstationId);
    return ws?.occupiedBy !== undefined;
  }

  /** Get the occupant of a workstation */
  getOccupant(workstationId: string): string | undefined {
    return this.workstations.get(workstationId)?.occupiedBy;
  }

  /** Get current assignment for an agent */
  getAgentAssignment(agentId: string): WorkstationAssignment | undefined {
    return this.assignments.get(agentId);
  }

  /** Get workstation occupied by an agent (if any) */
  getAgentWorkstation(agentId: string): Workstation | undefined {
    const assignment = this.assignments.get(agentId);
    if (!assignment) return undefined;
    return this.workstations.get(assignment.workstationId);
  }

  /** Assign an agent to a workstation */
  assign(agentId: string, workstationId: string): { ok: boolean; error?: string } {
    const ws = this.workstations.get(workstationId);
    if (!ws) {
      return { ok: false, error: "workstation_not_found" };
    }

    if (ws.occupiedBy && ws.occupiedBy !== agentId) {
      return { ok: false, error: "workstation_occupied" };
    }

    // Release any existing assignment for this agent
    this.release(agentId);

    // Assign to new workstation
    ws.occupiedBy = agentId;
    ws.occupiedAt = Date.now();

    const assignment: WorkstationAssignment = {
      agentId,
      workstationId,
      startedAt: Date.now(),
    };
    this.assignments.set(agentId, assignment);
    this.save();

    return { ok: true };
  }

  /** Release an agent from their workstation */
  release(agentId: string): { ok: boolean; workstationId?: string } {
    const assignment = this.assignments.get(agentId);
    if (!assignment) {
      return { ok: false };
    }

    const ws = this.workstations.get(assignment.workstationId);
    if (ws) {
      ws.occupiedBy = undefined;
      ws.occupiedAt = undefined;
    }

    this.assignments.delete(agentId);
    this.save();

    return { ok: true, workstationId: assignment.workstationId };
  }

  /** Get all available (unoccupied) workstations */
  getAvailable(): Workstation[] {
    return this.getAll().filter((ws) => !ws.occupiedBy);
  }

  /** Get all occupied workstations with occupant info */
  getOccupied(): Array<Workstation & { occupiedBy: string; occupiedAt: number }> {
    return this.getAll().filter((ws): ws is Workstation & { occupiedBy: string; occupiedAt: number } =>
      ws.occupiedBy !== undefined && ws.occupiedAt !== undefined
    );
  }

  /** Find best matching workstation for agent based on their skills */
  findMatchingWorkstation(agentSkills: string[]): Workstation | undefined {
    const available = this.getAvailable();
    if (available.length === 0) return undefined;

    // Prioritize workstations matching agent's skills
    for (const skill of agentSkills) {
      const match = available.find((ws) => ws.skillRequired === skill);
      if (match) return match;
    }

    // Fallback to any available workstation
    return available[0];
  }

  /** Calculate path to a workstation (simplified - returns target position) */
  getPathTo(workstationId: string): { x: number; z: number } | undefined {
    const ws = this.workstations.get(workstationId);
    return ws ? { ...ws.position } : undefined;
  }

  /** Get summary of all workstations with occupancy status */
  getList(): Array<{
    id: string;
    name: string;
    zone: ZoneType;
    skillRequired: string;
    position: { x: number; z: number };
    occupied: boolean;
    occupiedBy?: { agentId: string; name?: string; since: number };
  }> {
    return this.getAll().map((ws) => ({
      id: ws.id,
      name: ws.name,
      zone: ws.zone,
      skillRequired: ws.skillRequired,
      position: ws.position,
      occupied: ws.occupiedBy !== undefined,
      occupiedBy: ws.occupiedBy && ws.occupiedAt
        ? { agentId: ws.occupiedBy, since: ws.occupiedAt }
        : undefined,
    }));
  }

  private load(): void {
    // Load workstations
    try {
      if (existsSync(WORKSTATIONS_PATH)) {
        const data = JSON.parse(readFileSync(WORKSTATIONS_PATH, "utf-8"));
        if (Array.isArray(data)) {
          for (const ws of data) {
            if (ws.id) this.workstations.set(ws.id, ws);
          }
        }
      }
    } catch {
      // Start fresh if corrupt
    }

    // Initialize defaults if empty
    if (this.workstations.size === 0) {
      this.initializeDefaults();
    }

    // Load assignments
    try {
      if (existsSync(ASSIGNMENTS_PATH)) {
        const data = JSON.parse(readFileSync(ASSIGNMENTS_PATH, "utf-8"));
        if (Array.isArray(data)) {
          for (const a of data) {
            if (a.agentId) this.assignments.set(a.agentId, a);
            // Restore workstation state
            const ws = this.workstations.get(a.workstationId);
            if (ws) {
              ws.occupiedBy = a.agentId;
              ws.occupiedAt = a.startedAt;
            }
          }
        }
      }
    } catch {
      // Start fresh if corrupt
    }
  }

  private save(): void {
    try {
      writeFileSync(
        WORKSTATIONS_PATH,
        JSON.stringify(this.getAll(), null, 2),
        "utf-8"
      );
      writeFileSync(
        ASSIGNMENTS_PATH,
        JSON.stringify(Array.from(this.assignments.values()), null, 2),
        "utf-8"
      );
    } catch {
      // Non-fatal — data is also in-memory
    }
  }
}
