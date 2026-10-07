"use client";
// Offline check-in queue (localStorage). Each item is synced later with check_in(p_method:'offline', p_log_time, p_client_ref).
// client_ref makes the sync idempotent (time_logs.client_ref is unique), so retrying is always safe.

import { supabaseBrowser } from "@/lib/supabase/client";
import { errText, isNetworkError, uuid } from "./lib";

export interface QueuedCheckin {
  client_ref: string;
  log_time: string; // ISO
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  direction: string;
  employee_id: number | null;
  error?: string | null; // last business error (e.g. outside area) — kept so the user can see why it failed
  tries?: number;
}

const KEY = "gohr.ess.offline-checkins";
const EVENT = "gohr:offline-queue";

function read(): QueuedCheckin[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(list: QueuedCheckin[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / blocked */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function queuedCheckins(employeeId?: number | null): QueuedCheckin[] {
  const all = read();
  return employeeId == null ? all : all.filter((q) => q.employee_id == null || q.employee_id === employeeId);
}

export function enqueueCheckin(item: Omit<QueuedCheckin, "client_ref" | "log_time"> & { log_time?: string }): QueuedCheckin {
  const q: QueuedCheckin = { client_ref: uuid(), log_time: item.log_time ?? new Date().toISOString(), ...item, error: null, tries: 0 };
  write([...read(), q]);
  return q;
}

export function removeQueued(ref: string) {
  write(read().filter((q) => q.client_ref !== ref));
}

export function onQueueChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

let syncing: Promise<{ synced: number; failed: number }> | null = null;

/** Send every queued check-in. Network errors keep the item; business errors are recorded on the item. */
export function syncQueue(): Promise<{ synced: number; failed: number }> {
  if (syncing) return syncing;
  syncing = (async () => {
    let synced = 0;
    let failed = 0;
    if (typeof navigator !== "undefined" && !navigator.onLine) return { synced, failed };
    const sb = supabaseBrowser();
    for (const q of read()) {
      const { error } = await sb.rpc("check_in", {
        p_method: "offline",
        p_latitude: q.latitude,
        p_longitude: q.longitude,
        p_accuracy: q.accuracy,
        p_direction: q.direction || "auto",
        p_log_time: q.log_time,
        p_client_ref: q.client_ref,
        p_note: "ซิงก์จากโหมดออฟไลน์",
      });
      if (!error) {
        removeQueued(q.client_ref);
        synced++;
      } else if (isNetworkError(error)) {
        failed++;
        break; // still offline — try again later
      } else {
        failed++;
        write(read().map((x) => (x.client_ref === q.client_ref ? { ...x, error: errText(error), tries: (x.tries ?? 0) + 1 } : x)));
      }
    }
    return { synced, failed };
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
