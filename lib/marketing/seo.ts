// SEO helpers for the public marketing landing page — pure functions, unit tested in tests/marketing-seo.test.ts.
//
// The landing page at "/" only exists on GoAlong's own demo / sales server (TRIAL_SIGNUP=1, the same switch as
// /trial). A customer's GO HR install is a private HR system: "/" keeps redirecting to login and robots.txt
// keeps crawlers out of everything except the public job board at /careers.

/** Paths a crawler may index on the marketing server */
export const MARKETING_PUBLIC_PATHS = ["/", "/trial"] as const;

/** App areas that must never be crawled (all of them need a login anyway — this only saves crawl budget) */
export const PRIVATE_PATH_PREFIXES = ["/api/", "/login", "/m/", "/kiosk", "/account/", "/settings/", "/forgot-password", "/reset-password"] as const;

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * Normalise the public base URL (APP_URL) for canonical links, the sitemap and Open Graph.
 * Returns null when the value is missing or is not an absolute http(s) URL, so callers can skip absolute links
 * instead of publishing "http://localhost:3000" to search engines.
 */
export function siteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (!["http:", "https:"].includes(u.protocol) || !u.host) return null;
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(u.hostname)) return null;
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** One robots.txt rule group — same shape as Next's MetadataRoute.Robots rules */
export interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
}

/**
 * robots.txt content.
 * - marketing server: index the landing + trial pages, keep the app itself out
 * - customer install: only the job board (/careers) is public; everything else is the private HR system
 */
export function robotsFor(opts: { marketing: boolean; base: string | null }): { rules: RobotsRule[]; sitemap?: string } {
  if (opts.marketing) {
    return {
      rules: [{ userAgent: "*", allow: [...MARKETING_PUBLIC_PATHS, "/careers"], disallow: [...PRIVATE_PATH_PREFIXES] }],
      ...(opts.base ? { sitemap: `${opts.base}/sitemap.xml` } : {}),
    };
  }
  return {
    rules: [{ userAgent: "*", allow: ["/careers"], disallow: ["/"] }],
    ...(opts.base ? { sitemap: `${opts.base}/sitemap.xml` } : {}),
  };
}

/** One sitemap entry — same shape as Next's MetadataRoute.Sitemap items */
export interface SitemapEntry {
  url: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
}

/** sitemap.xml entries; empty when APP_URL is not a public absolute URL (a sitemap must use absolute URLs) */
export function sitemapFor(opts: { marketing: boolean; base: string | null }): SitemapEntry[] {
  if (!opts.base) return [];
  if (opts.marketing) {
    return [
      { url: `${opts.base}/`, changeFrequency: "weekly", priority: 1 },
      { url: `${opts.base}/trial`, changeFrequency: "monthly", priority: 0.8 },
    ];
  }
  return [{ url: `${opts.base}/careers`, changeFrequency: "weekly", priority: 0.8 }];
}

/**
 * schema.org structured data for the landing page: the product (SoftwareApplication), the vendor (Organization)
 * and the FAQ. No price or rating is published — prices are quoted per company and there are no public reviews,
 * and Google penalises made-up ratings.
 */
export function landingJsonLd(opts: { base: string | null; description: string; faq: FaqItem[] }): Record<string, unknown> {
  const url = opts.base ? `${opts.base}/` : undefined;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": url ? `${url}#org` : undefined,
        name: "GoAlong",
        url,
      },
      {
        "@type": "SoftwareApplication",
        name: "GO HR",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "HR, Time Attendance, Payroll",
        operatingSystem: "Web, iOS, Android (PWA)",
        inLanguage: "th",
        description: opts.description,
        url,
        image: opts.base ? `${opts.base}/landing/og-go-hr.png` : undefined,
        publisher: url ? { "@id": `${url}#org` } : { "@type": "Organization", name: "GoAlong" },
        featureList: [
          "ลงเวลาผ่านมือถือ GPS / QR / สแกนใบหน้า / Wi-Fi / เครื่องสแกนนิ้ว",
          "ลา โอที และเอกสาร อนุมัติหลายขั้นบนมือถือ",
          "คำนวณเงินเดือน ภาษี ประกันสังคม กองทุนสำรองเลี้ยงชีพ",
          "ภ.ง.ด.1 ภ.ง.ด.1ก สปส.1-10 50 ทวิ ไฟล์โอนเงินธนาคาร",
          "PDPA ปิดบังข้อมูลอ่อนไหวและบันทึกผู้ดู",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: opts.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

/**
 * Serialise JSON-LD for a <script type="application/ld+json"> body. `<` is escaped so a "</script>" inside any
 * string cannot close the tag; undefined fields are dropped by JSON.stringify.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}
