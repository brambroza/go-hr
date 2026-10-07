"use client";
// ไฟล์โอนเงินเดือนเข้าธนาคาร — choose layout (built-in or custom), company account / Company ID / effective date,
// validate (account digits per bank, bank codes, totals), preview the first lines, download.

import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { money } from "@/lib/format";
import { BANK_NAMES, bankFileData, buildExport, type BankRow, type RenderedFile } from "@/lib/payroll/files";
import { fetchRowsIn } from "@/lib/payroll/fetch";
import { ExportReviewModal, LayoutPicker, StatusBadge, useFileLayouts } from "./file-export";
import type { Entry, PeriodFull } from "./types";

type Priv = { employee_id: number; bank_account_name: string | null; bank_branch: string | null; national_id: string | null };
type Emp = { id: number; prefix: string | null; first_name: string; last_name: string; email: string | null; phone: string | null };
type CompanyBank = { bank_code?: string; account?: string; branch?: string; company_id?: string; sender_name?: string };

export function BankFileModal({ open, onClose, period, entries }: { open: boolean; onClose: () => void; period: PeriodFull; entries: Entry[] }) {
  const [pref, setPref] = useState<string | null>(null);
  const { layouts, defaultKey } = useFileLayouts("bank", pref);
  const [key, setKey] = useState("");
  const [company, setCompany] = useState<{ name: string; name_en?: string; tax_id: string }>({ name: "", tax_id: "" });
  const [bank, setBank] = useState<CompanyBank>({});
  const [effective, setEffective] = useState(period.pay_date);
  const [batchNo, setBatchNo] = useState(1);
  const [people, setPeople] = useState<{ emp: Map<number, Emp>; priv: Map<number, Priv> } | null>(null);
  const [review, setReview] = useState<(RenderedFile & { ok: boolean }) | null>(null);
  const [total, setTotal] = useState(0);

  const bankEntries = useMemo(() => entries.filter((e) => e.pay_method === "bank" && Number(e.net_pay) > 0), [entries]);

  useEffect(() => {
    if (!open) return;
    const sb = supabaseBrowser();
    (async () => {
      const [{ data: pay }, { data: comp }] = await Promise.all([
        sb.from("settings").select("value").eq("key", "payroll").maybeSingle(),
        sb.from("settings").select("value").eq("key", "company").maybeSingle(),
      ]);
      const p = (pay?.value ?? {}) as { company_bank?: CompanyBank; bank_file_format?: string };
      setBank(p.company_bank ?? {});
      setPref(p.bank_file_format ?? null);
      const c = (comp?.value ?? {}) as { name?: string; name_en?: string; tax_id?: string };
      setCompany({ name: c.name ?? "", name_en: c.name_en, tax_id: c.tax_id ?? "" });
      const ids = bankEntries.map((e) => e.employee_id);
      const [emps, privs] = await Promise.all([
        fetchRowsIn<Emp>(ids, (part) => sb.from("employees").select("id, prefix, first_name, last_name, email, phone").in("id", part).order("id")),
        // bank account name / branch need the employee_private view permission; fall back to the payslip snapshot
        fetchRowsIn<Priv>(ids, (part) => sb.from("employee_private").select("employee_id, bank_account_name, bank_branch, national_id").in("employee_id", part).order("employee_id")).catch(() => [] as Priv[]),
      ]);
      setPeople({ emp: new Map(emps.map((e) => [e.id, e])), priv: new Map(privs.map((x) => [x.employee_id, x])) });
    })();
  }, [open, bankEntries]);

  useEffect(() => {
    if (defaultKey && !key) setKey(defaultKey);
  }, [defaultKey, key]);

  const layout = layouts.find((l) => l.key === key);

  const rows: BankRow[] = useMemo(
    () =>
      bankEntries.map((e) => {
        const emp = people?.emp.get(e.employee_id);
        const priv = people?.priv.get(e.employee_id);
        const name = e.emp_name.replace(/^(นาย|นางสาว|นาง)/, "").trim();
        return {
          employee_id: e.employee_id,
          emp_code: e.emp_code,
          prefix: emp?.prefix ?? null,
          first_name: emp?.first_name ?? name.split(" ")[0] ?? "",
          last_name: emp?.last_name ?? name.split(" ").slice(1).join(" "),
          national_id: priv?.national_id ?? null,
          email: emp?.email ?? null,
          phone: emp?.phone ?? null,
          account_name: priv?.bank_account_name ?? null,
          bank_code: e.bank_code,
          branch_code: priv?.bank_branch ?? null,
          account: e.bank_account,
          amount: Number(e.net_pay),
          pay_method: e.pay_method ?? "bank",
        };
      }),
    [bankEntries, people],
  );

  const build = () => {
    if (!layout) return;
    const data = bankFileData(
      layout,
      {
        company,
        company_bank_code: bank.bank_code ?? "",
        company_bank_branch: bank.branch,
        company_account: bank.account ?? "",
        company_bank_id: bank.company_id,
        sender_name: bank.sender_name,
        effective_date: effective,
        batch_no: batchNo,
        batch_ref: period.code,
        period_code: period.code,
        pay_date: period.pay_date,
      },
      rows,
    );
    setTotal(Number(data.data.file["batch.total"]) || 0);
    setReview(buildExport(layout, data));
  };

  const scopeCount = layout?.bankScope === "same" ? rows.filter((r) => r.bank_code === bank.bank_code).length : layout?.bankScope === "other" ? rows.filter((r) => r.bank_code !== bank.bank_code).length : rows.length;
  const byBank = useMemo(() => {
    const m = new Map<string, { n: number; total: number }>();
    for (const r of rows) {
      const x = m.get(r.bank_code ?? "") ?? { n: 0, total: 0 };
      x.n++;
      x.total += r.amount;
      m.set(r.bank_code ?? "", x);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [rows]);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title="ไฟล์โอนเงินเดือนเข้าธนาคาร"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button icon={<Eye className="size-4" />} disabled={!layout || !people} onClick={build}>
              ตรวจข้อมูลและดูตัวอย่างไฟล์
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-soft">
          รวมเฉพาะพนักงานที่รับเงินผ่านธนาคารและมียอดสุทธิมากกว่า 0 — {rows.length} คน ยอดรวม {money(rows.reduce((s, r) => s + r.amount, 0))} บาท
          {byBank.length > 0 && <> ({byBank.map(([c, x]) => `${BANK_NAMES[c]?.replace(/^ธนาคาร/, "") ?? c ?? "ไม่ระบุ"} ${x.n}`).join(" · ")})</>}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="รูปแบบไฟล์ของธนาคาร" className="sm:col-span-2">
            <LayoutPicker layouts={layouts} value={key} onChange={setKey} />
          </Field>
          {layout && (
            <div className="text-sm sm:col-span-2">
              <StatusBadge status={layout.status} /> <span className="text-ink-soft">{layout.description}</span>
              {layout.bankScope && layout.bankScope !== "any" && <div className="mt-1 text-amber-ink">รูปแบบนี้รวม {scopeCount} คน ({layout.bankScope === "same" ? "เฉพาะบัญชีธนาคารเดียวกับบริษัท" : "เฉพาะบัญชีต่างธนาคาร"})</div>}
            </div>
          )}
          <Field label="ธนาคารของบัญชีบริษัท">
            <Select value={bank.bank_code ?? ""} onChange={(e) => setBank({ ...bank, bank_code: e.target.value })}>
              {Object.entries(BANK_NAMES).map(([c, n]) => (
                <option key={c} value={c}>
                  {c} · {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="เลขที่บัญชีบริษัท (บัญชีที่ตัดเงิน)">
            <Input inputMode="numeric" value={bank.account ?? ""} onChange={(e) => setBank({ ...bank, account: e.target.value })} placeholder="xxx-x-xxxxx-x" />
          </Field>
          <Field label="รหัสสาขาบัญชีบริษัท" hint="4 หลัก (ใช้ในไฟล์ KTB)">
            <Input inputMode="numeric" value={bank.branch ?? ""} onChange={(e) => setBank({ ...bank, branch: e.target.value })} />
          </Field>
          <Field label="Company ID / รหัสบริษัทที่ธนาคารกำหนด" hint="ดูได้จากหนังสือยืนยันการสมัครบริการของธนาคาร">
            <Input value={bank.company_id ?? ""} onChange={(e) => setBank({ ...bank, company_id: e.target.value })} />
          </Field>
          <Field label="วันที่มีผลโอนเงิน (Effective date)">
            <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
          </Field>
          <Field label="เลขที่ชุด (Batch No.)" hint="ไฟล์ที่ 2 ของวันเดียวกันให้ใช้ 2">
            <Input type="number" min={1} value={batchNo} onChange={(e) => setBatchNo(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-ink-mute">ค่าเริ่มต้นของบัญชีบริษัทแก้ได้ที่ ตั้งค่าเวลา / เงินเดือน / ภาษี › บัญชีบริษัทและไฟล์โอนเงิน — ค่าที่แก้ในหน้าต่างนี้ใช้กับไฟล์นี้เท่านั้น</p>
      </Modal>
      <ExportReviewModal open={open && !!review} onClose={() => setReview(null)} title="ตรวจไฟล์โอนเงินเดือน" layout={layout} file={review} extra={review && <p className="mb-3 text-sm">ไฟล์มี {review.count} รายการ ยอดรวม {money(total)} บาท</p>} />
    </>
  );
}
