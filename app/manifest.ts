import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/m",
    name: "GO HR",
    short_name: "GO HR",
    description: "ลงเวลา ยื่นใบลา ดูสลิปเงินเดือน — แอปพนักงาน GO HR",
    lang: "th",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f6f4",
    theme_color: "#1b6f53",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "ลงเวลา", short_name: "ลงเวลา", url: "/m/checkin", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "ส่งใบลา", short_name: "ใบลา", url: "/m/requests/new?type=leave", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
