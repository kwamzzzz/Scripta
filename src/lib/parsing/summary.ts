import type { DiffSeg } from "./word-diff";

const words = (s: string) => s.split(/\s+/).filter(Boolean);

const NUM = /^[£$€]?\d[\d,]*(?:\.\d+)?%?$/;

const UNIT_AFTER = /^(days?|months?|years?|weeks?|hours?|business|calendar)$/i;

/**
 * Mechanical, derived-from-the-segments summary. No AI, no paraphrase:
 * numeric swaps become "12 → 36 months", otherwise we report what moved.
 */
export function diffSummary(
  segs: DiffSeg[],
  opts: { change: "Added" | "Deleted" | "Modified"; title: string },
): string {
  if (opts.change === "Added") {
    const text = segs.filter((s) => s.k !== "d").map((s) => s.t).join("").trim();
    const first = words(text).slice(0, 16).join(" ");
    return `New clause: ${first}${words(text).length > 16 ? "…" : ""}`;
  }
  if (opts.change === "Deleted") {
    const text = segs.filter((s) => s.k !== "i").map((s) => s.t).join("").trim();
    const first = words(text).slice(0, 16).join(" ");
    return `Clause deleted: ${first}${words(text).length > 16 ? "…" : ""}`;
  }

  const notes: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const del = segs[i];
    const ins = segs[i + 1];
    if (!del || del.k !== "d" || !ins || ins.k !== "i") continue;
    const dW = words(del.t);
    const iW = words(ins.t);
    const dNums = dW.filter((w) => NUM.test(w));
    const iNums = iW.filter((w) => NUM.test(w));
    if (dNums.length === 1 && iNums.length === 1) {
      const tail = words(segs[i + 2]?.t ?? "")[0] ?? "";
      const unit = UNIT_AFTER.test(tail) ? ` ${tail.replace(/[^\w]/g, "")}` : "";
      notes.push(`${dNums[0]} → ${iNums[0]}${unit}`);
    } else if (dW.length <= 6 && iW.length <= 6) {
      notes.push(`"${dW.join(" ")}" → "${iW.join(" ")}"`);
    }
  }

  if (notes.length > 0) return notes.slice(0, 3).join("; ");

  const removed = segs.filter((s) => s.k === "d").reduce((n, s) => n + words(s.t).length, 0);
  const added = segs.filter((s) => s.k === "i").reduce((n, s) => n + words(s.t).length, 0);
  if (removed && added) return `Wording amended: ${removed} words removed, ${added} added`;
  if (added) return `Wording added: ${added} words`;
  if (removed) return `Wording removed: ${removed} words`;
  return "No textual change";
}
