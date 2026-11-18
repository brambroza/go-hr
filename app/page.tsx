import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { isBackOffice } from "@/lib/permissions";
import { isTruthyEnv } from "@/lib/security-headers";
import { jsonLdScript, landingJsonLd, siteUrl } from "@/lib/marketing/seo";
import { FAQ, LANDING_DESCRIPTION, LANDING_KEYWORDS, LANDING_TITLE } from "@/lib/marketing/landing-content";
import { LandingPage } from "@/components/marketing/landing-page";

/** The public landing page lives only on GoAlong's demo / sales server — same switch as /trial */
const marketingOn = () => isTruthyEnv(process.env.TRIAL_SIGNUP);

/** SEO metadata for the landing page; a customer install keeps the plain app title */
export async function generateMetadata(): Promise<Metadata> {
  if (!marketingOn()) return {};
  const base = siteUrl(process.env.APP_URL);
  const ogImage = { url: "/landing/og-go-hr.png", width: 1440, height: 756, alt: "แดชบอร์ด GO HR โปรแกรม HR ลงเวลา และเงินเดือน" };
  return {
    // absolute: skip the layout's "%s · GO HR" template — the brand is already in the title
    title: { absolute: LANDING_TITLE },
    description: LANDING_DESCRIPTION,
    keywords: LANDING_KEYWORDS,
    ...(base ? { metadataBase: new URL(base) } : {}),
    alternates: { canonical: "/" },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    openGraph: {
      type: "website",
      locale: "th_TH",
      siteName: "GO HR",
      url: "/",
      title: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      images: [ogImage],
    },
    twitter: { card: "summary_large_image", title: LANDING_TITLE, description: LANDING_DESCRIPTION, images: [ogImage.url] },
  };
}

/**
 * "/" — signed-in users go to their home screen. Visitors see the marketing landing page on GoAlong's demo
 * server (TRIAL_SIGNUP=1); on a customer's install they are sent to the login page as before.
 */
export default async function Home() {
  const me = await getMe();
  if (me) redirect(isBackOffice(me) || me.isSupervisor ? "/dashboard" : "/m");
  if (!marketingOn()) redirect("/login");

  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const jsonLd = landingJsonLd({ base: siteUrl(process.env.APP_URL), description: LANDING_DESCRIPTION, faq: FAQ });
  return (
    <>
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <LandingPage contactLine={process.env.TRIAL_CONTACT_LINE?.trim() || undefined} />
    </>
  );
}
