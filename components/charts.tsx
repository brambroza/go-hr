"use client";
// Lightweight SVG charts (no external library — works offline on customer servers)

import { useState } from "react";

const PALETTE = ["#1b6f53", "#4ba383", "#b1dbca", "#8a5300", "#b4441c", "#3b6b8f", "#7a8a84", "#d8a24a"];

export function BarList({ data, valueFormat = (v: number) => v.toLocaleString("th-TH"), max }: { data: { name: string; value: number }[]; valueFormat?: (v: number) => string; max?: number }) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-2">
      {data.map((d) => (
        <li key={d.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate text-ink-soft" title={d.name}>{d.name}</span>
          <span className="h-2.5 rounded-full bg-jade-50">
            <span className="block h-2.5 rounded-full bg-jade-500" style={{ width: `${Math.max(2, (d.value / m) * 100)}%` }} />
          </span>
          <span className="num w-16 text-right font-medium">{valueFormat(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Donut({ data, size = 140 }: { data: { name: string; value: number }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" width={size} height={size} className="shrink-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e9eeeb" strokeWidth="14" />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const el = <circle key={d.name} cx="60" cy="60" r={r} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} />;
          acc += len;
          return el;
        })}
      </svg>
      <ul className="flex flex-col gap-1 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="text-ink-soft">{d.name}</span>
            <span className="num font-medium">{d.value.toLocaleString("th-TH")}</span>
            <span className="num text-xs text-ink-mute">({Math.round((d.value / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** columns with optional line overlay; series[0] = bars */
export function ColumnChart({ labels, series, height = 200, format = (v: number) => v.toLocaleString("th-TH") }: { labels: string[]; series: { name: string; values: number[]; type?: "bar" | "line"; color?: string }[]; height?: number; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const w = 600;
  const h = height;
  const pad = { l: 8, r: 8, t: 12, b: 26 };
  const cw = (w - pad.l - pad.r) / Math.max(1, labels.length);
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const bars = series.filter((s) => s.type !== "line");
  const lines = series.filter((s) => s.type === "line");
  const bw = (cw * 0.7) / Math.max(1, bars.length);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={w - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="#e9eeeb" />
        ))}
        {labels.map((l, i) => (
          <g key={l} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={pad.l + i * cw} y={pad.t} width={cw} height={h - pad.t - pad.b} fill={hover === i ? "#eef7f3" : "transparent"} />
            {bars.map((s, j) => (
              <rect key={s.name} x={pad.l + i * cw + cw * 0.15 + j * bw} y={y(s.values[i] ?? 0)} width={bw - 2} height={Math.max(0, h - pad.b - y(s.values[i] ?? 0))} rx="2" fill={s.color ?? PALETTE[j]} />
            ))}
            <text x={pad.l + i * cw + cw / 2} y={h - 8} textAnchor="middle" fontSize="11" fill="#7a8a84">{l}</text>
          </g>
        ))}
        {lines.map((s, j) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color ?? PALETTE[3 + j]}
            strokeWidth="2.5"
            points={s.values.map((v, i) => `${pad.l + i * cw + cw / 2},${y(v)}`).join(" ")}
          />
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md border border-line bg-white px-3 py-1.5 text-xs shadow">
          <div className="font-medium">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="num text-ink-soft">{s.name}: {format(s.values[hover] ?? 0)}</div>
          ))}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-soft">
        {series.map((s, j) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm" style={{ background: s.color ?? (s.type === "line" ? PALETTE[3 + lines.indexOf(s)] : PALETTE[j]) }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
