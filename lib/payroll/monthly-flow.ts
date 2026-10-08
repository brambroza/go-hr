// The whole monthly payroll job as one ordered checklist:
// check time → calculate → approve → bank transfer → payslips → SSO (สปส.1-10) → tax (ภ.ง.ด.1) → close
// (+ ภ.ง.ด.1ก / 50 ทวิ after December). Pure: the server action loads the data, the page renders the steps.

export type FilingKind = "bank" | "sso" | "pnd1" | "pnd1a" | "pvd";
export type StepState = "done" | "current" | "todo" | "late";

export interface FlowPeriod {
  id: number;
  code: string;
  name: string;
  status: "open" | "calculated" | "approved" | "paid" | "closed";
  pay_date: string;
  att_start_date: string | null;
  att_end_date: string | null;
  start_date: string;
  end_date: string;
  payslip_published: boolean;
  entries: number;
  net_total: number;
  tax_total: number;
  sso_total: number;
}

export interface FlowFiling {
  id: number;
  kind: FilingKind;
  submitted_on: string;
  ref_no: string | null;
  amount: number | null;
  note: string | null;
}

export interface FlowReadiness {
  pendingRequests: number;
  missingScans: number;
  absentDays: number;
}

export interface FlowInput {
  year: number;
  month: number;
  today: string; // YYYY-MM-DD (Asia/Bangkok)
  period: FlowPeriod | null;
  readiness: FlowReadiness;
  filings: FlowFiling[];
}

export interface FlowStep {
  key: string;
  title: string;
  description: string;
  due: string | null;
  dueNote?: string;
  state: StepState;
  done: boolean;
  filingKind?: FilingKind;
  filing?: FlowFiling;
  issues?: string[];
}

const ORDER = ["open", "calculated", "approved", "paid", "closed"] as const;
export const statusAtLeast = (s: FlowPeriod["status"] | undefined, min: FlowPeriod["status"]) => !!s && ORDER.indexOf(s) >= ORDER.indexOf(min);

export function addDaysIso(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
/** day `day` of the month after year/month (clamped to month length) */
export function nextMonthDay(year: number, month: number, day: number): string {
  const y = month === 12 ? year + 1 : year;
  const m = month === 12 ? 1 : month + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function buildMonthlyFlow(i: FlowInput): FlowStep[] {
  const p = i.period;
  const st = p?.status;
  const filing = (k: FilingKind) => i.filings.find((f) => f.kind === k);
  const pay = p?.pay_date ?? new Date(Date.UTC(i.year, i.month, 0)).toISOString().slice(0, 10); // no period yet: month end
  const r = i.readiness;
  const timeIssues = [
    r.pendingRequests ? `เอกสารลา / OT / แก้เวลา ที่ยังรออนุมัติ ${r.pendingRequests} ใบ` : "",
    r.missingScans ? `วันที่ลืมสแกนเวลา ${r.missingScans} วัน` : "",
    r.absentDays ? `วันที่ขาดงาน (ตรวจว่าขาดจริงหรือลืมยื่นลา) ${r.absentDays} วัน` : "",
  ].filter(Boolean);

  const steps: Omit<FlowStep, "state">[] = [
    {
      key: "time", title: "ตรวจและปิดเวลาทำงาน",
      description: "อนุมัติเอกสารลา / OT / แก้เวลาให้ครบ แก้วันที่ลืมสแกน แล้วตรวจสรุปสาย ขาด OT ของรอบตัดเวลา",
      due: addDaysIso(pay, -4), issues: timeIssues,
      done: statusAtLeast(st, "approved") || (statusAtLeast(st, "calculated") && timeIssues.length === 0),
    },
    {
      key: "calc", title: "คำนวณเงินเดือน",
      description: "ระบบรวมเงินเดือน OT ขาด/สาย รายการประจำ หนี้สิน แล้วคำนวณภาษี ประกันสังคม และกองทุน คำนวณซ้ำได้จนกว่าจะอนุมัติ",
      due: addDaysIso(pay, -3), done: statusAtLeast(st, "calculated"),
    },
    {
      key: "approve", title: "ตรวจและอนุมัติงวด",
      description: "ตรวจยอดรวมเทียบเดือนก่อน คนเข้าใหม่ / ลาออก / ปรับเงินเดือน แล้วผู้มีอำนาจกดอนุมัติ",
      due: addDaysIso(pay, -2), done: statusAtLeast(st, "approved"),
    },
    {
      key: "bank", title: "ส่งไฟล์โอนเงินเข้าธนาคาร",
      description: "ดาวน์โหลดไฟล์โอนเงินจากหน้างวด อัปโหลดเข้าระบบธนาคารของบริษัท ตรวจยอดรวมให้ตรงกับทะเบียนเงินเดือน แล้วบันทึกว่าจ่ายแล้ว",
      due: addDaysIso(pay, -1), dueNote: "ธนาคารส่วนใหญ่ต้องได้ไฟล์ล่วงหน้าอย่างน้อย 1 วันทำการ",
      filingKind: "bank", filing: filing("bank"), done: !!filing("bank") || statusAtLeast(st, "paid"),
    },
    {
      key: "payslip", title: "เผยแพร่สลิปเงินเดือน",
      description: "พนักงานเห็นสลิปในแอปและได้รับแจ้งเตือน พิมพ์สลิปแบบกระดาษได้จากหน้างวด",
      due: pay, done: !!p?.payslip_published,
    },
    {
      key: "sso", title: "ยื่นเงินสมทบประกันสังคม (สปส.1-10)",
      description: "ดาวน์โหลดไฟล์ สปส.1-10 แนบในระบบ e-Service ของสำนักงานประกันสังคม ชำระเงินสมทบ แล้วบันทึกเลขอ้างอิงไว้",
      due: nextMonthDay(i.year, i.month, 15), dueNote: "ภายในวันที่ 15 ของเดือนถัดไป",
      filingKind: "sso", filing: filing("sso"), done: !!filing("sso"),
    },
    {
      key: "pnd1", title: "ยื่นภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1)",
      description: "ดาวน์โหลดไฟล์ ภ.ง.ด.1 ยื่นผ่าน e-Filing ของกรมสรรพากร ชำระภาษี แล้วบันทึกเลขอ้างอิงไว้",
      due: nextMonthDay(i.year, i.month, 15), dueNote: "ยื่นออนไลน์ภายในวันที่ 15 (ยื่นกระดาษภายในวันที่ 7) ของเดือนถัดไป",
      filingKind: "pnd1", filing: filing("pnd1"), done: !!filing("pnd1"),
    },
  ];
  if (i.month === 12) {
    steps.push({
      key: "pnd1a", title: "ภ.ง.ด.1ก และหนังสือรับรอง 50 ทวิ (สิ้นปี)",
      description: "สรุปเงินได้และภาษีทั้งปีของพนักงานทุกคน ยื่น ภ.ง.ด.1ก และออก 50 ทวิ ให้พนักงานไว้ยื่นภาษีของตนเอง",
      due: `${i.year + 1}-02-${new Date(Date.UTC(i.year + 1, 2, 0)).getUTCDate()}`, dueNote: "ภายในเดือนกุมภาพันธ์ของปีถัดไป",
      filingKind: "pnd1a", filing: filing("pnd1a"), done: !!filing("pnd1a"),
    });
  }
  steps.push({
    key: "close", title: "ปิดงวด",
    description: "ล็อกเวลาทำงานของรอบนี้ไม่ให้แก้ย้อนหลัง ยอดเดือนนี้จะใช้เป็นยอดสะสมของเดือนถัดไป",
    due: nextMonthDay(i.year, i.month, 15), done: st === "closed",
  });

  let currentSet = false;
  return steps.map((s) => {
    let state: StepState = s.done ? "done" : "todo";
    if (!s.done) {
      if (s.due && s.due < i.today) state = "late";
      else if (!currentSet) state = "current";
      if (!currentSet) currentSet = true;
    }
    return { ...s, state };
  });
}
