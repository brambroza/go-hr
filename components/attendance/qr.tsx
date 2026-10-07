"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Spinner, clsx } from "@/components/ui";

/** QR code rendered to inline SVG (crisp on screen and in print) */
export function QrSvg({ value, className, label }: { value: string; className?: string; label?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#082119", light: "#ffffff" } }).then((s) => alive && setSvg(s));
    return () => {
      alive = false;
    };
  }, [value]);
  if (!svg) return <div className={clsx("grid place-items-center", className)}><Spinner /></div>;
  return <div role="img" aria-label={label ?? "QR Code"} className={clsx("[&>svg]:h-full [&>svg]:w-full", className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}
