// Generates PWA PNG icons from app/icon.svg into public/icons (run: node scripts/pwa-icons.mjs)
import sharp from "sharp";
import fs from "node:fs";

const svg = fs.readFileSync(new URL("../app/icon.svg", import.meta.url));
// maskable: full-bleed background, artwork inside the 80% safe zone
const maskable = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#10b981"/>` +
    `<g transform="translate(256 256) scale(0.78) translate(-256 -256)"><circle cx="256" cy="256" r="150" fill="none" stroke="#fff" stroke-width="40"/>` +
    `<path d="M256 166v96l62 40" fill="none" stroke="#d1fae5" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`,
);
fs.mkdirSync(new URL("../public/icons/", import.meta.url), { recursive: true });
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(new URL(`../public/icons/icon-${size}.png`, import.meta.url).pathname);
  await sharp(maskable).resize(size, size).png().toFile(new URL(`../public/icons/maskable-${size}.png`, import.meta.url).pathname);
}
await sharp(svg).resize(180, 180).flatten({ background: "#165a44" }).png().toFile(new URL("../public/icons/apple-touch-icon.png", import.meta.url).pathname);
console.log("icons written to public/icons");
