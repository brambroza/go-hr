"use client";
// One sign-out path for the employee app and the back office: a shared phone must not keep the previous
// person's offline punches (they would be posted under the next account) or cached salary pages.

import type { ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearSwPages } from "@/lib/pwa";
import { clearQueue, queuedCheckins, syncQueue } from "./offline-queue";

type ConfirmFn = (text: ReactNode, opts?: { danger?: boolean; confirmText?: string }) => Promise<boolean>;

/**
 * Sync what can still be synced, warn when offline punches would be lost, then clear local state and sign out.
 * @returns false when the user cancelled
 */
export async function signOutEverywhere(opts: { employeeId: number | null | undefined; confirm: ConfirmFn }): Promise<boolean> {
  const { employeeId, confirm } = opts;
  if (employeeId != null && queuedCheckins(employeeId).length && typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await syncQueue(employeeId);
    } catch {
      /* reported on the items */
    }
  }
  const left = employeeId != null ? queuedCheckins(employeeId).length : 0;
  if (left > 0) {
    const ok = await confirm(`มีการลงเวลาที่ยังไม่ซิงก์ ${left} รายการ ถ้าออกจากระบบตอนนี้รายการจะหายไป ต้องการออกจากระบบหรือไม่`, { danger: true, confirmText: "ออกจากระบบ" });
    if (!ok) return false;
  }
  clearQueue();
  await clearSwPages();
  await supabaseBrowser().auth.signOut();
  return true;
}
