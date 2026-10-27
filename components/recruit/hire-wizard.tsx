"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button, Field, Input, Modal, Select, toast } from "@/components/ui";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { humanError } from "@/components/crud/crud-page";
import { useLookups } from "@/components/employees/use-lookups";
import { supabaseBrowser } from "@/lib/supabase/client";
import { addDays, isoDate, thDate } from "@/lib/format";
import { invalidateDirectory, useDirectory } from "./use-directory";

export function nextCode(codes: string[]): string {
  let prefix = "E";
  let width = 4;
  let max = 0;
  for (const c of codes) {
    const m = /^([A-Za-z]*)(\d+)$/.exec(c);
    if (!m) continue;
    const n = Number(m[2]);
    if (n > max) {
      max = n;
      prefix = m[1];
      width = m[2].length;
    }
  }
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

type Applicant = { id: number; first_name: string; last_name: string; expected_salary: number | null; available_date: string | null; posting_id: number | null };
type Posting = { position_id: number | null; org_unit_id: number | null; branch_id: number | null; hiring_manager_id: number | null; salary_min: number | null } | null;

/** “บรรจุเป็นพนักงาน” — RPC applicant_hire creates the employee (status probation) and links the applicant */
export function HireWizard({ open, onClose, applicant, posting, onHired }: { open: boolean; onClose: () => void; applicant: Applicant; posting: Posting; onHired: (empId: number) => void }) {
  const lk = useLookups();
  const dir = useDirectory();
  const [v, setV] = useState({ code: "", hire_date: "", position_id: "", org_unit_id: "", branch_id: "", supervisor_id: null as number | null, salary: "", shift_id: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: number; code: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setDone(null);
    supabaseBrowser()
      .from("employees")
      .select("code")
      .limit(20000)
      .then(({ data }: { data: unknown }) => {
        const tomorrow = addDays(isoDate(), 1);
        setV({
          code: nextCode(((data ?? []) as { code: string }[]).map((r) => r.code)),
          hire_date: applicant.available_date && applicant.available_date > isoDate() ? applicant.available_date : tomorrow,
          position_id: posting?.position_id ? String(posting.position_id) : "",
          org_unit_id: posting?.org_unit_id ? String(posting.org_unit_id) : "",
          branch_id: posting?.branch_id ? String(posting.branch_id) : "",
          supervisor_id: posting?.hiring_manager_id ?? null,
          salary: applicant.expected_salary ? String(applicant.expected_salary) : posting?.salary_min ? String(posting.salary_min) : "",
          shift_id: "",
        });
      });
  }, [open, applicant, posting]);

  async function hire() {
    if (!v.code.trim()) return toast.error("กรุณาระบุรหัสพนักงาน");
    if (!v.hire_date) return toast.error("กรุณาระบุวันที่เริ่มงาน");
    setBusy(true);
    const n = (s: string) => (s ? Number(s) : null);
    const { data, error } = await supabaseBrowser().rpc("applicant_hire", {
      p_applicant_id: applicant.id, p_code: v.code.trim(), p_hire_date: v.hire_date, p_position_id: n(v.position_id), p_org_unit_id: n(v.org_unit_id), p_branch_id: n(v.branch_id),
      p_supervisor_id: v.supervisor_id, p_salary: n(v.salary), p_shift_id: n(v.shift_id),
    });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    invalidateDirectory();
    toast.ok(`บรรจุเป็นพนักงานแล้ว รหัส ${v.code.trim()}`);
    setDone({ id: data as number, code: v.code.trim() });
    onHired(data as number);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`บรรจุ ${applicant.first_name} ${applicant.last_name} เป็นพนักงาน`}
      footer={
        done ? (
          <>
            <Button variant="secondary" onClick={onClose}>ปิด</Button>
            <Link href={`/employees/${done.id}`} className="inline-flex h-10 items-center rounded-[var(--radius-ctl)] bg-jade-600 px-4 text-[15px] font-medium text-white hover:bg-jade-700">
              เปิดประวัติพนักงาน
            </Link>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
            <Button loading={busy} onClick={hire}>บรรจุเป็นพนักงาน</Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="size-12 text-jade-600" />
          <p className="text-lg font-semibold">สร้างพนักงานรหัส {done.code} แล้ว</p>
          <p className="max-w-md text-[15px] text-ink-soft">
            สถานะ “ทดลองงาน” เริ่มงาน {thDate(v.hire_date, "long")} — ข้อมูลการศึกษาและประสบการณ์จากใบสมัครถูกคัดลอกไปที่ประวัติพนักงานแล้ว กรุณาเพิ่มข้อมูลที่เหลือ (เลขบัตรประชาชน บัญชีธนาคาร) และสร้างบัญชีผู้ใช้ในหน้าประวัติพนักงาน
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="รหัสพนักงาน" required hint="ระบบเสนอรหัสถัดไปให้อัตโนมัติ">
            <Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} className="num" />
          </Field>
          <Field label="วันที่เริ่มงาน" required hint="ระบบคำนวณวันครบทดลองงาน 119 วันให้">
            <Input type="date" value={v.hire_date} onChange={(e) => setV({ ...v, hire_date: e.target.value })} />
          </Field>
          <Field label="ตำแหน่ง">
            <Select value={v.position_id} onChange={(e) => setV({ ...v, position_id: e.target.value })} placeholder="— ตามประกาศ —">
              {lk.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="หน่วยงาน">
            <Select value={v.org_unit_id} onChange={(e) => setV({ ...v, org_unit_id: e.target.value })} placeholder="— ตามประกาศ —">
              {lk.orgs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="สาขา">
            <Select value={v.branch_id} onChange={(e) => setV({ ...v, branch_id: e.target.value })} placeholder="— ตามประกาศ —">
              {lk.branches.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="หัวหน้างาน">
            <EmployeePicker value={v.supervisor_id} onChange={(x) => setV({ ...v, supervisor_id: x })} options={dir.options} placeholder="— ไม่ระบุ —" />
          </Field>
          <Field label="เงินเดือนเริ่มต้น (บาท)" hint={applicant.expected_salary ? `ผู้สมัครต้องการ ${Number(applicant.expected_salary).toLocaleString("th-TH")} บาท` : undefined}>
            <Input type="money" min={0} value={v.salary} onChange={(e) => setV({ ...v, salary: e.target.value })} className="num" />
          </Field>
          <Field label="กะการทำงาน">
            <Select value={v.shift_id} onChange={(e) => setV({ ...v, shift_id: e.target.value })} placeholder="— กะเริ่มต้นของบริษัท —">
              {lk.shifts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
