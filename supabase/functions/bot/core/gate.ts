import type { GateResult } from './types.ts';

// Pilot stub — always allowed. Step 9 replaces this with real plan/status checks.
export function gate(_feature: string): GateResult {
  return { allowed: true };
}
