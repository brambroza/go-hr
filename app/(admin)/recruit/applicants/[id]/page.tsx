import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApplicantDetail } from "@/components/recruit/applicant-detail";

export const metadata = { title: "ผู้สมัคร" };

export default async function ApplicantPage({ params }: PageProps<"/recruit/applicants/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return (
    <Suspense>
      <ApplicantDetail id={Number(id)} />
    </Suspense>
  );
}
