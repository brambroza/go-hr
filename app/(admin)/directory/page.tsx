"use client";

import type { Res } from "@/lib/employees/labels";
import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Mail, Phone, Search, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Empty, Input, PageHeader, Panel, Select, Spinner, clsx, toast } from "@/components/ui";
import { Avatar } from "@/components/employees/avatar";

type Row = {
  id: number; code: string; prefix: string | null; first_name: string; last_name: string; nickname: string | null;
  first_name_en: string | null; last_name_en: string | null; email: string | null; phone: string | null; photo_url: string | null;
  branch_id: number | null; org_unit_id: number | null; org_unit_name: string | null; position_name: string | null; branch_name: string | null;
};

export default function DirectoryPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("");
  const [branch, setBranch] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    supabaseBrowser()
      .from("v_directory")
      .select("id, code, prefix, first_name, last_name, nickname, first_name_en, last_name_en, email, phone, photo_url, branch_id, org_unit_id, org_unit_name, position_name, branch_name")
      .order("first_name")
      .limit(10000)
      .then(({ data, error }: Res) => {
        if (error) toast.error(error.message);
        setRows((data as Row[]) ?? []);
      });
  }, []);

  const orgs = useMemo(() => uniq(rows, "org_unit_id", "org_unit_name"), [rows]);
  const branches = useMemo(() => uniq(rows, "branch_id", "branch_name"), [rows]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (!org || String(r.org_unit_id) === org) &&
        (!branch || String(r.branch_id) === branch) &&
        (!t || [r.code, r.first_name, r.last_name, r.nickname, r.first_name_en, r.last_name_en, r.email, r.phone, r.position_name, r.org_unit_name].some((x) => x?.toLowerCase().includes(t))),
    );
  }, [rows, q, org, branch]);


  return (
    <div>
      <PageHeader title="ผู้ติดต่อภายใน" description="ค้นหาเบอร์โทรและอีเมลของเพื่อนร่วมงาน" />
      <Panel bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} placeholder="ชื่อ ชื่อเล่น ตำแหน่ง เบอร์โทร" className="h-9 pl-8 text-sm" aria-label="ค้นหาผู้ติดต่อ" />
          </div>
          <Select className="h-9 sm:w-auto min-w-40 text-sm" value={org} onChange={(e) => { setOrg(e.target.value); setLimit(60); }} placeholder="หน่วยงาน: ทั้งหมด" aria-label="หน่วยงาน">
            {orgs.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </Select>
          {branches.length > 1 && (
            <Select className="h-9 sm:w-auto min-w-36 text-sm" value={branch} onChange={(e) => { setBranch(e.target.value); setLimit(60); }} placeholder="สาขา: ทั้งหมด" aria-label="สาขา">
              {branches.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </Select>
          )}
          <span className="num ml-auto text-sm text-ink-mute">{shown.length.toLocaleString()} คน</span>
          <div className="flex rounded-[var(--radius-ctl)] border border-line p-0.5" role="group" aria-label="รูปแบบการแสดงผล">
            <button type="button" aria-pressed={view === "cards"} aria-label="แบบการ์ด" onClick={() => setView("cards")} className={clsx("rounded-md p-1.5", view === "cards" ? "bg-jade-600 text-white" : "text-ink-soft hover:bg-jade-50")}><LayoutGrid className="size-4" /></button>
            <button type="button" aria-pressed={view === "table"} aria-label="แบบตาราง" onClick={() => setView("table")} className={clsx("rounded-md p-1.5", view === "table" ? "bg-jade-600 text-white" : "text-ink-soft hover:bg-jade-50")}><List className="size-4" /></button>
          </div>
        </div>
        {!rows ? (
          <div className="py-16"><Spinner className="mx-auto" /></div>
        ) : shown.length === 0 ? (
          <Empty icon={<Users className="size-8" />} title="ไม่พบผู้ติดต่อ" description="ลองค้นหาด้วยชื่อเล่น หรือล้างตัวกรองหน่วยงาน" />
        ) : view === "cards" ? (
          <ul className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {shown.slice(0, limit).map((r) => (
              <li key={r.id} className="flex gap-3 rounded-[var(--radius-panel)] border border-line-soft p-3">
                <Avatar src={r.photo_url} name={`${r.first_name} ${r.last_name}`} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">
                    {r.first_name} {r.last_name}
                  </div>
                  <div className="truncate text-sm text-ink-soft">{r.nickname ? `“${r.nickname}” · ` : ""}{r.position_name ?? "-"}</div>
                  <div className="truncate text-xs text-ink-mute">{[r.org_unit_name, r.branch_name].filter(Boolean).join(" · ")}</div>
                  <div className="mt-2 flex flex-col gap-0.5 text-sm">
                    {r.phone ? <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-jade-800 hover:underline"><Phone className="size-3.5" /><span className="num">{r.phone}</span></a> : null}
                    {r.email ? <a href={`mailto:${r.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-jade-800 hover:underline"><Mail className="size-3.5 shrink-0" /><span className="truncate">{r.email}</span></a> : null}
                    {!r.phone && !r.email && <span className="text-xs text-ink-mute">ไม่มีข้อมูลติดต่อ</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">ชื่อ</th>
                  <th className="px-3 py-2 font-medium">ชื่อเล่น</th>
                  <th className="px-3 py-2 font-medium">ตำแหน่ง</th>
                  <th className="px-3 py-2 font-medium">หน่วยงาน</th>
                  <th className="px-3 py-2 font-medium">โทรศัพท์</th>
                  <th className="px-3 py-2 font-medium">อีเมล</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((r) => (
                  <tr key={r.id} className="border-b border-line-soft last:border-0">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 whitespace-nowrap"><Avatar src={r.photo_url} name={`${r.first_name} ${r.last_name}`} size={28} />{r.first_name} {r.last_name}</div>
                    </td>
                    <td className="px-3 py-2">{r.nickname ?? "-"}</td>
                    <td className="px-3 py-2">{r.position_name ?? "-"}</td>
                    <td className="px-3 py-2">{r.org_unit_name ?? "-"}</td>
                    <td className="num whitespace-nowrap px-3 py-2">{r.phone ? <a className="text-jade-800 hover:underline" href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>{r.phone}</a> : "-"}</td>
                    <td className="px-3 py-2">{r.email ? <a className="text-jade-800 hover:underline" href={`mailto:${r.email}`}>{r.email}</a> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && shown.length > limit && (
          <div className="border-t border-line-soft p-3 text-center">
            <button type="button" className="text-sm font-medium text-jade-700 hover:underline" onClick={() => setLimit((l) => l + 60)}>
              แสดงเพิ่ม ({(shown.length - limit).toLocaleString()} คน)
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}

function uniq(rows: Row[] | null, idKey: "org_unit_id" | "branch_id", nameKey: "org_unit_name" | "branch_name"): [string, string][] {
  const m = new Map<string, string>();
  for (const r of rows ?? []) if (r[idKey] != null && r[nameKey]) m.set(String(r[idKey]), r[nameKey]!);
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "th"));
}
