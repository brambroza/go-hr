"use client";

import { useState } from "react";
import { clsx } from "@/components/ui";

const TONES = ["bg-jade-100 text-jade-800", "bg-sky-100 text-sky-800", "bg-amber-100 text-amber-ink", "bg-violet-100 text-violet-800", "bg-rose-100 text-rose-800"];

/** Employee photo with initials fallback */
export function Avatar({ src, name, size = 40, className }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const n = (name ?? "").trim();
  const initials = n ? n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("") : "?";
  const tone = TONES[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) };
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={n} onError={() => setBroken(true)} style={style} className={clsx("shrink-0 rounded-full bg-paper object-cover", className)} />;
  }
  return (
    <span aria-hidden style={style} className={clsx("inline-grid shrink-0 place-items-center rounded-full font-semibold", tone, className)}>
      {initials}
    </span>
  );
}
