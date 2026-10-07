"use client";

import { Star } from "lucide-react";
import { clsx } from "@/components/ui";

export function Stars({ n, onChange, size = "sm" }: { n: number | null; onChange?: (n: number | null) => void; size?: "sm" | "md" }) {
  if (!onChange && !n) return <span className="text-ink-mute">-</span>;
  const cls = size === "md" ? "size-6" : "size-3.5";
  return (
    <span className="inline-flex text-amber-500" aria-label={`${n ?? 0} ดาว`}>
      {Array.from({ length: 5 }, (_, i) =>
        onChange ? (
          <button key={i} type="button" onClick={() => onChange(n === i + 1 ? null : i + 1)} aria-label={`${i + 1} ดาว`} className="p-0.5">
            <Star className={clsx(cls, i < (n ?? 0) ? "fill-current" : "text-line")} />
          </button>
        ) : (
          <Star key={i} className={clsx(cls, i < (n ?? 0) ? "fill-current" : "text-line")} />
        ),
      )}
    </span>
  );
}
