// Copies the face-api models used by the check-in / enrollment screens into public/models/face so they are
// served by the app itself (works offline / LAN-only — no CDN at runtime). Runs on `npm install` (postinstall)
// and therefore inside the Docker build too.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "@vladmandic", "face-api", "model");
const dest = path.join(root, "public", "models", "face");

// tiny face detector (~190 KB) + 68-point landmarks tiny (~75 KB) + face recognition / 128-d descriptor (~6.2 MB)
export const FACE_MODELS = ["tiny_face_detector_model", "face_landmark_68_tiny_model", "face_recognition_model"];

if (!fs.existsSync(src)) {
  console.warn("[copy-face-models] @vladmandic/face-api is not installed — skipped");
  process.exit(0);
}
fs.mkdirSync(dest, { recursive: true });
let copied = 0;
for (const m of FACE_MODELS) {
  for (const f of [`${m}-weights_manifest.json`, `${m}.bin`]) {
    const from = path.join(src, f);
    const to = path.join(dest, f);
    if (!fs.existsSync(from)) {
      console.error(`[copy-face-models] missing ${f} in @vladmandic/face-api`);
      process.exit(1);
    }
    const a = fs.statSync(from);
    const b = fs.existsSync(to) ? fs.statSync(to) : null;
    if (!b || b.size !== a.size) {
      fs.copyFileSync(from, to);
      copied++;
    }
  }
}
console.log(`[copy-face-models] ${copied ? `copied ${copied} file(s)` : "up to date"} -> public/models/face`);
