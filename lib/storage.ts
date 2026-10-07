"use client";
import { supabaseBrowser } from "./supabase/client";
import { publicEnv } from "./public-env";

export type Bucket = "public" | "avatars" | "documents" | "attachments" | "checkins" | "resumes";

/**
 * Upload a file from the browser. Path is prefixed with the user's id (storage RLS requires it for
 * non-HR users). Returns the storage path plus a URL: public URL for public buckets, otherwise the path
 * (resolve with signedUrl() when displaying).
 */
export async function uploadFile(bucket: Bucket, file: File | Blob, opts: { folder?: string; name?: string } = {}) {
  const sb = supabaseBrowser();
  const { data: auth } = await sb.auth.getUser();
  const ext = (opts.name ?? (file instanceof File ? file.name : "file.bin")).split(".").pop()?.toLowerCase() ?? "bin";
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = [auth.user?.id ?? "anon", opts.folder, safeName].filter(Boolean).join("/");
  const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: false, contentType: (file as File).type || undefined });
  if (error) throw error;
  const isPublic = bucket === "public" || bucket === "avatars";
  const url = isPublic ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : `${bucket}/${path}`;
  return { path, url, name: file instanceof File ? file.name : safeName, type: (file as File).type ?? "" };
}

/** Resolve a stored reference ("bucket/path" or full URL) to a viewable URL */
export async function signedUrl(ref: string | null | undefined, expiresIn = 3600): Promise<string | null> {
  if (!ref) return null;
  if (/^https?:\/\//.test(ref) || ref.startsWith("data:")) return ref;
  const [bucket, ...rest] = ref.split("/");
  const { data } = await supabaseBrowser().storage.from(bucket).createSignedUrl(rest.join("/"), expiresIn);
  if (!data?.signedUrl) return null;
  return data.signedUrl.startsWith("http") ? data.signedUrl : `${publicEnv().supabaseUrl}/storage/v1${data.signedUrl}`;
}

/** Resize an image in the browser before upload (photos from phones are large) */
export async function resizeImage(file: File | Blob, maxSize = 1280, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}
