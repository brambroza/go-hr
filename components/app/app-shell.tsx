"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell, Clock, FileBarChart, FileCheck2, GraduationCap, LayoutDashboard, LogOut, Megaphone, Menu, Network, Search, Settings,
  Smartphone, Target, UserPlus, Users, Wallet, X, ChevronDown,
} from "lucide-react";
import { clsx } from "clsx";
import { NAV, type NavItem } from "@/lib/nav";
import { can, type Me } from "@/lib/permissions";
import { MeProvider } from "./me-context";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Toaster } from "@/components/ui";
import { thDateTime } from "@/lib/format";

const ICONS: Record<string, typeof Bell> = { LayoutDashboard, Network, Users, Clock, FileCheck2, Wallet, FileBarChart, UserPlus, GraduationCap, Target, Megaphone, Settings };

function visible(me: Me, item: NavItem) {
  if (item.everyone) return true;
  if (item.supervisor && me.isSupervisor) return true;
  if (item.perm) return can(me, item.perm[0], item.perm[1] ?? "view");
  return false;
}

export function AppShell({ me, company, children }: { me: Me; company: { name: string; logo_url?: string | null }; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => visible(me, i)) })).filter((g) => g.items.length), [me]);
  const activeHref = useMemo(() => {
    let best = "";
    for (const g of groups) for (const i of g.items) if ((pathname === i.href || pathname.startsWith(i.href + "/")) && i.href.length > best.length) best = i.href;
    return best;
  }, [groups, pathname]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isOpen = (key: string) => expanded[key] ?? groups.find((g) => g.key === key)?.items.some((i) => i.href === activeHref) ?? false;

  useEffect(() => setOpen(false), [pathname]);

  const sidebar = (
    <nav className="flex h-full flex-col bg-jade-950 text-jade-100">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        {company.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logo_url} alt="" className="size-9 rounded-md bg-white object-contain p-0.5" />
        ) : (
          <div className="grid size-9 place-items-center rounded-md bg-jade-500 text-lg font-bold text-white">HR</div>
        )}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-white">{company.name}</div>
          <div className="text-xs text-jade-300">GO HR</div>
        </div>
      </div>
      <div className="thin-scroll flex-1 overflow-y-auto px-3 pb-6">
        {groups.map((g) => {
          const Icon = ICONS[g.icon] ?? LayoutDashboard;
          const opened = isOpen(g.key);
          return (
            <div key={g.key} className="mt-1">
              <button
                type="button"
                onClick={() => setExpanded((x) => ({ ...x, [g.key]: !opened }))}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[15px] text-jade-100 hover:bg-white/5"
                aria-expanded={opened}
              >
                <Icon className="size-[18px] text-jade-300" />
                <span className="flex-1 text-left">{g.label}</span>
                <ChevronDown className={clsx("size-4 text-jade-400 transition-transform", opened && "rotate-180")} />
              </button>
              {opened && (
                <ul className="mb-1 ml-[18px] border-l border-white/10 pl-2">
                  {g.items.map((i) => (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        className={clsx(
                          "block rounded-md px-2.5 py-1.5 text-sm",
                          i.href === activeHref ? "bg-jade-600 font-medium text-white" : "text-jade-200 hover:bg-white/5 hover:text-white",
                        )}
                      >
                        {i.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {me.employeeId && (
        <Link href="/m" className="mx-3 mb-4 flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-jade-100 hover:bg-white/5">
          <Smartphone className="size-4" /> หน้าพนักงาน (ลงเวลา / ยื่นเอกสาร)
        </Link>
      )}
    </nav>
  );

  return (
    <MeProvider me={me}>
      <div className="min-h-dvh lg:pl-[264px]">
        <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[264px] lg:block">{sidebar}</aside>
        {open && (
          <div className="no-print fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-jade-950/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[280px] shadow-xl">{sidebar}</div>
          </div>
        )}
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white/90 px-3 backdrop-blur sm:px-5">
          <button className="rounded-md p-2 text-ink-soft hover:bg-paper lg:hidden" onClick={() => setOpen(true)} aria-label="เมนู">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <EmployeeSearch />
          <div className="ml-auto flex items-center gap-1">
            <Notifications />
            <UserMenu me={me} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-3 py-5 sm:px-6">{children}</main>
      </div>
      <Toaster />
    </MeProvider>
  );
}

function EmployeeSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ id: number; code: string; first_name: string; last_name: string; nickname: string | null; position_name: string | null }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setRows([]);
      return;
    }
    const t = setTimeout(async () => {
      const s = q.trim().replace(/[%,()]/g, "");
      const { data } = await supabaseBrowser()
        .from("v_directory")
        .select("id, code, first_name, last_name, nickname, position_name")
        .or(`code.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,nickname.ilike.%${s}%`)
        .limit(8);
      setRows(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหาพนักงาน (ชื่อ / ชื่อเล่น / รหัส)"
        className="h-9 w-full rounded-md border border-line bg-paper pl-8 pr-3 text-sm focus:border-jade-500 focus:bg-white focus:outline-none"
      />
      {rows.length > 0 && (
        <ul className="absolute left-0 right-0 top-10 z-50 overflow-hidden rounded-md border border-line bg-white shadow-lg">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-jade-50"
                onClick={() => {
                  setQ("");
                  router.push(`/employees/${r.id}`);
                }}
              >
                <span>
                  {r.first_name} {r.last_name} {r.nickname && <span className="text-ink-mute">({r.nickname})</span>}
                </span>
                <span className="text-xs text-ink-mute">{r.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Noti = { id: number; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export function Notifications() {
  const [items, setItems] = useState<Noti[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const load = async () => {
    const { data } = await supabaseBrowser().from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(20);
    setItems((data as Noti[]) ?? []);
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  const unread = items.filter((i) => !i.read_at).length;
  return (
    <div className="relative">
      <button className="relative rounded-md p-2 text-ink-soft hover:bg-paper" onClick={() => setOpen((v) => !v)} aria-label="การแจ้งเตือน">
        <Bell className="size-5" />
        {unread > 0 && <span className="num absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-rust px-1 text-[10px] font-semibold text-white">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-md border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
              <span className="text-sm font-semibold">การแจ้งเตือน</span>
              {unread > 0 && (
                <button
                  className="text-xs text-jade-700 hover:underline"
                  onClick={async () => {
                    await supabaseBrowser().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
                    load();
                  }}
                >
                  อ่านทั้งหมด
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-mute">ยังไม่มีการแจ้งเตือน</li>}
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    className={clsx("block w-full px-3 py-2.5 text-left hover:bg-paper", !n.read_at && "bg-jade-50/60")}
                    onClick={async () => {
                      setOpen(false);
                      if (!n.read_at) await supabaseBrowser().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
                      if (n.link) router.push(n.link);
                      load();
                    }}
                  >
                    <div className="text-sm font-medium text-ink">{n.title}</div>
                    {n.body && <div className="text-xs text-ink-soft">{n.body}</div>}
                    <div className="mt-0.5 text-[11px] text-ink-mute">{thDateTime(n.created_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const initials = (me.employee?.nickname || me.displayName).slice(0, 2);
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-paper" onClick={() => setOpen((v) => !v)}>
        {me.employee?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.employee.photo_url} alt="" className="size-8 rounded-full object-cover" />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-jade-100 text-sm font-semibold text-jade-800">{initials}</span>
        )}
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-sm font-medium leading-tight">{me.displayName}</span>
          <span className="block text-xs leading-tight text-ink-mute">{me.isAdmin ? "ผู้ดูแลระบบ" : me.roleName ?? "พนักงาน"}</span>
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-md border border-line bg-white py-1 shadow-xl">
            {me.employeeId && (
              <Link href="/m/profile" className="block px-3 py-2 text-sm hover:bg-paper" onClick={() => setOpen(false)}>
                ข้อมูลของฉัน
              </Link>
            )}
            <Link href="/account/password" className="block px-3 py-2 text-sm hover:bg-paper" onClick={() => setOpen(false)}>
              เปลี่ยนรหัสผ่าน
            </Link>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rust hover:bg-rust-soft"
              onClick={async () => {
                await supabaseBrowser().auth.signOut();
                router.replace("/login");
                router.refresh();
              }}
            >
              <LogOut className="size-4" /> ออกจากระบบ
            </button>
          </div>
        </>
      )}
    </div>
  );
}
