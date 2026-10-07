import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { can, type Action, type Me, type MenuKey, type Permissions } from "./permissions";

/** Current user + profile + permissions (memoized per request). Returns null when not signed in. */
export const getMe = cache(async (): Promise<Me | null> => {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await sb
    .from("profiles")
    .select("id, username, display_name, email, is_admin, is_active, must_change_password, employee_id, role_groups(code, name, permissions, data_scope)")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  const group = (Array.isArray(profile.role_groups) ? profile.role_groups[0] : profile.role_groups) as
    | { code: string; name: string; permissions: Permissions; data_scope: string }
    | null;

  let employee: Me["employee"] = null;
  let isSupervisor = false;
  if (profile.employee_id) {
    const { data: e } = await sb
      .from("v_directory")
      .select("id, code, first_name, last_name, nickname, photo_url, position_name, org_unit_name")
      .eq("id", profile.employee_id)
      .maybeSingle();
    employee = (e as Me["employee"]) ?? null;
    const { count } = await sb
      .from("v_directory")
      .select("id", { count: "exact", head: true })
      .eq("supervisor_id", profile.employee_id);
    isSupervisor = (count ?? 0) > 0;
  }

  return {
    userId: auth.user.id,
    email: auth.user.email ?? profile.email ?? null,
    displayName:
      profile.display_name ||
      (employee ? `${employee.first_name} ${employee.last_name}` : null) ||
      profile.username ||
      auth.user.email ||
      "ผู้ใช้",
    isAdmin: !!profile.is_admin,
    roleCode: group?.code ?? null,
    roleName: group?.name ?? null,
    dataScope: profile.is_admin ? "all" : group?.data_scope ?? "self",
    permissions: (group?.permissions ?? {}) as Permissions,
    employeeId: profile.employee_id ?? null,
    employee,
    isSupervisor,
    mustChangePassword: !!profile.must_change_password,
  };
});

export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  return me;
}

export class ForbiddenError extends Error {
  constructor(msg = "ไม่มีสิทธิ์ทำรายการนี้") {
    super(msg);
  }
}

/** For server actions / route handlers: throws when the user lacks the permission. */
export async function requirePerm(menu: MenuKey, action: Action = "view"): Promise<Me> {
  const me = await getMe();
  if (!me) throw new ForbiddenError("กรุณาเข้าสู่ระบบ");
  if (!can(me, menu, action)) throw new ForbiddenError();
  return me;
}

/** Result shape for server actions consumed by client forms */
export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

export async function safeAction<T>(fn: () => Promise<T>, okMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: okMessage };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
    return { ok: false, error: msg };
  }
}
