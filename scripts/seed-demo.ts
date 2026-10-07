/**
 * Demo data for sales demos / development.
 *   npm run db:seed-demo
 * Creates a sample factory: org chart, ~45 employees, logins, shifts, 45 days of time logs, leave quotas & requests.
 * Safe to re-run: skips when employee E0001 already exists.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

loadEnv();
const sb = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const must = <T,>(r: { data: T; error: unknown }): NonNullable<T> => {
  if (r.error) throw r.error;
  return r.data as NonNullable<T>;
};

const FIRST_M = ["สมชาย", "ประเสริฐ", "วีระ", "อนุชา", "ธนากร", "กิตติ", "ณัฐพล", "สุรชัย", "อำนาจ", "ภานุวัฒน์", "ชัยวัฒน์", "พงศกร", "ศักดิ์ชัย", "ปิยะ", "วิทยา", "เอกชัย", "นพดล", "ไพโรจน์", "สิทธิชัย", "จักรพันธ์", "ธีรศักดิ์", "อภิชาติ"];
const FIRST_F = ["สุดารัตน์", "กนกวรรณ", "พรทิพย์", "จันทร์เพ็ญ", "วิไลวรรณ", "ศิริพร", "นภัสสร", "ปวีณา", "อรุณี", "มณีรัตน์", "ธิดารัตน์", "รัตนาภรณ์", "สุภาพร", "ชนิดา", "พิมพ์ชนก", "กาญจนา", "อัญชลี", "เบญจวรรณ", "ณัฐธิดา", "ลัดดาวัลย์", "ปาริชาติ", "วรรณภา"];
const LAST = ["ใจดี", "ศรีสุข", "มั่นคง", "แก้วมณี", "ทองดี", "บุญมา", "สุขสวัสดิ์", "พรหมมา", "จันทร์แก้ว", "เพชรรัตน์", "วงศ์ใหญ่", "สมบูรณ์", "ทองคำ", "ศรีวงศ์", "อินทร์แก้ว", "บุญเรือง", "ประเสริฐสุข", "รุ่งเรือง", "ชัยมงคล", "สายทอง"];
const NICK = ["ต้น", "เอ", "บี", "ปุ้ย", "แนน", "โอ๊ต", "ฝน", "บอส", "กิ๊ฟ", "มิ้นท์", "เจมส์", "ปลา", "นุ่น", "เก่ง", "แพร", "ตาล", "ป๊อป", "ฟ้า", "กอล์ฟ", "จูน"];

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function main() {
  const exists = await sb.from("employees").select("id").eq("code", "E0001").maybeSingle();
  if (exists.data) {
    console.log("demo data already present — skipping");
    return;
  }

  await sb.from("settings").update({ value: { name: "บริษัท โกอะลอง แมนูแฟคเจอริ่ง จำกัด", name_en: "GO Along Manufacturing Co., Ltd.", tax_id: "0115560012345", branch_no: "00000", address: "99/9 หมู่ 5 ถ.เทพารักษ์ ต.บางเสาธง อ.บางเสาธง จ.สมุทรปราการ 10570", phone: "02-123-4567", email: "hr@example.co.th", primary_color: "#1b6f53" } }).eq("key", "company");

  const [hq, br2] = must(await sb.from("branches").insert([
    { code: "HQ", name: "สำนักงานใหญ่ บางเสาธง", is_head_office: true, tax_branch_no: "00000", sso_account_no: "1000123456", sso_branch_no: "000000", address: "99/9 หมู่ 5 ถ.เทพารักษ์ ต.บางเสาธง อ.บางเสาธง จ.สมุทรปราการ 10570" },
    { code: "RY", name: "สาขาระยอง (โรงงาน 2)", tax_branch_no: "00001", sso_account_no: "1000123456", sso_branch_no: "000001" },
  ], { defaultToNull: false }).select());

  const org = async (code: string, name: string, unit_type: string, parent_id: number | null, branch_id: number) =>
    must(await sb.from("org_units").insert({ code, name, unit_type, parent_id, branch_id }).select().single());
  const company = await org("C", "บริษัท โกอะลอง แมนูแฟคเจอริ่ง", "บริษัท", null, hq.id);
  const adm = await org("ADM", "ฝ่ายบริหาร", "ฝ่าย", company.id, hq.id);
  const hrU = await org("HR", "แผนกทรัพยากรบุคคล", "แผนก", adm.id, hq.id);
  const acc = await org("ACC", "แผนกบัญชีและการเงิน", "แผนก", adm.id, hq.id);
  const prd = await org("PRD", "ฝ่ายผลิต", "ฝ่าย", company.id, hq.id);
  const line1 = await org("PRD-L1", "ไลน์ผลิต 1", "แผนก", prd.id, hq.id);
  const line2 = await org("PRD-L2", "ไลน์ผลิต 2 (ระยอง)", "แผนก", prd.id, br2.id);
  const qc = await org("QC", "แผนกควบคุมคุณภาพ", "แผนก", prd.id, hq.id);
  const wh = await org("WH", "แผนกคลังสินค้า", "แผนก", prd.id, hq.id);
  const sales = await org("SAL", "ฝ่ายขาย", "ฝ่าย", company.id, hq.id);

  const pos = async (code: string, name: string, org_unit_id: number, job_level: number, min_salary: number, max_salary: number) =>
    must(await sb.from("positions").insert({ code, name, org_unit_id, job_level, min_salary, max_salary }).select().single());
  const P = {
    md: await pos("MD", "กรรมการผู้จัดการ", company.id, 18, 120000, 250000),
    hrm: await pos("HRM", "ผู้จัดการฝ่ายบุคคล", hrU.id, 12, 45000, 80000),
    hro: await pos("HRO", "เจ้าหน้าที่บุคคล", hrU.id, 5, 18000, 30000),
    accm: await pos("ACCM", "ผู้จัดการบัญชี", acc.id, 12, 45000, 80000),
    acco: await pos("ACCO", "เจ้าหน้าที่บัญชี/เงินเดือน", acc.id, 5, 18000, 32000),
    pm: await pos("PM", "ผู้จัดการฝ่ายผลิต", prd.id, 13, 50000, 90000),
    sup: await pos("SUP", "หัวหน้าไลน์ผลิต", line1.id, 8, 25000, 40000),
    op: await pos("OP", "พนักงานฝ่ายผลิต", line1.id, 2, 11000, 18000),
    qco: await pos("QCO", "พนักงาน QC", qc.id, 3, 13000, 20000),
    whs: await pos("WHS", "พนักงานคลังสินค้า", wh.id, 2, 11000, 17000),
    sm: await pos("SM", "ผู้จัดการฝ่ายขาย", sales.id, 12, 45000, 90000),
    se: await pos("SE", "พนักงานขาย", sales.id, 5, 18000, 30000),
  };
  await sb.from("career_paths").insert([
    { from_position_id: P.op.id, to_position_id: P.sup.id, min_years: 3, requirements: "ผ่านหลักสูตรหัวหน้างานเบื้องต้น, ผลประเมิน B ขึ้นไป 2 ปีติด" },
    { from_position_id: P.sup.id, to_position_id: P.pm.id, min_years: 5, requirements: "ภาวะผู้นำ, Lean Manufacturing" },
    { from_position_id: P.hro.id, to_position_id: P.hrm.id, min_years: 5, requirements: "กฎหมายแรงงาน, Payroll ขั้นสูง" },
  ], { defaultToNull: false });

  const shifts = must(await sb.from("shifts").select("id, code"));
  const shiftId = (c: string) => shifts.find((s) => s.code === c)!.id;

  // ---- employees ---------------------------------------------------------------
  type E = { code: string; org: number; pos: number; branch: number; type: string; salary: number; unit: string; sup?: string; shift: string; status?: string; hire: string; gender: "M" | "F" };
  const list: E[] = [
    { code: "E0001", org: company.id, pos: P.md.id, branch: hq.id, type: "monthly", salary: 180000, unit: "month", shift: "O", hire: "2015-03-01", gender: "M" },
    { code: "E0002", org: hrU.id, pos: P.hrm.id, branch: hq.id, type: "monthly", salary: 65000, unit: "month", sup: "E0001", shift: "O", hire: "2017-06-01", gender: "F" },
    { code: "E0003", org: hrU.id, pos: P.hro.id, branch: hq.id, type: "monthly", salary: 24000, unit: "month", sup: "E0002", shift: "O", hire: "2021-02-15", gender: "F" },
    { code: "E0004", org: acc.id, pos: P.accm.id, branch: hq.id, type: "monthly", salary: 60000, unit: "month", sup: "E0001", shift: "O", hire: "2016-09-01", gender: "F" },
    { code: "E0005", org: acc.id, pos: P.acco.id, branch: hq.id, type: "monthly", salary: 26000, unit: "month", sup: "E0004", shift: "O", hire: "2020-05-01", gender: "F" },
    { code: "E0006", org: prd.id, pos: P.pm.id, branch: hq.id, type: "monthly", salary: 75000, unit: "month", sup: "E0001", shift: "D", hire: "2016-01-04", gender: "M" },
    { code: "E0007", org: line1.id, pos: P.sup.id, branch: hq.id, type: "monthly", salary: 32000, unit: "month", sup: "E0006", shift: "D", hire: "2018-08-01", gender: "M" },
    { code: "E0008", org: line2.id, pos: P.sup.id, branch: br2.id, type: "monthly", salary: 31000, unit: "month", sup: "E0006", shift: "D", hire: "2019-04-01", gender: "M" },
    { code: "E0009", org: sales.id, pos: P.sm.id, branch: hq.id, type: "monthly", salary: 70000, unit: "month", sup: "E0001", shift: "O", hire: "2018-02-01", gender: "M" },
    { code: "E0010", org: qc.id, pos: P.qco.id, branch: hq.id, type: "monthly", salary: 16500, unit: "month", sup: "E0006", shift: "D", hire: "2022-07-01", gender: "F" },
  ];
  for (let i = 11; i <= 45; i++) {
    const code = `E${String(i).padStart(4, "0")}`;
    const r = rnd();
    if (r < 0.5) list.push({ code, org: line1.id, pos: P.op.id, branch: hq.id, type: "daily", salary: 400 + Math.round(rnd() * 8) * 10, unit: "day", sup: "E0007", shift: rnd() < 0.7 ? "D" : "N", hire: ymd(new Date(2019 + Math.floor(rnd() * 7), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27))), gender: rnd() < 0.55 ? "F" : "M" });
    else if (r < 0.7) list.push({ code, org: line2.id, pos: P.op.id, branch: br2.id, type: "daily", salary: 380 + Math.round(rnd() * 6) * 10, unit: "day", sup: "E0008", shift: "D", hire: ymd(new Date(2020 + Math.floor(rnd() * 6), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27))), gender: rnd() < 0.5 ? "F" : "M" });
    else if (r < 0.82) list.push({ code, org: wh.id, pos: P.whs.id, branch: hq.id, type: "monthly", salary: 13000 + Math.round(rnd() * 30) * 100, unit: "month", sup: "E0006", shift: "D", hire: ymd(new Date(2018 + Math.floor(rnd() * 8), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27))), gender: "M" });
    else if (r < 0.92) list.push({ code, org: sales.id, pos: P.se.id, branch: hq.id, type: "monthly", salary: 20000 + Math.round(rnd() * 80) * 100, unit: "month", sup: "E0009", shift: "O", hire: ymd(new Date(2019 + Math.floor(rnd() * 7), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27))), gender: rnd() < 0.5 ? "F" : "M" });
    else list.push({ code, org: qc.id, pos: P.qco.id, branch: hq.id, type: "monthly", salary: 15000 + Math.round(rnd() * 40) * 100, unit: "month", sup: "E0006", shift: "D", hire: ymd(new Date(2021 + Math.floor(rnd() * 5), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27))), gender: "F" });
  }
  // a couple of recent hires on probation
  list[list.length - 1].hire = ymd(new Date(Date.now() - 70 * 86400000));
  list[list.length - 1].status = "probation";
  list[list.length - 2].hire = ymd(new Date(Date.now() - 100 * 86400000));
  list[list.length - 2].status = "probation";

  const idByCode: Record<string, number> = {};
  for (const e of list) {
    const first = e.gender === "M" ? pick(FIRST_M) : pick(FIRST_F);
    const row = must(await sb.from("employees").insert({
      code: e.code, prefix: e.gender === "M" ? "นาย" : pick(["นาง", "นางสาว"]), first_name: first, last_name: pick(LAST), nickname: pick(NICK),
      gender: e.gender, birth_date: ymd(new Date(1975 + Math.floor(rnd() * 28), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27))),
      phone: `08${Math.floor(10000000 + rnd() * 89999999)}`, email: `${e.code.toLowerCase()}@example.co.th`,
      branch_id: e.branch, org_unit_id: e.org, position_id: e.pos, employee_type: e.type, status: e.status ?? "permanent", hire_date: e.hire,
      default_shift_id: shiftId(e.shift), weekly_off_days: e.shift === "O" ? [0, 6] : [0],
    }).select("id").single());
    idByCode[e.code] = row.id;
    await sb.from("employee_private").update({
      salary: e.salary, salary_unit: e.unit, national_id: nationalId(), bank_code: pick(["004", "014", "002", "006"]), bank_account: String(Math.floor(1000000000 + rnd() * 8999999999)),
      sso_enabled: true, pvd_enabled: e.type === "monthly" && rnd() < 0.5, pvd_employee_rate: 3, pvd_employer_rate: 3,
    }).eq("employee_id", row.id);
    await sb.from("employee_addresses").insert({ employee_id: row.id, address_type: "current", house_no: `${Math.floor(rnd() * 200)}/${Math.floor(rnd() * 20)}`, subdistrict: "บางเสาธง", district: "บางเสาธง", province: "สมุทรปราการ", postcode: "10570" });
  }
  for (const e of list) if (e.sup) await sb.from("employees").update({ supervisor_id: idByCode[e.sup] }).eq("id", idByCode[e.code]);
  await sb.from("org_units").update({ manager_employee_id: idByCode.E0001 }).eq("id", company.id);
  await sb.from("org_units").update({ manager_employee_id: idByCode.E0002 }).eq("id", hrU.id);
  await sb.from("org_units").update({ manager_employee_id: idByCode.E0004 }).eq("id", acc.id);
  await sb.from("org_units").update({ manager_employee_id: idByCode.E0006 }).eq("id", prd.id);
  await sb.from("org_units").update({ manager_employee_id: idByCode.E0007 }).eq("id", line1.id);
  await sb.from("org_units").update({ manager_employee_id: idByCode.E0008 }).eq("id", line2.id);
  await sb.from("org_units").update({ manager_employee_id: idByCode.E0009 }).eq("id", sales.id);
  const travel = await itemId("TRAVEL");
  const position = await itemId("POSITION");
  await sb.from("employee_pay_items").insert([
    { employee_id: idByCode.E0007, pay_item_id: position, amount: 3000 },
    { employee_id: idByCode.E0008, pay_item_id: position, amount: 3000 },
    { employee_id: idByCode.E0009, pay_item_id: position, amount: 8000 },
    ...list.filter((e) => e.org === sales.id && e.code !== "E0009").map((e) => ({ employee_id: idByCode[e.code], pay_item_id: travel, amount: 2000 })),
  ]);

  // ---- logins --------------------------------------------------------------------
  const groups = must(await sb.from("role_groups").select("id, code"));
  const gid = (c: string) => groups.find((g) => g.code === c)!.id;
  const accounts: [string, string, string, string, string][] = [
    ["E0002", "hr", "Hr@12345", "HR", "ผู้จัดการฝ่ายบุคคล"],
    ["E0005", "payroll", "Pay@12345", "SAL", "เจ้าหน้าที่เงินเดือน"],
    ["E0006", "manager", "Mgr@12345", "MANAGER", "ผู้จัดการฝ่ายผลิต"],
    ["E0007", "E0007", "Emp@12345", "EMPLOYEE", "หัวหน้าไลน์ 1"],
  ];
  for (const e of list) if (!["E0002", "E0005", "E0006", "E0007"].includes(e.code)) accounts.push([e.code, e.code, "Emp@12345", e.code === "E0001" ? "EXEC" : "EMPLOYEE", ""]);
  for (const [code, username, pw, group] of accounts) {
    const email = `${code.toLowerCase()}@staff.gohr.local`;
    const { data: u, error } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (error) throw error;
    await sb.from("profiles").upsert({ id: u.user!.id, email, username, role_group_id: gid(group), employee_id: idByCode[code], is_active: true });
  }

  // ---- work locations -------------------------------------------------------------
  must(await sb.from("work_locations").insert([
    { name: "โรงงานบางเสาธง", branch_id: hq.id, latitude: 13.5935, longitude: 100.8211, radius_m: 300, wifi_ssids: ["GOALONG-STAFF"] },
    { name: "โรงงานระยอง", branch_id: br2.id, latitude: 12.7086, longitude: 101.1717, radius_m: 300 },
  ], { defaultToNull: false }));

  // ---- holidays 2026 ------------------------------------------------------------------
  const hol = [["2026-01-01", "วันขึ้นปีใหม่"], ["2026-03-03", "วันมาฆบูชา"], ["2026-04-06", "วันจักรี"], ["2026-04-13", "วันสงกรานต์"], ["2026-04-14", "วันสงกรานต์"], ["2026-04-15", "วันสงกรานต์"], ["2026-05-01", "วันแรงงานแห่งชาติ"], ["2026-05-04", "วันฉัตรมงคล"], ["2026-06-03", "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี"], ["2026-07-28", "วันเฉลิมพระชนมพรรษา ร.10"], ["2026-08-12", "วันแม่แห่งชาติ"], ["2026-10-13", "วันคล้ายวันสวรรคต ร.9"], ["2026-10-23", "วันปิยมหาราช"], ["2026-12-07", "ชดเชยวันพ่อแห่งชาติ"], ["2026-12-31", "วันสิ้นปี"]];
  await sb.from("holidays").insert(hol.map(([holiday_date, name]) => ({ holiday_date, name })), { defaultToNull: false });

  // ---- leave quotas ---------------------------------------------------------------------
  const lts = must(await sb.from("leave_types").select("id, code, default_quota_days, is_unlimited, gender"));
  const year = new Date().getFullYear();
  const quotas = [];
  for (const e of list) for (const lt of lts) {
    if (lt.is_unlimited || (lt.gender && lt.gender !== e.gender)) continue;
    if (lt.code === "VACATION" && e.hire > `${year - 1}-12-31`) continue;
    quotas.push({ employee_id: idByCode[e.code], leave_year: year, leave_type_id: lt.id, quota_days: lt.default_quota_days });
  }
  must(await sb.from("leave_quotas").insert(quotas, { defaultToNull: false }));

  // ---- time logs for the last 45 days -----------------------------------------------------
  const today = new Date();
  const logs: Record<string, unknown>[] = [];
  for (let d = 45; d >= 1; d--) {
    const day = new Date(today.getTime() - d * 86400000);
    const date = ymd(day);
    if (hol.some(([h]) => h === date)) continue;
    for (const e of list) {
      const dow = day.getDay();
      const off = e.shift === "O" ? dow === 0 || dow === 6 : dow === 0;
      if (off) continue;
      if (new Date(e.hire) > day) continue;
      const r = rnd();
      if (r < 0.025) continue; // absent
      const [sh, eh] = e.shift === "O" ? [8, 30] : e.shift === "N" ? [20, 0] : [8, 0];
      const lateMin = r < 0.12 ? 3 + Math.floor(rnd() * 25) : -Math.floor(rnd() * 25);
      const inT = new Date(`${date}T${String(sh).padStart(2, "0")}:${String(eh).padStart(2, "0")}:00+07:00`);
      inT.setMinutes(inT.getMinutes() + lateMin);
      const outT = new Date(inT.getTime());
      const outBase = new Date(`${date}T${e.shift === "O" ? "17:30" : e.shift === "N" ? "05:00" : "17:00"}:00+07:00`);
      if (e.shift === "N") outBase.setDate(outBase.getDate() + 1);
      outT.setTime(outBase.getTime() + (r > 0.75 ? 30 + Math.floor(rnd() * 150) : Math.floor(rnd() * 15)) * 60000);
      if (rnd() < 0.02) { logs.push({ employee_id: idByCode[e.code], log_time: inT.toISOString(), source: "fingerprint" }); continue; } // missing out
      const src = e.type === "daily" ? "fingerprint" : pick(["gps", "gps", "wifi", "qr"]);
      logs.push({ employee_id: idByCode[e.code], log_time: inT.toISOString(), source: src, direction: "auto" });
      logs.push({ employee_id: idByCode[e.code], log_time: outT.toISOString(), source: src, direction: "auto" });
    }
  }
  for (let i = 0; i < logs.length; i += 1000) must(await sb.from("time_logs").insert(logs.slice(i, i + 1000), { defaultToNull: false }));

  // ---- announcements / feed ---------------------------------------------------------------
  await sb.from("announcements").insert([
    { title: "กำหนดการตรวจสุขภาพประจำปี 2569", content: "ตรวจสุขภาพประจำปี วันที่ 20-21 ต.ค. ณ ห้องประชุมใหญ่ อาคาร A กรุณางดอาหารก่อนตรวจ 8 ชั่วโมง", is_pinned: true },
    { title: "วันหยุดชดเชยวันปิยมหาราช", content: "บริษัทหยุดทำการวันที่ 23 ต.ค. 2569" },
  ], { defaultToNull: false });
  console.log(`✓ demo data: ${list.length} employees, ${logs.length} time logs`);
  console.log("logins: hr / Hr@12345 · payroll / Pay@12345 · manager / Mgr@12345 · E0007 (supervisor) / Emp@12345 · E0011 (employee) / Emp@12345");
}

async function itemId(code: string) {
  return must(await sb.from("pay_items").select("id").eq("code", code).single()).id as number;
}

function nationalId() {
  let s = String(1 + Math.floor(rnd() * 8));
  for (let i = 0; i < 11; i++) s += Math.floor(rnd() * 10);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (13 - i);
  return s + ((11 - (sum % 11)) % 10);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
