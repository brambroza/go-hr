// Check-in area policy (พื้นที่ลงเวลา) — shared by the org-unit form and the mobile check-in screen.
// The effective policy for an employee is resolved in the database (app.checkin_policy / my_checkin_policy):
//   employee's own work_location_ids → nearest org unit (walking up the tree) with a mode set → every active location.

/** Value stored in org_units.checkin_mode */
export type OrgCheckinMode = "inherit" | "locations" | "anywhere";

/** Effective policy returned by my_checkin_policy() */
export interface CheckinPolicy {
  mode: "all" | "locations" | "anywhere";
  location_ids: number[];
  source?: string;
}

export const ORG_CHECKIN_MODE: Record<OrgCheckinMode, string> = {
  inherit: "ตามหน่วยงานแม่",
  locations: "กำหนดพื้นที่ลงเวลา",
  anywhere: "ไม่จำกัดพื้นที่ (ลงเวลาได้ทุกที่)",
};

export const DEFAULT_POLICY: CheckinPolicy = { mode: "all", location_ids: [] };

/** Parse the jsonb from my_checkin_policy(); anything malformed falls back to "all" */
export function parsePolicy(raw: unknown): CheckinPolicy {
  if (!raw || typeof raw !== "object") return DEFAULT_POLICY;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "locations" || o.mode === "anywhere" ? o.mode : "all";
  const ids = Array.isArray(o.location_ids) ? o.location_ids.map(Number).filter((n) => Number.isFinite(n)) : [];
  if (mode === "locations" && !ids.length) return DEFAULT_POLICY;
  return { mode, location_ids: mode === "locations" ? ids : [], source: typeof o.source === "string" ? o.source : undefined };
}

/** Locations the employee may use under this policy ("anywhere" keeps the list for distance display only) */
export function allowedLocations<T extends { id: number }>(policy: CheckinPolicy, locations: T[]): T[] {
  if (policy.mode !== "locations") return locations;
  return locations.filter((l) => policy.location_ids.includes(l.id));
}

/** Whether a GPS check-in can be submitted: anywhere → always; otherwise only inside a location's radius */
export function gpsAllowed(policy: CheckinPolicy, insideArea: boolean): boolean {
  return policy.mode === "anywhere" || insideArea;
}

/** Validation for the org-unit form: "locations" mode needs at least one location */
export function validateOrgPolicy(mode: unknown, locationIds: unknown): string | null {
  if (mode === "locations" && (!Array.isArray(locationIds) || locationIds.length === 0)) return "เลือกพื้นที่ลงเวลาอย่างน้อย 1 จุด";
  return null;
}
