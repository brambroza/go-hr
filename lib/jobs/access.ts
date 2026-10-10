// Access of resigned employees — pure helpers shared by the job runner and the tests.
// The database rule lives in app.employee_allowed() (supabase/migrations/20261011010000_resigned_access.sql);
// employeeAllowed() mirrors it so the behaviour is unit tested.

export interface ProfileAccessRow {
  id: string;
  is_active: boolean;
  auth_banned_at: string | null;
}

/**
 * Mirror of SQL app.employee_allowed(status, resign_date): an employee keeps access through the end of the
 * last working day (resign_date) and loses it from the next day. A resigned status without a date is blocked.
 * @param today - YYYY-MM-DD in Asia/Bangkok
 */
export function employeeAllowed(status: string | null | undefined, resignDate: string | null | undefined, today: string): boolean {
  if (status !== "resigned") return true;
  return !!resignDate && resignDate >= today;
}

/**
 * Which auth users must be banned / unbanned so the auth layer matches profiles.is_active.
 * A row already consistent (inactive + banned, or active + not banned) is left alone.
 */
export function planAuthBans(rows: ProfileAccessRow[]): { ban: string[]; unban: string[] } {
  const ban: string[] = [];
  const unban: string[] = [];
  for (const r of rows) {
    if (!r.is_active && r.auth_banned_at == null) ban.push(r.id);
    else if (r.is_active && r.auth_banned_at != null) unban.push(r.id);
  }
  return { ban, unban };
}

/** ban_duration accepted by GoTrue: ~100 years, or "none" to lift the ban */
export const BAN_FOREVER = "876000h";
