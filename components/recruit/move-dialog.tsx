"use client";

import { useState } from "react";
import { Button, Field, Modal, Select, Textarea, toast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { humanError } from "@/components/crud/crud-page";
import { STAGE } from "./labels";

export const MOVE_TARGETS = ["applied", "screening", "interview", "assessment", "offer", "rejected", "talent_pool", "withdrawn"] as const;

/** change applicant stage via RPC applicant_move (records history with an optional note) */
export function MoveDialog({
  applicant,
  to,
  onClose,
  onDone,
}: {
  applicant: { id: number; name: string; stage: string } | null;
  to?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<string>(to ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const k = `${applicant?.id}-${to}`;
  if (k !== key) {
    setKey(k);
    setStage(to ?? "");
    setNote("");
  }

  async function go() {
    if (!applicant || !stage) return;
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("applicant_move", { p_applicant_id: applicant.id, p_stage: stage, p_note: note.trim() || null });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.ok(`ย้าย ${applicant.name} ไป “${STAGE[stage]}” แล้ว`);
    onDone();
    onClose();
  }

  return (
    <Modal
      open={!!applicant}
      onClose={onClose}
      size="sm"
      title="ย้ายขั้นตอนผู้สมัคร"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant={stage === "rejected" ? "danger" : "primary"} loading={busy} disabled={!stage || stage === applicant?.stage} onClick={go}>
            ย้ายขั้นตอน
          </Button>
        </>
      }
    >
      {applicant && (
        <div className="flex flex-col gap-3">
          <p className="text-[15px]">
            <b>{applicant.name}</b> — ตอนนี้อยู่ขั้น “{STAGE[applicant.stage]}”
          </p>
          <Field label="ย้ายไปขั้น" required>
            <Select value={stage} onChange={(e) => setStage(e.target.value)} placeholder="— เลือก —">
              {MOVE_TARGETS.filter((s) => s !== applicant.stage).map((s) => (
                <option key={s} value={s}>{STAGE[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="หมายเหตุ" hint="บันทึกไว้ในประวัติของผู้สมัคร เช่น เหตุผลที่ไม่ผ่าน">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>
          <p className="text-xs text-ink-mute">การบรรจุเป็นพนักงาน ให้ใช้ปุ่ม “บรรจุเป็นพนักงาน” ในหน้ารายละเอียดผู้สมัคร</p>
        </div>
      )}
    </Modal>
  );
}
