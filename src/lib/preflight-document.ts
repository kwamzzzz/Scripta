/**
 * The completeness check any drafted document can answer, whatever it is.
 *
 * A resolution has rules of its own — quorum, authority, who signs — and those
 * live with the instrument. These two questions do not: a section left empty
 * and a placeholder never filled are wrong in a clause, a memo and a letter
 * alike, and both are the kind of thing that is only ever noticed by the
 * person who receives the file.
 */
import { partText, type EditorPart } from "@/editor/model";
import type { PreflightItem } from "@/components/Preflight";

const PLACEHOLDER = /\[([^\]]{1,60})\]/g;

export function documentPreflight(
  parts: EditorPart[],
  /** What the parts are called here: section, clause, paragraph. */
  noun = "section",
): PreflightItem[] {
  const items: PreflightItem[] = [];
  const label = (part: EditorPart) =>
    [part.num, part.title].filter(Boolean).join(" ") || `A ${noun}`;

  const empty = parts.filter((part) => !partText(part).trim());
  for (const part of empty)
    items.push({
      key: `empty-${part.id}`,
      level: "blocking",
      label: `${label(part)} is empty`,
      detail: part.placeholder ?? `Write the ${noun}, or remove it.`,
      count: 1,
      anchorId: part.id,
    });

  for (const part of parts) {
    const found = [...partText(part).matchAll(PLACEHOLDER)].map((m) => m[1]!.trim());
    if (!found.length) continue;
    items.push({
      key: `placeholder-${part.id}`,
      level: "blocking",
      label: `${label(part)} still has ${found.length === 1 ? "a placeholder" : "placeholders"}`,
      detail: `Fill in ${found.map((f) => `[${f}]`).join(", ")} before this goes out.`,
      count: found.length,
      anchorId: part.id,
    });
  }

  if (!parts.length)
    items.push({
      key: "nothing",
      level: "blocking",
      label: "There is nothing to send",
      detail: `Write at least one ${noun} before exporting.`,
      count: 1,
    });

  if (!items.length)
    items.push({
      key: "written",
      level: "clear",
      label: `Every ${noun} is written`,
      detail: `No ${noun} is empty and no placeholder is left to fill.`,
      count: 0,
    });

  return items;
}
