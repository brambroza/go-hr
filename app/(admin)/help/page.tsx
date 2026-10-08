import { requireMe } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_SSO_CONFIG, DEFAULT_TAX_CONFIG, ssoLimits, type SsoConfig, type TaxConfig } from "@/lib/payroll/tax";
import { CHANGELOG } from "@/lib/changelog";
import { HelpCenter } from "@/components/help/help-center";
import pkg from "@/package.json";

export const metadata = { title: "ช่วยเหลือและการดูแลระบบ" };

export default async function HelpPage() {
  await requireMe();
  const [sso, tax, lic] = await Promise.all([
    getSetting<SsoConfig>("sso_config", DEFAULT_SSO_CONFIG),
    getSetting<TaxConfig>("tax_config", DEFAULT_TAX_CONFIG),
    supabaseAdmin().from("settings").select("value").eq("key", "license_status").maybeSingle(),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const lim = ssoLimits(today, sso);
  const upcoming = [...sso.ceilings].filter((c) => c.from > today).sort((a, b) => a.from.localeCompare(b.from));
  const license = (lic.data?.value ?? null) as { license_id?: string; licensee?: string } | null;
  return (
    <HelpCenter
      version={pkg.version}
      license={license?.license_id ? { id: license.license_id, licensee: license.licensee ?? "" } : null}
      rates={{
        sso: { employee: sso.rate_employee, employer: sso.rate_employer, floor: lim.floor, ceiling: lim.ceiling, max: lim.maxEmployee, upcoming },
        tax: { brackets: tax.brackets, expense: tax.expense, personal: tax.personal_allowance },
      }}
      changelog={CHANGELOG}
    />
  );
}
