"use server";

import { revalidatePath } from "next/cache";
import { requirePerm, safeAction, type ActionResult } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateRows, type RawRow, type Refs } from "@/lib/employees/import";

export interface ImportResult {
  created: number;
  updated: number;
  failed: { line: number; code: string; error: string }[];
  privateSkipped: boolean;
}

async function loadRefs(sb: ReturnType<typeof supabaseAdmin>): Promise<Refs> {
  const [b, o, p, e] = await Promise.all([
    sb.from("branches").select("id, code"),
    sb.from("org_units").select("id, code"),
    sb.from("positions").select("id, code"),
    sb.from("employees").select("id, code"),
  ]);
  const m = (d: { id: number; code: string }[] | null) => Object.fromEntries((d ?? []).map((x) => [x.code.toLowerCase(), x.id]));
  return { branches: m(b.data), orgs: m(o.data), positions: m(p.data), employees: m(e.data) };
}

/** Reference lookups for the client-side preview (codes only — no sensitive data) */
export async function importRefsAction(): Promise<ActionResult<Refs>> {
  return safeAction(async () => {
    await requirePerm("employee", "create");
    return loadRefs(supabaseAdmin());
  });
}

export async function importEmployeesAction(rows: RawRow[]): Promise<ActionResult<ImportResult>> {
  return safeAction(async () => {
    const me = await requirePerm("employee", "create");
    if (!Array.isArray(rows) || !rows.length) throw new Error("ไม่มีข้อมูลที่จะนำเข้า");
    if (rows.length > 5000) throw new Error("นำเข้าได้ครั้งละไม่เกิน 5,000 แถว");
    const canEdit = can(me, "employee", "edit");
    const canPrivate = can(me, "employee_private", "edit");
    const sb = supabaseAdmin();
    const refs = await loadRefs(sb);
    // re-validate on the server — never trust the client preview
    const parsed = validateRows(rows, refs);
    const res: ImportResult = { created: 0, updated: 0, failed: [], privateSkipped: false };
    const idByCode: Record<string, number> = { ...refs.employees };

    for (const r of parsed) {
      const code = String(r.employee.code ?? "");
      if (r.errors.length) {
        res.failed.push({ line: r.line, code, error: r.errors.join(", ") });
        continue;
      }
      if (r.isUpdate && !canEdit) {
        res.failed.push({ line: r.line, code, error: "มีรหัสนี้อยู่แล้ว และคุณไม่มีสิทธิ์แก้ไขข้อมูลพนักงาน" });
        continue;
      }
      const { code: _c, ...rest } = r.employee;
      void _c;
      let id: number;
      if (r.isUpdate) {
        id = idByCode[code.toLowerCase()];
        if (Object.keys(rest).length) {
          const { error } = await sb.from("employees").update(rest).eq("id", id);
          if (error) {
            res.failed.push({ line: r.line, code, error: error.message });
            continue;
          }
        }
        res.updated++;
      } else {
        const { data, error } = await sb.from("employees").insert(r.employee).select("id").single();
        if (error || !data) {
          res.failed.push({ line: r.line, code, error: error?.message.includes("duplicate") ? "รหัสพนักงานซ้ำ" : error?.message ?? "บันทึกไม่สำเร็จ" });
          continue;
        }
        id = data.id;
        idByCode[code.toLowerCase()] = id;
        res.created++;
      }
      if (Object.keys(r.priv).length) {
        if (!canPrivate) res.privateSkipped = true;
        else {
          const { error } = await sb.from("employee_private").upsert({ employee_id: id, ...r.priv }, { onConflict: "employee_id" });
          if (error) res.failed.push({ line: r.line, code, error: `ข้อมูลเงินเดือน/บัญชี: ${error.message}` });
        }
      }
    }
    // supervisors last (they may be created in the same file)
    for (const r of parsed) {
      if (r.errors.length || !r.supervisor_code) continue;
      const id = idByCode[String(r.employee.code).toLowerCase()];
      const sup = idByCode[r.supervisor_code.toLowerCase()];
      if (id && sup) await sb.from("employees").update({ supervisor_id: sup }).eq("id", id);
    }
    await sb.from("audit_logs").insert({ user_id: me.userId, user_name: me.displayName, action: "IMPORT", table_name: "employees", note: `created ${res.created}, updated ${res.updated}, failed ${res.failed.length}` });
    revalidatePath("/employees");
    return res;
  });
}
