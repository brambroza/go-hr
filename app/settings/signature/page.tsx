import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getMe } from "@/lib/auth";
import { isBackOffice } from "@/lib/permissions";
import { supabaseServer } from "@/lib/supabase/server";
import { SignatureSettings } from "@/components/requests/signature-settings";

export const metadata = { title: "ตั้งค่าลายเซ็น" };

/** Standalone (outside the back-office layout) so every signed-in user — including plain employees — can use it. */
export default async function SignaturePage({ searchParams }: PageProps<"/settings/signature">) {
  const me = await getMe();
  if (!me) redirect("/login?next=/settings/signature");
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data } = await sb.from("profiles").select("signature_url").eq("id", me.userId).maybeSingle();
  const back = typeof sp.back === "string" && sp.back.startsWith("/") ? sp.back : isBackOffice(me) || me.isSupervisor ? "/requests/templates" : "/m";
  return (
    <main className="min-h-dvh bg-paper px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <Link href={back} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700">
          <ArrowLeft className="size-4" /> กลับ
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ตั้งค่าลายเซ็น</h1>
        <p className="mt-1 mb-5 text-[15px] text-ink-soft">
          ลายเซ็นของ <b>{me.displayName}</b> ใช้ในหนังสือรับรองและเอกสารที่คุณเป็นผู้ลงนาม วาดด้วยเมาส์หรือนิ้ว หรืออัปโหลดรูปลายเซ็น (แนะนำ PNG พื้นหลังโปร่งใส)
        </p>
        <SignatureSettings current={data?.signature_url ?? null} userId={me.userId} />
      </div>
    </main>
  );
}
