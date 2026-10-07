"use client";

// Lazy loader for @vladmandic/face-api. Only the check-in and face-enrollment screens import this file, and the
// library itself (~1.3 MB incl. TensorFlow.js) is pulled in with a dynamic import on first use. Models are served
// by the app from /models/face (copied by scripts/copy-face-models.mjs) so nothing is fetched from the internet.

import type * as FaceApi from "@vladmandic/face-api";
import type { Box, Pt } from "./face-liveness";

export type FaceApiModule = typeof FaceApi;
export const FACE_MODEL_URL = "/models/face";

let loading: Promise<FaceApiModule> | null = null;

export function loadFaceApi(): Promise<FaceApiModule> {
  if (!loading) {
    loading = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      const tf = faceapi.tf as unknown as { setBackend: (b: string) => Promise<boolean>; ready: () => Promise<void>; getBackend: () => string };
      // WebGL is fast on phones; fall back to CPU (slow but works everywhere)
      try {
        if (!(await tf.setBackend("webgl"))) await tf.setBackend("cpu");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
      ]);
      return faceapi;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

export type FaceScan = { box: Box; landmarks: Pt[]; descriptor?: Float32Array; score: number };

type Input = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;

/** Detect all faces with landmarks (fast — used every frame for placement + liveness) */
export async function detectFaces(faceapi: FaceApiModule, input: Input, inputSize = 224): Promise<FaceScan[]> {
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.5 });
  const res = await faceapi.detectAllFaces(input, opts).withFaceLandmarks(true);
  return res.map((r) => ({
    box: { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height },
    landmarks: r.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
    score: r.detection.score,
  }));
}

/** Detect faces and compute 128-d descriptors (slower — once per capture). */
export async function describeFaces(faceapi: FaceApiModule, input: Input, inputSize = 320): Promise<FaceScan[]> {
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.5 });
  const res = await faceapi.detectAllFaces(input, opts).withFaceLandmarks(true).withFaceDescriptors();
  return res.map((r) => ({
    box: { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height },
    landmarks: r.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
    descriptor: r.descriptor,
    score: r.detection.score,
  }));
}

/** Copy the current video frame to a canvas (optionally mirrored for a selfie look) */
export function grabFrame(video: HTMLVideoElement, maxSize = 640): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(video.videoWidth * scale);
  c.height = Math.round(video.videoHeight * scale);
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
  return c;
}

export function canvasToJpeg(c: HTMLCanvasElement, quality = 0.82): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("แปลงรูปไม่สำเร็จ"))), "image/jpeg", quality));
}

/** Rounded descriptor as a plain array (PostgREST real[]) */
export function toPgArray(d: Float32Array): number[] {
  return Array.from(d, (x) => Math.round(x * 1e6) / 1e6);
}

/** Thai message for camera errors */
export function cameraErrorText(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "ไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องในการตั้งค่าเบราว์เซอร์แล้วลองใหม่";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "ไม่พบกล้องหน้าในอุปกรณ์นี้";
  if (name === "NotReadableError") return "กล้องถูกใช้งานโดยแอปอื่นอยู่ — ปิดแอปนั้นแล้วลองใหม่";
  if (typeof window !== "undefined" && !window.isSecureContext) return "เปิดกล้องได้เฉพาะเมื่อเข้าระบบผ่าน https เท่านั้น";
  return "เปิดกล้องไม่ได้";
}

export async function openFrontCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("อุปกรณ์นี้เปิดกล้องจากเบราว์เซอร์ไม่ได้"), { name: window.isSecureContext ? "NotFoundError" : "SecurityError" });
  }
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
}
