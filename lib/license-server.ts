import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyLicense, type LicenseStatus } from "@/lib/license";

export type StoredLicense = LicenseStatus & { license?: string; source?: "settings" | "env" };

/** Verify and store a license in settings 'license_status' (service role). Callers check permissions first. */
export async function installLicense(license: string, source: "settings" | "env" = "settings"): Promise<StoredLicense> {
  const status = verifyLicense(license);
  if (!status.valid) throw new Error(status.error ?? "License ไม่ถูกต้อง");
  const value: StoredLicense = { ...status, license: license.trim().replace(/\s+/g, ""), source };
  const { error } = await supabaseAdmin().from("settings").upsert({ key: "license_status", value, is_public: false, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return value;
}

/** Remove the installed license (falls back to the trial limit). */
export async function removeLicense() {
  const { error } = await supabaseAdmin().from("settings").delete().eq("key", "license_status");
  if (error) throw new Error(error.message);
}

/**
 * Current license. Re-verifies the stored string (so a hand-edited DB row can't fake it) and
 * falls back to env GOHR_LICENSE (installed automatically on first read).
 */
export async function getLicense(): Promise<StoredLicense | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("settings").select("value").eq("key", "license_status").maybeSingle();
  const stored = (data?.value ?? null) as StoredLicense | null;
  if (stored?.license) {
    const re = verifyLicense(stored.license);
    if (!re.valid && stored.valid) {
      await sb.from("settings").update({ value: { ...stored, valid: false, error: re.error } }).eq("key", "license_status");
      return { ...stored, ...re, license: stored.license };
    }
    return { ...stored, support_expired: re.support_expired };
  }
  const env = process.env.GOHR_LICENSE;
  if (env && verifyLicense(env).valid) return installLicense(env, "env");
  return stored;
}
