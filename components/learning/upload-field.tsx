"use client";

import { useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Spinner, toast } from "@/components/ui";
import { uploadFile, type Bucket } from "@/lib/storage";

/** URL text input + "upload file" button (learning materials go to the public bucket so every employee can open them) */
export function UploadUrlField({ value, onChange, accept, bucket = "public", maxMb = 50, placeholder }: { value: string; onChange: (v: string) => void; accept?: string; bucket?: Bucket; maxMb?: number; placeholder?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "https://"}
        className="h-10 w-full min-w-0 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-[15px] focus:border-jade-500 focus:outline-none focus:ring-2 focus:ring-jade-100"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} className="rounded p-2 text-ink-mute hover:text-rust" aria-label="ล้าง">
          <X className="size-4" />
        </button>
      )}
      <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-sm hover:bg-jade-50">
        {busy ? <Spinner className="size-4" /> : <Paperclip className="size-4" />} อัปโหลด
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > maxMb * 1024 * 1024) return toast.error(`ไฟล์ใหญ่เกิน ${maxMb} MB`);
            setBusy(true);
            try {
              const r = await uploadFile(bucket, f, { folder: "learning" });
              onChange(r.url);
              toast.ok("อัปโหลดแล้ว");
            } catch (x) {
              toast.error(x instanceof Error ? x.message : "อัปโหลดไม่สำเร็จ");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
    </div>
  );
}
