import type { GateResult } from './types.ts';
import { getPlanLimits, ACTIVE_STATUSES } from './plans.ts';

export interface GateContext {
  workspaceStatus: string;
  workspacePlan: string;
  trialEndsAt?: string;
}

/**
 * Checks whether a feature is available for the workspace's current status and plan.
 * Count-based limits (maxTasks, maxVoice) are enforced in the individual handlers
 * that create records — they call checkUsageLimit() from billing/queries.ts.
 */
export function gate(feature: string, ctx: GateContext): GateResult {
  const { workspaceStatus, workspacePlan, trialEndsAt } = ctx;

  // Check trial expiry in real-time (cron may lag)
  if (workspaceStatus === 'trial' && trialEndsAt) {
    if (new Date(trialEndsAt).getTime() < Date.now()) {
      return { allowed: false, reason: 'workspace_suspended' };
    }
  }

  // Blocked statuses — nothing works
  if (!ACTIVE_STATUSES.has(workspaceStatus)) {
    const reason = workspaceStatus === 'suspended'
      ? 'workspace_suspended'
      : 'workspace_cancelled';
    return { allowed: false, reason: reason as GateResult['reason'] };
  }

  const limits = getPlanLimits(workspacePlan);

  switch (feature) {
    case 'subtask_create':
      if (!limits.subtasks) return { allowed: false, reason: 'feature_not_in_plan' };
      break;

    case 'calendar':
      if (!limits.calendarSync) return { allowed: false, reason: 'feature_not_in_plan' };
      break;

    case 'email_send':
      if (limits.maxEmailPerMonth === 0) return { allowed: false, reason: 'feature_not_in_plan' };
      break;

    case 'voice':
      if (limits.maxVoicePerMonth === 0) return { allowed: false, reason: 'feature_not_in_plan' };
      break;
  }

  return { allowed: true };
}
