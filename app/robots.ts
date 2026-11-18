import type { MetadataRoute } from "next";
import { isTruthyEnv } from "@/lib/security-headers";
import { robotsFor, siteUrl } from "@/lib/marketing/seo";

// read env per request: the same Docker image runs as GoAlong's marketing server and as customer installs
export const dynamic = "force-dynamic";

/** robots.txt — marketing server indexes the landing page; a customer install only exposes /careers */
export default function robots(): MetadataRoute.Robots {
  return robotsFor({ marketing: isTruthyEnv(process.env.TRIAL_SIGNUP), base: siteUrl(process.env.APP_URL) });
}
