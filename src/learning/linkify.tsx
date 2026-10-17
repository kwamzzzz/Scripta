import type { ReactNode } from "react";
/** Bare web addresses in a block become links that open beside the course. */
export function linkify(text: string): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s)]*[^\s).,;:])/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">
        {part.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
      </a>
    ) : (
      part
    ),
  );
}
