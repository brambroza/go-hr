"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { computeCommission, type CommissionTier } from "@/lib/payroll/commission";
import { money } from "@/lib/format";

/** edit [{from,to,rate}] tiers; "to" of a row follows the next row's "from" */
export function TierEditor({ value, onChange, mode }: { value: CommissionTier[]; onChange: (v: CommissionTier[]) => void; mode: "step" | "flat" }) {
  const rows = value.length ? value : [{ from: 0, to: null, rate: 0 }];
  const [sample, setSample] = useState(250000);
  const set = (i: number, k: keyof CommissionTier, v: string) => {
    const next = rows.map((r) => ({ ...r }));
    next[i] = { ...next[i], [k]: v === "" ? null : Number(v) } as CommissionTier;
    // keep tiers contiguous
    for (let j = 0; j < next.length - 1; j++) next[j].to = next[j + 1].from;
    next[next.length - 1].to = null;
    onChange(next);
  };
  const add = () => {
    const last = rows[rows.length - 1];
    const from = Number(last.from || 0) + 100000;
    onChange([...rows.slice(0, -1), { ...last, to: from }, { from, to: null, rate: Number(last.rate) + 1 }]);
  };
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i).map((r) => ({ ...r }));
    for (let j = 0; j < next.length - 1; j++) next[j].to = next[j + 1].from;
    if (next.length) next[next.length - 1].to = null;
    onChange(next);
  };
  return (
    <div className="rounded-[var(--radius-ctl)] border border-line p-3">
      <div className="grid grid-cols-[1fr_1fr_6rem_2rem] gap-2 text-xs text-ink-soft">
        <span>ตั้งแต่ (บาท)</span>
        <span>ถึง (ไม่รวม)</span>
        <span>อัตรา %</span>
        <span />
      </div>
      {rows.map((t, i) => (
        <div key={i} className="mt-1.5 grid grid-cols-[1fr_1fr_6rem_2rem] items-center gap-2">
          <Input type="number" className="num h-9" value={t.from ?? 0} onChange={(e) => set(i, "from", e.target.value)} disabled={i === 0} />
          <Input className="num h-9" value={t.to == null ? "ขึ้นไป" : money(t.to, 0)} disabled />
          <Input type="number" step="0.01" className="num h-9" value={t.rate ?? 0} onChange={(e) => set(i, "rate", e.target.value)} />
          <button type="button" className="rounded p-1 text-ink-mute hover:text-rust disabled:opacity-30" onClick={() => remove(i)} disabled={rows.length === 1} aria-label="ลบขั้น">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={add}>
          เพิ่มขั้น
        </Button>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          ทดลองยอด
          <Input type="number" className="num h-8 w-32" value={sample} onChange={(e) => setSample(Number(e.target.value))} />
          = <b className="num text-ink">{money(computeCommission(sample, rows, mode))}</b>
        </label>
      </div>
    </div>
  );
}
