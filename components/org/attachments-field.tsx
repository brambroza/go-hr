"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { Button, toast } from "@/components/ui";
import { BUCKET_RULES, acceptFor, signedUrl, uploadFile, type Bucket } from "@/lib/storage";

export type Attachment = { name: string; url: string; type?: string };

/** Open a stored file ("bucket/path" or URL) in a new tab */
export async function openStored(ref: string) {
  const w = window.open("", "_blank");
  const url = await signedUrl(ref);
  if (!url) {
    w?.close();
    toast.error("เปิดไฟล์ไม่ได้ ไฟล์อาจถูกลบไปแล้ว");
    return;
  }
  if (w) w.location.href = url;
  else window.location.href = url;
}

export function AttachmentsField({ value, onChange, bucket = "documents", folder, disabled }: { value: unknown; onChange: (v: Attachment[]) => void; bucket?: Bucket; folder?: string; disabled?: boolean }) {
  const list = Array.isArray(value) ? (value as Attachment[]) : [];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: Attachment[] = [];
    try {
      for (const f of Array.from(files)) {
        try {
          const r = await uploadFile(bucket, f, { folder });
          added.push({ name: r.name, url: r.url, type: r.type });
        } catch (e) {
          toast.error(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      onChange([...list, ...added]);
      if (added.length) toast.ok(`แนบไฟล์แล้ว ${added.length} ไฟล์ กด “บันทึก” เพื่อยืนยัน`);
    } catch (e) {
      toast.error(`อัปโหลดไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {list.length > 0 && (
        <ul className="divide-y divide-line-soft rounded-[var(--radius-ctl)] border border-line">
          {list.map((a, i) => (
            <li key={a.url + i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <FileText className="size-4 shrink-0 text-jade-600" />
              <button type="button" className="min-w-0 flex-1 truncate text-left text-jade-800 hover:underline" onClick={() => openStored(a.url)}>
                {a.name}
              </button>
              {!disabled && (
                <button type="button" className="rounded p-1 text-ink-mute hover:bg-rust-soft hover:text-rust" aria-label={`ลบไฟล์ ${a.name}`} onClick={() => onChange(list.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div>
          <input ref={input} type="file" multiple accept={acceptFor(bucket)} className="sr-only" onChange={(e) => onFiles(e.target.files)} tabIndex={-1} aria-hidden />
          <Button size="sm" variant="secondary" icon={<Paperclip className="size-4" />} loading={busy} onClick={() => input.current?.click()}>
            แนบไฟล์
          </Button>
          <span className="ml-2 text-xs text-ink-mute">{BUCKET_RULES[bucket].hint} ต่อไฟล์</span>
        </div>
      )}
    </div>
  );
}
