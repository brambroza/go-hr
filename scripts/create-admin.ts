/**
 * Create (or reset) the first administrator account.
 *   npx tsx scripts/create-admin.ts admin@company.com 'StrongP@ss1' "ผู้ดูแลระบบ"
 * Requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment / .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

loadEnv();
const [email, password, name = "ผู้ดูแลระบบ", username = "admin"] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: tsx scripts/create-admin.ts <email> <password> [display name] [username]");
  process.exit(1);
}
const sb = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  let user = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) {
    const { error } = await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user!;
  }
  const { error } = await sb.from("profiles").upsert({ id: user.id, email, username, display_name: name, is_admin: true, is_active: true });
  if (error) throw error;
  console.log(`✓ admin ready: ${email} (username: ${username})`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
