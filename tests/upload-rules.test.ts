import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptFor, checkUpload, mimeFromName, sniffMime } from "../lib/upload-rules";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46);
const PDF = text("%PDF-1.7 ....");
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0);

test("upload: size limit per bucket", () => {
  assert.match(checkUpload("avatars", { type: "image/png", size: 6 * 1024 * 1024 }) ?? "", /ใหญ่เกิน 5 MB/);
  assert.equal(checkUpload("avatars", { type: "image/png", size: 100 }, PNG), null);
});

test("upload: type must be allowed for the bucket (falls back to the extension when the browser gives no type)", () => {
  assert.match(checkUpload("avatars", { type: "application/pdf", size: 10 }) ?? "", /ชนิดไฟล์ไม่รองรับ/);
  assert.equal(checkUpload("documents", { type: "", size: 10, name: "report.csv" }), null);
  assert.equal(mimeFromName("Photo.JPG"), "image/jpeg");
  assert.equal(mimeFromName("x.exe"), null);
});

test("upload: svg / html content is rejected everywhere, even when renamed", () => {
  assert.match(checkUpload("public", { type: "image/png", size: 10, name: "logo.png" }, text("<svg xmlns=...")) ?? "", /สคริปต์/);
  assert.match(checkUpload("documents", { type: "application/pdf", size: 10 }, text("<!DOCTYPE html><html>")) ?? "", /สคริปต์/);
});

test("upload: signature must match the declared type", () => {
  assert.equal(checkUpload("avatars", { type: "image/jpeg", size: 10 }, JPG), null);
  assert.match(checkUpload("avatars", { type: "image/jpeg", size: 10 }, PNG) ?? "", /ไม่ตรงกับชนิดไฟล์/);
  assert.match(checkUpload("avatars", { type: "image/png", size: 10 }, text("MZ......garbage..")) ?? "", /รูปภาพไม่ถูกต้อง/);
  assert.equal(checkUpload("documents", { type: "application/pdf", size: 10 }, PDF), null);
  // Office files are zip containers — accepted for docx / xlsx, not for an image
  assert.equal(checkUpload("documents", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10 }, ZIP), null);
  assert.match(checkUpload("documents", { type: "image/png", size: 10 }, ZIP) ?? "", /ไม่ตรงกับชนิดไฟล์/);
});

test("upload: sniff + accept list", () => {
  assert.equal(sniffMime(PNG), "image/png");
  assert.equal(sniffMime(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), "image/webp");
  assert.equal(sniffMime(bytes(1, 2)), null);
  assert.equal(acceptFor("avatars"), "image/jpeg,image/png,image/webp");
});
