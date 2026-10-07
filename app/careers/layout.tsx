import Link from "next/link";
import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { getPublicCompany } from "@/components/careers/data";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPublicCompany();
  return { title: { default: `ร่วมงานกับ ${c.name}`, template: `%s · ${c.name}` }, description: `ตำแหน่งงานที่เปิดรับสมัครของ ${c.name} สมัครงานออนไลน์ได้ทันที` };
}

export default async function CareersLayout({ children }: LayoutProps<"/careers">) {
  const c = await getPublicCompany();
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Link href="/careers" className="flex min-w-0 items-center gap-2.5">
            {c.logo_url ? (
               
              <img src={c.logo_url} alt="" className="size-9 rounded-md object-contain" />
            ) : (
              <span className="grid size-9 place-items-center rounded-md bg-jade-700 text-white">
                <Briefcase className="size-5" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-semibold leading-tight text-ink">{c.name}</span>
              <span className="block truncate text-xs text-ink-mute">ร่วมงานกับเรา</span>
            </span>
          </Link>
          <Link href="/careers" className="ml-auto shrink-0 text-sm font-medium text-jade-700 hover:underline">
            ตำแหน่งงานทั้งหมด
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 text-sm text-ink-soft">
          <span className="font-medium text-ink">{c.name}</span>
          {c.address && <span>{c.address}</span>}
          <span>
            {[c.phone && `โทร ${c.phone}`, c.email && `อีเมล ${c.email}`].filter(Boolean).join(" · ")}
          </span>
          <span className="mt-2 text-xs text-ink-mute">ข้อมูลในใบสมัครใช้เพื่อการพิจารณารับเข้าทำงานเท่านั้น และได้รับการคุ้มครองตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562</span>
        </div>
      </footer>
    </div>
  );
}
