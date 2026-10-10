// Account lockout after repeated failed sign-ins — mirror of the SQL in
// supabase/migrations/20261011030000_login_lockout.sql (public.login_failed / public.resolve_login), unit tested.

export interface LockoutPolicy {
  /** failed attempts before the account is locked; 0 = never lock */
  max_failed: number;
  /** minutes the lock lasts; also the window after which the failure count restarts */
  lock_minutes: number;
}

export interface FailureState {
  fails: number;
  last_at: string; // ISO
  locked_until: string | null; // ISO
}

/** State after one more failed attempt (null when the policy is off) */
export function nextFailureState(prev: FailureState | null, policy: LockoutPolicy, now: Date): FailureState | null {
  const max = Math.max(0, Math.floor(Number(policy.max_failed) || 0));
  if (max <= 0) return null;
  const mins = Math.max(1, Math.floor(Number(policy.lock_minutes) || 0));
  const windowStart = now.getTime() - mins * 60_000;
  let fails: number;
  if (!prev) fails = 1;
  else if (prev.locked_until && Date.parse(prev.locked_until) <= now.getTime()) fails = 1; // an expired lock starts over
  else if (Date.parse(prev.last_at) < windowStart) fails = 1; // old failures are forgotten
  else fails = prev.fails + 1;
  const locked_until = fails >= max ? new Date(now.getTime() + mins * 60_000).toISOString() : null;
  return { fails, last_at: now.toISOString(), locked_until };
}

/** Is the account locked right now, and for how many more minutes (rounded up)? */
export function lockoutState(state: FailureState | null, now: Date): { locked: boolean; minutesLeft: number } {
  if (!state?.locked_until) return { locked: false, minutesLeft: 0 };
  const left = Date.parse(state.locked_until) - now.getTime();
  if (left <= 0) return { locked: false, minutesLeft: 0 };
  return { locked: true, minutesLeft: Math.ceil(left / 60_000) };
}
