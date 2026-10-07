"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Camera, ImageUp, ScanFace, ShieldCheck, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Panel, Spinner, toast, useConfirm } from "@/components/ui";
import { humanError } from "@/components/crud/crud-page";
import { resizeImage, signedUrl, uploadFile } from "@/lib/storage";
import { thDate } from "@/lib/format";
import type { FaceCapture } from "@/components/ess/face-scan";
import { describeFaces, loadFaceApi, toPgArray } from "@/components/ess/face-api-loader";
import type { TabProps } from "./types";

const FaceCamera = dynamic(() => import("@/components/ess/face-scan").then((m) => m.FaceCamera), {
  ssr: false,
  loading: () => <div className="grid aspect-[4/5] w-full place-items-center rounded-[var(--radius-panel)] border border-line bg-paper text-sm text-ink-soft">กำลังโหลดระบบสแกนใบหน้า…</div>,
});

export const MAX_FACE_SAMPLES = 5;
type Sample = { id: number; photo_url: string | null; created_at: string; src?: string | null };

/** HR tab "ข้อมูลใบหน้า" in the employee profile */
export function FacesTab({ emp }: TabProps) {
  const can = useCan();
  return (
    <FaceEnroll
      employeeId={emp.id}
      canEdit={can("employee", "edit")}
      canDelete={can("employee", "edit")}
      title="ข้อมูลใบหน้า"
      intro="ใช้ยืนยันตัวตนตอนลงเวลาด้วยการสแกนใบหน้าในแอปพนักงาน — ถ่าย 3–5 รูปในแสงต่างกันเล็กน้อย (หน้าตรง, ไม่ใส่แมสก์/แว่นกันแดด)"
    />
  );
}

/** Shared enrollment UI — back office tab and employee self-enrollment (/m/profile) */
export function FaceEnroll({
  employeeId, canEdit, canDelete, title, intro, compact,
}: { employeeId: number; canEdit: boolean; canDelete: boolean; title: string; intro: string; compact?: boolean }) {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Sample[] | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const { data, error } = await sb.from("employee_faces").select("id, photo_url, created_at").eq("employee_id", employeeId).order("created_at");
    if (error) {
      toast.error(humanError(error));
      setRows([]);
      return;
    }
    const list = (data ?? []) as Sample[];
    const withSrc = await Promise.all(list.map(async (r) => ({ ...r, src: await signedUrl(r.photo_url).catch(() => null) })));
    setRows(withSrc);
  }, [sb, employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const count = rows?.length ?? 0;
  const full = count >= MAX_FACE_SAMPLES;

  async function save(descriptor: Float32Array, photo: Blob) {
    const blob = await resizeImage(photo, 480, 0.85);
    const up = await uploadFile("documents", blob, { folder: `faces/emp-${employeeId}`, name: "face.jpg" });
    const { error } = await sb.from("employee_faces").insert({ employee_id: employeeId, descriptor: toPgArray(descriptor), photo_url: up.url });
    if (error) {
      await sb.storage.from("documents").remove([up.path]).catch(() => undefined);
      throw error;
    }
    toast.ok("บันทึกตัวอย่างใบหน้าแล้ว");
    await load();
  }

  async function onCapture(c: FaceCapture) {
    if (full) throw new Error(`ครบ ${MAX_FACE_SAMPLES} ตัวอย่างแล้ว — ลบตัวอย่างเก่าก่อน`);
    setBusy(true);
    try {
      await save(c.descriptor, c.photo);
    } catch (e) {
      const m = humanError(e);
      toast.error(m);
      throw new Error(m);
    } finally {
      setBusy(false);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    try {
      const faceapi = await loadFaceApi();
      for (const f of Array.from(files).slice(0, MAX_FACE_SAMPLES - count)) {
        if (!f.type.startsWith("image/")) {
          toast.error(`${f.name}: เลือกไฟล์รูปภาพ (JPG, PNG)`);
          continue;
        }
        const small = await resizeImage(f, 960, 0.9);
        const img = await blobToImage(small);
        const faces = await describeFaces(faceapi, img, 416);
        if (faces.length !== 1) {
          toast.error(`${f.name}: ${faces.length === 0 ? "ไม่พบใบหน้าในรูป" : "พบหลายใบหน้าในรูป — ใช้รูปที่มีคนเดียว"}`);
          continue;
        }
        try {
          await save(faces[0].descriptor!, small);
          ok++;
        } catch (e) {
          toast.error(`${f.name}: ${humanError(e)}`);
        }
      }
    } catch (e) {
      toast.error(`ประมวลผลรูปไม่สำเร็จ: ${humanError(e)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (ok > 1) toast.ok(`บันทึก ${ok} ตัวอย่างแล้ว`);
    }
  }

  async function remove(r: Sample) {
    if (!(await confirm("ลบตัวอย่างใบหน้านี้? ถ้าลบหมด พนักงานจะลงเวลาด้วยใบหน้าไม่ได้จนกว่าจะลงทะเบียนใหม่", { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from("employee_faces").delete().eq("id", r.id);
    if (error) return toast.error(humanError(error));
    if (r.photo_url?.startsWith("documents/")) await sb.storage.from("documents").remove([r.photo_url.slice("documents/".length)]).catch(() => undefined);
    toast.ok("ลบแล้ว");
    load();
  }

  return (
    <Panel
      title={title}
      actions={rows ? <Badge color={count ? "green" : "gray"}>{count ? `ลงทะเบียนแล้ว ${count}/${MAX_FACE_SAMPLES}` : "ยังไม่ได้ลงทะเบียน"}</Badge> : null}
    >
      <p className="text-sm text-ink-soft">{intro}</p>

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={camera ? "secondary" : "primary"} icon={<Camera className="size-4" />} disabled={full && !camera} onClick={() => setCamera((v) => !v)}>
            {camera ? "ปิดกล้อง" : "ถ่ายจากกล้อง"}
          </Button>
          <Button variant="secondary" icon={<ImageUp className="size-4" />} loading={busy && !camera} disabled={full} onClick={() => fileRef.current?.click()}>
            อัปโหลดรูป
          </Button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFiles(e.target.files)} />
          {full && <span className="self-center text-sm text-amber-ink">ครบ {MAX_FACE_SAMPLES} ตัวอย่างแล้ว — ลบตัวอย่างเก่าก่อนเพิ่มใหม่</span>}
        </div>
      )}

      {camera && canEdit && (
        <div className={compact ? "mt-3" : "mt-3 max-w-sm"}>
          <FaceCamera mode="manual" paused={busy || full} onCapture={onCapture} captureLabel={full ? "ครบจำนวนแล้ว" : `ถ่ายตัวอย่างที่ ${count + 1}`} />
        </div>
      )}

      <div className="mt-4">
        {!rows ? (
          <Spinner className="mx-auto" />
        ) : rows.length === 0 ? (
          <Empty icon={<ScanFace className="size-8" />} title="ยังไม่มีตัวอย่างใบหน้า" description={canEdit ? "กด ‘ถ่ายจากกล้อง’ หรือ ‘อัปโหลดรูป’ เพื่อเพิ่มตัวอย่าง" : "ติดต่อฝ่ายบุคคลเพื่อลงทะเบียนใบหน้า"} />
        ) : (
          <ul className={compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3"}>
            {rows.map((r, i) => (
              <li key={r.id} className="overflow-hidden rounded-[var(--radius-ctl)] border border-line bg-paper">
                {r.src ? (
                  <img src={r.src} alt={`ตัวอย่างใบหน้าที่ ${i + 1}`} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="grid aspect-square place-items-center text-ink-mute"><ScanFace className="size-8" /></div>
                )}
                <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs text-ink-soft">
                  <span>{thDate(r.created_at.slice(0, 10))}</span>
                  {canDelete && (
                    <button className="rounded p-1 text-ink-mute hover:bg-rust-soft hover:text-rust" aria-label={`ลบตัวอย่างที่ ${i + 1}`} onClick={() => remove(r)}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-ink-mute">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        ระบบเก็บค่าตัวเลขของใบหน้า (128 ค่า) ไว้บนเซิร์ฟเวอร์ของบริษัทเท่านั้น ไม่ส่งออกนอกบริษัท และเทียบใบหน้าที่เซิร์ฟเวอร์ทุกครั้งที่ลงเวลา
      </p>
      {dialog}
    </Panel>
  );
}

function blobToImage(b: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("อ่านรูปไม่ได้"));
    img.src = URL.createObjectURL(b);
  });
}
