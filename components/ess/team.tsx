"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Fingerprint, MapPin, Search } from "lucide-react";
import { Badge, Button, clsx, Field, Input, Modal, Spinner, toast } from "@/components/ui";
import { useMe } from "@/components/app/me-context";
import { supabaseBrowser } from "@/lib/supabase/client";
import { resizeImage, uploadFile } from "@/lib/storage";
import { isoDate, thTime } from "@/lib/format";

type Member = {
  employee_id: number;
  code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
  position_name: string | null;
  supervisor_id: number | null;
  shift_code: string | null;
  shift_color: string | null;
  shift_start: string | null;
  shift_end: string | null;
  day_type: string;
  scans: number;
  first_in: string | null;
  last_scan: string | null;
  late_minutes: number;
  leave_type: string | null;
  attendance_exempt: boolean;
};

function statusOf(m: Member, nowHm: string): { label: string; color: string; key: string } {
  if (m.leave_type) return { label: m.leave_type, color: "blue", key: "leave" };
  if (m.day_type === "off" || m.day_type === "holiday") return { label: m.day_type === "holiday" ? "วันหยุดนักขัตฯ" : "วันหยุด", color: "gray", key: "off" };
  if (m.scans === 0) {
    if (m.attendance_exempt) return { label: "ไม่ต้องลงเวลา", color: "gray", key: "ok" };
    if (m.shift_start && nowHm < m.shift_start) return { label: "ยังไม่ถึงเวลา", color: "gray", key: "wait" };
    return { label: "ยังไม่ลงเวลา", color: "amber", key: "missing" };
  }
  if (m.late_minutes > 0) return { label: `สาย ${m.late_minutes} นาที`, color: "red", key: "late" };
  return { label: "มาแล้ว", color: "green", key: "in" };
}

export function TeamView() {
  const me = useMe();
  const [rows, setRows] = useState<Member[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [target, setTarget] = useState<Member | null>(null);
  const nowHm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

  async function load() {
    const { data, error } = await supabaseBrowser().rpc("my_team_today");
    if (error) toast.error(error.message);
    setRows((data as Member[]) ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  const withStatus = useMemo(() => (rows ?? []).map((m) => ({ m, s: statusOf(m, nowHm) })), [rows, nowHm]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { s } of withStatus) c[s.key] = (c[s.key] ?? 0) + 1;
    return c;
  }, [withStatus]);
  const list = withStatus.filter(({ m, s }) => {
    if (filter !== "all" && s.key !== filter) return false;
    const t = q.trim().toLowerCase();
    return !t || [m.code, m.first_name, m.last_name, m.nickname ?? ""].some((x) => x.toLowerCase().includes(t));
  });

  if (rows === null) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  if (rows.length === 0) return <p className="rounded-[var(--radius-panel)] border border-line bg-white px-4 py-10 text-center text-ink-soft">คุณยังไม่มีลูกทีมในระบบ</p>;

  const chips = [
    { k: "all", label: "ทั้งหมด", n: rows.length },
    { k: "in", label: "มาแล้ว", n: counts.in ?? 0 },
    { k: "late", label: "สาย", n: counts.late ?? 0 },
    { k: "missing", label: "ยังไม่ลงเวลา", n: counts.missing ?? 0 },
    { k: "leave", label: "ลา", n: counts.leave ?? 0 },
  ];

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {chips.slice(1).map((c) => (
          <button
            key={c.k}
            onClick={() => setFilter(filter === c.k ? "all" : c.k)}
            aria-pressed={filter === c.k}
            className={clsx("rounded-[var(--radius-panel)] border px-2 py-2 text-center", filter === c.k ? "border-jade-600 bg-jade-50" : "border-line bg-white")}
          >
            <div className={clsx("num text-xl font-semibold", c.k === "late" && c.n ? "text-rust" : c.k === "missing" && c.n ? "text-amber-ink" : "text-ink")}>{c.n}</div>
            <div className="text-xs text-ink-soft">{c.label}</div>
          </button>
        ))}
      </div>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ ชื่อเล่น รหัส" className="h-11 pl-9" aria-label="ค้นหาลูกทีม" />
      </div>
      <ul className="mt-3 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white">
        {list.map(({ m, s }) => (
          <li key={m.employee_id} className="flex items-center gap-3 border-b border-line-soft px-3 py-2.5 last:border-0">
            {m.photo_url ? (
               
              <img src={m.photo_url} alt="" className="size-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-jade-50 text-sm font-semibold text-jade-800">{(m.nickname || m.first_name).slice(0, 2)}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {m.first_name} {m.last_name}
                {m.nickname && <span className="font-normal text-ink-mute"> ({m.nickname})</span>}
              </div>
              <div className="num flex items-center gap-1.5 truncate text-sm text-ink-soft">
                {m.shift_code && m.day_type !== "off" && (
                  <span className="rounded px-1 text-[11px] font-semibold text-white" style={{ background: m.shift_color ?? "#10b981" }}>{m.shift_code}</span>
                )}
                {m.first_in ? `เข้า ${thTime(m.first_in)}` : m.shift_start ? `${m.shift_start}–${m.shift_end}` : m.code}
                {m.scans > 1 && m.last_scan ? ` · ล่าสุด ${thTime(m.last_scan)}` : ""}
              </div>
              <Badge color={s.color} className="mt-0.5">{s.label}</Badge>
            </div>
            <Button variant="secondary" className="h-11 shrink-0 px-3" onClick={() => setTarget(m)}>
              ลงเวลาแทน
            </Button>
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-mute">ไม่พบลูกทีมตามเงื่อนไข</li>}
      </ul>
      {target && <TeamCheckinModal member={target} onClose={() => setTarget(null)} onDone={load} supervisorName={me.displayName} />}
    </>
  );
}

function TeamCheckinModal({ member, onClose, onDone, supervisorName }: { member: Member; onClose: () => void; onDone: () => void; supervisorName: string }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState("กำลังหาตำแหน่ง…");
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return setGeoMsg("อุปกรณ์ไม่รองรับ GPS (ลงเวลาแทนได้โดยไม่มีพิกัด)");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
        setGeoMsg("");
      },
      () => setGeoMsg("ไม่ได้รับตำแหน่ง (ลงเวลาแทนได้โดยไม่มีพิกัด)"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, []);

  async function submit() {
    setBusy(true);
    try {
      let url: string | null = null;
      if (photo) url = (await uploadFile("checkins", photo.blob, { folder: `team/${isoDate()}`, name: "team.jpg" })).url;
      const { data, error } = await supabaseBrowser().rpc("team_check_in", {
        p_employee_id: member.employee_id,
        p_latitude: coords?.lat ?? null,
        p_longitude: coords?.lng ?? null,
        p_photo_url: url,
        p_note: note.trim() || `ลงเวลาแทนโดย ${supervisorName}`,
      });
      if (error) throw error;
      toast.ok(`ลงเวลาแทน ${member.nickname || member.first_name} แล้ว ${thTime((data as { time: string }).time)} น.`);
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`ลงเวลาแทน ${member.nickname || member.first_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button loading={busy} icon={<Fingerprint className="size-4" />} onClick={submit}>
            ลงเวลาตอนนี้
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-ink-soft">
          บันทึกเวลา {member.first_name} {member.last_name} ({member.code}) เป็นเวลาปัจจุบัน ระบบจะบันทึกว่าคุณเป็นผู้ลงเวลาให้
        </p>
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <MapPin className="size-4 text-jade-600" />
          {coords ? `ได้พิกัดแล้ว (±${Math.round(coords.acc)} ม.)` : geoMsg}
        </div>
        <input ref={file} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const blob = await resizeImage(f, 960, 0.8);
          setPhoto({ blob, preview: URL.createObjectURL(blob) });
        }} />
        <div className="flex items-center gap-3">
          {photo && (
             
            <img src={photo.preview} alt="รูปยืนยัน" className="size-14 rounded-md object-cover" />
          )}
          <Button variant="secondary" icon={<Camera className="size-4" />} onClick={() => file.current?.click()}>
            {photo ? "ถ่ายใหม่" : "ถ่ายรูปพนักงาน (ไม่บังคับ)"}
          </Button>
        </div>
        <Field label="หมายเหตุ">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น โทรศัพท์พนักงานเสีย" />
        </Field>
      </div>
    </Modal>
  );
}
