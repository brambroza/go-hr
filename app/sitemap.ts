import type { MetadataRoute } from "next";
import { isTruthyEnv } from "@/lib/security-headers";
import { sitemapFor, siteUrl } from "@/lib/marketing/seo";

// read env per request: the same Docker image runs as GoAlong's marketing server and as customer installs
export const dynamic = "force-dynamic";

/** sitemap.xml — landing + trial on the marketing server, the job board on a customer install */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapFor({ marketing: isTruthyEnv(process.env.TRIAL_SIGNUP), base: siteUrl(process.env.APP_URL) });
}
