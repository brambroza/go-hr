// Upload rules per storage bucket — mirror of supabase/migrations/20261010020000_storage_limits.sql.
// The Storage API enforces the same limits server side; this copy gives a clear Thai message before the
// upload starts and checks the file's real signature (magic bytes), not only the declared MIME type.
// Pure (no browser / Supabase imports) — unit tested in tests/upload-rules.test.ts.

export type Bucket = "public" | "avatars" | "documents" | "attachments" | "checkins" | "resumes";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const PDF = "application/pdf";
const DOC = "application/msword";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLS = "application/vnd.ms-excel";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPT = "application/vnd.ms-powerpoint";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const BUCKET_RULES: Record<Bucket, { maxBytes: number; types: readonly string[]; hint: string }> = {
  public: { maxBytes: 200 * 1024 * 1024, types: [...IMAGE_TYPES, PDF, "video/mp4", "video/webm", "video/quicktime", PPT, PPTX], hint: "รูปภาพ (JPG, PNG, WebP), PDF, วิดีโอ MP4 หรือสไลด์ ไม่เกิน 200 MB" },
  avatars: { maxBytes: 5 * 1024 * 1024, types: IMAGE_TYPES, hint: "รูปภาพ JPG, PNG หรือ WebP ไม่เกิน 5 MB" },
  checkins: { maxBytes: 3 * 1024 * 1024, types: IMAGE_TYPES, hint: "รูปภาพ JPG, PNG หรือ WebP ไม่เกิน 3 MB" },
  documents: { maxBytes: 20 * 1024 * 1024, types: [...IMAGE_TYPES, PDF, DOC, DOCX, XLS, XLSX, "text/csv", "text/plain"], hint: "PDF, รูปภาพ, Word, Excel หรือ CSV ไม่เกิน 20 MB" },
  attachments: { maxBytes: 20 * 1024 * 1024, types: [...IMAGE_TYPES, PDF, DOC, DOCX, XLS, XLSX, "text/csv", "text/plain"], hint: "PDF, รูปภาพ, Word, Excel หรือ CSV ไม่เกิน 20 MB" },
  resumes: { maxBytes: 5 * 1024 * 1024, types: [PDF, DOC, DOCX, ...IMAGE_TYPES], hint: "PDF, Word หรือรูปภาพ ไม่เกิน 5 MB" },
};

/** `accept` attribute for an <input type="file"> of a bucket */
export function acceptFor(bucket: Bucket): string {
  return BUCKET_RULES[bucket].types.join(",");
}

/** MIME type by file extension — browsers leave `File.type` empty for some files (e.g. .csv on Windows) */
export function mimeFromName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: PDF, doc: DOC, docx: DOCX, xls: XLS, xlsx: XLSX,
    ppt: PPT, pptx: PPTX, csv: "text/csv", txt: "text/plain", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  };
  return map[ext] ?? null;
}

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/**
 * Sniff the real type from the first bytes. Returns null when the signature is unknown (Office / text files
 * have none that is reliable enough; zip-based Office files are reported as "application/zip").
 */
export function sniffMime(head: Uint8Array): string | null {
  if (head.length < 4) return null;
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && head.length >= 12 && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return PDF;
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0])) return "application/x-ole"; // legacy .doc / .xls / .ppt
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return "application/zip"; // docx / xlsx / pptx
  if (head.length >= 12 && startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) return "video/mp4"; // ....ftyp (mp4 / mov)
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  const text = String.fromCharCode(...head.slice(0, 64)).trimStart().toLowerCase();
  if (text.startsWith("<svg") || text.startsWith("<?xml")) return "image/svg+xml";
  if (text.startsWith("<!doctype html") || text.startsWith("<html") || text.startsWith("<script")) return "text/html";
  return null;
}

const ZIP_TYPES = new Set([DOCX, XLSX, PPTX]);
const OLE_TYPES = new Set([DOC, XLS, PPT]);

/**
 * Validate a file for a bucket. `head` = first bytes of the file (optional). Returns a Thai error message or null.
 * Rejects: oversize, type not allowed for the bucket, and a signature that contradicts the declared type
 * (e.g. an HTML / SVG file renamed to .png).
 */
export function checkUpload(bucket: Bucket, file: { type?: string | null; size: number; name?: string }, head?: Uint8Array): string | null {
  const rule = BUCKET_RULES[bucket];
  if (file.size > rule.maxBytes) return `ไฟล์ใหญ่เกิน ${Math.round(rule.maxBytes / 1024 / 1024)} MB`;
  const declared = file.type || (file.name ? mimeFromName(file.name) : null) || "";
  if (!rule.types.includes(declared)) return `ชนิดไฟล์ไม่รองรับ (${rule.hint})`;
  if (head && head.length >= 4) {
    const real = sniffMime(head);
    if (real === "image/svg+xml" || real === "text/html") return "ไฟล์นี้มีโค้ดสคริปต์ ไม่อนุญาตให้อัปโหลด";
    if (real && real !== declared) {
      const ok =
        (real === "application/zip" && ZIP_TYPES.has(declared)) ||
        (real === "application/x-ole" && OLE_TYPES.has(declared)) ||
        (real === "video/mp4" && (declared === "video/mp4" || declared === "video/quicktime"));
      if (!ok) return "เนื้อหาไฟล์ไม่ตรงกับชนิดไฟล์ที่ระบุ";
    }
    if (!real && declared.startsWith("image/")) return "ไฟล์รูปภาพไม่ถูกต้อง";
  }
  return null;
}
