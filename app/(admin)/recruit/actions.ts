"use server";

import { revalidatePath } from "next/cache";
import { requirePerm, safeAction } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX = 5 * 1024 * 1024;
const RESUME_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

/** Upload a resume for a walk-in / manually added applicant (bucket "resumes" is service-role only) */
export async function uploadResumeAction(fd: FormData) {
  return safeAction(async () => {
    await requirePerm("recruit", "create");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("ไม่พบไฟล์");
    if (file.size > MAX) throw new Error("ไฟล์ใหญ่เกิน 5 MB");
    if (!RESUME_TYPES.includes(file.type) && !/\.(pdf|docx?)$/i.test(file.name)) throw new Error("รองรับเฉพาะไฟล์ PDF หรือ Word (.doc, .docx)");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const path = `hr/${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabaseAdmin().storage.from("resumes").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream" });
    if (error) throw error;
    return `resumes/${path}`;
  });
}

export async function revalidateRecruit() {
  revalidatePath("/recruit/applicants");
}
