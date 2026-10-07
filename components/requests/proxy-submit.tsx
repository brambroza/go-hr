"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EmployeePicker, type EmpOption } from "@/components/crud/employee-picker";
import { Field, Modal } from "@/components/ui";
import { RequestForm } from "./request-form";

/** "ยื่นแทนพนักงาน": pick an employee, then the shared request form */
export function ProxySubmit({ open, onClose, onSubmitted }: { open: boolean; onClose: () => void; onSubmitted: (req: { id: number; doc_no: string }) => void }) {
  const [emps, setEmps] = useState<EmpOption[]>([]);
  const [emp, setEmp] = useState<number | null>(null);

  useEffect(() => {
    if (!open || emps.length) return;
    supabaseBrowser()
      .from("v_directory")
      .select("id, code, first_name, last_name, nickname, position_name")
      .neq("status", "resigned")
      .order("code")
      .limit(5000)
      .then(({ data }: { data: unknown }) =>
        setEmps(((data ?? []) as { id: number; code: string; first_name: string; last_name: string; nickname: string | null; position_name: string | null }[]).map((e) => ({
          value: e.id,
          label: `${e.first_name} ${e.last_name}${e.nickname ? ` (${e.nickname})` : ""}`,
          raw: { code: e.code },
        }))),
      );
  }, [open, emps.length]);

  useEffect(() => {
    if (!open) {
      setEmp(null);
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="ยื่นเอกสารแทนพนักงาน" size="lg">
      <div className="mb-4">
        <Field label="พนักงาน" required>
          <EmployeePicker value={emp} onChange={setEmp} options={emps} />
        </Field>
      </div>
      {emp ? (
        <div className="border-t border-line-soft pt-4">
          <RequestForm key={emp} employeeId={emp} onSubmitted={onSubmitted} />
        </div>
      ) : (
        <p className="rounded-[var(--radius-ctl)] bg-paper px-3 py-6 text-center text-sm text-ink-soft">เลือกพนักงานก่อน แล้วแบบฟอร์มจะแสดงด้านล่าง</p>
      )}
    </Modal>
  );
}

