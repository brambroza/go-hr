import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans-thai/thai.css";
import "@fontsource/ibm-plex-sans-thai/latin.css";
import "@fontsource/ibm-plex-sans-thai/thai-500.css";
import "@fontsource/ibm-plex-sans-thai/latin-500.css";
import "@fontsource/ibm-plex-sans-thai/thai-600.css";
import "@fontsource/ibm-plex-sans-thai/latin-600.css";
import "./globals.css";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/public-env";
import { Toaster } from "@/components/ui";

// runtime config (Supabase URL / anon key) is read per request — see lib/public-env.ts
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "GO HR", template: "%s · GO HR" },
  description: "ระบบบริหารงานบุคคล ลงเวลา และเงินเดือน",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GO HR", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP nonce set by proxy.ts — the only inline script we render ourselves must carry it
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="th" className="h-full antialiased">
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `window.__GOHR_ENV=${JSON.stringify(publicEnv()).replace(/</g, "\\u003c")}` }} />
      </head>
      <body className="min-h-full">
        {children}
        {/* one toast stack for every page: admin console, /m, /careers, /kiosk, /account, print pages */}
        <Toaster />
      </body>
    </html>
  );
}
