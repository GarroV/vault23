export type PlanId = 'trial' | 'free' | 'solo' | 'team';

export interface PlanLimits {
  maxTasks: number;
  maxKbEntries: number;
  maxVoicePerMonth: number;
  maxEmailPerMonth: number;
  calendarSync: boolean;
  subtasks: boolean;
  maxMembers: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  trial: {
    maxTasks: 20,
    maxKbEntries: 5,
    maxVoicePerMonth: 3,
    maxEmailPerMonth: 0,
    calendarSync: false,
    subtasks: false,
    maxMembers: 1,
  },
  free: {
    maxTasks: 20,
    maxKbEntries: 5,
    maxVoicePerMonth: 3,
    maxEmailPerMonth: 0,
    calendarSync: false,
    subtasks: false,
    maxMembers: 1,
  },
  solo: {
    maxTasks: Infinity,
    maxKbEntries: 100,
    maxVoicePerMonth: 50,
    maxEmailPerMonth: 20,
    calendarSync: true,
    subtasks: true,
    maxMembers: 1,
  },
  team: {
    maxTasks: Infinity,
    maxKbEntries: 500,
    maxVoicePerMonth: 200,
    maxEmailPerMonth: 100,
    calendarSync: true,
    subtasks: true,
    maxMembers: 5,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as PlanId] ?? PLAN_LIMITS.free;
}

export const ACTIVE_STATUSES = new Set(['trial', 'active', 'past_due']);
export const GRACE_STATUSES = new Set(['past_due']);
