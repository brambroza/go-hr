import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LivenessTracker, LIVENESS, descriptorDistance, earFrom68, eyeAspectRatio, facePlacement, yawFrom68, type Pt,
} from "../components/ess/face-liveness";
import { clientIpFrom, normalizeIp } from "../app/api/checkin/network/client-ip";

/** synthetic 68-point face: eyes open/closed by `open`, nose shifted by `yaw` (fraction of eye span) */
function face(open = 0.3, yaw = 0): Pt[] {
  const pts: Pt[] = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }));
  const eye = (x0: number) => {
    const w = 30;
    const h = (open * w) / 1; // EAR = h / w
    return [
      { x: x0, y: 100 }, { x: x0 + 10, y: 100 - h / 2 }, { x: x0 + 20, y: 100 - h / 2 },
      { x: x0 + w, y: 100 }, { x: x0 + 20, y: 100 + h / 2 }, { x: x0 + 10, y: 100 + h / 2 },
    ];
  };
  eye(60).forEach((p, i) => (pts[36 + i] = p));
  eye(130).forEach((p, i) => (pts[42 + i] = p));
  pts[30] = { x: 110 + yaw * 100, y: 140 };
  return pts;
}

test("eye aspect ratio and yaw from landmarks", () => {
  assert.ok(Math.abs(earFrom68(face(0.3)) - 0.3) < 1e-9);
  assert.ok(earFrom68(face(0.05)) < 0.06);
  assert.equal(eyeAspectRatio([]), 0);
  assert.ok(Math.abs(yawFrom68(face(0.3, 0))) < 1e-9);
  assert.ok(yawFrom68(face(0.3, 0.4)) > 0.25);
  assert.ok(yawFrom68(face(0.3, -0.4)) < -0.25);
});

test("face placement inside the guide circle", () => {
  const frame = { width: 640, height: 480 };
  assert.equal(facePlacement([], frame), "none");
  assert.equal(facePlacement([{ x: 0, y: 0, width: 200, height: 200 }, { x: 300, y: 0, width: 200, height: 200 }], frame), "many");
  assert.equal(facePlacement([{ x: 300, y: 220, width: 40, height: 40 }], frame), "far");
  assert.equal(facePlacement([{ x: 0, y: 0, width: 470, height: 470 }], frame), "near");
  assert.equal(facePlacement([{ x: 0, y: 0, width: 200, height: 200 }], frame), "off_center");
  assert.equal(facePlacement([{ x: 220, y: 140, width: 200, height: 200 }], frame), "ok");
});

function run(tr: LivenessTracker, frames: { ear: number; yaw: number; dt?: number }[], t0 = 0) {
  let t = t0;
  for (const f of frames) {
    t += f.dt ?? 120;
    tr.feed({ t, ear: f.ear, yaw: f.yaw });
  }
  return t;
}
const still = (n: number, ear = 0.3, yaw = 0) => Array.from({ length: n }, () => ({ ear, yaw }));

test("liveness: a still photo never passes", () => {
  const tr = new LivenessTracker();
  run(tr, still(200));
  assert.equal(tr.stage, "challenge");
  assert.ok(tr.timedOut);
});

test("liveness: blink then look at the camera passes", () => {
  const tr = new LivenessTracker();
  run(tr, [...still(LIVENESS.baselineFrames), ...still(2), ...still(2, 0.1), ...still(1, 0.3)]);
  assert.equal(tr.stage, "return");
  assert.equal(tr.passedBy, "blink");
  run(tr, still(1), 10000);
  assert.equal(tr.stage, "passed");
});

test("liveness: slow eye close (> blinkMaxMs) is not a blink", () => {
  const tr = new LivenessTracker();
  let t = run(tr, still(LIVENESS.baselineFrames));
  t = run(tr, [{ ear: 0.1, yaw: 0 }], t);
  run(tr, [{ ear: 0.3, yaw: 0, dt: LIVENESS.blinkMaxMs + 400 }], t);
  assert.equal(tr.stage, "challenge");
});

test("liveness: head turn then back to front passes; must return to front", () => {
  const tr = new LivenessTracker();
  run(tr, [...still(LIVENESS.baselineFrames), ...still(1, 0.3, 0.35)]);
  assert.equal(tr.stage, "return");
  assert.equal(tr.passedBy, "turn");
  run(tr, still(3, 0.3, 0.3)); // still turned
  assert.equal(tr.stage, "return");
  run(tr, still(1, 0.3, 0.02));
  assert.equal(tr.stage, "passed");
  tr.reset();
  assert.equal(tr.stage, "baseline");
});

test("descriptor distance matches SQL mapping (score = 1 - distance)", () => {
  const a = Array.from({ length: 128 }, (_, i) => 0.1 * Math.sin(i + 1));
  const b = a.map((x) => x + 0.01);
  assert.ok(Math.abs(descriptorDistance(a, b) - Math.sqrt(128 * 0.0001)) < 1e-9); // 0.1131 like the psql test
  assert.equal(descriptorDistance(a, a), 0);
  assert.equal(descriptorDistance(a, [1, 2]), Infinity);
});

test("normalizeIp handles IPv4, IPv6, mapped IPv4, ports and junk", () => {
  assert.equal(normalizeIp("192.168.1.5"), "192.168.1.5");
  assert.equal(normalizeIp(" ::ffff:127.0.0.1 "), "127.0.0.1");
  assert.equal(normalizeIp("::FFFF:10.0.0.2"), "10.0.0.2");
  assert.equal(normalizeIp("::1"), "::1");
  assert.equal(normalizeIp("[2001:db8::1]:443"), "2001:db8::1");
  assert.equal(normalizeIp("203.0.113.9:51234"), "203.0.113.9");
  assert.equal(normalizeIp("fe80::1%eth0"), "fe80::1");
  assert.equal(normalizeIp("unknown"), null);
  assert.equal(normalizeIp(""), null);
  assert.equal(normalizeIp(null), null);
});

test("clientIpFrom takes the first X-Forwarded-For hop, then X-Real-IP", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  assert.equal(clientIpFrom(h({ "x-forwarded-for": "192.168.1.20, 172.18.0.5" })), "192.168.1.20");
  assert.equal(clientIpFrom(h({ "x-forwarded-for": "garbage", "x-real-ip": "::ffff:192.168.1.7" })), "192.168.1.7");
  assert.equal(clientIpFrom(h({})), null);
});
