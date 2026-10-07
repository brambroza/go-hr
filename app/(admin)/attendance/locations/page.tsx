"use client";

import { refColumn, refField } from "@/components/attendance/ref-field";
import { SafeCrudPage } from "@/components/attendance/safe-crud";
import { useState } from "react";
import QRCode from "qrcode";
import { LocateFixed, MonitorSmartphone, Network, Printer, QrCode, RefreshCw } from "lucide-react";
import { type Row } from "@/components/crud/crud-page";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Input, Modal, toast, useConfirm } from "@/components/ui";
import { getQrSecretAction, regenerateQrSecretAction } from "@/lib/attendance/actions";
import { QrSvg } from "@/components/attendance/qr";
import { invalidateAttLookups } from "@/components/attendance/lookups";

const COLS = "id, name, branch_id, latitude, longitude, radius_m, wifi_ssids, wifi_bssids, beacon_uuids, allowed_ip_ranges, allow_gps, allow_wifi, allow_beacon, allow_qr, require_photo, require_face, is_active, created_at, updated_at";

type LatLng = { lat: unknown; lng: unknown };

function LatLngPicker({ value, values, onChange }: { value: unknown; values: Record<string, unknown>; onChange: (v: LatLng) => void }) {
  const [busy, setBusy] = useState(false);
  const cur: LatLng = value && typeof value === "object" ? (value as LatLng) : { lat: values.latitude ?? "", lng: values.longitude ?? "" };
  function locate() {
    if (!navigator.geolocation) return toast.error("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        onChange({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) });
        toast.ok(`ได้ตำแหน่งแล้ว (ความแม่นยำ ±${Math.round(p.coords.accuracy)} ม.)`);
      },
      (e) => {
        setBusy(false);
        toast.error(e.code === 1 ? "ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์ตำแหน่งในเบราว์เซอร์แล้วลองใหม่" : "ระบุตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  const has = cur.lat !== "" && cur.lat != null && cur.lng !== "" && cur.lng != null;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" step="any" className="num" aria-label="ละติจูด" placeholder="ละติจูด เช่น 13.7563" value={String(cur.lat ?? "")} onChange={(e) => onChange({ ...cur, lat: e.target.value })} />
        <Input type="number" step="any" className="num" aria-label="ลองจิจูด" placeholder="ลองจิจูด เช่น 100.5018" value={String(cur.lng ?? "")} onChange={(e) => onChange({ ...cur, lng: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="subtle" size="sm" icon={<LocateFixed className="size-4" />} loading={busy} onClick={locate}>ใช้ตำแหน่งปัจจุบัน</Button>
        {has && <a className="text-sm text-jade-700 hover:underline" href={`https://maps.google.com/?q=${cur.lat},${cur.lng}`} target="_blank" rel="noreferrer">ดูบนแผนที่</a>}
      </div>
    </div>
  );
}

/** "192.168.1.0/24" or "203.0.113.10" (→ /32). Returns null when valid, else a Thai error */
function cidrError(list: unknown): string | null {
  if (!Array.isArray(list)) return null;
  for (const raw of list as string[]) {
    const [ip, bits, ...rest] = String(raw).split("/");
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    const v6 = !v4 && /^[0-9a-f:]+$/i.test(ip) && ip.includes(":");
    const max = v4 ? 32 : 128;
    const okBits = bits === undefined || (/^\d{1,3}$/.test(bits) && Number(bits) <= max);
    if (rest.length || !(v4 ? v4.slice(1).every((x) => Number(x) <= 255) : v6) || !okBits) return `“${raw}” ไม่ใช่ IP หรือ CIDR ที่ถูกต้อง (เช่น 192.168.1.0/24)`;
  }
  return null;
}

function IpRangesInput({ value, onChange }: { value: unknown; onChange: (v: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const arr = Array.isArray(value) ? (value as string[]) : [];
  const [text, setText] = useState(arr.join(", "));
  const commit = (t: string) => onChange(t.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean));
  async function useMine() {
    setBusy(true);
    try {
      const r = await fetch("/api/whoami-ip", { cache: "no-store" });
      const j = (await r.json()) as { ip: string | null; cidr: string | null };
      if (!j.cidr) return toast.error("ระบุ IP ของเครื่องนี้ไม่ได้");
      if (arr.includes(j.cidr)) return toast.ok(`มี ${j.cidr} อยู่แล้ว`);
      const next = [...arr, j.cidr];
      setText(next.join(", "));
      onChange(next);
      toast.ok(`เพิ่ม ${j.cidr} แล้ว — ถ้าเป็นวง LAN ให้แก้เป็นทั้งวง เช่น 192.168.1.0/24`);
    } catch {
      toast.error("ติดต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Input className="num" value={text} onChange={(e) => (setText(e.target.value), commit(e.target.value))} placeholder="เช่น 192.168.1.0/24, 203.0.113.10/32" />
      <div>
        <Button variant="subtle" size="sm" icon={<Network className="size-4" />} loading={busy} onClick={useMine}>ใช้ IP ปัจจุบันของฉัน</Button>
      </div>
    </div>
  );
}

export default function LocationsPage() {
  const can = useCan();
  const canEdit = can("attendance", "edit");
  const [poster, setPoster] = useState<{ row: Row; secret: string } | null>(null);
  const [loading, setLoading] = useState<number | null>(null);
  const { confirm, dialog } = useConfirm();

  async function openPoster(row: Row) {
    setLoading(Number(row.id));
    const r = await getQrSecretAction(Number(row.id));
    setLoading(null);
    if (!r.ok) return toast.error(r.error);
    setPoster({ row, secret: r.data! });
  }

  async function regenerate() {
    if (!poster) return;
    if (!(await confirm("สร้างรหัส QR ใหม่? โปสเตอร์ QR ที่พิมพ์ติดไว้เดิมจะใช้ลงเวลาไม่ได้อีก ต้องพิมพ์ใหม่", { danger: true, confirmText: "สร้างใหม่" }))) return;
    const r = await regenerateQrSecretAction(Number(poster.row.id));
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "สร้างใหม่แล้ว");
    setPoster({ ...poster, secret: r.data! });
  }

  return (
    <>
      <SafeCrudPage
        config={{
          table: "work_locations",
          select: COLS,
          title: "พื้นที่ลงเวลา",
          description: "จุดที่พนักงานลงเวลาด้วยมือถือได้ — GPS (รัศมี), Wi-Fi, Beacon หรือสแกน QR ที่ติดไว้ / QR หมุนเวียนบนจอ Kiosk",
          menu: "attendance",
          orderBy: { column: "name", ascending: true },
          searchColumns: ["name"],
          formSize: "lg",
          defaults: { radius_m: 150, allow_gps: true, allow_wifi: true, allow_qr: true, is_active: true },
          afterSave: () => invalidateAttLookups(),
          beforeSave: (v) => {
            const { _latlng, ...rest } = v as Row & { _latlng?: LatLng | "" | null };
            if (_latlng && typeof _latlng === "object") {
              rest.latitude = _latlng.lat === "" || _latlng.lat == null ? null : Number(_latlng.lat);
              rest.longitude = _latlng.lng === "" || _latlng.lng == null ? null : Number(_latlng.lng);
            }
            if ((rest.latitude == null) !== (rest.longitude == null)) throw new Error("กรุณาระบุทั้งละติจูดและลองจิจูด");
            return rest;
          },
          rowActions: (r) =>
            canEdit ? (
              <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" onClick={() => openPoster(r)} aria-label="พิมพ์ QR ลงเวลา" title="พิมพ์ QR ลงเวลา" disabled={loading === Number(r.id)}>
                <QrCode className="size-4" />
              </button>
            ) : null,
          columns: [
            { key: "name", label: "ชื่อจุดลงเวลา", sortable: true },
            refColumn("branch_id", "สาขา", "branches"),
            {
              key: "latitude",
              label: "พิกัด / รัศมี",
              render: (r) => (r.latitude != null ? <span className="num text-sm">{Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)} · {String(r.radius_m)} ม.</span> : <span className="text-ink-mute">ยังไม่ระบุ</span>),
              exportValue: (r) => `${r.latitude},${r.longitude}`,
            },
            {
              key: "methods",
              label: "วิธีลงเวลา",
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.allow_gps ? <Badge color="green">GPS</Badge> : null}
                  {r.allow_wifi ? <Badge color="green">Wi-Fi{Array.isArray(r.wifi_ssids) && r.wifi_ssids.length ? ` (${r.wifi_ssids.length})` : ""}</Badge> : null}
                  {r.allow_wifi && Array.isArray(r.allowed_ip_ranges) && r.allowed_ip_ranges.length ? <Badge color="green">เครือข่ายบริษัท</Badge> : null}
                  {r.allow_beacon ? <Badge color="green">Beacon</Badge> : null}
                  {r.allow_qr ? <Badge color="green">QR</Badge> : null}
                  {r.require_photo ? <Badge color="amber">ต้องถ่ายรูป</Badge> : null}
                  {r.require_face ? <Badge color="amber">ต้องสแกนหน้า</Badge> : null}
                </div>
              ),
              exportValue: (r) => ["gps", "wifi", "beacon", "qr"].filter((k) => r[`allow_${k}`]).join(" "),
            },
            { key: "is_active", label: "ใช้งาน" },
          ],
          fields: [
            { name: "name", label: "ชื่อจุดลงเวลา", type: "text", required: true, section: "ข้อมูลจุดลงเวลา" },
            refField("branch_id", "สาขา", { table: "branches", label: "name", order: "code" }, { section: "ข้อมูลจุดลงเวลา" }),
            { name: "is_active", label: "ใช้งาน", type: "boolean", section: "ข้อมูลจุดลงเวลา" },

            { name: "allow_gps", label: "ลงเวลาด้วย GPS", type: "boolean", section: "GPS" },
            { name: "radius_m", label: "รัศมีที่อนุญาต (เมตร)", type: "number", min: 10, step: "1", required: true, section: "GPS", hint: "แนะนำ 100–300 ม. (GPS ในอาคารคลาดเคลื่อนได้)" },
            { name: "_latlng", label: "พิกัดจุดศูนย์กลาง", type: "custom", span: 2, section: "GPS", render: ({ value, values, onChange }) => <LatLngPicker value={value} values={values} onChange={onChange} /> },
            { name: "latitude", label: "ละติจูด", type: "number", hideInForm: true },
            { name: "longitude", label: "ลองจิจูด", type: "number", hideInForm: true },

            { name: "allow_wifi", label: "ลงเวลาด้วย Wi-Fi", type: "boolean", section: "Wi-Fi / Beacon" },
            { name: "allow_beacon", label: "ลงเวลาด้วย Beacon", type: "boolean", section: "Wi-Fi / Beacon" },
            { name: "wifi_ssids", label: "ชื่อ Wi-Fi (SSID)", type: "tags", section: "Wi-Fi / Beacon", placeholder: "เช่น OFFICE-STAFF, FACTORY-5G" },
            { name: "wifi_bssids", label: "MAC ของ Access Point (BSSID)", type: "tags", section: "Wi-Fi / Beacon", hint: "ปลอดภัยกว่า SSID เพราะปลอมยาก", placeholder: "aa:bb:cc:dd:ee:ff" },
            {
              name: "allowed_ip_ranges",
              label: "เครือข่ายของบริษัท (IP / CIDR)",
              type: "custom",
              span: 2,
              section: "Wi-Fi / Beacon",
              hint: "สำหรับเมนู ‘Wi-Fi บริษัท’ ในแอปพนักงาน (เบราว์เซอร์อ่านชื่อ Wi-Fi ไม่ได้ จึงตรวจจาก IP) — ติดตั้งในวง LAN ใส่วง IP ภายใน เช่น 192.168.1.0/24; เข้าผ่านอินเทอร์เน็ตใส่ IP สาธารณะ (Fixed IP) ของสำนักงาน",
              validate: (v) => cidrError(v),
              render: ({ value, onChange }) => <IpRangesInput value={value} onChange={onChange} />,
            },
            { name: "beacon_uuids", label: "Beacon UUID", type: "tags", span: 2, section: "Wi-Fi / Beacon" },

            { name: "allow_qr", label: "ลงเวลาด้วย QR Code", type: "boolean", section: "QR และการยืนยันตัวตน" },
            { name: "require_photo", label: "ต้องถ่ายรูปทุกครั้ง", type: "boolean", section: "QR และการยืนยันตัวตน" },
            { name: "require_face", label: "ต้องยืนยันใบหน้า", type: "boolean", section: "QR และการยืนยันตัวตน" },
          ],
        }}
      />

      <Modal
        open={!!poster}
        onClose={() => setPoster(null)}
        size="lg"
        title="QR ลงเวลา"
        footer={
          <>
            <Button variant="ghost" className="mr-auto" icon={<RefreshCw className="size-4" />} onClick={regenerate}>สร้างรหัสใหม่</Button>
            <a href="/attendance/devices" className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line px-4 text-[15px] hover:bg-jade-50">
              <MonitorSmartphone className="size-4" /> ตั้งค่าจอ Kiosk (QR หมุนเวียน)
            </a>
            <Button icon={<Printer className="size-4" />} onClick={() => poster && printPoster(String(poster.row.name), `${poster.row.id}.${poster.secret}`)}>พิมพ์โปสเตอร์</Button>
          </>
        }
      >
        {poster && (
          <div id="qr-poster" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border-2 border-jade-800 p-6 text-center">
            <div className="text-sm text-ink-soft">สแกนเพื่อลงเวลาเข้า-ออกงาน</div>
            <div className="text-2xl font-semibold">{String(poster.row.name)}</div>
            <QrSvg value={`${poster.row.id}.${poster.secret}`} className="aspect-square w-full max-w-72" label={`QR ลงเวลา ${poster.row.name}`} />
            <ol className="text-left text-sm text-ink-soft">
              <li>1. เปิดแอป GO HR บนมือถือ แล้วกด “ลงเวลา”</li>
              <li>2. เลือก “สแกน QR” แล้วส่องที่รูปนี้</li>
            </ol>
            <p className="text-xs text-ink-mute">QR นี้ใช้ได้เฉพาะในแอป GO HR ของบริษัท — ถ้าสงสัยว่ารั่วไหล ให้กด “สร้างรหัสใหม่” แล้วพิมพ์ใหม่</p>
          </div>
        )}
      </Modal>
      {dialog}
    </>
  );
}

/** Prints only the poster in a clean window (app chrome is not printed) */
async function printPoster(name: string, value: string) {
  const w = window.open("", "_blank", "width=800,height=1000");
  if (!w) return toast.error("เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต pop-up แล้วลองใหม่");
  const svg = await QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#082119", light: "#ffffff" } });
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>QR ลงเวลา ${esc(name)}</title>
<style>body{font-family:"IBM Plex Sans Thai","Noto Sans Thai",Tahoma,sans-serif;display:flex;justify-content:center;padding:20mm 10mm;color:#082119}
.p{border:3px solid #134837;border-radius:16px;padding:14mm;text-align:center;width:150mm}.s{font-size:20px;color:#4a5a54}
.t{font-size:34px;font-weight:600;margin:6px 0 12px}svg{width:115mm;height:115mm}ol{text-align:left;font-size:17px;color:#4a5a54;display:inline-block;padding-left:20px}
.n{font-size:12px;color:#7a8a84}@page{size:A4;margin:10mm}</style></head>
<body><div class="p"><div class="s">สแกนเพื่อลงเวลาเข้า-ออกงาน</div><div class="t">${esc(name)}</div>${svg}
<ol><li>เปิดแอป GO HR บนมือถือ แล้วกด “ลงเวลา”</li><li>เลือก “สแกน QR” แล้วส่องที่รูปนี้</li></ol>
<div class="n">ใช้ได้เฉพาะในแอป GO HR ของบริษัท</div></div><script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`);
  w.document.close();
}
