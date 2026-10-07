"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Eraser, ImageUp, PenLine, Trash2, Undo2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { signedUrl } from "@/lib/storage";
import { Button, Panel, Tabs, toast, useConfirm } from "@/components/ui";
import { errMsg } from "./lib";

const W = 600;
const H = 220;

export function SignatureSettings({ current, userId }: { current: string | null; userId: string }) {
  const sb = supabaseBrowser();
  const [ref, setRef] = useState<string | null>(current);
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    let alive = true;
    if (ref) signedUrl(ref).then((u) => alive && setPreview(u));
    else setPreview(null);
    return () => {
      alive = false;
    };
  }, [ref]);

  async function store(blob: Blob, name: string) {
    setSaving(true);
    try {
      // documents bucket is private: the path starts with the user id (storage policy), shown via signed URL.
      // Uploaded as an ArrayBuffer (raw body) rather than lib/storage uploadFile(): supabase-js sends Blobs as
      // multipart, which the local dev storage gateway stores verbatim (corrupt PNG). Works the same on real Supabase.
      const path = `${userId}/signatures/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      const { error: upErr } = await sb.storage.from("documents").upload(path, await blob.arrayBuffer(), { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;
      const ref = `documents/${path}`;
      void name;
      const { error } = await sb.from("profiles").update({ signature_url: ref }).eq("id", userId);
      if (error) throw error;
      setRef(ref);
      toast.ok("บันทึกลายเซ็นแล้ว");
    } catch (e) {
      toast.error(`บันทึกลายเซ็นไม่สำเร็จ: ${errMsg(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirm("ลบลายเซ็นของคุณ? เอกสารที่พิมพ์หลังจากนี้จะไม่มีรูปลายเซ็น", { danger: true, confirmText: "ลบลายเซ็น" }))) return;
    const { error } = await sb.from("profiles").update({ signature_url: null }).eq("id", userId);
    if (error) return toast.error(errMsg(error));
    if (ref && !/^https?:/.test(ref)) {
      const [bucket, ...rest] = ref.split("/");
      await sb.storage.from(bucket).remove([rest.join("/")]).catch(() => null);
    }
    setRef(null);
    toast.ok("ลบลายเซ็นแล้ว");
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="ลายเซ็นปัจจุบัน" actions={ref && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4 text-rust" />} onClick={remove}>ลบลายเซ็น</Button>}>
        {ref ? (
          <div className="grid h-36 place-items-center rounded-[var(--radius-ctl)] border border-dashed border-line bg-[repeating-conic-gradient(#f3f6f4_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
            {preview ? (
               
              <img src={preview} alt="ลายเซ็นของฉัน" className="max-h-32 max-w-full object-contain" />
            ) : (
              <span className="text-sm text-ink-mute">กำลังโหลด…</span>
            )}
          </div>
        ) : (
          <p className="rounded-[var(--radius-ctl)] bg-paper px-3 py-6 text-center text-sm text-ink-soft">ยังไม่มีลายเซ็น — วาดหรืออัปโหลดด้านล่าง</p>
        )}
      </Panel>

      <Panel bodyClass="p-0">
        <Tabs
          tabs={[
            { value: "draw" as const, label: <span className="inline-flex items-center gap-1.5"><PenLine className="size-4" />วาดลายเซ็น</span> },
            { value: "upload" as const, label: <span className="inline-flex items-center gap-1.5"><ImageUp className="size-4" />อัปโหลดรูป</span> },
          ]}
          value={mode}
          onChange={setMode}
          className="px-3 pt-1"
        />
        <div className="p-4">{mode === "draw" ? <DrawPad saving={saving} onSave={(b) => store(b, "signature.png")} /> : <UploadPad saving={saving} onSave={store} />}</div>
      </Panel>
      {dialog}
    </div>
  );
}

function DrawPad({ onSave, saving }: { onSave: (b: Blob) => void; saving: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<{ x: number; y: number; p: number }[][]>([]);
  const drawing = useRef(false);
  const [count, setCount] = useState(0);
  const [color, setColor] = useState("#0b1f5c");

  const redraw = () => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes.current) {
      if (s.length === 1) {
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(s[0].x, s[0].y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      for (let i = 1; i < s.length; i++) {
        ctx.beginPath();
        ctx.lineWidth = 2.2 + (s[i].p || 0.5) * 2.2;
        ctx.moveTo(s[i - 1].x, s[i - 1].y);
        ctx.lineTo(s[i].x, s[i].y);
        ctx.stroke();
      }
    }
  };
   
  useEffect(redraw, [color, count]);

  const pos = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, p: e.pressure || 0.5 };
  };

  function save() {
    const c = cv.current;
    if (!c || !strokes.current.length) return toast.error("กรุณาวาดลายเซ็นก่อน");
    // crop to the drawn area (+ margin) so the image sits nicely on documents
    const pts = strokes.current.flat();
    const pad = 12;
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) - pad));
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - pad));
    const x1 = Math.min(W, Math.ceil(Math.max(...pts.map((p) => p.x)) + pad));
    const y1 = Math.min(H, Math.ceil(Math.max(...pts.map((p) => p.y)) + pad));
    const out = document.createElement("canvas");
    const scale = 2;
    out.width = (x1 - x0) * scale;
    out.height = (y1 - y0) * scale;
    out.getContext("2d")!.drawImage(c, x0 * scale, y0 * scale, (x1 - x0) * scale, (y1 - y0) * scale, 0, 0, out.width, out.height);
    out.toBlob((b) => b && onSave(b), "image/png");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-[var(--radius-ctl)] border border-line bg-white">
        <canvas
          ref={(el) => {
            cv.current = el;
            if (el && el.width !== W * 2) {
              el.width = W * 2;
              el.height = H * 2;
              el.getContext("2d")!.scale(2, 2);
            }
          }}
          className="block aspect-[600/220] w-full touch-none cursor-crosshair"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            strokes.current.push([pos(e)]);
            redraw();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            strokes.current[strokes.current.length - 1].push(pos(e));
            redraw();
          }}
          onPointerUp={() => {
            drawing.current = false;
            setCount(strokes.current.length);
          }}
          onPointerCancel={() => (drawing.current = false)}
          aria-label="พื้นที่วาดลายเซ็น"
        />
        <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-dashed border-line" />
        {count === 0 && <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-ink-mute">เซ็นชื่อที่นี่</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">สีหมึก</span>
        {["#0b1f5c", "#111111", "#1d4ed8"].map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} aria-label={`สี ${c}`} className="size-7 rounded-full ring-offset-2" style={{ background: c, boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }} />
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" icon={<Undo2 className="size-4" />} disabled={!count} onClick={() => { strokes.current.pop(); setCount(strokes.current.length); }}>
            ย้อนกลับ
          </Button>
          <Button variant="secondary" icon={<Eraser className="size-4" />} disabled={!count} onClick={() => { strokes.current = []; setCount(0); }}>
            ล้าง
          </Button>
          <Button loading={saving} disabled={!count} onClick={save}>
            บันทึกลายเซ็น
          </Button>
        </div>
      </div>
    </div>
  );
}

function UploadPad({ onSave, saving }: { onSave: (b: Blob, name: string) => void; saving: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [whiteToClear, setWhiteToClear] = useState(true);
  const [processed, setProcessed] = useState<Blob | null>(null);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    (async () => {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      if (whiteToClear) {
        // photo/scan of a signature on paper → make the light background transparent
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (lum > 200) d[i + 3] = 0;
          else if (lum > 150) d[i + 3] = Math.round(((200 - lum) / 50) * d[i + 3]);
        }
        ctx.putImageData(img, 0, 0);
      }
      c.toBlob((b) => {
        if (!alive || !b) return;
        setProcessed(b);
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(b);
        });
      }, "image/png");
    })().catch(() => toast.error("อ่านไฟล์รูปไม่ได้ — ใช้ไฟล์ PNG หรือ JPG"));
    return () => {
      alive = false;
    };
  }, [file, whiteToClear]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-ctl)] border border-dashed border-line bg-paper/50 px-4 py-6 text-center hover:border-jade-300">
        <ImageUp className="size-6 text-jade-600" />
        <span className="text-[15px]">{file ? file.name : "เลือกไฟล์รูปลายเซ็น (PNG / JPG ไม่เกิน 5 MB)"}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 5 * 1024 * 1024) return toast.error("ไฟล์ใหญ่เกิน 5 MB");
            setFile(f);
          }}
        />
      </label>
      {file && (
        <>
          <label className="inline-flex items-center gap-2 text-[15px]">
            <input type="checkbox" className="size-4 accent-jade-600" checked={whiteToClear} onChange={(e) => setWhiteToClear(e.target.checked)} />
            ลบพื้นหลังสีขาวให้โปร่งใส (สำหรับรูปถ่าย/สแกนจากกระดาษ)
          </label>
          <div className="grid h-36 place-items-center rounded-[var(--radius-ctl)] border border-line bg-[repeating-conic-gradient(#f3f6f4_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
            {url && (
               
              <img src={url} alt="ตัวอย่างลายเซ็น" className="max-h-32 max-w-full object-contain" />
            )}
          </div>
          <div className="flex justify-end">
            <Button loading={saving} disabled={!processed} onClick={() => processed && onSave(processed, "signature.png")}>
              บันทึกลายเซ็น
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
