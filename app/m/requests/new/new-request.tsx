"use client";
import { useRouter } from "next/navigation";
import { RequestForm } from "@/components/requests/request-form";

export function NewRequest({ type }: { type?: string }) {
  const router = useRouter();
  return <RequestForm key={type ?? "pick"} defaultType={type} onSubmitted={(r) => router.replace(`/m/requests/${r.id}`)} />;
}
