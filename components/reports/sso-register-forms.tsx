"use client";
// สปส.1-03 (แบบขึ้นทะเบียนผู้ประกันตน) และ สปส.6-09 (แบบแจ้งการสิ้นสุดความเป็นผู้ประกันตน) — one A4 sheet per person.
// Rebuilt in HTML from the structure of the SSO paper forms (like the other gov forms); the boxes HR fills by hand
// (hospital choice, signatures) are left blank. Check against the latest form before the first filing.

import { Box, DigitBoxes, Dots, SignBlock, dmyBE } from "./gov-forms";
import { SSO_LEAVE_REASONS, ssoLeaveDate } from "@/lib/payroll/sso-register";

export interface SsoFormPerson {
  national_id: string | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  birth_date: string | null;
  nationality: string | null;
  hire_date: string;
  resign_date: string | null;
  resign_type: string | null;
  sso_hospital: string | null;
}

export interface SsoFormEmployer {
  name: string;
  branch_name: string;
  account_no: string;
  branch_no: string;
}

function EmployerBox({ e }: { e: SsoFormEmployer }) {
  return (
    <div className="mt-2 rounded-md border border-black px-2 py-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          ชื่อสถานประกอบการ <Dots w="70mm">{e.name}</Dots>
        </span>
        <span>
          สาขา <Dots w="30mm">{e.branch_name}</Dots>
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-4">
        <span>
          เลขที่บัญชีนายจ้าง <DigitBoxes value={e.account_no} groups={[2, 7, 1]} />
        </span>
        <span>
          ลำดับที่สาขา <DigitBoxes value={e.branch_no || "000000"} groups={[6]} />
        </span>
      </div>
    </div>
  );
}

function Who({ p }: { p: SsoFormPerson }) {
  return (
    <>
      <div className="mt-1">
        เลขประจำตัวประชาชน <DigitBoxes value={p.national_id} />
      </div>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <span>
          คำนำหน้า <Dots w="16mm">{p.prefix}</Dots>
        </span>
        <span className="flex grow items-end gap-1">
          ชื่อ <Dots w="45mm">{p.first_name}</Dots>
        </span>
        <span className="flex grow items-end gap-1">
          ชื่อสกุล <Dots w="45mm">{p.last_name}</Dots>
        </span>
      </div>
    </>
  );
}

export function Sso103Sheet({ p, employer }: { p: SsoFormPerson; employer: SsoFormEmployer }) {
  return (
    <section className="gov-sheet">
      <div className="flex items-start justify-between">
        <div className="text-[10px]">สำนักงานประกันสังคม</div>
        <div className="rounded border border-black px-2 font-bold">สปส. 1-03</div>
      </div>
      <div className="text-center">
        <div className="text-[15px] font-bold">แบบขึ้นทะเบียนผู้ประกันตน</div>
        <div className="text-[10px]">(นายจ้างยื่นภายใน 30 วัน นับแต่วันที่ลูกจ้างเข้าทำงาน)</div>
      </div>
      <EmployerBox e={employer} />
      <div className="mt-2 rounded-md border border-black px-2 py-1">
        <b>ข้อมูลผู้ประกันตน</b>
        <Who p={p} />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          เพศ <Box on={p.gender === "M"}>ชาย</Box>
          <Box on={p.gender === "F"}>หญิง</Box>
          <span>
            สัญชาติ <Dots w="24mm">{p.nationality}</Dots>
          </span>
          <span>
            วัน เดือน ปีเกิด <Dots w="26mm">{dmyBE(p.birth_date)}</Dots>
          </span>
        </div>
        <div className="mt-1">
          วันที่เข้าทำงาน <Dots w="26mm">{dmyBE(p.hire_date)}</Dots>
        </div>
        <div className="mt-2">
          สถานพยาบาลที่ประสงค์จะใช้บริการ (เลือก 3 แห่งตามลำดับ)
          <div className="mt-1 grid gap-1 pl-4">
            <div>
              1. <Dots w="110mm">{p.sso_hospital}</Dots>
            </div>
            <div>
              2. <Dots w="110mm" />
            </div>
            <div>
              3. <Dots w="110mm" />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <SignBlock role="ผู้ประกันตน" />
        <SignBlock role="นายจ้าง / ผู้รับมอบอำนาจ" />
      </div>
      <div className="mt-4 rounded-md border border-black px-2 py-1 text-[10px]">สำหรับเจ้าหน้าที่ — เลขที่รับ <Dots w="30mm" /> วันที่รับ <Dots w="26mm" /> ผู้รับ <Dots w="40mm" /></div>
    </section>
  );
}

export function Sso609Sheet({ p, employer }: { p: SsoFormPerson; employer: SsoFormEmployer }) {
  const reason = p.resign_type ? SSO_LEAVE_REASONS[p.resign_type] : undefined;
  return (
    <section className="gov-sheet">
      <div className="flex items-start justify-between">
        <div className="text-[10px]">สำนักงานประกันสังคม</div>
        <div className="rounded border border-black px-2 font-bold">สปส. 6-09</div>
      </div>
      <div className="text-center">
        <div className="text-[15px] font-bold">แบบแจ้งการสิ้นสุดความเป็นผู้ประกันตน</div>
        <div className="text-[10px]">(นายจ้างยื่นภายในวันที่ 15 ของเดือนถัดจากเดือนที่ลูกจ้างสิ้นสภาพ)</div>
      </div>
      <EmployerBox e={employer} />
      <div className="mt-2 rounded-md border border-black px-2 py-1">
        <b>ข้อมูลผู้ประกันตนที่สิ้นสภาพการเป็นลูกจ้าง</b>
        <Who p={p} />
        <div className="mt-1 flex flex-wrap gap-4">
          <span>
            วันที่เข้าทำงาน <Dots w="26mm">{dmyBE(p.hire_date)}</Dots>
          </span>
          <span>
            วันที่สิ้นสภาพการเป็นลูกจ้าง <Dots w="26mm">{p.resign_date ? dmyBE(ssoLeaveDate(p.resign_date)) : ""}</Dots>
          </span>
        </div>
        <div className="text-[9.5px] italic">(วันถัดจากวันทำงานวันสุดท้าย {p.resign_date ? dmyBE(p.resign_date) : ""})</div>
        <div className="mt-2">สาเหตุการสิ้นสภาพ</div>
        <div className="mt-1 grid grid-cols-2 gap-1 pl-4">
          {Object.values(SSO_LEAVE_REASONS).map((r) => (
            <Box key={r.code} on={reason?.code === r.code}>
              {r.code}. {r.label}
            </Box>
          ))}
          <Box on={false}>7. โอนย้ายสาขา</Box>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div />
        <SignBlock role="นายจ้าง / ผู้รับมอบอำนาจ" />
      </div>
      <div className="mt-4 rounded-md border border-black px-2 py-1 text-[10px]">สำหรับเจ้าหน้าที่ — เลขที่รับ <Dots w="30mm" /> วันที่รับ <Dots w="26mm" /> ผู้รับ <Dots w="40mm" /></div>
    </section>
  );
}
