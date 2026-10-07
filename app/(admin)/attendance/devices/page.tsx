"use client";

import { refColumn, refField } from "@/components/attendance/ref-field";
import { SafeCrudPage } from "@/components/attendance/safe-crud";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, KeyRound, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { humanError, type Row } from "@/components/crud/crud-page";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { Badge, Button, Empty, Input, Modal, Spinner, toast, useConfirm } from "@/components/ui";
import { thDateTime } from "@/lib/format";
import { getDeviceKeyAction, regenerateDeviceKeyAction } from "@/lib/attendance/actions";
import { empName, useEmployees } from "@/components/attendance/lookups";

const COLS = "id, name, device_type, brand, serial_no, ip_address, branch_id, location_id, last_seen_at, is_active, created_at, updated_at";
const TYPES = [
  { value: "fingerprint", label: "เครื่องสแกนนิ้ว" },
  { value: "face", label: "เครื่องสแกนใบหน้า" },
  { value: "kiosk", label: "จอ Kiosk (QR หมุนเวียน)" },
  { value: "card", label: "เครื่องทาบบัตร" },
  { value: "beacon", label: "Beacon" },
];

function online(lastSeen: unknown) {
  if (!lastSeen) return <Badge>ยังไม่เคยเชื่อมต่อ</Badge>;
  const mins = (Date.now() - new Date(String(lastSeen)).getTime()) / 60_000;
  return (
    <span className="flex flex-col items-start">
      <Badge color={mins < 15 ? "green" : mins < 24 * 60 ? "amber" : "red"}>{mins < 15 ? "ออนไลน์" : "ขาดการติดต่อ"}</Badge>
      <span className="num mt-0.5 text-xs text-ink-mute">{thDateTime(String(lastSeen))}</span>
    </span>
  );
}

export default function DevicesPage() {
  const can = useCan();
  const canEdit = can("attendance", "edit");
  const [keyFor, setKeyFor] = useState<{ row: Row; key: string } | null>(null);
  const [mapFor, setMapFor] = useState<Row | null>(null);
  const { confirm, dialog } = useConfirm();
  const [regenBusy, setRegenBusy] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function showKey(row: Row) {
    const r = await getDeviceKeyAction(Number(row.id));
    if (!r.ok) return toast.error(r.error);
    setKeyFor({ row, key: r.data! });
  }
  async function regen() {
    if (!keyFor) return;
    if (!(await confirm("สร้าง API key ใหม่? เครื่องที่ใช้ key เดิมจะส่งข้อมูลไม่ได้จนกว่าจะตั้งค่า key ใหม่", { danger: true, confirmText: "สร้างใหม่" }))) return;
    setRegenBusy(true);
    const r = await regenerateDeviceKeyAction(Number(keyFor.row.id)).finally(() => setRegenBusy(false));
    if (!r.ok) return toast.error(humanError(r.error));
    toast.ok(r.message ?? "สร้างใหม่แล้ว");
    setKeyFor({ ...keyFor, key: r.data! });
  }
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.ok("คัดลอกแล้ว"), () => toast.error("คัดลอกไม่สำเร็จ"));

  return (
    <>
      <SafeCrudPage
        config={{
          table: "time_devices",
          select: COLS,
          title: "อุปกรณ์ลงเวลา",
          description: "เครื่องสแกนนิ้ว/ใบหน้าที่ส่งข้อมูลเข้าระบบอัตโนมัติ และจอ Kiosk แสดง QR หมุนเวียน",
          menu: "attendance",
          orderBy: { column: "name", ascending: true },
          searchColumns: ["name", "serial_no", "ip_address"],
          defaults: { device_type: "fingerprint", is_active: true },
          filters: [{ name: "device_type", label: "ประเภท", options: TYPES.map((t) => ({ value: t.value, label: t.label })) }],
          rowActions: (r) =>
            canEdit ? (
              <>
                <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" onClick={() => showKey(r)} aria-label="API key และวิธีเชื่อมต่อ" title="API key และวิธีเชื่อมต่อ"><KeyRound className="size-4" /></button>
                <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" onClick={() => setMapFor(r)} aria-label="จับคู่รหัสผู้ใช้บนเครื่อง" title="จับคู่รหัสผู้ใช้บนเครื่อง"><Users className="size-4" /></button>
              </>
            ) : null,
          columns: [
            { key: "name", label: "ชื่ออุปกรณ์", sortable: true },
            { key: "device_type", label: "ประเภท" },
            { key: "brand", label: "ยี่ห้อ / S/N", render: (r) => <span className="text-sm">{[r.brand, r.serial_no].filter(Boolean).join(" · ") || "-"}</span> },
            refColumn("location_id", "พื้นที่ลงเวลา", "work_locations"),
            { key: "last_seen_at", label: "สถานะ", render: (r) => online(r.last_seen_at), exportValue: (r) => r.last_seen_at },
            { key: "is_active", label: "ใช้งาน" },
          ],
          fields: [
            { name: "name", label: "ชื่ออุปกรณ์", type: "text", required: true, placeholder: "เช่น เครื่องสแกนนิ้ว ประตูโรงงาน 1" },
            { name: "device_type", label: "ประเภท", type: "select", required: true, options: TYPES },
            { name: "brand", label: "ยี่ห้อ / รุ่น", type: "text", placeholder: "เช่น ZKTeco MB360" },
            { name: "serial_no", label: "Serial No.", type: "text" },
            { name: "ip_address", label: "IP Address", type: "text" },
            refField("branch_id", "สาขา", { table: "branches", label: "name", order: "code" }),
            refField("location_id", "พื้นที่ลงเวลา", { table: "work_locations", select: "id, name", label: "name", order: "name" }, { hint: "จำเป็นสำหรับ Kiosk QR" }),
            { name: "is_active", label: "ใช้งาน", type: "boolean" },
          ],
        }}
      />

      <Modal
        open={!!keyFor}
        onClose={() => setKeyFor(null)}
        size="lg"
        title={`เชื่อมต่อ ${keyFor?.row.name ?? ""}`}
        footer={<Button variant="ghost" className="mr-auto" icon={<RefreshCw className="size-4" />} onClick={regen} loading={regenBusy}>สร้าง API key ใหม่</Button>}
      >
        {keyFor && (
          <div className="flex flex-col gap-4 text-[15px]">
            <div>
              <div className="mb-1 text-sm font-medium text-ink-soft">API key (เก็บเป็นความลับ)</div>
              <div className="flex gap-2">
                <Input readOnly value={keyFor.key} className="num font-mono text-sm" onFocus={(e) => e.target.select()} />
                <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => copy(keyFor.key)}>คัดลอก</Button>
              </div>
            </div>
            {keyFor.row.device_type === "kiosk" ? (
              <div>
                <div className="mb-1 text-sm font-medium text-ink-soft">ลิงก์จอ Kiosk (เปิดบนแท็บเล็ต/จอที่ติดตั้งหน้างาน แบบเต็มจอ)</div>
                <div className="flex gap-2">
                  <Input readOnly value={`${origin}/kiosk?key=${keyFor.key}`} className="font-mono text-sm" onFocus={(e) => e.target.select()} />
                  <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => copy(`${origin}/kiosk?key=${keyFor.key}`)}>คัดลอก</Button>
                  <a href={`/kiosk?key=${keyFor.key}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1 rounded-[var(--radius-ctl)] border border-line px-3 hover:bg-jade-50"><ExternalLink className="size-4" />เปิด</a>
                </div>
                {!keyFor.row.location_id && <p className="mt-1 text-sm text-rust">ยังไม่ได้เลือกพื้นที่ลงเวลา — จอ Kiosk จะแสดง QR ไม่ได้</p>}
              </div>
            ) : (
              <div>
                <div className="mb-1 text-sm font-medium text-ink-soft">ส่งเวลาจากเครื่อง / โปรแกรมกลาง (middleware)</div>
                <pre className="thin-scroll overflow-x-auto rounded-lg border border-line bg-paper p-3 text-xs leading-relaxed text-ink">{`POST ${origin}/api/device/push
x-device-key: ${keyFor.key}
Content-Type: application/json

{ "logs": [
  { "user_id": "7", "time": "2026-10-07 07:55:12", "direction": "in" },
  { "employee_code": "E0007", "time": "2026-10-07T17:02:00+07:00" }
] }`}</pre>
                <p className="mt-1 text-sm text-ink-soft">
                  ส่งซ้ำได้ไม่เกิดข้อมูลซ้ำ · เวลาที่ไม่มีโซนเวลาถือเป็นเวลาไทย · รหัสผู้ใช้บนเครื่องที่ไม่ตรงกับรหัสพนักงาน ให้จับคู่ที่ปุ่ม <Users className="inline size-4" />
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {mapFor && <UserMapModal device={mapFor} onClose={() => setMapFor(null)} />}
      {dialog}
    </>
  );
}

type MapRow = { device_user_id: string; employee_id: number; device_id: number | null };

function UserMapModal({ device, onClose }: { device: Row; onClose: () => void }) {
  const sb = supabaseBrowser();
  const { list: emps } = useEmployees();
  const [rows, setRows] = useState<MapRow[] | null>(null);
  const [draft, setDraft] = useState<{ user: string; emp: number | null }>({ user: "", emp: null });
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const { confirm, dialog } = useConfirm();
  const empById = useMemo(() => new Map(emps.map((e) => [e.id, e])), [emps]);
  const options = useMemo(() => emps.map((e) => ({ value: e.id, label: empName(e), raw: e })), [emps]);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from("device_user_maps").select("device_user_id, employee_id, device_id").or(`device_id.eq.${device.id},device_id.is.null`).order("device_user_id").limit(5000);
    if (error) toast.error(error.message);
    setRows((data as MapRow[]) ?? []);
  }, [sb, device.id]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function add() {
    if (!draft.user.trim() || !draft.emp) return toast.error("กรุณาระบุรหัสบนเครื่องและเลือกพนักงาน");
    setAdding(true);
    const { error } = await sb.from("device_user_maps").insert({ device_user_id: draft.user.trim(), employee_id: draft.emp, device_id: Number(device.id) });
    setAdding(false);
    if (error) return toast.error(humanError(error));
    toast.ok("เพิ่มการจับคู่แล้ว");
    setDraft({ user: "", emp: null });
    load();
  }
  async function remove(r: MapRow) {
    if (!(await confirm(`ลบการจับคู่รหัสบนเครื่อง "${r.device_user_id}" ใช่หรือไม่? สแกนจากรหัสนี้จะไม่ถูกนับเป็นของพนักงานคนนี้อีก`, { danger: true, confirmText: "ลบ" }))) return;
    let del = sb.from("device_user_maps").delete().eq("device_user_id", r.device_user_id).eq("employee_id", r.employee_id);
    del = r.device_id == null ? del.is("device_id", null) : del.eq("device_id", r.device_id);
    const { error } = await del;
    if (error) return toast.error(humanError(error));
    toast.ok("ลบการจับคู่แล้ว");
    load();
  }

  const shown = (rows ?? []).filter((r) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const e = empById.get(r.employee_id);
    return r.device_user_id.toLowerCase().includes(t) || `${e?.code} ${empName(e)}`.toLowerCase().includes(t);
  });

  return (
    <Modal open onClose={onClose} size="lg" title={`จับคู่รหัสผู้ใช้บนเครื่อง — ${device.name}`}>
      <p className="mb-3 text-sm text-ink-soft">ใช้เมื่อรหัสบนเครื่องสแกนไม่ตรงกับรหัสพนักงาน (ถ้าตรงกันไม่ต้องจับคู่) · รายการ “ทุกเครื่อง” มาจากการนำเข้าไฟล์</p>
      <div className="mb-3 grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
        <Input value={draft.user} onChange={(e) => setDraft({ ...draft, user: e.target.value })} placeholder="รหัสบนเครื่อง" aria-label="รหัสบนเครื่อง" />
        <EmployeePicker value={draft.emp} onChange={(v) => setDraft({ ...draft, emp: v })} options={options} />
        <Button icon={<Plus className="size-4" />} onClick={add} loading={adding}>เพิ่ม</Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา" className="mb-2 h-9 text-sm" />
      {rows === null ? (
        <Spinner className="mx-auto my-6" />
      ) : shown.length === 0 ? (
        <Empty title="ยังไม่มีการจับคู่" />
      ) : (
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-line text-left text-[13px] text-ink-soft">
              <th className="px-2 py-1.5 font-medium">รหัสบนเครื่อง</th>
              <th className="px-2 py-1.5 font-medium">พนักงาน</th>
              <th className="px-2 py-1.5 font-medium">ใช้กับ</th>
              <th className="w-px" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const e = empById.get(r.employee_id);
              return (
                <tr key={`${r.device_user_id}-${r.employee_id}-${r.device_id}`} className="border-b border-line-soft last:border-0">
                  <td className="num px-2 py-1.5 font-mono">{r.device_user_id}</td>
                  <td className="px-2 py-1.5">{e ? `${e.code} · ${empName(e)}` : `#${r.employee_id}`}</td>
                  <td className="px-2 py-1.5">{r.device_id == null ? <Badge>ทุกเครื่อง</Badge> : <Badge color="blue">เครื่องนี้</Badge>}</td>
                  <td className="px-2 py-1 text-right">
                    <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => remove(r)} aria-label="ลบการจับคู่"><Trash2 className="size-4" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {dialog}
    </Modal>
  );
}
