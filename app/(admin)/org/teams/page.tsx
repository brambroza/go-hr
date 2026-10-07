"use client";

import type { Res } from "@/lib/employees/labels";
import { useCallback, useEffect, useState } from "react";
import { Trash2, UserPlus, Users } from "lucide-react";
import { CrudPage, humanError } from "@/components/crud/crud-page";
import { EmployeePicker, type EmpOption } from "@/components/crud/employee-picker";
import { Badge, Button, Empty, Input, Modal, Spinner, toast, useConfirm } from "@/components/ui";
import { Avatar } from "@/components/employees/avatar";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";

type Team = { id: number; name: string; leader_employee_id: number | null };

export default function TeamsPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const loadCounts = useCallback(async () => {
    const { data } = await supabaseBrowser().from("team_members").select("team_id");
    const m: Record<number, number> = {};
    for (const r of (data as { team_id: number }[]) ?? []) m[r.team_id] = (m[r.team_id] ?? 0) + 1;
    setCounts(m);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    loadCounts();
  }, [loadCounts]);

  return (
    <>
      <CrudPage
        config={{
          table: "teams",
          title: "ทีมงาน",
          description: "จัดกลุ่มพนักงานข้ามหน่วยงาน (เช่น ทีมโครงการ ทีมความปลอดภัย) ใช้กับขอบเขตข้อมูลแบบ “ทีมเดียวกัน” ได้",
          menu: "org",
          orderBy: { column: "name", ascending: true },
          searchColumns: ["name", "description"],
          exportName: "teams",
          columns: [
            { key: "name", label: "ชื่อทีม", sortable: true },
            { key: "leader_employee_id", label: "หัวหน้าทีม" },
            { key: "members", label: "สมาชิก", render: (r) => <Badge color="green"><Users className="size-3" /><span className="num">{counts[Number(r.id)] ?? 0}</span></Badge>, exportValue: (r) => counts[Number(r.id)] ?? 0 },
            { key: "description", label: "รายละเอียด", render: (r) => <span className="line-clamp-1 max-w-sm text-ink-soft">{String(r.description ?? "-")}</span> },
            { key: "is_active", label: "ใช้งาน" },
          ],
          fields: [
            { name: "name", label: "ชื่อทีม", type: "text", required: true },
            { name: "leader_employee_id", label: "หัวหน้าทีม", type: "employee" },
            { name: "description", label: "รายละเอียด", type: "textarea" },
            { name: "is_active", label: "ใช้งาน", type: "boolean", default: true },
          ],
          afterSave: async (row) => {
            // leader is always a member of the team
            if (row.leader_employee_id) {
              const { error } = await supabaseBrowser().from("team_members").upsert({ team_id: row.id, employee_id: row.leader_employee_id, role: "หัวหน้าทีม" }, { onConflict: "team_id,employee_id", ignoreDuplicates: true });
              if (error) toast.error("บันทึกทีมแล้ว แต่เพิ่มหัวหน้าทีมเป็นสมาชิกไม่สำเร็จ: " + humanError(error));
              loadCounts();
            }
          },
          rowActions: (r) => (
            <Button size="sm" variant="subtle" icon={<Users className="size-4" />} onClick={() => setTeam(r as unknown as Team)}>
              สมาชิก
            </Button>
          ),
        }}
      />
      <MembersModal team={team} onClose={() => { setTeam(null); loadCounts(); }} />
    </>
  );
}

type Member = { employee_id: number; role: string | null };

function MembersModal({ team, onClose }: { team: Team | null; onClose: () => void }) {
  const can = useCan();
  const editable = can("org", "edit") || can("org", "create");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [emps, setEmps] = useState<EmpOption[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();
  const sb = supabaseBrowser();

  const load = useCallback(async () => {
    if (!team) return;
    const { data, error } = await sb.from("team_members").select("employee_id, role").eq("team_id", team.id);
    if (error) toast.error(error.message);
    setMembers((data as Member[]) ?? []);
  }, [team, sb]);

  useEffect(() => {
    if (!team) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    setMembers(null);
    load();
    if (!emps.length)
      sb.from("v_directory").select("id, code, first_name, last_name, nickname, photo_url, position_name").order("code").limit(5000).then(({ data }: Res) => {
        setEmps(((data ?? []) as Record<string, unknown>[]).map((r) => ({ value: r.id as number, label: `${r.first_name} ${r.last_name}${r.nickname ? ` (${r.nickname})` : ""}`, raw: r })));
      });
  }, [team, load, sb, emps.length]);

  async function add() {
    if (!team || !pick) return;
    if (members?.some((m) => m.employee_id === pick)) return toast.error("พนักงานคนนี้อยู่ในทีมแล้ว");
    setBusy(true);
    const { error } = await sb.from("team_members").insert({ team_id: team.id, employee_id: pick, role: role.trim() || null });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.ok("เพิ่มสมาชิกแล้ว");
    setPick(null);
    setRole("");
    load();
  }
  async function remove(id: number) {
    if (!team) return;
    if (id === team.leader_employee_id) return toast.error("นำหัวหน้าทีมออกไม่ได้ เปลี่ยนหัวหน้าทีมก่อน");
    if (!(await confirm("นำพนักงานคนนี้ออกจากทีมใช่หรือไม่?", { danger: true, confirmText: "นำออก" }))) return;
    const { error } = await sb.from("team_members").delete().eq("team_id", team.id).eq("employee_id", id);
    if (error) return toast.error(humanError(error));
    toast.ok("นำออกจากทีมแล้ว");
    load();
  }

  const empById = new Map(emps.map((e) => [Number(e.value), e]));
  return (
    <Modal open={!!team} onClose={onClose} size="lg" title={team ? `สมาชิกทีม ${team.name}` : ""}>
      {editable && (
        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <EmployeePicker value={pick} onChange={setPick} options={emps.filter((e) => !members?.some((m) => m.employee_id === Number(e.value)))} placeholder="เลือกพนักงานที่จะเพิ่ม" />
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="บทบาทในทีม (ถ้ามี)" aria-label="บทบาทในทีม" />
          <Button icon={<UserPlus className="size-4" />} onClick={add} disabled={!pick} loading={busy}>
            เพิ่มสมาชิก
          </Button>
        </div>
      )}
      {!members ? (
        <div className="py-10"><Spinner className="mx-auto" /></div>
      ) : members.length === 0 ? (
        <Empty title="ยังไม่มีสมาชิก" description="เลือกพนักงานด้านบนเพื่อเพิ่มเข้าทีม" />
      ) : (
        <ul className="divide-y divide-line-soft">
          {members.map((m) => {
            const e = empById.get(m.employee_id);
            return (
              <li key={m.employee_id} className="flex items-center gap-3 py-2">
                <Avatar src={(e?.raw?.photo_url as string) ?? null} name={e?.label} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">
                    {e?.label ?? `#${m.employee_id}`}
                    {m.employee_id === team?.leader_employee_id && <Badge color="green" className="ml-2">หัวหน้าทีม</Badge>}
                  </div>
                  <div className="truncate text-xs text-ink-mute">{[e?.raw?.code, e?.raw?.position_name, m.role].filter(Boolean).join(" · ")}</div>
                </div>
                {editable && (
                  <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => remove(m.employee_id)} aria-label={`นำ ${e?.label ?? ""} ออกจากทีม`}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </Modal>
  );
}
