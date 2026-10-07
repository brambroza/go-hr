/**
 * GO HR license tool (run by GO Along only — needs licenses/private.pem, which is gitignored).
 *   npx tsx scripts/license.ts keygen                 → writes licenses/private.pem + public.pem, prints the public key for lib/license.ts
 *   npx tsx scripts/license.ts issue --licensee "บริษัท ... จำกัด" --max 200 [--tax-id 0105...] [--support-until 2027-12-31] [--modules professional]
 *   npx tsx scripts/license.ts verify <license>
 *   npx tsx scripts/license.ts install <license|file>   → verifies and stores it in settings 'license_status' (uses .env.local service role)
 */
import fs from "node:fs";
import path from "node:path";
import { createPrivateKey, generateKeyPairSync, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { signLicense, verifyLicense, type LicensePayload } from "../lib/license";
import { loadEnv } from "./env";

const DIR = path.join(process.cwd(), "licenses");
const PRIV = path.join(DIR, "private.pem");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];
if (cmd === "keygen") {
  if (fs.existsSync(PRIV) && !process.argv.includes("--force")) {
    console.error(`มี ${PRIV} อยู่แล้ว — ใช้ --force ถ้าต้องการสร้างใหม่ (License เดิมทั้งหมดจะใช้ไม่ได้)`);
    process.exit(1);
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(PRIV, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(path.join(DIR, "public.pem"), publicKey.export({ type: "spki", format: "pem" }));
  const der = (publicKey.export({ type: "spki", format: "der" }) as Buffer).toString("base64");
  console.log("เขียน private key ที่", PRIV, "(เก็บรักษาให้ดี ห้าม commit)");
  console.log("วาง public key นี้ใน lib/license.ts → LICENSE_PUBLIC_KEY:");
  console.log(der);
} else if (cmd === "issue") {
  const licensee = arg("licensee");
  const max = Number(arg("max"));
  if (!licensee || !Number.isInteger(max) || max < 1) {
    console.error('usage: issue --licensee "ชื่อบริษัท" --max 200 [--tax-id ...] [--support-until YYYY-MM-DD]');
    process.exit(1);
  }
  const support = arg("support-until");
  if (support && !/^\d{4}-\d{2}-\d{2}$/.test(support)) {
    console.error("--support-until ต้องเป็น YYYY-MM-DD");
    process.exit(1);
  }
  const payload: LicensePayload = {
    license_id: randomUUID(),
    licensee,
    ...(arg("tax-id") ? { tax_id: arg("tax-id") } : {}),
    max_employees: max,
    modules: (arg("modules") ?? "professional").split(","),
    issued_at: new Date().toISOString().slice(0, 10),
    ...(support ? { support_until: support } : {}),
  };
  const lic = signLicense(payload, createPrivateKey(fs.readFileSync(PRIV)));
  const check = verifyLicense(lic);
  if (!check.valid) console.error("คำเตือน: public key ใน lib/license.ts ไม่ตรงกับ private key —", check.error);
  console.log(lic);
} else if (cmd === "verify") {
  console.log(JSON.stringify(verifyLicense(process.argv[3]), null, 2));
} else if (cmd === "install") {
  loadEnv();
  const src = process.argv[3] ?? "";
  const lic = (fs.existsSync(src) ? fs.readFileSync(src, "utf8") : src).trim().replace(/\s+/g, "");
  const st = verifyLicense(lic);
  if (!st.valid) {
    console.error(st.error);
    process.exit(1);
  }
  const sb = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  sb.from("settings")
    .upsert({ key: "license_status", value: { ...st, license: lic, source: "settings" }, is_public: false })
    .then(({ error }) => {
      if (error) {
        console.error(error.message);
        process.exit(1);
      }
      console.log(`ติดตั้ง License แล้ว: ${st.licensee} สูงสุด ${st.max_employees} คน`);
    });
} else {
  console.log("usage: npx tsx scripts/license.ts keygen | issue --licensee \"...\" --max N [--support-until YYYY-MM-DD] | verify <license> | install <license|file>");
}
