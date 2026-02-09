import { Agent, ScheduleTask } from '@/types/agent';
import { BUILDINGS } from './buildings';

export const HOURS_TO_MS = (hours: number) => hours * 60 * 60 * 1000;

export class ScheduleGenerator {
  private getWorkBuilding(role: string): string {
    const building = BUILDINGS.find(b => 
      b.allowedRoles.includes(role) && b.type === 'office'
    );
    return building?.id || 'dragon-perch';
  }

  private getRandomService(): string {
    const services = BUILDINGS.filter(b => 
      b.type === 'service' || b.type === 'commerce' || b.type === 'social'
    );
    return services[Math.floor(Math.random() * services.length)]?.id || 'tavern';
  }

  private timeToHours(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + minutes / 60;
  }

  generateDailySchedule(agent: Agent): ScheduleTask[] {
    const role = agent.subtype;
    const tasks: ScheduleTask[] = [];
    
    // Schedule depends on agent role
    if (role === 'shalom') {
      return this.generateDragonSchedule();
    } else if (['ceo', 'cmo', 'cfo', 'cio', 'cso', 'coo'].includes(role)) {
      return this.generateCSuiteSchedule(role);
    } else {
      return this.generateKoboldSchedule();
    }
  }

  private generateDragonSchedule(): ScheduleTask[] {
    return [
      {
        id: `task_${Date.now()}_1`,
        startTime: 8.0,
        duration: 60,
        building: 'residences',
        activity: 'morning contemplation',
        priority: 8
      },
      {
        id: `task_${Date.now()}_2`,
        startTime: 9.0,
        duration: 150,
        building: 'dragon-perch',
        activity: 'world oversight',
        priority: 10
      },
      {
        id: `task_${Date.now()}_3`,
        startTime: 11.5,
        duration: 60,
        building: 'moltx-post',
        activity: 'checking communications',
        priority: 7
      },
      {
        id: `task_${Date.now()}_4`,
        startTime: 12.5,
        duration: 90,
        building: 'tavern',
        activity: 'lunch and social',
        priority: 6
      },
      {
        id: `task_${Date.now()}_5`,
        startTime: 14.0,
        duration: 180,
        building: 'town-hall',
        activity: 'executive decisions',
        priority: 9
      },
      {
        id: `task_${Date.now()}_6`,
        startTime: 17.0,
        duration: 60,
        building: 'moltbook-library',
        activity: 'knowledge review',
        priority: 7
      },
      {
        id: `task_${Date.now()}_7`,
        startTime: 18.0,
        duration: 120,
        building: 'dragon-perch',
        activity: 'evening meditation',
        priority: 8
      },
      {
        id: `task_${Date.now()}_8`,
        startTime: 20.0,
        duration: 120,
        building: 'tavern',
        activity: 'socializing with agents',
        priority: 6
      },
      {
        id: `task_${Date.now()}_9`,
        startTime: 22.0,
        duration: 60,
        building: 'residences',
        activity: 'rest and planning',
        priority: 9
      }
    ];
  }

  private generateCSuiteSchedule(role: string): ScheduleTask[] {
    const workBuilding = this.getWorkBuilding(role);
    const lunchBuilding = role === 'coo' ? 'tavern' : 'tavern';
    
    return [
      {
        id: `task_${Date.now()}_1`,
        startTime: 7.5 + Math.random() * 0.5,
        duration: 30,
        building: 'residences',
        activity: 'morning routine',
        priority: 6
      },
      {
        id: `task_${Date.now()}_2`,
        startTime: 8.0,
        duration: 120,
        building: workBuilding,
        activity: 'morning focus work',
        priority: 9
      },
      {
        id: `task_${Date.now()}_3`,
        startTime: 10.0,
        duration: 30,
        building: 'moltx-post',
        activity: 'communications check',
        priority: 7
      },
      {
        id: `task_${Date.now()}_4`,
        startTime: 10.5,
        duration: 90,
        building: workBuilding,
        activity: 'deep work session',
        priority: 9
      },
      {
        id: `task_${Date.now()}_5`,
        startTime: 12.0,
        duration: 60,
        building: lunchBuilding,
        activity: 'lunch break',
        priority: 5
      },
      {
        id: `task_${Date.now()}_6`,
        startTime: 13.0,
        duration: 180,
        building: workBuilding,
        activity: 'afternoon execution',
        priority: 9
      },
      {
        id: `task_${Date.now()}_7`,
        startTime: 16.0,
        duration: 30,
        building: 'moltbook-library',
        activity: 'research and learning',
        priority: 6
      },
      {
        id: `task_${Date.now()}_8`,
        startTime: 16.5,
        duration: 90,
        building: workBuilding,
        activity: 'wrap up and planning',
        priority: 8
      },
      {
        id: `task_${Date.now()}_9`,
        startTime: 18.0,
        duration: 120,
        building: role === 'cmo' ? 'market-square' : role === 'cmo' ? 'tavern' : this.getRandomService(),
        activity: 'afternoon activities',
        priority: 5
      },
      {
        id: `task_${Date.now()}_10`,
        startTime: 20.0,
        duration: 60,
        building: workBuilding,
        activity: 'evening review',
        priority: 7
      },
      {
        id: `task_${Date.now()}_11`,
        startTime: 21.0,
        duration: 60,
        building: 'residences',
        activity: 'dinner and rest',
        priority: 6
      },
      {
        id: `task_${Date.now()}_12`,
        startTime: 22.0,
        duration: 60,
        building: 'residences',
        activity: 'prepare for sleep',
        priority: 6
      }
    ];
  }

  private generateKoboldSchedule(): ScheduleTask[] {
    const services = ['moltx-post', 'moltbook-library', 'trading-post', 'forge'];
    
    return [
      {
        id: `task_${Date.now()}_1`,
        startTime: 6.0,
        duration: 30,
        building: 'residences',
        activity: 'wake up and prepare',
        priority: 7
      },
      {
        id: `task_${Date.now()}_2`,
        startTime: 7.0,
        duration: 120,
        building: services[Math.floor(Math.random() * services.length)],
        activity: 'morning duties',
        priority: 8
      },
      {
        id: `task_${Date.now()}_3`,
        startTime: 9.5,
        duration: 150,
        building: services[Math.floor(Math.random() * services.length)],
        activity: 'skilled work',
        priority: 9
      },
      {
        id: `task_${Date.now()}_4`,
        startTime: 12.0,
        duration: 90,
        building: 'tavern',
        activity: 'lunch with friends',
        priority: 6
      },
      {
        id: `task_${Date.now()}_5`,
        startTime: 13.5,
        duration: 120,
        building: services[Math.floor(Math.random() * services.length)],
        activity: 'afternoon tasks',
        priority: 8
      },
      {
        id: `task_${Date.now()}_6`,
        startTime: 15.5,
        duration: 60,
        building: 'moltbook-library',
        activity: 'learning and research',
        priority: 6
      },
      {
        id: `task_${Date.now()}_7`,
        startTime: 17.0,
        duration: 180,
        building: services[Math.floor(Math.random() * services.length)],
        activity: 'evening work',
        priority: 8
      },
      {
        id: `task_${Date.now()}_8`,
        startTime: 20.0,
        duration: 120,
        building: 'tavern',
        activity: 'social time',
        priority: 5
      },
      {
        id: `task_${Date.now()}_9`,
        startTime: 22.0,
        duration: 60,
        building: 'residences',
        activity: 'rest',
        priority: 7
      }
    ];
  }

  getCurrentTask(agent: Agent, currentHour: number): ScheduleTask | null {
    if (!agent.schedule || agent.schedule.length === 0) return null;
    
    for (const task of agent.schedule) {
      const startTime = task.startTime;
      const endTime = startTime + task.duration / 60;
      
      if (currentHour >= startTime && currentHour < endTime) {
        return task;
      }
    }
    
    return null;
  }

  getNextTask(agent: Agent, currentHour: number): ScheduleTask | null {
    if (!agent.schedule || agent.schedule.length === 0) return null;
    
    const sortedTasks = [...agent.schedule].sort((a, b) => a.startTime - b.startTime);
    
    for (const task of sortedTasks) {
      if (task.startTime > currentHour) {
        return task;
      }
    }
    
    return null;
  }
}

export const scheduleGenerator = new ScheduleGenerator();
