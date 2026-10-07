"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, PenLine, Printer } from "lucide-react";
import { signedUrl } from "@/lib/storage";

/** toolbar of the printable document page (hidden when printing) */
export function DocumentToolbar({ title, lang, signer, signers, backHref }: { title: string; lang: "th" | "en"; signer: string | null; signers: { id: string; label: string }[]; backHref: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set(k, v);
    router.replace(`${pathname}?${p}`, { scroll: false });
  };
  return (
    <div className="no-print sticky top-14 z-10 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700">
          <ArrowLeft className="size-4" /> กลับ
        </Link>
        <h1 className="truncate text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-[var(--radius-ctl)] border border-line text-sm" role="group" aria-label="ภาษา">
          {(["th", "en"] as const).map((l) => (
            <button key={l} type="button" onClick={() => set("lang", l)} className={l === lang ? "bg-jade-600 px-3 py-1.5 text-white" : "bg-white px-3 py-1.5 hover:bg-jade-50"}>
              {l === "th" ? "ภาษาไทย" : "English"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-ink-soft">
          ผู้ลงนาม
          <select value={signer ?? ""} onChange={(e) => set("signer", e.target.value)} className="h-9 max-w-56 rounded-[var(--radius-ctl)] border border-line bg-white px-2 text-sm text-ink">
            {signers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <Link href="/settings/signature" className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-sm hover:bg-jade-50">
          <PenLine className="size-4" /> ตั้งค่าลายเซ็นของฉัน
        </Link>
        <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-ctl)] bg-jade-600 px-3 text-sm font-medium text-white hover:bg-jade-700">
          <Printer className="size-4" /> พิมพ์ / บันทึก PDF
        </button>
      </div>
    </div>
  );
}

/** signature image from a storage reference ("bucket/path" or URL) */
export function SignatureImage({ src, className }: { src: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (src) signedUrl(src).then((u) => alive && setUrl(u)).catch(() => null);
    return () => {
      alive = false;
    };
  }, [src]);
  if (!src || !url) return <div className={className} />;
   
  return <img src={url} alt="ลายเซ็น" className={className} />;
}
