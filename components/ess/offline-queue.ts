"use client";
// Offline check-in queue (localStorage). Each item is synced later with check_in(p_method:'offline', p_log_time, p_client_ref).
// client_ref makes the sync idempotent (time_logs.client_ref is unique), so retrying is always safe.
// Items are stamped with the employee they belong to; only the signed-in employee's items are shown and synced
// (a phone can be shared), and the whole queue is dropped on sign-out (see ./logout.ts).

import { supabaseBrowser } from "@/lib/supabase/client";
import { errText, isNetworkError, uuid } from "./lib";
import { markQueueError, normalizeQueue, partitionQueue, type QueuedCheckin } from "./offline-queue-core";

export type { QueuedCheckin } from "./offline-queue-core";

const KEY = "gohr.ess.offline-checkins";
const EVENT = "gohr:offline-queue";

function read(): QueuedCheckin[] {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeQueue(raw ? JSON.parse(raw) : []);
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

/** Queued items of one employee only (never another person's punches on a shared phone) */
export function queuedCheckins(employeeId: number | null | undefined): QueuedCheckin[] {
  return partitionQueue(read(), employeeId).mine;
}

export function enqueueCheckin(item: Omit<QueuedCheckin, "client_ref" | "log_time" | "employee_id"> & { log_time?: string; employee_id: number | null | undefined }): QueuedCheckin {
  if (item.employee_id == null) throw new Error("บัญชีนี้ยังไม่ผูกกับพนักงาน จึงบันทึกเวลาไว้ไม่ได้");
  const q: QueuedCheckin = { client_ref: uuid(), log_time: item.log_time ?? new Date().toISOString(), ...item, employee_id: Number(item.employee_id), error: null, tries: 0 };
  write([...read(), q]);
  return q;
}

export function removeQueued(ref: string) {
  write(read().filter((q) => q.client_ref !== ref));
}

/** Drop everything (sign-out): items of other people can never be synced by anyone else on this device */
export function clearQueue() {
  write([]);
}

export function onQueueChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

const syncing = new Map<number, Promise<{ synced: number; failed: number }>>();

/** Send the signed-in employee's queued check-ins. Network errors keep the item; business errors are recorded on the item. */
export function syncQueue(employeeId: number | null | undefined): Promise<{ synced: number; failed: number }> {
  if (employeeId == null) return Promise.resolve({ synced: 0, failed: 0 });
  const key = Number(employeeId);
  const running = syncing.get(key);
  if (running) return running;
  const p = (async () => {
    let synced = 0;
    let failed = 0;
    if (typeof navigator !== "undefined" && !navigator.onLine) return { synced, failed };
    const sb = supabaseBrowser();
    for (const q of queuedCheckins(key)) {
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
        write(markQueueError(read(), q.client_ref, errText(error)));
      }
    }
    return { synced, failed };
  })().finally(() => {
    syncing.delete(key);
  });
  syncing.set(key, p);
  return p;
}
