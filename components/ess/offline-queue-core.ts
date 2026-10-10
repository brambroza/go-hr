// Pure helpers for the offline check-in queue (no browser / supabase imports so they can be unit tested).
// The queue lives in one localStorage key per device; a device may be shared by several employees, so every
// item carries the employee it belongs to and callers only ever see / sync their own items.

export interface QueuedCheckin {
  client_ref: string;
  log_time: string; // ISO
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  direction: string;
  employee_id: number;
  error?: string | null; // last business error (e.g. outside area) — kept so the user can see why it failed
  tries?: number;
}

/** Parse what is in storage: drop anything that is not an object or has no employee (items from before the stamp cannot be attributed) */
export function normalizeQueue(raw: unknown): QueuedCheckin[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((q): q is QueuedCheckin => !!q && typeof q === "object" && typeof (q as QueuedCheckin).client_ref === "string" && Number.isFinite(Number((q as QueuedCheckin).employee_id)) && (q as QueuedCheckin).employee_id != null);
}

/** Split the queue into the signed-in employee's items and everybody else's */
export function partitionQueue(list: QueuedCheckin[], employeeId: number | null | undefined): { mine: QueuedCheckin[]; others: QueuedCheckin[] } {
  const mine: QueuedCheckin[] = [];
  const others: QueuedCheckin[] = [];
  for (const q of list) (employeeId != null && Number(q.employee_id) === Number(employeeId) ? mine : others).push(q);
  return { mine, others };
}

/** Record a business error on one item (keeps the item so the user can read why it failed) */
export function markQueueError(list: QueuedCheckin[], clientRef: string, message: string): QueuedCheckin[] {
  return list.map((q) => (q.client_ref === clientRef ? { ...q, error: message, tries: (q.tries ?? 0) + 1 } : q));
}
