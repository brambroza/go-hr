import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { getCompany } from "@/lib/settings";
import { supabaseServer } from "@/lib/supabase/server";
import { normalizePolicy } from "@/lib/employees/password";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "เปลี่ยนรหัสผ่าน" };

export default async function ChangePasswordPage({ searchParams }: PageProps<"/account/password">) {
  const me = await getMe();
  if (!me) redirect("/login?next=/account/password");
  const sp = await searchParams;
  const first = sp.first === "1" || me.mustChangePassword;
  const sb = await supabaseServer();
  const [{ data }, company] = await Promise.all([sb.from("settings").select("value").eq("key", "password_policy").maybeSingle(), getCompany()]);
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center gap-2.5">
          {company.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt="" className="size-10 rounded-md bg-white object-contain p-0.5" />
          ) : (
            <div className="grid size-10 place-items-center rounded-md bg-jade-600 text-lg font-bold text-white">HR</div>
          )}
          <span className="font-semibold">{company.name}</span>
        </div>
        <ChangePasswordForm first={first} policy={normalizePolicy(data?.value)} name={me.displayName} />
      </div>
    </main>
  );
}
