import { notFound, redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isTruthyEnv } from "@/lib/security-headers";
import { TrialLeads } from "@/components/settings/trial-leads";

export const metadata = { title: "ผู้ขอทดลองใช้" };

/** Trial sign-up leads — only on GoAlong's demo server (TRIAL_SIGNUP=1) */
export default async function TrialLeadsPage() {
  if (!isTruthyEnv(process.env.TRIAL_SIGNUP)) notFound();
  const me = await requireMe();
  if (!can(me, "settings")) redirect("/dashboard");
  return <TrialLeads />;
}
