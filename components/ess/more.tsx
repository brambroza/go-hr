"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, CheckCheck, ClipboardCheck, KeyRound, ListTodo, LogOut, Monitor, Newspaper, Plane, ScrollText, TrendingUp, UserRound, Users } from "lucide-react";
import { useMe } from "@/components/app/me-context";
import { isBackOffice } from "@/lib/permissions";
import { supabaseBrowser } from "@/lib/supabase/client";

type Item = { href: string; label: string; icon: typeof Plane; badge?: number };

export function MoreMenu() {
  const me = useMe();
  const router = useRouter();
  const [toApprove, setToApprove] = useState(0);
  useEffect(() => {
    supabaseBrowser()
      .rpc("my_pending_counts")
      .then(({ data }: { data: unknown }) => setToApprove(Number((data as { to_approve?: number } | null)?.to_approve ?? 0)));
  }, []);

  const showApprovals = me.isSupervisor || toApprove > 0;
  const groups: { title: string; items: Item[] }[] = [
    {
      title: "เวลาทำงาน",
      items: [
        { href: "/m/leave", label: "วันลา", icon: Plane },
        { href: "/m/calendar", label: "ปฏิทิน", icon: CalendarDays },
      ],
    },
    ...(me.isSupervisor || showApprovals
      ? [
          {
            title: "สำหรับหัวหน้างาน",
            items: [
              ...(me.isSupervisor ? [{ href: "/m/team", label: "ทีมของฉัน", icon: Users }] : []),
              ...(showApprovals ? [{ href: "/m/approvals", label: "อนุมัติเอกสาร", icon: CheckCheck, badge: toApprove }] : []),
            ],
          },
        ]
      : []),
    {
      title: "บริษัทและการพัฒนา",
      items: [
        { href: "/m/feed", label: "ข่าวสาร", icon: Newspaper },
        { href: "/m/todos", label: "To-do", icon: ListTodo },
        { href: "/m/learning", label: "เรียนออนไลน์", icon: BookOpen },
        { href: "/m/evaluations", label: "แบบประเมิน", icon: ClipboardCheck },
        { href: "/m/policies", label: "นโยบายบริษัท", icon: ScrollText },
        { href: "/m/career", label: "เส้นทางการเติบโต", icon: TrendingUp },
      ],
    },
    {
      title: "บัญชีของฉัน",
      items: [
        { href: "/m/profile", label: "ข้อมูลของฉัน", icon: UserRound },
        { href: "/account/password", label: "เปลี่ยนรหัสผ่าน", icon: KeyRound },
        ...(isBackOffice(me) || me.isSupervisor ? [{ href: "/dashboard", label: "ระบบหลังบ้าน", icon: Monitor }] : []),
      ],
    },
  ];

  return (
    <>
      <Link href="/m/profile" className="mb-4 flex items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-white p-4 active:bg-jade-50">
        {me.employee?.photo_url ? (
           
          <img src={me.employee.photo_url} alt="" className="size-12 rounded-full object-cover" />
        ) : (
          <span className="grid size-12 place-items-center rounded-full bg-jade-100 font-semibold text-jade-800">{(me.employee?.nickname || me.displayName).slice(0, 2)}</span>
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold">{me.displayName}</div>
          <div className="truncate text-sm text-ink-mute">{[me.employee?.code, me.employee?.position_name].filter(Boolean).join(" · ")}</div>
        </div>
      </Link>
      {groups.map((g) => (
        <section key={g.title} className="mb-4">
          <h2 className="mb-2 px-1 text-sm font-medium text-ink-soft">{g.title}</h2>
          <div className="grid grid-cols-3 gap-2">
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className="relative flex h-[88px] flex-col items-center justify-center gap-1.5 rounded-[var(--radius-panel)] border border-line bg-white px-1 text-center text-sm leading-tight text-ink active:bg-jade-50">
                <span className="grid size-9 place-items-center rounded-full bg-jade-50 text-jade-700">
                  <i.icon className="size-5" />
                </span>
                {i.label}
                {!!i.badge && <span className="num absolute right-2 top-2 grid min-w-5 place-items-center rounded-full bg-rust px-1.5 text-xs font-semibold text-white">{i.badge}</span>}
              </Link>
            ))}
          </div>
        </section>
      ))}
      <button
        className="mb-4 flex h-14 w-full items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-line bg-white text-[15px] font-medium text-rust active:bg-rust-soft"
        onClick={async () => {
          await supabaseBrowser().auth.signOut();
          router.replace("/login");
          router.refresh();
        }}
      >
        <LogOut className="size-5" /> ออกจากระบบ
      </button>
    </>
  );
}
