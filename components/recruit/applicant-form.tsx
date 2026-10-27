"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, Select, Textarea, toast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { humanError } from "@/components/crud/crud-page";
import { uploadResumeAction } from "@/app/(admin)/recruit/actions";
import { EDU_LEVELS, SOURCE } from "./labels";

type Posting = { id: number; title: string };

const EMPTY = {
  posting_id: "", prefix: "", first_name: "", last_name: "", nickname: "", phone: "", email: "", birth_date: "", gender: "",
  education_level: "", institution: "", major: "", experience_years: "", last_company: "", last_position: "",
  expected_salary: "", available_date: "", source: "walk-in", notes: "",
};

/** add an applicant manually (walk-in / referral / job board) */
export function ApplicantFormModal({ open, onClose, postings, onSaved, defaultPosting }: { open: boolean; onClose: () => void; postings: Posting[]; onSaved: (id: number) => void; defaultPosting?: string }) {
  const [v, setV] = useState({ ...EMPTY, posting_id: defaultPosting ?? "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof EMPTY, val: string) => setV((x) => ({ ...x, [k]: val }));

  async function save() {
    const e: Record<string, string> = {};
    if (!v.first_name.trim()) e.first_name = "กรุณากรอกชื่อ";
    if (!v.last_name.trim()) e.last_name = "กรุณากรอกนามสกุล";
    if (!/^0\d{8,9}$/.test(v.phone.replace(/\D/g, ""))) e.phone = "เบอร์โทรไม่ถูกต้อง (เช่น 0812345678)";
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      let resume_url: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.set("file", file);
        const r = await uploadResumeAction(fd);
        if (!r.ok) throw new Error(r.error);
        resume_url = r.data as string;
      }
      const num = (s: string) => (s === "" ? null : Number(s));
      const { data, error } = await supabaseBrowser()
        .from("applicants")
        .insert({
          posting_id: num(v.posting_id), prefix: v.prefix || null, first_name: v.first_name.trim(), last_name: v.last_name.trim(), nickname: v.nickname || null,
          phone: v.phone.replace(/\D/g, ""), email: v.email || null, birth_date: v.birth_date || null, gender: v.gender || null,
          education_level: v.education_level || null, institution: v.institution || null, major: v.major || null, experience_years: num(v.experience_years),
          last_company: v.last_company || null, last_position: v.last_position || null, expected_salary: num(v.expected_salary), available_date: v.available_date || null,
          source: v.source, notes: v.notes || null, resume_url, consent_pdpa: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.ok("เพิ่มผู้สมัครแล้ว");
      setV({ ...EMPTY, posting_id: defaultPosting ?? "" });
      setFile(null);
      onSaved(data.id);
      onClose();
    } catch (x) {
      toast.error(humanError(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="เพิ่มผู้สมัคร (Walk-in / แหล่งอื่น)"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button loading={busy} onClick={save}>บันทึกผู้สมัคร</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ตำแหน่งที่สมัคร">
          <Select value={v.posting_id} onChange={(e) => set("posting_id", e.target.value)} placeholder="— ไม่ระบุ (เก็บในคลังผู้สมัคร) —">
            {postings.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </Select>
        </Field>
        <Field label="ช่องทาง" required>
          <Select value={v.source} onChange={(e) => set("source", e.target.value)}>
            {Object.entries(SOURCE).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-[6rem_1fr] gap-2 sm:col-span-2 sm:grid-cols-[7rem_1fr_1fr_8rem]">
          <Field label="คำนำหน้า">
            <Select value={v.prefix} onChange={(e) => set("prefix", e.target.value)} placeholder="-">
              {["นาย", "นาง", "นางสาว"].map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="ชื่อ" required error={err.first_name}>
            <Input value={v.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="นามสกุล" required error={err.last_name} className="col-span-2 sm:col-span-1">
            <Input value={v.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
          <Field label="ชื่อเล่น" className="col-span-2 sm:col-span-1">
            <Input value={v.nickname} onChange={(e) => set("nickname", e.target.value)} />
          </Field>
        </div>
        <Field label="เบอร์โทร" required error={err.phone}>
          <Input type="tel" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="อีเมล">
          <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="วันเกิด">
          <Input type="date" value={v.birth_date} onChange={(e) => set("birth_date", e.target.value)} />
        </Field>
        <Field label="เพศ">
          <Select value={v.gender} onChange={(e) => set("gender", e.target.value)} placeholder="— ไม่ระบุ —">
            <option value="M">ชาย</option>
            <option value="F">หญิง</option>
          </Select>
        </Field>
        <Field label="วุฒิการศึกษาสูงสุด">
          <Select value={v.education_level} onChange={(e) => set("education_level", e.target.value)} placeholder="— ไม่ระบุ —">
            {EDU_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </Select>
        </Field>
        <Field label="สถาบัน / สาขา">
          <Input value={v.institution} onChange={(e) => set("institution", e.target.value)} />
        </Field>
        <Field label="ประสบการณ์ (ปี)">
          <Input type="number" min={0} step="0.5" value={v.experience_years} onChange={(e) => set("experience_years", e.target.value)} className="num" />
        </Field>
        <Field label="ที่ทำงานล่าสุด / ตำแหน่ง">
          <Input value={v.last_company} onChange={(e) => set("last_company", e.target.value)} placeholder="บริษัท" />
        </Field>
        <Field label="เงินเดือนที่ต้องการ">
          <Input type="money" min={0} value={v.expected_salary} onChange={(e) => set("expected_salary", e.target.value)} className="num" />
        </Field>
        <Field label="วันที่เริ่มงานได้">
          <Input type="date" value={v.available_date} onChange={(e) => set("available_date", e.target.value)} />
        </Field>
        <Field label="ไฟล์ใบสมัคร / Resume (PDF, Word ไม่เกิน 5 MB)" className="sm:col-span-2">
          <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="py-1.5" />
        </Field>
        <Field label="บันทึกของ HR" className="sm:col-span-2">
          <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
