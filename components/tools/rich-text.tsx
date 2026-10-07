import { Fragment } from "react";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

/** Plain text with line breaks and clickable links (no HTML injection) */
export function RichText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line.split(URL_RE).map((part, j) =>
            j % 2 === 1 ? (
              <a key={j} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-jade-700 underline underline-offset-2 hover:text-jade-900">
                {part}
              </a>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </div>
  );
}
