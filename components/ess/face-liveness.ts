// Pure helpers for the face check-in screen (no DOM / face-api imports — unit tested in tests/face.test.ts).
//
// Liveness ("are you a live person in front of the camera?") is a light challenge based on the 68-point
// landmarks: the person must BLINK or TURN THEIR HEAD a little and come back to face the camera.
//  - Head turn: yaw is estimated from the nose tip vs the outer eye corners. A real head is 3D, so the nose
//    moves relative to the eyes; a printed photo or a phone held up and tilted stays nearly flat.
//  - Blink: eye aspect ratio (EAR) drops clearly below the person's own baseline and recovers.
// Limits: this stops printed photos / still images, NOT a video replay or a 3D mask. The server is the
// authority for identity (descriptor distance in SQL); liveness only raises the cost of cheating.

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Eye aspect ratio for the 6 eye points (p1..p6 in 68-landmark order) */
export function eyeAspectRatio(eye: Pt[]): number {
  if (eye.length < 6) return 0;
  const [p1, p2, p3, p4, p5, p6] = eye;
  const w = dist(p1, p4);
  return w > 0 ? (dist(p2, p6) + dist(p3, p5)) / (2 * w) : 0;
}

/** Mean EAR of both eyes from all 68 landmarks */
export function earFrom68(pts: Pt[]): number {
  if (pts.length < 68) return 0;
  return (eyeAspectRatio(pts.slice(36, 42)) + eyeAspectRatio(pts.slice(42, 48))) / 2;
}

/**
 * Head yaw in -1..1 from 68 landmarks: 0 = facing the camera. Sign: positive when the nose tip is closer to
 * landmark 45 (image-right outer eye corner) than to landmark 36. Only the magnitude is used for liveness.
 */
export function yawFrom68(pts: Pt[]): number {
  if (pts.length < 68) return 0;
  const nose = pts[30];
  const a = dist(nose, pts[36]);
  const b = dist(nose, pts[45]);
  return a + b > 0 ? (a - b) / (a + b) : 0;
}

export type Placement = "ok" | "none" | "many" | "far" | "near" | "off_center";

/** Is the (single) face well placed inside the guide circle? frame = video size in px */
export function facePlacement(boxes: Box[], frame: { width: number; height: number }): Placement {
  if (boxes.length === 0) return "none";
  if (boxes.length > 1) return "many";
  const b = boxes[0];
  const short = Math.min(frame.width, frame.height);
  const size = Math.max(b.width, b.height) / short;
  if (size < 0.22) return "far";
  if (size > 0.85) return "near";
  const cx = (b.x + b.width / 2 - frame.width / 2) / short;
  const cy = (b.y + b.height / 2 - frame.height / 2) / short;
  if (Math.hypot(cx, cy) > 0.2) return "off_center";
  return "ok";
}

export const PLACEMENT_TEXT: Record<Placement, string> = {
  ok: "ใบหน้าอยู่ในกรอบแล้ว",
  none: "ไม่พบใบหน้า — มองตรงมาที่กล้องในที่ที่มีแสงพอ",
  many: "พบหลายใบหน้า — ให้มีเพียงคุณคนเดียวในกล้อง",
  far: "ขยับเข้าใกล้กล้องอีกนิด",
  near: "ถอยห่างจากกล้องอีกนิด",
  off_center: "ให้ใบหน้าอยู่กลางวงกลม",
};

export type LivenessStage = "baseline" | "challenge" | "return" | "passed";
export type LivenessFrame = { t: number; ear: number; yaw: number };

export const LIVENESS = {
  baselineFrames: 4, // frontal frames to learn the person's own EAR / yaw
  frontalYaw: 0.12, // |yaw - baseline| below this = facing the camera
  turnYaw: 0.18, // |yaw - baseline| above this = head clearly turned
  blinkDrop: 0.72, // EAR below baseline * this = eyes closed
  blinkRecover: 0.88, // EAR back above baseline * this = eyes open again
  blinkMaxMs: 900, // closed → open must happen within this
  timeoutMs: 15000, // challenge must be done within this
};

/**
 * Small state machine: feed one frame per detection (only frames where a single, well-placed face was found).
 * baseline → challenge (blink OR head turn) → return (face the camera again) → passed.
 */
export class LivenessTracker {
  stage: LivenessStage = "baseline";
  passedBy: "blink" | "turn" | null = null;
  private base: LivenessFrame[] = [];
  private earBase = 0;
  private yawBase = 0;
  private closedAt: number | null = null;
  private startedAt = 0;

  reset() {
    this.stage = "baseline";
    this.passedBy = null;
    this.base = [];
    this.closedAt = null;
    this.startedAt = 0;
  }

  get timedOut(): boolean {
    return this.stage === "challenge" && this.startedAt > 0 && this.lastT - this.startedAt > LIVENESS.timeoutMs;
  }
  private lastT = 0;

  feed(f: LivenessFrame): LivenessStage {
    this.lastT = f.t;
    if (this.stage === "passed") return this.stage;
    if (this.stage === "baseline") {
      // only learn from roughly frontal, eyes-open frames
      if (Math.abs(f.yaw) < 0.25 && f.ear > 0.12) this.base.push(f);
      if (this.base.length >= LIVENESS.baselineFrames) {
        const ears = this.base.map((b) => b.ear).sort((a, b) => a - b);
        const yaws = this.base.map((b) => b.yaw).sort((a, b) => a - b);
        this.earBase = ears[Math.floor(ears.length / 2)];
        this.yawBase = yaws[Math.floor(yaws.length / 2)];
        this.stage = "challenge";
        this.startedAt = f.t;
      }
      return this.stage;
    }
    const dy = Math.abs(f.yaw - this.yawBase);
    if (this.stage === "challenge") {
      if (dy > LIVENESS.turnYaw) {
        this.passedBy = "turn";
        this.stage = "return";
        return this.stage;
      }
      if (f.ear < this.earBase * LIVENESS.blinkDrop) {
        this.closedAt ??= f.t;
      } else if (this.closedAt != null && f.ear > this.earBase * LIVENESS.blinkRecover) {
        if (f.t - this.closedAt <= LIVENESS.blinkMaxMs) {
          this.passedBy = "blink";
          this.stage = "return";
        }
        this.closedAt = null;
      }
      if (this.stage === "challenge" && this.closedAt != null && f.t - this.closedAt > LIVENESS.blinkMaxMs) this.closedAt = null;
      return this.stage;
    }
    // return: facing the camera again with eyes open → capture this frame
    if (dy < LIVENESS.frontalYaw && f.ear > this.earBase * LIVENESS.blinkRecover) this.stage = "passed";
    return this.stage;
  }
}

/** Euclidean distance between two descriptors (same as SQL app.face_distance) */
export function descriptorDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}
